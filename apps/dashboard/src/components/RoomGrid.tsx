import type { Room } from '@/types'
import Badge from '@/components/ui/Badge'

interface Props {
  rooms: Room[]
}

const statusColor: Record<Room['status'], 'green' | 'yellow' | 'blue' | 'purple' | 'orange' | 'red'> =
  {
    clean: 'green',
    dirty: 'yellow',
    occupied: 'blue',
    inspecting: 'purple',
    maintenance: 'orange',
    out_of_order: 'red',
  }

export default function RoomGrid({ rooms }: Props) {
  if (rooms.length === 0) {
    return <p className="text-slate-500 text-sm py-6 text-center">No rooms found.</p>
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {rooms.map((room) => (
        <div key={room.id} className="bg-slate-900 rounded-xl border border-slate-800 p-3 text-center hover:border-slate-700 transition-colors">
          <p className="text-xl font-bold text-slate-100">{room.roomNumber}</p>
          <p className="text-xs text-slate-500 mb-2">Floor {room.floor}</p>
          <Badge color={statusColor[room.status]}>{room.status.replace(/_/g, ' ')}</Badge>
        </div>
      ))}
    </div>
  )
}
