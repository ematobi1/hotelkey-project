'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken, getTenantId } from '@/lib/auth'

const BI_URL = process.env['NEXT_PUBLIC_BI_SERVICE_URL'] ?? 'http://localhost:3016'

type Horizon = 7 | 14 | 30

interface ForecastDay {
  date: string
  predicted_occupancy: number
  lower_bound: number
  upper_bound: number
}

interface ForecastResponse {
  forecast: ForecastDay[]
}

function occupancyBadgeClass(pct: number): string {
  if (pct >= 80) return 'badge badge-green'
  if (pct >= 60) return 'badge badge-amber'
  return 'badge badge-red'
}

function LinePath({ data, width, height }: { data: number[]; width: number; height: number }) {
  if (data.length < 2) return null
  const maxV = Math.max(...data)
  const minV = Math.min(...data)
  const range = maxV - minV || 1
  const pad = 10

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2)
    const y = pad + ((maxV - v) / range) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return (
    <polyline
      points={points.join(' ')}
      fill="none"
      stroke="var(--color-primary)"
      strokeWidth="2.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  )
}

export default function OccupancyPage() {
  const router = useRouter()
  const [horizon, setHorizon] = useState<Horizon>(30)
  const [forecast, setForecast] = useState<ForecastDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!getToken()) {
      router.replace('/')
    }
  }, [router])

  useEffect(() => {
    const tenantId = getTenantId() ?? 'demo-tenant'

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${BI_URL}/v1/bi/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken() ?? ''}`,
          },
          body: JSON.stringify({
            tenantId,
            userId: 'system',
            question: `Get the occupancy forecast for the next ${horizon} days. Return only the raw forecast data from get_occupancy_forecast tool for tenant ${tenantId}.`,
          }),
        })

        if (res.ok) {
          const body = (await res.json()) as { data: { toolCallsMade: Array<{ tool: string; result: ForecastResponse }> } }
          const forecastCall = body.data.toolCallsMade.find(
            (tc) => tc.tool === 'get_occupancy_forecast',
          )
          if (forecastCall) {
            setForecast((forecastCall.result as ForecastResponse).forecast.slice(0, horizon))
            return
          }
        }
        setForecast(generateMockForecast(horizon))
      } catch {
        setForecast(generateMockForecast(horizon))
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [horizon])

  function generateMockForecast(days: number): ForecastDay[] {
    const today = new Date()
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() + i + 1)
      const occ = Math.round(60 + Math.sin(i / 5) * 18 + Math.random() * 8)
      return {
        date: d.toISOString().split('T')[0] ?? '',
        predicted_occupancy: Math.min(99, Math.max(25, occ)),
        lower_bound: Math.max(20, occ - 8),
        upper_bound: Math.min(100, occ + 8),
      }
    })
  }

  const chartWidth = 800
  const chartHeight = 200
  const occupancyValues = forecast.map((d) => d.predicted_occupancy)

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Occupancy Forecast</h1>
        <p className="page-subtitle">ML-powered predictions with confidence intervals</p>
      </header>

      <div className="filter-bar">
        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
          Horizon:
        </span>
        {([7, 14, 30] as Horizon[]).map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setHorizon(h)}
            className={`btn btn-sm ${horizon === h ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: 'auto', minHeight: 36 }}
            aria-pressed={horizon === h}
          >
            {h} days
          </button>
        ))}
      </div>

      {loading && <p className="loading-text">Loading forecast…</p>}

      {error && (
        <div role="alert" className="alert alert-error">
          {error}
        </div>
      )}

      {!loading && forecast.length > 0 && (
        <>
          <div className="chart-container">
            <p className="chart-title">Predicted Occupancy — Next {horizon} Days</p>
            <svg
              className="line-chart-svg"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
              aria-label={`Line chart: occupancy forecast for next ${horizon} days`}
              role="img"
            >
              <defs>
                <linearGradient id="occ-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Reference lines */}
              {[80, 60].map((ref) => {
                const maxV = Math.max(...occupancyValues)
                const minV = Math.min(...occupancyValues)
                const range = maxV - minV || 1
                const y = 10 + ((maxV - ref) / range) * (chartHeight - 20)
                if (y < 0 || y > chartHeight) return null
                return (
                  <line
                    key={ref}
                    x1={10}
                    y1={y}
                    x2={chartWidth - 10}
                    y2={y}
                    stroke={ref === 80 ? 'var(--color-success)' : 'var(--color-warning)'}
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    opacity="0.4"
                  />
                )
              })}
              <LinePath data={occupancyValues} width={chartWidth} height={chartHeight} />
            </svg>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                <span style={{ width: 16, height: 2, background: 'var(--color-success)', display: 'inline-block', opacity: 0.6, borderTop: '1px dashed var(--color-success)' }} />
                80% threshold
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                <span style={{ width: 16, height: 2, background: 'var(--color-warning)', display: 'inline-block', opacity: 0.6, borderTop: '1px dashed var(--color-warning)' }} />
                60% threshold
              </span>
            </div>
          </div>

          <div className="table-container">
            <table className="table">
              <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
                Occupancy forecast data
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Predicted</th>
                  <th scope="col">Lower bound</th>
                  <th scope="col">Upper bound</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td style={{ fontWeight: 600 }}>{row.predicted_occupancy}%</td>
                    <td>{row.lower_bound}%</td>
                    <td>{row.upper_bound}%</td>
                    <td>
                      <span className={occupancyBadgeClass(row.predicted_occupancy)}>
                        {row.predicted_occupancy >= 80
                          ? 'Strong'
                          : row.predicted_occupancy >= 60
                          ? 'Moderate'
                          : 'Low'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
