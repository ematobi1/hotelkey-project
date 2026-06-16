'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getTenantId } from '@/lib/auth'

interface Stats {
  totalRooms: number
  occupiedRooms: number
  cleanRooms: number
  checkedIn: number
  pendingHkTasks: number
}

const statConfig: { label: string; key: keyof Stats; accent: string; text: string }[] = [
  { label: 'Total Rooms',      key: 'totalRooms',      accent: 'bg-slate-600',   text: 'text-slate-100'   },
  { label: 'Occupied',         key: 'occupiedRooms',   accent: 'bg-blue-500',    text: 'text-blue-400'    },
  { label: 'Clean & Ready',    key: 'cleanRooms',      accent: 'bg-emerald-500', text: 'text-emerald-400' },
  { label: 'Guests Checked In',key: 'checkedIn',       accent: 'bg-cyan-500',    text: 'text-cyan-400'    },
  { label: 'Pending HK Tasks', key: 'pendingHkTasks',  accent: 'bg-amber-500',   text: 'text-amber-400'   },
]

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const tenantId = getTenantId() ?? ''

    Promise.all([
      api.reservations.list(tenantId),
      api.rooms.list(tenantId),
      api.housekeeping.tasks(tenantId),
    ])
      .then(([reservations, rooms, tasks]) => {
        setStats({
          totalRooms: rooms.meta.total,
          occupiedRooms: rooms.data.filter((r) => r.status === 'occupied').length,
          cleanRooms: rooms.data.filter((r) => r.status === 'clean').length,
          checkedIn: reservations.data.filter((r) => r.status === 'checked_in').length,
          pendingHkTasks: tasks.data.filter(
            (t) => t.status === 'pending' || t.status === 'assigned',
          ).length,
        })
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-8 text-slate-500 text-sm flex items-center gap-2">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          Failed to load overview: {error}
        </p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Overview</h1>
        <p className="text-slate-500 text-sm mt-1">Live property status</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {statConfig.map(({ label, key, accent, text }) => (
          <StatCard key={key} label={label} value={stats![key]} accent={accent} text={text} />
        ))}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
  text,
}: {
  label: string
  value: number
  accent: string
  text: string
}) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />
      <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">{label}</p>
      <p className={`text-3xl font-bold mt-3 tabular-nums ${text}`}>{value}</p>
    </div>
  )
}
