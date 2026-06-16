import type { WorkOrder } from '@/types'
import Badge from '@/components/ui/Badge'

interface Props {
  workOrders: WorkOrder[]
  onEdit: (order: WorkOrder) => void
  onSelect: (order: WorkOrder) => void
}

const priorityColor: Record<WorkOrder['priority'], 'gray' | 'blue' | 'yellow' | 'red'> = {
  low: 'gray',
  medium: 'blue',
  high: 'yellow',
  urgent: 'red',
}

const statusColor: Record<WorkOrder['status'], 'blue' | 'yellow' | 'green' | 'red' | 'gray'> = {
  open: 'blue',
  assigned: 'yellow',
  in_progress: 'yellow',
  completed: 'green',
  cancelled: 'gray',
}

export default function WorkOrderList({ workOrders, onEdit, onSelect }: Props) {
  if (workOrders.length === 0) {
    return <p className="text-slate-500 text-sm py-6 text-center">No work orders found.</p>
  }

  return (
    <ul className="space-y-2">
      {workOrders.map((order) => (
        <li
          key={order.id}
          className="p-4 bg-slate-900 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-100 text-sm">{order.title}</p>
              <p className="text-xs text-slate-500 capitalize mt-1">
                {order.category}
                {order.roomId ? ` · Room ${order.roomId}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <Badge color={priorityColor[order.priority]}>{order.priority}</Badge>
              <button
                type="button"
                onClick={() => onSelect(order)}
                className="focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded-full"
                aria-label={`View details for ${order.title}`}
              >
                <Badge color={statusColor[order.status]}>{order.status.replace(/_/g, ' ')}</Badge>
              </button>
              <button
                type="button"
                onClick={() => onEdit(order)}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded px-1 transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
