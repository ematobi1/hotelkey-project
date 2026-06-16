'use client'

import type { Reservation } from '@/types'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

interface Props {
  reservations: Reservation[]
  onCheckIn: (id: string) => void
  onCheckOut: (id: string) => void
}

const statusColor: Record<Reservation['status'], 'gray' | 'blue' | 'green' | 'red'> = {
  tentative: 'gray',
  confirmed: 'blue',
  checked_in: 'green',
  checked_out: 'gray',
  cancelled: 'red',
  no_show: 'red',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function ReservationTable({ reservations, onCheckIn, onCheckOut }: Props) {
  if (reservations.length === 0) {
    return <p className="text-slate-500 text-sm py-6 text-center">No reservations found.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left">
            <th className="pb-3 pr-4 font-medium text-slate-500 text-xs uppercase tracking-widest">
              Confirmation
            </th>
            <th className="pb-3 pr-4 font-medium text-slate-500 text-xs uppercase tracking-widest">
              Room
            </th>
            <th className="pb-3 pr-4 font-medium text-slate-500 text-xs uppercase tracking-widest">
              Check-in
            </th>
            <th className="pb-3 pr-4 font-medium text-slate-500 text-xs uppercase tracking-widest">
              Check-out
            </th>
            <th className="pb-3 pr-4 font-medium text-slate-500 text-xs uppercase tracking-widest">
              Status
            </th>
            <th className="pb-3 font-medium text-slate-500 text-xs uppercase tracking-widest">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {reservations.map((r) => (
            <tr key={r.id} className="border-b border-slate-800/50 hover:bg-white/[0.02] transition-colors">
              <td className="py-3 pr-4 font-mono text-xs text-slate-400">{r.confirmationCode}</td>
              <td className="py-3 pr-4 text-slate-100 font-medium">{r.roomId}</td>
              <td className="py-3 pr-4 text-slate-400">{formatDate(r.checkInDate)}</td>
              <td className="py-3 pr-4 text-slate-400">{formatDate(r.checkOutDate)}</td>
              <td className="py-3 pr-4">
                <Badge color={statusColor[r.status]}>
                  {r.status.replace(/_/g, ' ')}
                </Badge>
              </td>
              <td className="py-3">
                <div className="flex gap-2">
                  {r.status === 'confirmed' && (
                    <Button size="sm" onClick={() => onCheckIn(r.id)}>
                      Check in
                    </Button>
                  )}
                  {r.status === 'checked_in' && (
                    <Button size="sm" variant="secondary" onClick={() => onCheckOut(r.id)}>
                      Check out
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
