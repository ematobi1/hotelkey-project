'use client'

import type { HkTask } from '@/types'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

interface Props {
  tasks: HkTask[]
  onUpdateStatus: (id: string, status: string) => void
}

const statusColor: Record<HkTask['status'], 'gray' | 'blue' | 'yellow' | 'green' | 'red'> = {
  pending: 'gray',
  assigned: 'blue',
  in_progress: 'yellow',
  completed: 'green',
  cancelled: 'red',
}

export default function TaskList({ tasks, onUpdateStatus }: Props) {
  if (tasks.length === 0) {
    return <p className="text-slate-500 text-sm py-6 text-center">No tasks found.</p>
  }

  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="flex items-center justify-between gap-4 p-4 bg-slate-900 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-slate-100 capitalize text-sm">
                {task.taskType.replace(/_/g, ' ')}
              </span>
              <Badge color={statusColor[task.status]}>{task.status.replace(/_/g, ' ')}</Badge>
              {task.priority && (
                <span className="text-xs text-slate-500 uppercase tracking-widest">
                  {task.priority}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Room {task.roomId} · {task.assignedTo ?? 'Unassigned'}
            </p>
          </div>

          <div className="flex gap-2 shrink-0">
            {task.status === 'assigned' && (
              <Button size="sm" onClick={() => onUpdateStatus(task.id, 'in_progress')}>
                Start
              </Button>
            )}
            {task.status === 'in_progress' && (
              <Button size="sm" variant="secondary" onClick={() => onUpdateStatus(task.id, 'completed')}>
                Complete
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
