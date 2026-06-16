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
        <h1 className="text-2xl font-bold text-slate-100">Reservations</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{reservations.length} total</span>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-950 transition-colors"
          >
            + New Reservation
          </button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          {actionError}
        </p>
      )}

      {loading && <p className="text-slate-500 text-sm">Loading…</p>}

      {error && !loading && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          Failed to load reservations: {error}
        </p>
      )}

      {!loading && !error && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
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
