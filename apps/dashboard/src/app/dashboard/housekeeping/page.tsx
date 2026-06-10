'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getTenantId } from '@/lib/auth'
import type { HkTask } from '@/types'
import TaskList from '@/components/TaskList'

type FilterStatus = 'all' | HkTask['status']

const filterOptions: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
]

export default function HousekeepingPage() {
  const [tasks, setTasks] = useState<HkTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterStatus>('all')

  useEffect(() => {
    const tenantId = getTenantId() ?? ''
    api.housekeeping
      .tasks(tenantId)
      .then((res) => setTasks(res.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleUpdateStatus(id: string, status: string) {
    setActionError(null)
    try {
      const tenantId = getTenantId() ?? ''
      const { data } = await api.housekeeping.updateStatus(id, status, tenantId)
      setTasks((prev) => prev.map((t) => (t.id === id ? data : t)))
    } catch (err) {
      setActionError((err as Error).message)
    }
  }

  const visibleTasks =
    filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Housekeeping</h1>
        <span className="text-sm text-slate-400">{tasks.length} tasks</span>
      </div>

      {!loading && !error && (
        <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === opt.value
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {actionError && (
        <p role="alert" className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {actionError}
        </p>
      )}

      {loading && <p className="text-slate-400 text-sm">Loading…</p>}

      {error && !loading && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-md px-4 py-3">
          Failed to load tasks: {error}
        </p>
      )}

      {!loading && !error && (
        <TaskList tasks={visibleTasks} onUpdateStatus={handleUpdateStatus} />
      )}
    </div>
  )
}
