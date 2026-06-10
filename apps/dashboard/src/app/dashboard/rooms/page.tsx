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
        <h1 className="text-2xl font-bold text-slate-800">Rooms</h1>
        <span className="text-sm text-slate-400">{rooms.length} total</span>
      </div>

      {!loading && !error && rooms.length > 0 && (
        <div className="flex gap-4 flex-wrap mb-6">
          {(Object.entries(counts) as [Room['status'], number][]).map(([status, count]) => (
            <span key={status} className="text-xs text-slate-600 bg-slate-100 rounded px-2 py-1 capitalize">
              {status.replace(/_/g, ' ')}: <strong>{count}</strong>
            </span>
          ))}
        </div>
      )}

      {loading && <p className="text-slate-400 text-sm">Loading…</p>}

      {error && !loading && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-md px-4 py-3">
          Failed to load rooms: {error}
        </p>
      )}

      {!loading && !error && <RoomGrid rooms={rooms} />}
    </div>
  )
}
