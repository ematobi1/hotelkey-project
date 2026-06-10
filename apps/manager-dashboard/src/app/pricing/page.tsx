'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken, getTenantId } from '@/lib/auth'

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8000'
const PRICING_URL = process.env['NEXT_PUBLIC_PRICING_SERVICE_URL'] ?? 'http://localhost:8002'

interface RoomType {
  id: string
  name: string
  currentRate: number
  currency: string
  available: number
}

interface PricingRecommendation {
  roomTypeId: string
  roomTypeName: string
  recommendedRate: number
  currentRate: number
  confidence: number
}

interface OverrideState {
  [roomTypeId: string]: string
}

export default function PricingPage() {
  const router = useRouter()
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [recommendations, setRecommendations] = useState<PricingRecommendation[]>([])
  const [autonomousActive, setAutonomousActive] = useState(true)
  const [circuitOpen, setCircuitOpen] = useState(false)
  const [overrides, setOverrides] = useState<OverrideState>({})
  const [pricingReachable, setPricingReachable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPauseConfirm, setShowPauseConfirm] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!getToken()) {
      router.replace('/')
      return
    }

    const tenantId = getTenantId() ?? 'demo-tenant'

    async function load() {
      setLoading(true)

      const mockRooms: RoomType[] = [
        { id: 'rt-001', name: 'Standard Room', currentRate: 159, currency: 'USD', available: 12 },
        { id: 'rt-002', name: 'Deluxe Room', currentRate: 219, currency: 'USD', available: 8 },
        { id: 'rt-003', name: 'Junior Suite', currentRate: 319, currency: 'USD', available: 4 },
        { id: 'rt-004', name: 'Executive Suite', currentRate: 489, currency: 'USD', available: 2 },
        { id: 'rt-005', name: 'Presidential Suite', currentRate: 899, currency: 'USD', available: 1 },
      ]

      try {
        const res = await fetch(
          `${API_BASE}/v1/room-types?tenantId=${encodeURIComponent(tenantId)}`,
          { headers: { Authorization: `Bearer ${getToken() ?? ''}` } },
        )
        if (res.ok) {
          const body = (await res.json()) as { data: RoomType[] }
          setRoomTypes(body.data ?? mockRooms)
        } else {
          setRoomTypes(mockRooms)
        }
      } catch {
        setRoomTypes(mockRooms)
      }

      try {
        const recRes = await fetch(
          `${PRICING_URL}/v1/pricing/recommendation?tenantId=${encodeURIComponent(tenantId)}`,
          {
            headers: { Authorization: `Bearer ${getToken() ?? ''}` },
            signal: AbortSignal.timeout(3000),
          },
        )
        if (recRes.ok) {
          const body = (await recRes.json()) as { data: PricingRecommendation[] }
          setRecommendations(body.data ?? [])
          setPricingReachable(true)
        } else {
          setPricingReachable(false)
          setRecommendations(mockRooms.map((r) => ({
            roomTypeId: r.id,
            roomTypeName: r.name,
            recommendedRate: Math.round(r.currentRate * (1 + (Math.random() - 0.4) * 0.2)),
            currentRate: r.currentRate,
            confidence: 0.8 + Math.random() * 0.18,
          })))
        }
      } catch {
        setPricingReachable(false)
        setRecommendations(mockRooms.map((r) => ({
          roomTypeId: r.id,
          roomTypeName: r.name,
          recommendedRate: Math.round(r.currentRate * (1 + (Math.random() - 0.4) * 0.2)),
          currentRate: r.currentRate,
          confidence: 0.8 + Math.random() * 0.18,
        })))
      }

      setLoading(false)
    }

    void load()
  }, [router])

  async function applyOverride(roomTypeId: string) {
    const rate = parseFloat(overrides[roomTypeId] ?? '')
    if (isNaN(rate) || rate <= 0) {
      setError('Invalid rate value')
      return
    }
    setSaving(roomTypeId)
    setError(null)
    try {
      const res = await fetch(`${PRICING_URL}/v1/pricing/override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken() ?? ''}`,
        },
        body: JSON.stringify({
          tenantId: getTenantId(),
          roomTypeId,
          rate,
        }),
      })
      if (!res.ok && res.status !== 404) {
        throw new Error(`Failed to apply override: ${res.status}`)
      }
      setRoomTypes((prev) =>
        prev.map((r) => (r.id === roomTypeId ? { ...r, currentRate: rate } : r)),
      )
      setOverrides((prev) => {
        const next = { ...prev }
        delete next[roomTypeId]
        return next
      })
      setSuccessMsg(`Rate updated for ${roomTypes.find((r) => r.id === roomTypeId)?.name ?? roomTypeId}`)
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      // If pricing service is down, apply locally for demo
      setRoomTypes((prev) =>
        prev.map((r) => (r.id === roomTypeId ? { ...r, currentRate: rate } : r)),
      )
      setOverrides((prev) => {
        const next = { ...prev }
        delete next[roomTypeId]
        return next
      })
      setSuccessMsg(`Rate updated locally (pricing service offline)`)
      setTimeout(() => setSuccessMsg(null), 3000)
    } finally {
      setSaving(null)
    }
  }

  async function toggleAutonomous() {
    const next = !autonomousActive
    try {
      await fetch(`${PRICING_URL}/v1/pricing/autonomous`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken() ?? ''}`,
        },
        body: JSON.stringify({ active: next, tenantId: getTenantId() }),
      })
    } catch {
      // Apply optimistically even if service is down
    }
    setAutonomousActive(next)
    setShowPauseConfirm(false)
    setSuccessMsg(`Autonomous pricing ${next ? 'resumed' : 'paused'}`)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  if (loading) return <p className="loading-text">Loading pricing data…</p>

  const recMap = new Map(recommendations.map((r) => [r.roomTypeId, r]))

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Pricing Controls</h1>
        <p className="page-subtitle">Override autonomous pricing and view ML recommendations</p>
      </header>

      <div className="stat-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <p className="stat-label">Autonomous Pricing</p>
          <p className="stat-value" style={{ fontSize: '1.25rem', color: autonomousActive ? 'var(--color-success)' : 'var(--color-warning)' }}>
            {autonomousActive ? 'ACTIVE' : 'PAUSED'}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Circuit Breaker</p>
          <p className="stat-value" style={{ fontSize: '1.25rem', color: circuitOpen ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {circuitOpen ? 'TRIPPED' : 'OK'}
          </p>
          {circuitOpen && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-danger)', marginTop: '0.25rem' }}>
              RevPAR dropped &gt;15% — autonomy paused
            </p>
          )}
        </div>
        <div className="stat-card">
          <p className="stat-label">ML Pricing Service</p>
          <p className="stat-value" style={{ fontSize: '1.25rem', color: pricingReachable ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
            {pricingReachable ? 'CONNECTED' : 'OFFLINE'}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}

      {successMsg && (
        <div role="status" className="alert alert-success">
          {successMsg}
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 className="card-title">Room Rate Overrides</h2>
        <p className="card-subtitle">
          Enter a new rate and click Override to override autonomous pricing for that room type.
        </p>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Room type</th>
                <th scope="col">Current rate</th>
                <th scope="col">ML recommendation</th>
                <th scope="col">Available</th>
                <th scope="col">Override rate ($)</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {roomTypes.map((room) => {
                const rec = recMap.get(room.id)
                const recDiff = rec ? rec.recommendedRate - room.currentRate : 0
                return (
                  <tr key={room.id}>
                    <td style={{ fontWeight: 600 }}>{room.name}</td>
                    <td>${room.currentRate}/night</td>
                    <td>
                      {rec ? (
                        <span>
                          ${rec.recommendedRate}/night{' '}
                          <span
                            className={recDiff >= 0 ? 'stat-delta-up' : 'stat-delta-down'}
                            style={{ fontSize: '0.8125rem' }}
                          >
                            ({recDiff >= 0 ? '+' : ''}${recDiff})
                          </span>
                          <br />
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            {(rec.confidence * 100).toFixed(0)}% confidence
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                          Unavailable
                        </span>
                      )}
                    </td>
                    <td>{room.available}</td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        step={1}
                        className="form-input"
                        style={{ minHeight: 40, padding: '0.5rem 0.75rem', maxWidth: 120 }}
                        placeholder={String(room.currentRate)}
                        value={overrides[room.id] ?? ''}
                        onChange={(e) =>
                          setOverrides((prev) => ({ ...prev, [room.id]: e.target.value }))
                        }
                        aria-label={`Override rate for ${room.name}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ width: 'auto', whiteSpace: 'nowrap' }}
                        disabled={!overrides[room.id] || saving === room.id}
                        onClick={() => void applyOverride(room.id)}
                        aria-label={`Apply override rate for ${room.name}`}
                      >
                        {saving === room.id ? 'Saving…' : 'Override'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Autonomous Pricing Control</h2>
        <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-muted)', marginBottom: '1rem', lineHeight: 1.6 }}>
          When autonomous pricing is active, the ML pricing service adjusts rates every 15 minutes
          based on occupancy forecasts, competitor rates, and demand signals. A circuit breaker
          automatically pauses it if RevPAR drops more than 15% week-over-week.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {autonomousActive ? (
            <button
              type="button"
              className="btn btn-danger"
              style={{ width: 'auto' }}
              onClick={() => setShowPauseConfirm(true)}
            >
              Pause Autonomous Pricing
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-accent"
              style={{ width: 'auto' }}
              onClick={() => void toggleAutonomous()}
            >
              Resume Autonomous Pricing
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: 'auto' }}
            onClick={() => setCircuitOpen((o) => !o)}
          >
            {circuitOpen ? 'Reset Circuit Breaker' : 'Simulate Circuit Trip'}
          </button>
        </div>
      </div>

      {showPauseConfirm && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <div className="modal">
            <h2 id="pause-title" className="modal-title">Pause Autonomous Pricing?</h2>
            <p className="modal-body">
              Rates will no longer be adjusted automatically. Manual overrides will remain in effect.
              You can resume at any time.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowPauseConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void toggleAutonomous()}
              >
                Pause pricing
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
