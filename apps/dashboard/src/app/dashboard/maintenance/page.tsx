'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { getTenantId, getUserId } from '@/lib/auth'
import type { CreateWorkOrderInput, WorkOrder } from '@/types'
import WorkOrderList from '@/components/WorkOrderList'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

const CATEGORIES = ['plumbing', 'electrical', 'hvac', 'furniture', 'cleaning', 'safety', 'other']
const PRIORITIES = ['low', 'medium', 'high', 'urgent']

const priorityColor: Record<WorkOrder['priority'], 'gray' | 'blue' | 'yellow' | 'red'> = {
  low: 'gray', medium: 'blue', high: 'yellow', urgent: 'red',
}
const statusColor: Record<WorkOrder['status'], 'blue' | 'yellow' | 'green' | 'red' | 'gray'> = {
  open: 'blue', assigned: 'yellow', in_progress: 'yellow', completed: 'green', cancelled: 'gray',
}

export default function MaintenancePage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingOrder, setEditingOrder] = useState<WorkOrder | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [detailOrder, setDetailOrder] = useState<WorkOrder | null>(null)
  const [noteText, setNoteText] = useState('')
  const [detailBusy, setDetailBusy] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const formRef = useRef<HTMLFormElement>(null)

  function loadWorkOrders() {
    const tenantId = getTenantId() ?? ''
    setLoading(true)
    api.maintenance
      .list(tenantId)
      .then((res) => setWorkOrders(res.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadWorkOrders() }, [])

  function openNewForm() {
    setEditingOrder(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEditForm(order: WorkOrder) {
    setEditingOrder(order)
    setFormError(null)
    setShowForm(true)
    setDetailOrder(null)
  }

  function closeForm() {
    setShowForm(false)
    setEditingOrder(null)
    setFormError(null)
  }

  function openDetail(order: WorkOrder) {
    setDetailOrder(order)
    setNoteText('')
    setDetailError(null)
  }

  function closeDetail() {
    setDetailOrder(null)
    setNoteText('')
    setDetailError(null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)

    const form = e.currentTarget
    const get = (name: string) =>
      (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value

    const tenantId = getTenantId() ?? ''
    const userId = getUserId()
    if (!userId) {
      setFormError('Session expired — please log in again.')
      setSubmitting(false)
      return
    }

    const roomId = get('roomId').trim() || undefined

    try {
      if (editingOrder) {
        await api.maintenance.update(editingOrder.id, tenantId, {
          title: get('title'),
          description: get('description'),
          category: get('category'),
          priority: get('priority'),
          roomId: roomId ?? null,
        })
      } else {
        const input: CreateWorkOrderInput = {
          tenantId,
          title: get('title'),
          description: get('description'),
          category: get('category'),
          priority: get('priority'),
          reportedBy: userId,
          ...(roomId ? { roomId } : {}),
        }
        await api.maintenance.create(input)
      }
      closeForm()
      loadWorkOrders()
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMarkResolved() {
    if (!detailOrder) return
    setDetailBusy(true)
    setDetailError(null)
    try {
      const tenantId = getTenantId() ?? ''
      const updated = await api.maintenance.updateStatus(detailOrder.id, tenantId, 'completed')
      setDetailOrder(updated.data)
      setWorkOrders((prev) => prev.map((o) => (o.id === updated.data.id ? updated.data : o)))
    } catch (err) {
      setDetailError((err as Error).message)
    } finally {
      setDetailBusy(false)
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!detailOrder || !noteText.trim()) return
    setDetailBusy(true)
    setDetailError(null)
    try {
      const tenantId = getTenantId() ?? ''
      const updated = await api.maintenance.updateStatus(
        detailOrder.id,
        tenantId,
        detailOrder.status,
        noteText.trim(),
      )
      setDetailOrder(updated.data)
      setWorkOrders((prev) => prev.map((o) => (o.id === updated.data.id ? updated.data : o)))
      setNoteText('')
    } catch (err) {
      setDetailError((err as Error).message)
    } finally {
      setDetailBusy(false)
    }
  }

  const isTerminal = detailOrder?.status === 'completed' || detailOrder?.status === 'cancelled'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Maintenance</h1>
        <Button onClick={openNewForm}>New work order</Button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 mb-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">
            {editingOrder ? 'Edit Work Order' : 'New Work Order'}
          </h2>

          <form ref={formRef} onSubmit={handleSubmit} noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-1">
                  Title
                </label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  required
                  defaultValue={editingOrder?.title ?? ''}
                  key={editingOrder?.id ?? 'new-title'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g. Broken air conditioning unit"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  required
                  defaultValue={editingOrder?.description ?? ''}
                  key={editingOrder?.id ?? 'new-desc'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                  placeholder="Describe the issue in detail…"
                />
              </div>

              <div>
                <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">
                  Category
                </label>
                <select
                  id="category"
                  name="category"
                  required
                  defaultValue={editingOrder?.category ?? CATEGORIES[0]}
                  key={editingOrder?.id ?? 'new-cat'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} className="capitalize">{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="priority" className="block text-sm font-medium text-slate-700 mb-1">
                  Priority
                </label>
                <select
                  id="priority"
                  name="priority"
                  required
                  defaultValue={editingOrder?.priority ?? PRIORITIES[1]}
                  key={editingOrder?.id ?? 'new-pri'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p} className="capitalize">{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="roomId" className="block text-sm font-medium text-slate-700 mb-1">
                  Room ID <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  id="roomId"
                  name="roomId"
                  type="text"
                  defaultValue={editingOrder?.roomId ?? ''}
                  key={editingOrder?.id ?? 'new-room'}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g. room-uuid"
                />
              </div>
            </div>

            {formError && (
              <p role="alert" className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {formError}
              </p>
            )}

            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Saving…' : editingOrder ? 'Save changes' : 'Submit work order'}
              </button>
              <Button variant="secondary" onClick={closeForm}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {loading && <p className="text-slate-400 text-sm">Loading…</p>}

      {error && !loading && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-md px-4 py-3">
          Failed to load work orders: {error}
        </p>
      )}

      {!loading && !error && (
        <WorkOrderList
          workOrders={workOrders}
          onEdit={openEditForm}
          onSelect={openDetail}
        />
      )}

      {/* Detail panel */}
      {detailOrder && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Work order details"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={closeDetail}
            aria-label="Close"
          />
          <div className="relative z-10 h-full w-full max-w-md bg-white shadow-xl flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-800">Work Order Details</h2>
              <button
                type="button"
                onClick={closeDetail}
                className="text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
                aria-label="Close panel"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5 flex-1 space-y-5">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{detailOrder.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 capitalize">{detailOrder.category}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Badge color={priorityColor[detailOrder.priority]}>{detailOrder.priority}</Badge>
                  <Badge color={statusColor[detailOrder.status]}>{detailOrder.status.replace(/_/g, ' ')}</Badge>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailOrder.description}</p>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {detailOrder.roomId && (
                  <>
                    <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Room</dt>
                    <dd className="text-slate-800 font-mono text-xs">{detailOrder.roomId}</dd>
                  </>
                )}
                <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Reported by</dt>
                <dd className="text-slate-800 font-mono text-xs truncate">{detailOrder.reportedBy}</dd>
                <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Created</dt>
                <dd className="text-slate-800 text-xs">{new Date(detailOrder.createdAt).toLocaleString()}</dd>
                {detailOrder.completedAt && (
                  <>
                    <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Completed</dt>
                    <dd className="text-slate-800 text-xs">{new Date(detailOrder.completedAt).toLocaleString()}</dd>
                  </>
                )}
              </dl>

              {detailOrder.notes && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Technician notes</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded-md px-3 py-2 whitespace-pre-wrap">
                    {detailOrder.notes}
                  </p>
                </div>
              )}

              {detailError && (
                <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {detailError}
                </p>
              )}

              {!isTerminal && (
                <button
                  type="button"
                  disabled={detailBusy}
                  onClick={handleMarkResolved}
                  className="w-full py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {detailBusy ? 'Saving…' : 'Mark as Resolved'}
                </button>
              )}

              {!isTerminal && (
                <form onSubmit={handleAddNote} className="space-y-2">
                  <label htmlFor="note" className="block text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Add note / response
                  </label>
                  <textarea
                    id="note"
                    rows={3}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                    placeholder="Add technician notes or a response…"
                  />
                  <button
                    type="submit"
                    disabled={detailBusy || !noteText.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {detailBusy ? 'Saving…' : 'Save note'}
                  </button>
                </form>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => { openEditForm(detailOrder); closeDetail() }}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium focus:outline-none"
                >
                  Edit this work order →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
