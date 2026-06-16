'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { getTenantId } from '@/lib/auth'
import type { AvailabilityResult, Guest, RoomType } from '@/types'
import Button from '@/components/ui/Button'

interface Props {
  onClose: () => void
  onCreated: () => void
}

interface NewGuestForm {
  firstName: string
  lastName: string
  email: string
  phone: string
}

type GuestMode = 'search' | 'new'

const inputCls =
  'w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors'

const labelCls = 'block text-xs font-medium text-slate-400 mb-1'

export default function NewReservationModal({ onClose, onCreated }: Props) {
  const tenantId = getTenantId() ?? ''

  const [checkInDate, setCheckInDate] = useState('')
  const [checkOutDate, setCheckOutDate] = useState('')
  const [adults, setAdults] = useState(1)
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [roomTypeId, setRoomTypeId] = useState('')
  const [availableRooms, setAvailableRooms] = useState<AvailabilityResult[] | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<AvailabilityResult | null>(null)
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)

  const [guestMode, setGuestMode] = useState<GuestMode>('search')
  const [guestQuery, setGuestQuery] = useState('')
  const [guestResults, setGuestResults] = useState<Guest[]>([])
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null)
  const [showGuestDropdown, setShowGuestDropdown] = useState(false)
  const [newGuest, setNewGuest] = useState<NewGuestForm>({ firstName: '', lastName: '', email: '', phone: '' })
  const [searchingGuests, setSearchingGuests] = useState(false)
  const guestSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ confirmationCode: string } | null>(null)

  useEffect(() => {
    api.roomTypes.list(tenantId).then((res) => setRoomTypes(res.data)).catch(() => {})
  }, [tenantId])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowGuestDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (guestMode !== 'search') return
    if (guestQuery.length < 2) {
      setGuestResults([])
      setShowGuestDropdown(false)
      return
    }
    if (guestSearchTimeout.current) clearTimeout(guestSearchTimeout.current)
    guestSearchTimeout.current = setTimeout(() => {
      setSearchingGuests(true)
      api.guests
        .search(tenantId, guestQuery)
        .then((res) => {
          setGuestResults(res.data)
          setShowGuestDropdown(true)
        })
        .catch(() => {})
        .finally(() => setSearchingGuests(false))
    }, 300)
    return () => {
      if (guestSearchTimeout.current) clearTimeout(guestSearchTimeout.current)
    }
  }, [guestQuery, guestMode, tenantId])

  const dateError =
    checkInDate && checkOutDate && checkOutDate <= checkInDate
      ? 'Check-out must be after check-in'
      : null

  const canCheckAvailability = checkInDate && checkOutDate && !dateError && adults >= 1

  async function handleCheckAvailability() {
    setAvailabilityError(null)
    setAvailableRooms(null)
    setSelectedRoom(null)
    setSelectedGuest(null)
    setCheckingAvailability(true)
    try {
      const res = await api.reservations.checkAvailability({
        tenantId,
        checkInDate,
        checkOutDate,
        adults,
        roomTypeId: roomTypeId || undefined,
      })
      setAvailableRooms(res.data)
    } catch (err) {
      setAvailabilityError((err as Error).message)
    } finally {
      setCheckingAvailability(false)
    }
  }

  function handleSelectGuest(g: Guest) {
    setSelectedGuest(g)
    setGuestQuery(`${g.firstName} ${g.lastName}`)
    setShowGuestDropdown(false)
  }

  function handleGuestModeChange(mode: GuestMode) {
    setGuestMode(mode)
    setSelectedGuest(null)
    setGuestQuery('')
    setGuestResults([])
    setNewGuest({ firstName: '', lastName: '', email: '', phone: '' })
  }

  const canConfirm =
    selectedRoom !== null &&
    (guestMode === 'search'
      ? selectedGuest !== null
      : newGuest.firstName.trim() !== '' && newGuest.lastName.trim() !== '')

  async function handleConfirm() {
    if (!selectedRoom) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      let guestId: string
      if (guestMode === 'new') {
        const res = await api.guests.create({
          tenantId,
          firstName: newGuest.firstName.trim(),
          lastName: newGuest.lastName.trim(),
          email: newGuest.email.trim() || undefined,
          phone: newGuest.phone.trim() || undefined,
        })
        guestId = res.data.id
      } else {
        guestId = selectedGuest!.id
      }

      const res = await api.reservations.create({
        tenantId,
        guestId,
        roomId: selectedRoom.roomId,
        checkInDate,
        checkOutDate,
        adults,
        ratePerNight: selectedRoom.ratePerNight,
        currencyCode: selectedRoom.currencyCode,
        source: 'direct',
      })

      setSuccess({ confirmationCode: res.data.confirmationCode })
      onCreated()
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const nights = selectedRoom?.nights ?? 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-10 pb-10 px-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="New reservation"
    >
      <div className="w-full max-w-xl bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">New Reservation</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-100 mb-1">Reservation confirmed</p>
            <p className="text-sm text-slate-400 mb-5">
              Confirmation code:{' '}
              <span className="font-mono font-medium text-cyan-400">{success.confirmationCode}</span>
            </p>
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-6">
            <section aria-labelledby="section-dates">
              <h3 id="section-dates" className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Dates &amp; Room Type
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label htmlFor="checkIn" className={labelCls}>Check-in</label>
                  <input
                    id="checkIn"
                    type="date"
                    value={checkInDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => {
                      setCheckInDate(e.target.value)
                      setAvailableRooms(null)
                      setSelectedRoom(null)
                    }}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="checkOut" className={labelCls}>Check-out</label>
                  <input
                    id="checkOut"
                    type="date"
                    value={checkOutDate}
                    min={checkInDate || new Date().toISOString().split('T')[0]}
                    onChange={(e) => {
                      setCheckOutDate(e.target.value)
                      setAvailableRooms(null)
                      setSelectedRoom(null)
                    }}
                    className={inputCls}
                  />
                </div>
              </div>
              {dateError && (
                <p className="text-xs text-red-400 mb-3">{dateError}</p>
              )}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label htmlFor="adults" className={labelCls}>Adults</label>
                  <select
                    id="adults"
                    value={adults}
                    onChange={(e) => { setAdults(Number(e.target.value)); setAvailableRooms(null); setSelectedRoom(null) }}
                    className={inputCls}
                  >
                    {[1,2,3,4].map(n => <option key={n} value={n} className="bg-slate-800">{n}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="roomType" className={labelCls}>
                    Room type <span className="text-slate-600 font-normal">(optional)</span>
                  </label>
                  <select
                    id="roomType"
                    value={roomTypeId}
                    onChange={(e) => { setRoomTypeId(e.target.value); setAvailableRooms(null); setSelectedRoom(null) }}
                    className={inputCls}
                  >
                    <option value="" className="bg-slate-800">Any type</option>
                    {roomTypes.map(rt => (
                      <option key={rt.id} value={rt.id} className="bg-slate-800">{rt.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Button
                onClick={handleCheckAvailability}
                disabled={!canCheckAvailability || checkingAvailability}
              >
                {checkingAvailability ? 'Checking…' : 'Check Availability'}
              </Button>
              {availabilityError && (
                <p role="alert" className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {availabilityError}
                </p>
              )}
            </section>

            {availableRooms !== null && (
              <section aria-labelledby="section-rooms">
                <h3 id="section-rooms" className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                  Available Rooms {availableRooms.length > 0 && `(${availableRooms.length})`}
                </h3>
                {availableRooms.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-800 rounded-xl px-4 py-3 text-center">
                    No rooms available for these dates.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {availableRooms.map((room) => (
                      <button
                        key={room.roomId}
                        type="button"
                        onClick={() => setSelectedRoom(room)}
                        className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                          selectedRoom?.roomId === room.roomId
                            ? 'border-cyan-500 bg-cyan-500/[0.08]'
                            : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-slate-100">Room {room.roomNumber}</span>
                            <span className="ml-2 text-slate-400">{room.roomTypeName}</span>
                            {room.isAccessible && (
                              <span className="ml-2 text-xs text-cyan-400">♿ Accessible</span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="font-semibold text-slate-100">
                              ${room.ratePerNight.toFixed(0)}/night
                            </span>
                            <div className="text-xs text-slate-500">
                              ${room.totalAmount.toFixed(0)} total
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">Floor {room.floor}</div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {selectedRoom && (
              <section aria-labelledby="section-guest">
                <h3 id="section-guest" className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                  Guest
                </h3>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => handleGuestModeChange('search')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      guestMode === 'search'
                        ? 'bg-cyan-500 text-slate-900'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    Search existing
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGuestModeChange('new')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      guestMode === 'new'
                        ? 'bg-cyan-500 text-slate-900'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    New guest
                  </button>
                </div>

                {guestMode === 'search' ? (
                  <div className="relative" ref={dropdownRef}>
                    <label htmlFor="guestSearch" className={labelCls}>
                      Search by name or email
                    </label>
                    <input
                      id="guestSearch"
                      type="search"
                      value={guestQuery}
                      onChange={(e) => {
                        setGuestQuery(e.target.value)
                        if (selectedGuest) setSelectedGuest(null)
                      }}
                      placeholder="Type at least 2 characters…"
                      className={inputCls}
                      autoComplete="off"
                    />
                    {searchingGuests && (
                      <span className="absolute right-3 top-8 text-xs text-slate-500">Searching…</span>
                    )}
                    {showGuestDropdown && guestResults.length > 0 && (
                      <ul className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl shadow-black/40 max-h-48 overflow-y-auto">
                        {guestResults.map((g) => (
                          <li key={g.id}>
                            <button
                              type="button"
                              onClick={() => handleSelectGuest(g)}
                              className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-700 transition-colors first:rounded-t-xl last:rounded-b-xl"
                            >
                              <span className="font-medium text-slate-100">{g.firstName} {g.lastName}</span>
                              {g.email && <span className="ml-2 text-slate-500 text-xs">{g.email}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {showGuestDropdown && guestResults.length === 0 && !searchingGuests && guestQuery.length >= 2 && (
                      <p className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl px-3 py-2.5 text-sm text-slate-500">
                        No guests found. Try "New guest" to create one.
                      </p>
                    )}
                    {selectedGuest && (
                      <p className="mt-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
                        ✓ {selectedGuest.firstName} {selectedGuest.lastName}
                        {selectedGuest.email ? ` · ${selectedGuest.email}` : ''}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="nFirstName" className={labelCls}>
                        First name <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="nFirstName"
                        type="text"
                        value={newGuest.firstName}
                        onChange={(e) => setNewGuest(p => ({ ...p, firstName: e.target.value }))}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label htmlFor="nLastName" className={labelCls}>
                        Last name <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="nLastName"
                        type="text"
                        value={newGuest.lastName}
                        onChange={(e) => setNewGuest(p => ({ ...p, lastName: e.target.value }))}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label htmlFor="nEmail" className={labelCls}>Email</label>
                      <input
                        id="nEmail"
                        type="email"
                        value={newGuest.email}
                        onChange={(e) => setNewGuest(p => ({ ...p, email: e.target.value }))}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label htmlFor="nPhone" className={labelCls}>Phone</label>
                      <input
                        id="nPhone"
                        type="tel"
                        value={newGuest.phone}
                        onChange={(e) => setNewGuest(p => ({ ...p, phone: e.target.value }))}
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}
              </section>
            )}

            {selectedRoom && canConfirm && (
              <section aria-labelledby="section-confirm">
                <h3 id="section-confirm" className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                  Summary
                </h3>
                <div className="bg-slate-800 rounded-xl border border-slate-700 px-4 py-3.5 text-sm space-y-2 mb-4">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Room</span>
                    <span className="text-slate-100 font-medium">
                      {selectedRoom.roomNumber} · {selectedRoom.roomTypeName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Dates</span>
                    <span className="text-slate-300">
                      {checkInDate} → {checkOutDate}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nights</span>
                    <span className="text-slate-300">{nights}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Rate</span>
                    <span className="text-slate-300">
                      ${selectedRoom.ratePerNight.toFixed(0)} / night
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-700 pt-2 mt-1">
                    <span className="font-medium text-slate-400">Total</span>
                    <span className="font-semibold text-slate-100">
                      ${selectedRoom.totalAmount.toFixed(0)} {selectedRoom.currencyCode}
                    </span>
                  </div>
                </div>

                {submitError && (
                  <p role="alert" className="mb-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {submitError}
                  </p>
                )}

                <Button
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="w-full justify-center"
                >
                  {submitting ? 'Saving…' : 'Confirm Reservation'}
                </Button>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
