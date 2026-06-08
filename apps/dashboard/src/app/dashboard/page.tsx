'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getTenantId } from '@/lib/auth'
import Card from '@/components/ui/Card'

interface Stats {
  totalRooms: number
  occupiedRooms: number
  cleanRooms: number
  checkedIn: number
  pendingHkTasks: number
}

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
    return <div className="p-8 text-slate-400 text-sm">Loading…</div>
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-md px-4 py-3">
          Failed to load overview: {error}
        </p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Overview</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Rooms" value={stats!.totalRooms} />
        <StatCard label="Occupied" value={stats!.occupiedRooms} />
        <StatCard label="Clean & Ready" value={stats!.cleanRooms} />
        <StatCard label="Guests Checked In" value={stats!.checkedIn} />
        <StatCard label="Pending HK Tasks" value={stats!.pendingHkTasks} />
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-6">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-slate-800 mt-2">{value}</p>
    </Card>
  )
}
