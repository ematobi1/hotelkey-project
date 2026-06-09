'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getToken, getTenantId } from '@/lib/auth'

const ROOM_SERVICE = process.env['NEXT_PUBLIC_API_BASE'] ?? 'http://localhost:8000'

interface OccupancyDay {
  date: string
  occupancy: number
}

interface DashboardData {
  currentOccupancy: number
  todayCheckouts: number
  todayCheckins: number
  revparThisMonth: number
  revparLastMonth: number
  last7Days: OccupancyDay[]
}

function occupancyClass(pct: number): string {
  if (pct >= 80) return 'occupancy-high'
  if (pct >= 60) return 'occupancy-medium'
  return 'occupancy-low'
}

function mockDashboardData(): DashboardData {
  const today = new Date()
  return {
    currentOccupancy: 74,
    todayCheckouts: 18,
    todayCheckins: 22,
    revparThisMonth: 138.9,
    revparLastMonth: 134.5,
    last7Days: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (6 - i))
      const occ = 65 + Math.round(Math.sin(i) * 12 + Math.random() * 8)
      return { date: d.toLocaleDateString('en-US', { weekday: 'short' }), occupancy: occ }
    }),
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getToken()) {
      router.replace('/')
      return
    }

    const tenantId = getTenantId()

    async function load() {
      try {
        const res = await fetch(
          `${ROOM_SERVICE}/v1/rooms?tenantId=${encodeURIComponent(tenantId ?? '')}`,
          {
            headers: {
              Authorization: `Bearer ${getToken() ?? ''}`,
              'Content-Type': 'application/json',
            },
          },
        )
        if (res.ok) {
          const body = (await res.json()) as { data: Array<{ status: string }> }
          const rooms = body.data ?? []
          const occupied = rooms.filter((r) => r.status === 'occupied').length
          const total = rooms.length || 1
          setData({ ...mockDashboardData(), currentOccupancy: Math.round((occupied / total) * 100) })
        } else {
          setData(mockDashboardData())
        }
      } catch {
        setData(mockDashboardData())
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [router])

  if (loading) {
    return <p className="loading-text">Loading dashboard…</p>
  }

  if (!data) return null

  const revparDelta = data.revparThisMonth - data.revparLastMonth
  const revparPct = ((revparDelta / data.revparLastMonth) * 100).toFixed(1)
  const maxOcc = Math.max(...data.last7Days.map((d) => d.occupancy), 1)

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </header>

      <div className="stat-grid">
        <div className="stat-card">
          <p className="stat-label">Current Occupancy</p>
          <p className="stat-value">{data.currentOccupancy}%</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Today Check-outs</p>
          <p className="stat-value">{data.todayCheckouts}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Today Check-ins</p>
          <p className="stat-value">{data.todayCheckins}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">RevPAR This Month</p>
          <p className="stat-value">${data.revparThisMonth.toFixed(0)}</p>
          <p className={`stat-delta ${revparDelta >= 0 ? 'stat-delta-up' : 'stat-delta-down'}`}>
            {revparDelta >= 0 ? '+' : ''}
            {revparPct}% vs last month
          </p>
        </div>
      </div>

      <div className="chart-container">
        <p className="chart-title">Occupancy — Last 7 Days</p>
        <div className="bar-chart" role="img" aria-label="Bar chart showing occupancy over the last 7 days">
          {data.last7Days.map((day) => (
            <div key={day.date} className="bar-col">
              <div
                className={`bar ${occupancyClass(day.occupancy)}`}
                style={{ height: `${(day.occupancy / maxOcc) * 90}%` }}
                title={`${day.date}: ${day.occupancy}%`}
              />
              <span className="bar-label">{day.date}</span>
              <span className="bar-label">{day.occupancy}%</span>
            </div>
          ))}
        </div>
      </div>

      <nav aria-label="Quick navigation">
        <h2 className="card-title">Quick access</h2>
        <div className="quick-links">
          <Link href="/bi" className="quick-link">
            <span className="quick-link-icon" aria-hidden="true">AI</span>
            BI Assistant
            <span className="quick-link-desc">Ask anything in plain English</span>
          </Link>
          <Link href="/occupancy" className="quick-link">
            <span className="quick-link-icon" aria-hidden="true">%</span>
            Occupancy Forecast
            <span className="quick-link-desc">30-day ML predictions</span>
          </Link>
          <Link href="/scenario-planner" className="quick-link">
            <span className="quick-link-icon" aria-hidden="true">S</span>
            Scenario Planner
            <span className="quick-link-desc">Simulate demand scenarios</span>
          </Link>
          <Link href="/pricing" className="quick-link">
            <span className="quick-link-icon" aria-hidden="true">$</span>
            Pricing Controls
            <span className="quick-link-desc">Override autonomous pricing</span>
          </Link>
        </div>
      </nav>
    </>
  )
}
