'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { getToken, getTenantId } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import type { HkTask, HkTaskStatus, WorkOrder, WorkOrderStatus } from '@/types'

const HK_STATUSES: HkTaskStatus[] = ['pending', 'assigned', 'in_progress', 'completed', 'skipped']
const WO_STATUSES: WorkOrderStatus[] = ['open', 'assigned', 'in_progress', 'completed', 'cancelled']

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ')
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export default function TaskDetailPage() {
  const router = useRouter()
  const params = useParams<{ type: string; id: string }>()
  const taskType = params.type
  const taskId = params.id

  const [hkTask, setHkTask] = useState<HkTask | null>(null)
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [selectedStatus, setSelectedStatus] = useState('')
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [updateSuccess, setUpdateSuccess] = useState(false)

  const isHousekeeping = taskType === 'housekeeping'
  const statuses = isHousekeeping ? HK_STATUSES : WO_STATUSES
  const currentStatus = isHousekeeping ? hkTask?.status : workOrder?.status

  useEffect(() => {
    if (!getToken()) {
      router.replace('/')
      return
    }

    if (taskType !== 'housekeeping' && taskType !== 'maintenance') {
      router.replace('/tasks')
      return
    }

    loadTask()
  }, [router, taskType, taskId])

  useEffect(() => {
    if (currentStatus) setSelectedStatus(currentStatus)
  }, [currentStatus])

  async function loadTask() {
    setLoading(true)
    setFetchError(null)
    const tenantId = getTenantId() ?? ''

    try {
      if (isHousekeeping) {
        const res = await apiFetch<{ data: HkTask[] }>(
          `/v1/housekeeping/tasks?tenantId=${encodeURIComponent(tenantId)}`,
        )
        const found = res.data.find((t) => t.id === taskId)
        if (!found) {
          setFetchError('Task not found.')
        } else {
          setHkTask(found)
          setSelectedStatus(found.status)
        }
      } else {
        const res = await apiFetch<{ data: WorkOrder }>(
          `/v1/maintenance/work-orders/${taskId}?tenantId=${encodeURIComponent(tenantId)}`,
        )
        setWorkOrder(res.data)
        setSelectedStatus(res.data.status)
      }
    } catch (err) {
      setFetchError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedStatus || selectedStatus === currentStatus) return

    setUpdating(true)
    setUpdateError(null)
    setUpdateSuccess(false)
    const tenantId = getTenantId() ?? ''

    try {
      if (isHousekeeping) {
        const res = await apiFetch<{ data: HkTask }>(`/v1/housekeeping/tasks/${taskId}`, {
          method: 'PATCH',
          body: JSON.stringify({ tenantId, status: selectedStatus }),
        })
        setHkTask(res.data)
        setSelectedStatus(res.data.status)
      } else {
        const res = await apiFetch<{ data: WorkOrder }>(
          `/v1/maintenance/work-orders/${taskId}/status`,
          {
            method: 'PATCH',
            body: JSON.stringify({ tenantId, status: selectedStatus }),
          },
        )
        setWorkOrder(res.data)
        setSelectedStatus(res.data.status)
      }
      setUpdateSuccess(true)
    } catch (err) {
      setUpdateError((err as Error).message)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <>
      <Link href="/tasks" className="back-link">
        ← Back to tasks
      </Link>

      {loading && <p className="state-text">Loading…</p>}

      {fetchError && !loading && (
        <div role="alert" className="alert alert-error">
          {fetchError}
        </div>
      )}

      {!loading && !fetchError && isHousekeeping && hkTask && (
        <>
          <div className="page-header">
            <h1 className="page-title">{hkTask.taskType.replace(/_/g, ' ')}</h1>
          </div>

          <section className="detail-card" aria-label="Task details">
            <div className="detail-row">
              <span className="detail-key">Status</span>
              <span className="detail-value">{statusLabel(hkTask.status)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Room ID</span>
              <span className="detail-value">{hkTask.roomId}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Priority</span>
              <span className="detail-value">{hkTask.priority}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Assigned to</span>
              <span className="detail-value">{hkTask.assignedTo ?? '—'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Due at</span>
              <span className="detail-value">{formatDate(hkTask.dueAt)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Notes</span>
              <span className="detail-value">{hkTask.notes ?? '—'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Started at</span>
              <span className="detail-value">{formatDate(hkTask.startedAt)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Completed at</span>
              <span className="detail-value">{formatDate(hkTask.completedAt)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Created</span>
              <span className="detail-value">{formatDate(hkTask.createdAt)}</span>
            </div>
          </section>

          <section className="detail-card" aria-label="Update status">
            <h2 className="modal-title">Update status</h2>
            <form onSubmit={handleUpdateSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="hk-status" className="form-label">
                  New status
                </label>
                <select
                  id="hk-status"
                  className="form-select"
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value)
                    setUpdateSuccess(false)
                  }}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>

              {updateError && (
                <div role="alert" className="alert alert-error">
                  {updateError}
                </div>
              )}

              {updateSuccess && (
                <div role="status" className="alert alert-success">
                  Status updated successfully.
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={updating || selectedStatus === hkTask.status}
              >
                {updating ? 'Saving…' : 'Save status'}
              </button>
            </form>
          </section>
        </>
      )}

      {!loading && !fetchError && !isHousekeeping && workOrder && (
        <>
          <div className="page-header">
            <h1 className="page-title">{workOrder.title}</h1>
          </div>

          <section className="detail-card" aria-label="Work order details">
            <div className="detail-row">
              <span className="detail-key">Status</span>
              <span className="detail-value">{statusLabel(workOrder.status)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Priority</span>
              <span className="detail-value">{workOrder.priority}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Category</span>
              <span className="detail-value">{workOrder.category}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Room ID</span>
              <span className="detail-value">{workOrder.roomId ?? '—'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Description</span>
              <span className="detail-value">{workOrder.description}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Reported by</span>
              <span className="detail-value">{workOrder.reportedBy}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Assigned to</span>
              <span className="detail-value">{workOrder.assignedTo ?? '—'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Due at</span>
              <span className="detail-value">{formatDate(workOrder.dueAt)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Notes</span>
              <span className="detail-value">{workOrder.notes ?? '—'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Created</span>
              <span className="detail-value">{formatDate(workOrder.createdAt)}</span>
            </div>
          </section>

          <section className="detail-card" aria-label="Update status">
            <h2 className="modal-title">Update status</h2>
            <form onSubmit={handleUpdateSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="wo-status" className="form-label">
                  New status
                </label>
                <select
                  id="wo-status"
                  className="form-select"
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value)
                    setUpdateSuccess(false)
                  }}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>

              {updateError && (
                <div role="alert" className="alert alert-error">
                  {updateError}
                </div>
              )}

              {updateSuccess && (
                <div role="status" className="alert alert-success">
                  Status updated successfully.
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={updating || selectedStatus === workOrder.status}
              >
                {updating ? 'Saving…' : 'Save status'}
              </button>
            </form>
          </section>
        </>
      )}
    </>
  )
}
