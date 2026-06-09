'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth'

const DIGITAL_TWIN_URL = process.env['NEXT_PUBLIC_DIGITAL_TWIN_URL'] ?? 'http://localhost:4000'

interface ScenarioParams {
  dateFrom: string
  dateTo: string
  groupBookingSize: number
  rateChangePct: number
  staffingChangePct: number
}

interface ScenarioResult {
  occupancyImpactPct: number
  revenueImpactUsd: number
  staffingRequired: number
  confidenceScore: number
}

function defaultParams(): ScenarioParams {
  const today = new Date()
  const twoWeeks = new Date(today)
  twoWeeks.setDate(twoWeeks.getDate() + 14)
  return {
    dateFrom: today.toISOString().split('T')[0] ?? '',
    dateTo: twoWeeks.toISOString().split('T')[0] ?? '',
    groupBookingSize: 0,
    rateChangePct: 0,
    staffingChangePct: 0,
  }
}

export default function ScenarioPlannerPage() {
  const router = useRouter()
  const [twinReachable, setTwinReachable] = useState<boolean | null>(null)
  const [params, setParams] = useState<ScenarioParams>(defaultParams())
  const [result, setResult] = useState<ScenarioResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (!getToken()) {
      router.replace('/')
      return
    }

    async function checkTwin() {
      try {
        const res = await fetch(`${DIGITAL_TWIN_URL}/health`, {
          signal: AbortSignal.timeout(3000),
        })
        setTwinReachable(res.ok)
      } catch {
        setTwinReachable(false)
      }
    }

    void checkTwin()
  }, [router])

  async function runSimulation() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${DIGITAL_TWIN_URL}/v1/scenarios/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`Digital twin error: ${res.status}`)
      const data = (await res.json()) as ScenarioResult
      setResult(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function setParam<K extends keyof ScenarioParams>(key: K, value: ScenarioParams[K]) {
    setParams((prev) => ({ ...prev, [key]: value }))
    setResult(null)
  }

  if (twinReachable === null) {
    return <p className="loading-text">Checking Digital Twin connectivity…</p>
  }

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Scenario Planner</h1>
        <p className="page-subtitle">Simulate demand scenarios using the Digital Twin engine</p>
      </header>

      {!twinReachable && (
        <div className="card">
          <div className="coming-soon">
            <div className="coming-soon-icon" aria-hidden="true">S</div>
            <h2 className="coming-soon-title">Digital Twin Unavailable</h2>
            <p className="coming-soon-desc">
              The Scenario Planner requires the Digital Twin service (port 4000) which is not
              currently reachable. This feature is part of Phase 2 infrastructure. Once the Digital
              Twin service is deployed, return here to simulate group bookings, rate changes, and
              staffing adjustments before committing.
            </p>
            <div className="alert alert-info" style={{ marginTop: '1.5rem', textAlign: 'left' }}>
              <strong>Expected endpoint:</strong> {DIGITAL_TWIN_URL}/health
            </div>
          </div>
        </div>
      )}

      {twinReachable && (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h2 className="card-title">Scenario Parameters</h2>
            <div className="scenario-grid">
              <div className="form-group">
                <label htmlFor="dateFrom" className="form-label">
                  From date
                </label>
                <input
                  id="dateFrom"
                  type="date"
                  className="form-input"
                  value={params.dateFrom}
                  onChange={(e) => setParam('dateFrom', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="dateTo" className="form-label">
                  To date
                </label>
                <input
                  id="dateTo"
                  type="date"
                  className="form-input"
                  value={params.dateTo}
                  onChange={(e) => setParam('dateTo', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="groupSize" className="form-label">
                  Group booking size (rooms)
                </label>
                <input
                  id="groupSize"
                  type="number"
                  min={0}
                  max={500}
                  className="form-input"
                  value={params.groupBookingSize}
                  onChange={(e) => setParam('groupBookingSize', Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="rateChange" className="form-label">
                  Rate change (%)
                </label>
                <input
                  id="rateChange"
                  type="number"
                  min={-50}
                  max={100}
                  className="form-input"
                  value={params.rateChangePct}
                  onChange={(e) => setParam('rateChangePct', Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="staffingChange" className="form-label">
                  Staffing change (%)
                </label>
                <input
                  id="staffingChange"
                  type="number"
                  min={-50}
                  max={100}
                  className="form-input"
                  value={params.staffingChangePct}
                  onChange={(e) => setParam('staffingChangePct', Number(e.target.value))}
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="alert alert-error">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={() => void runSimulation()}
              disabled={loading}
              className="btn btn-primary"
              style={{ width: 'auto' }}
            >
              {loading ? 'Simulating…' : 'Run simulation'}
            </button>
          </div>

          {result && (
            <div className="card">
              <h2 className="card-title">Simulation Results</h2>
              <div className="scenario-results">
                <div className="stat-card">
                  <p className="stat-label">Occupancy Impact</p>
                  <p className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {result.occupancyImpactPct >= 0 ? '+' : ''}
                    {result.occupancyImpactPct.toFixed(1)}%
                  </p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Revenue Impact</p>
                  <p className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {result.revenueImpactUsd >= 0 ? '+' : ''}$
                    {Math.abs(result.revenueImpactUsd).toLocaleString()}
                  </p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Staff Required</p>
                  <p className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {result.staffingRequired}
                  </p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Model Confidence</p>
                  <p className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {(result.confidenceScore * 100).toFixed(0)}%
                  </p>
                </div>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  className="btn btn-accent"
                  style={{ width: 'auto' }}
                  disabled
                  aria-disabled="true"
                  title="Review and confirm before applying"
                >
                  Apply Scenario (requires confirmation)
                </button>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                  Review the results carefully before applying changes to live reservations.
                </p>
              </div>
            </div>
          )}

          {showConfirm && (
            <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
              <div className="modal">
                <h2 id="confirm-title" className="modal-title">Apply Scenario?</h2>
                <p className="modal-body">
                  This will update room availability, rates, and staffing rosters based on the simulation results. This action cannot be undone automatically.
                </p>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowConfirm(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      setShowConfirm(false)
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
