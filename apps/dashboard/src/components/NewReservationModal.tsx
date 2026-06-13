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

export default function NewReservationModal({ onClose, onCreated }: Props) {
  const tenantId = getTenantId() ?? ''

  // Step A — dates & availability
  const [checkInDate, setCheckInDate] = useState('')
  const [checkOutDate, setCheckOutDate] = useState('')
  const [adults, setAdults] = useState(1)
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [roomTypeId, setRoomTypeId] = useState('')
  const [availableRooms, setAvailableRooms] = useState<AvailabilityResult[] | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<AvailabilityResult | null>(null)
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)

  // Step B — guest
  const [guestMode, setGuestMode] = useState<GuestMode>('search')
  const [guestQuery, setGuestQuery] = useState('')
  const [guestResults, setGuestResults] = useState<Guest[]>([])
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null)
  const [showGuestDropdown, setShowGuestDropdown] = useState(false)
  const [newGuest, setNewGuest] = useState<NewGuestForm>({ firstName: '', lastName: '', email: '', phone: '' })
  const [searchingGuests, setSearchingGuests] = useState(false)
  const guestSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Step C — confirm
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ confirmationCode: string } | null>(null)

  // Load room types on mount
  useEffect(() => {
    api.roomTypes.list(tenantId).then((res) => setRoomTypes(res.data)).catch(() => {})
  }, [tenantId])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowGuestDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Guest search debounce
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

  const canCheckAvailability =
    checkInDate && checkOutDate && !dateError && adults >= 1

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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-10 pb-10 px-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="New reservation"
    >
      <div className="w-full max-w-xl bg-white rounded-xl shadow-xl border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">New Reservation</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-800 mb-1">Reservation confirmed</p>
            <p className="text-sm text-slate-500 mb-4">
              Confirmation code:{' '}
              <span className="font-mono font-medium text-slate-700">{success.confirmationCode}</span>
            </p>
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-6">
            {/* Section A — Dates */}
            <section aria-labelledby="section-dates">
              <h3 id="section-dates" className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Dates &amp; Room Type
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label htmlFor="checkIn" className="block text-xs font-medium text-slate-700 mb-1">
                    Check-in
                  </label>
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
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="checkOut" className="block text-xs font-medium text-slate-700 mb-1">
                    Check-out
                  </label>
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
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              {dateError && (
                <p className="text-xs text-red-600 mb-3">{dateError}</p>
              )}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label htmlFor="adults" className="block text-xs font-medium text-slate-700 mb-1">
                    Adults
                  </label>
                  <select
                    id="adults"
                    value={adults}
                    onChange={(e) => { setAdults(Number(e.target.value)); setAvailableRooms(null); setSelectedRoom(null) }}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="roomType" className="block text-xs font-medium text-slate-700 mb-1">
                    Room type <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <select
                    id="roomType"
                    value={roomTypeId}
                    onChange={(e) => { setRoomTypeId(e.target.value); setAvailableRooms(null); setSelectedRoom(null) }}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Any type</option>
                    {roomTypes.map(rt => (
                      <option key={rt.id} value={rt.id}>{rt.name}</option>
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
                <p role="alert" className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {availabilityError}
                </p>
              )}
            </section>

            {/* Section B — Available Rooms */}
            {availableRooms !== null && (
              <section aria-labelledby="section-rooms">
                <h3 id="section-rooms" className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Available Rooms {availableRooms.length > 0 && `(${availableRooms.length})`}
                </h3>
                {availableRooms.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-50 rounded-md px-4 py-3 text-center">
                    No rooms available for these dates.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {availableRooms.map((room) => (
                      <button
                        key={room.roomId}
                        type="button"
                        onClick={() => setSelectedRoom(room)}
                        className={`w-full text-left rounded-md border px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          selectedRoom?.roomId === room.roomId
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-slate-800">Room {room.roomNumber}</span>
                            <span className="ml-2 text-slate-500">{room.roomTypeName}</span>
                            {room.isAccessible && (
                              <span className="ml-2 text-xs text-indigo-600">♿ Accessible</span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="font-semibold text-slate-800">
                              ${room.ratePerNight.toFixed(0)}/night
                            </span>
                            <div className="text-xs text-slate-500">
                              ${room.totalAmount.toFixed(0)} total
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">Floor {room.floor}</div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Section C — Guest */}
            {selectedRoom && (
              <section aria-labelledby="section-guest">
                <h3 id="section-guest" className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Guest
                </h3>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => handleGuestModeChange('search')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                      guestMode === 'search'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Search existing
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGuestModeChange('new')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                      guestMode === 'new'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    New guest
                  </button>
                </div>

                {guestMode === 'search' ? (
                  <div className="relative" ref={dropdownRef}>
                    <label htmlFor="guestSearch" className="block text-xs font-medium text-slate-700 mb-1">
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
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      autoComplete="off"
                    />
                    {searchingGuests && (
                      <span className="absolute right-3 top-8 text-xs text-slate-400">Searching…</span>
                    )}
                    {showGuestDropdown && guestResults.length > 0 && (
                      <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {guestResults.map((g) => (
                          <li key={g.id}>
                            <button
                              type="button"
                              onClick={() => handleSelectGuest(g)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
                            >
                              <span className="font-medium text-slate-800">{g.firstName} {g.lastName}</span>
                              {g.email && <span className="ml-2 text-slate-500 text-xs">{g.email}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {showGuestDropdown && guestResults.length === 0 && !searchingGuests && guestQuery.length >= 2 && (
                      <p className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg px-3 py-2 text-sm text-slate-500">
                        No guests found. Try "New guest" to create one.
                      </p>
                    )}
                    {selectedGuest && (
                      <p className="mt-1 text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                        ✓ {selectedGuest.firstName} {selectedGuest.lastName}
                        {selectedGuest.email ? ` · ${selectedGuest.email}` : ''}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="nFirstName" className="block text-xs font-medium text-slate-700 mb-1">
                        First name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="nFirstName"
                        type="text"
                        value={newGuest.firstName}
                        onChange={(e) => setNewGuest(p => ({ ...p, firstName: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="nLastName" className="block text-xs font-medium text-slate-700 mb-1">
                        Last name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="nLastName"
                        type="text"
                        value={newGuest.lastName}
                        onChange={(e) => setNewGuest(p => ({ ...p, lastName: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="nEmail" className="block text-xs font-medium text-slate-700 mb-1">
                        Email
                      </label>
                      <input
                        id="nEmail"
                        type="email"
                        value={newGuest.email}
                        onChange={(e) => setNewGuest(p => ({ ...p, email: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="nPhone" className="block text-xs font-medium text-slate-700 mb-1">
                        Phone
                      </label>
                      <input
                        id="nPhone"
                        type="tel"
                        value={newGuest.phone}
                        onChange={(e) => setNewGuest(p => ({ ...p, phone: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Section D — Summary + Confirm */}
            {selectedRoom && canConfirm && (
              <section aria-labelledby="section-confirm">
                <h3 id="section-confirm" className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Summary
                </h3>
                <div className="bg-slate-50 rounded-lg border border-slate-200 px-4 py-3 text-sm space-y-1.5 mb-4">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Room</span>
                    <span className="text-slate-800 font-medium">
                      {selectedRoom.roomNumber} · {selectedRoom.roomTypeName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Dates</span>
                    <span className="text-slate-800">
                      {checkInDate} → {checkOutDate}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nights</span>
                    <span className="text-slate-800">{nights}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Rate</span>
                    <span className="text-slate-800">
                      ${selectedRoom.ratePerNight.toFixed(0)} / night
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1.5">
                    <span className="font-medium text-slate-700">Total</span>
                    <span className="font-semibold text-slate-800">
                      ${selectedRoom.totalAmount.toFixed(0)} {selectedRoom.currencyCode}
                    </span>
                  </div>
                </div>

                {submitError && (
                  <p role="alert" className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
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
