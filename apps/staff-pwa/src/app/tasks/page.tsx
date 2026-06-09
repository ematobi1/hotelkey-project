'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getToken, getTenantId, getStaffId } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import type { HkTask, HkTaskStatus, WorkOrder, WorkOrderStatus } from '@/types'

const HK_STATUSES: HkTaskStatus[] = ['pending', 'assigned', 'in_progress', 'completed', 'skipped']
const WO_STATUSES: WorkOrderStatus[] = ['open', 'assigned', 'in_progress', 'completed', 'cancelled']

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ')
}

function hkStatusBadgeClass(status: HkTaskStatus): string {
  return `badge badge-${status}`
}

function woStatusBadgeClass(status: WorkOrderStatus): string {
  return `badge badge-${status}`
}

function priorityBadgeClass(priority: string): string {
  return `badge badge-${priority}`
}

interface UpdateModalProps {
  title: string
  currentStatus: string
  statuses: string[]
  submitting: boolean
  error: string | null
  onConfirm: (status: string) => void
  onClose: () => void
}

function UpdateModal({
  title,
  currentStatus,
  statuses,
  submitting,
  error,
  onConfirm,
  onClose,
}: UpdateModalProps) {
  const [selected, setSelected] = useState(currentStatus)

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal">
        <h2 id="modal-title" className="modal-title">
          {title}
        </h2>

        <div className="form-group">
          <label htmlFor="status-select" className="form-label">
            New status
          </label>
          <select
            id="status-select"
            className="form-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div role="alert" className="alert alert-error">
            {error}
          </div>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || selected === currentStatus}
            onClick={() => onConfirm(selected)}
          >
            {submitting ? 'Saving…' : 'Update'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TasksPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'housekeeping' | 'maintenance'>('housekeeping')
  const [hkTasks, setHkTasks] = useState<HkTask[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [modalTaskId, setModalTaskId] = useState<string | null>(null)
  const [updateSubmitting, setUpdateSubmitting] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)

  useEffect(() => {
    if (!getToken()) {
      router.replace('/')
      return
    }
    loadAll()
  }, [router])

  function loadAll() {
    const tenantId = getTenantId() ?? ''
    const staffId = getStaffId() ?? ''
    setLoading(true)
    setFetchError(null)

    const hkPromise = apiFetch<{ data: HkTask[] }>(
      `/v1/housekeeping/tasks?tenantId=${encodeURIComponent(tenantId)}&assignedTo=${encodeURIComponent(staffId)}`,
    ).then((res) => setHkTasks(res.data))

    const woPromise = apiFetch<{ data: WorkOrder[] }>(
      `/v1/maintenance/work-orders?tenantId=${encodeURIComponent(tenantId)}&assignedTo=${encodeURIComponent(staffId)}`,
    ).then((res) => setWorkOrders(res.data))

    Promise.all([hkPromise, woPromise])
      .catch((err: Error) => setFetchError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleHkUpdate(taskId: string, status: string) {
    setUpdateSubmitting(true)
    setUpdateError(null)
    const tenantId = getTenantId() ?? ''
    try {
      const res = await apiFetch<{ data: HkTask }>(`/v1/housekeeping/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ tenantId, status }),
      })
      setHkTasks((prev) => prev.map((t) => (t.id === taskId ? res.data : t)))
      setModalTaskId(null)
    } catch (err) {
      setUpdateError((err as Error).message)
    } finally {
      setUpdateSubmitting(false)
    }
  }

  async function handleWoUpdate(orderId: string, status: string) {
    setUpdateSubmitting(true)
    setUpdateError(null)
    const tenantId = getTenantId() ?? ''
    try {
      const res = await apiFetch<{ data: WorkOrder }>(
        `/v1/maintenance/work-orders/${orderId}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ tenantId, status }),
        },
      )
      setWorkOrders((prev) => prev.map((o) => (o.id === orderId ? res.data : o)))
      setModalTaskId(null)
    } catch (err) {
      setUpdateError((err as Error).message)
    } finally {
      setUpdateSubmitting(false)
    }
  }

  const activeHkTask = hkTasks.find((t) => t.id === modalTaskId)
  const activeWo = workOrders.find((o) => o.id === modalTaskId)

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">My Tasks</h1>
      </div>

      <div className="tabs" role="tablist" aria-label="Task categories">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'housekeeping'}
          className={`tab${tab === 'housekeeping' ? ' tab-active' : ''}`}
          onClick={() => { setTab('housekeeping'); setModalTaskId(null) }}
        >
          Housekeeping
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'maintenance'}
          className={`tab${tab === 'maintenance' ? ' tab-active' : ''}`}
          onClick={() => { setTab('maintenance'); setModalTaskId(null) }}
        >
          Maintenance
        </button>
      </div>

      {loading && <p className="state-text">Loading…</p>}

      {fetchError && !loading && (
        <div role="alert" className="alert alert-error">
          Failed to load tasks: {fetchError}
        </div>
      )}

      {!loading && !fetchError && tab === 'housekeeping' && (
        <>
          <p className="page-count">{hkTasks.length} task{hkTasks.length !== 1 ? 's' : ''}</p>
          {hkTasks.length === 0 ? (
            <p className="state-text">No housekeeping tasks assigned to you.</p>
          ) : (
            <ul className="task-list" aria-label="Housekeeping tasks">
              {hkTasks.map((task) => (
                <li key={task.id} className="task-card">
                  <div className="task-card-header">
                    <div>
                      <p className="task-title">{task.taskType.replace(/_/g, ' ')}</p>
                      <p className="task-meta">Room: {task.roomId.slice(0, 8)}…</p>
                    </div>
                    <span className={hkStatusBadgeClass(task.status)}>
                      {statusLabel(task.status)}
                    </span>
                  </div>
                  <p className="task-meta">Priority {task.priority}</p>
                  <div className="task-actions">
                    <Link
                      href={`/tasks/housekeeping/${task.id}`}
                      className="btn btn-secondary btn-sm"
                    >
                      Details
                    </Link>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setUpdateError(null)
                        setModalTaskId(task.id)
                      }}
                    >
                      Update status
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {!loading && !fetchError && tab === 'maintenance' && (
        <>
          <p className="page-count">{workOrders.length} work order{workOrders.length !== 1 ? 's' : ''}</p>
          {workOrders.length === 0 ? (
            <p className="state-text">No maintenance work orders assigned to you.</p>
          ) : (
            <ul className="task-list" aria-label="Maintenance work orders">
              {workOrders.map((order) => (
                <li key={order.id} className="task-card">
                  <div className="task-card-header">
                    <p className="task-title">{order.title}</p>
                    <span className={woStatusBadgeClass(order.status)}>
                      {statusLabel(order.status)}
                    </span>
                  </div>
                  <p className="task-meta">
                    <span className={priorityBadgeClass(order.priority)}>{order.priority}</span>
                    {order.category && <> · {order.category}</>}
                  </p>
                  <div className="task-actions">
                    <Link
                      href={`/tasks/maintenance/${order.id}`}
                      className="btn btn-secondary btn-sm"
                    >
                      Details
                    </Link>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setUpdateError(null)
                        setModalTaskId(order.id)
                      }}
                    >
                      Update status
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {modalTaskId && tab === 'housekeeping' && activeHkTask && (
        <UpdateModal
          title="Update housekeeping task"
          currentStatus={activeHkTask.status}
          statuses={HK_STATUSES}
          submitting={updateSubmitting}
          error={updateError}
          onConfirm={(status) => handleHkUpdate(activeHkTask.id, status)}
          onClose={() => setModalTaskId(null)}
        />
      )}

      {modalTaskId && tab === 'maintenance' && activeWo && (
        <UpdateModal
          title="Update work order"
          currentStatus={activeWo.status}
          statuses={WO_STATUSES}
          submitting={updateSubmitting}
          error={updateError}
          onConfirm={(status) => handleWoUpdate(activeWo.id, status)}
          onClose={() => setModalTaskId(null)}
        />
      )}
    </>
  )
}
