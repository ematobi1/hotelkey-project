'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getTenantId } from '@/lib/auth'
import type { Reservation } from '@/types'
import ReservationTable from '@/components/ReservationTable'
import NewReservationModal from '@/components/NewReservationModal'

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  function loadReservations() {
    const tenantId = getTenantId() ?? ''
    setLoading(true)
    api.reservations
      .list(tenantId)
      .then((res) => setReservations(res.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadReservations()
  }, [])

  async function handleCheckIn(id: string) {
    setActionError(null)
    try {
      const tenantId = getTenantId() ?? ''
      const { data } = await api.reservations.checkIn(id, tenantId)
      setReservations((prev) => prev.map((r) => (r.id === id ? data : r)))
    } catch (err) {
      setActionError((err as Error).message)
    }
  }

  async function handleCheckOut(id: string) {
    setActionError(null)
    try {
      const tenantId = getTenantId() ?? ''
      const { data } = await api.reservations.checkOut(id, tenantId)
      setReservations((prev) => prev.map((r) => (r.id === id ? data : r)))
    } catch (err) {
      setActionError((err as Error).message)
    }
  }

  return (
    <div className="p-8">
      {showModal && (
        <NewReservationModal
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); loadReservations() }}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Reservations</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">{reservations.length} total</span>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            + New Reservation
          </button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {actionError}
        </p>
      )}

      {loading && <p className="text-slate-400 text-sm">Loading…</p>}

      {error && !loading && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-md px-4 py-3">
          Failed to load reservations: {error}
        </p>
      )}

      {!loading && !error && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <ReservationTable
            reservations={reservations}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
          />
        </div>
      )}
    </div>
  )
}
