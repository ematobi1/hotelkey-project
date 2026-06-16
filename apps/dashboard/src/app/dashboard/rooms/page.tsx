'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getTenantId } from '@/lib/auth'
import type { Room } from '@/types'
import RoomGrid from '@/components/RoomGrid'

const statusOrder: Room['status'][] = [
  'occupied',
  'dirty',
  'inspecting',
  'clean',
  'maintenance',
  'out_of_order',
]

function sortRooms(rooms: Room[]): Room[] {
  return [...rooms].sort(
    (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status),
  )
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const tenantId = getTenantId() ?? ''
    api.rooms
      .list(tenantId)
      .then((res) => setRooms(sortRooms(res.data)))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const counts = rooms.reduce<Partial<Record<Room['status'], number>>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Rooms</h1>
        <span className="text-sm text-slate-500">{rooms.length} total</span>
      </div>

      {!loading && !error && rooms.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {(Object.entries(counts) as [Room['status'], number][]).map(([status, count]) => (
            <span key={status} className="text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 capitalize">
              {status.replace(/_/g, ' ')}: <strong className="text-slate-200">{count}</strong>
            </span>
          ))}
        </div>
      )}

      {loading && <p className="text-slate-500 text-sm">Loading…</p>}

      {error && !loading && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          Failed to load rooms: {error}
        </p>
      )}

      {!loading && !error && <RoomGrid rooms={rooms} />}
    </div>
  )
}
