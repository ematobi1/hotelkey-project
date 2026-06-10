import type { WorkOrder } from '@/types'
import Badge from '@/components/ui/Badge'

interface Props {
  workOrders: WorkOrder[]
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

export default function WorkOrderList({ workOrders }: Props) {
  if (workOrders.length === 0) {
    return <p className="text-slate-400 text-sm py-6 text-center">No work orders found.</p>
  }

  return (
    <ul className="space-y-2">
      {workOrders.map((order) => (
        <li
          key={order.id}
          className="p-4 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-800 text-sm">{order.title}</p>
              <p className="text-xs text-slate-500 capitalize mt-1">
                {order.category}
                {order.roomId ? ` · Room ${order.roomId}` : ''}
              </p>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap justify-end">
              <Badge color={priorityColor[order.priority]}>{order.priority}</Badge>
              <Badge color={statusColor[order.status]}>{order.status.replace(/_/g, ' ')}</Badge>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
