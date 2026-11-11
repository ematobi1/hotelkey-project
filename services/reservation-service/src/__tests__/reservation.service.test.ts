import { describe, it, expect, vi, afterEach } from 'vitest'
import { ReservationService } from '../services/reservation.service'
import { BadRequestError, ConflictError } from '@hotel-key/types'

vi.mock('@hotel-key/kafka', () => ({
  createCloudEvent: vi.fn().mockReturnValue({ id: 'evt-1' }),
}))

const makeReservation = (overrides = {}) => ({
  id: 'res-1',
  tenantId: 'tenant-1',
  guestId: 'guest-1',
  roomId: 'room-1',
  status: 'confirmed' as const,
  checkInDate: new Date('2026-07-01'),
  checkOutDate: new Date('2026-07-05'),
  totalAmount: 400,
  currencyCode: 'USD',
  actualCheckIn: null,
  actualCheckOut: null,
  ratePlan: 'bar' as const,
  confirmationCode: 'ABC123',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeReservationRepo = (overrides = {}) => ({
  findConflictedRoomIds: vi.fn().mockResolvedValue([]),
  findByIdOrThrow: vi.fn().mockResolvedValue(makeReservation()),
  create: vi.fn().mockResolvedValue(makeReservation()),
  list: vi.fn().mockResolvedValue([makeReservation()]),
  updateStatus: vi.fn(),
  getPool: vi.fn(),
  ...overrides,
})

const ROOM_SERVICE_URL = 'http://room-service.test'

const makeProducer = () => ({ publish: vi.fn().mockResolvedValue(undefined) })

const makeRedlock = () => ({
  acquire: vi.fn().mockResolvedValue({ release: vi.fn() }),
})

describe('ReservationService.getAvailability', () => {
  it('throws BadRequestError when check-out is not after check-in', async () => {
    const svc = new ReservationService(makeReservationRepo() as any, makeProducer() as any, makeRedlock() as any, ROOM_SERVICE_URL)
    await expect(
      svc.getAvailability({
        tenantId: 'tenant-1',
        checkInDate: new Date('2026-07-05'),
        checkOutDate: new Date('2026-07-01'),
        adults: 2,
        roomTypeId: undefined,
      }),
    ).rejects.toThrow(BadRequestError)
  })

  it('throws BadRequestError when check-in equals check-out', async () => {
    const svc = new ReservationService(makeReservationRepo() as any, makeProducer() as any, makeRedlock() as any, ROOM_SERVICE_URL)
    const same = new Date('2026-07-01')
    await expect(
      svc.getAvailability({ tenantId: 'tenant-1', checkInDate: same, checkOutDate: same, adults: 2 }),
    ).rejects.toThrow(BadRequestError)
  })

  describe('with room-service data', () => {
    const room = (id: string, overrides = {}) => ({
      id, tenantId: 'tenant-1', roomNumber: id.replace('room-', ''), floor: 1, wing: null,
      roomTypeId: 'type-std', status: 'clean', amenities: ['wifi'], maxOccupancy: 2,
      isAccessible: false, notes: null, lastMaintenanceDate: null, nextMaintenanceDue: null,
      deletedAt: null, createdAt: new Date(), updatedAt: new Date(), ...overrides,
    })
    const roomType = { id: 'type-std', name: 'Standard', baseRate: 100, currencyCode: 'USD' }

    const stubRoomService = (rooms: unknown[], types: unknown[] = [roomType], ok = true) => {
      const fetchMock = vi.fn(async (url: string) => ({
        ok,
        json: async () => ({ data: url.includes('/v1/rooms/types') ? types : rooms }),
      }))
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    const query = {
      tenantId: 'tenant-1',
      checkInDate: new Date('2026-07-01'),
      checkOutDate: new Date('2026-07-05'),
      adults: 2,
    }

    it('queries room-service and excludes rooms with conflicting reservations', async () => {
      const fetchMock = stubRoomService([
        room('room-201', { floor: 2 }),
        room('room-101'),
        room('room-102'),
      ])
      const repo = makeReservationRepo({
        findConflictedRoomIds: vi.fn().mockResolvedValue(['room-102']),
      })
      const svc = new ReservationService(repo as any, makeProducer() as any, makeRedlock() as any, ROOM_SERVICE_URL)

      const result = await svc.getAvailability(query)

      expect(fetchMock).toHaveBeenCalledWith(`${ROOM_SERVICE_URL}/v1/rooms?tenantId=tenant-1`)
      expect(fetchMock).toHaveBeenCalledWith(`${ROOM_SERVICE_URL}/v1/rooms/types?tenantId=tenant-1`)
      expect(repo.findConflictedRoomIds).toHaveBeenCalledWith(
        'tenant-1', ['room-201', 'room-101', 'room-102'], query.checkInDate, query.checkOutDate,
      )
      // sorted by floor, then room number; 4 nights at the base rate
      expect(result.map((r) => r.roomId)).toEqual(['room-101', 'room-201'])
      expect(result[0]).toMatchObject({ nights: 4, ratePerNight: 100, totalAmount: 400, currencyCode: 'USD' })
    })

    it('only offers clean, active rooms that fit the party', async () => {
      stubRoomService([
        room('room-101', { status: 'dirty' }),
        room('room-102', { deletedAt: new Date() }),
        room('room-103', { maxOccupancy: 1 }),
        room('room-104'),
      ])
      const svc = new ReservationService(makeReservationRepo() as any, makeProducer() as any, makeRedlock() as any, ROOM_SERVICE_URL)

      const result = await svc.getAvailability(query)

      expect(result.map((r) => r.roomId)).toEqual(['room-104'])
    })

    it('returns no rooms without hitting the database when none are eligible', async () => {
      stubRoomService([room('room-101', { status: 'dirty' })])
      const repo = makeReservationRepo()
      const svc = new ReservationService(repo as any, makeProducer() as any, makeRedlock() as any, ROOM_SERVICE_URL)

      expect(await svc.getAvailability(query)).toEqual([])
      expect(repo.findConflictedRoomIds).not.toHaveBeenCalled()
    })

    it('fails loudly when room-service is unavailable', async () => {
      stubRoomService([], [], false)
      const svc = new ReservationService(makeReservationRepo() as any, makeProducer() as any, makeRedlock() as any, ROOM_SERVICE_URL)

      await expect(svc.getAvailability(query)).rejects.toThrow('Failed to fetch room data from room-service')
    })
  })
})

describe('ReservationService.cancelReservation', () => {
  it('throws ConflictError when already cancelled', async () => {
    const repo = makeReservationRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeReservation({ status: 'cancelled' })),
    })
    const svc = new ReservationService(repo as any, makeProducer() as any, makeRedlock() as any, ROOM_SERVICE_URL)
    await expect(svc.cancelReservation('res-1', 'tenant-1')).rejects.toThrow(ConflictError)
  })

  it('throws ConflictError when already checked out', async () => {
    const repo = makeReservationRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeReservation({ status: 'checked_out' })),
    })
    const svc = new ReservationService(repo as any, makeProducer() as any, makeRedlock() as any, ROOM_SERVICE_URL)
    await expect(svc.cancelReservation('res-1', 'tenant-1')).rejects.toThrow(ConflictError)
  })

  it('cancels a confirmed reservation and publishes event', async () => {
    const repo = makeReservationRepo({
      updateStatus: vi.fn().mockResolvedValue(makeReservation({ status: 'cancelled' })),
    })
    const producer = makeProducer()
    const svc = new ReservationService(repo as any, producer as any, makeRedlock() as any, ROOM_SERVICE_URL)
    const result = await svc.cancelReservation('res-1', 'tenant-1')
    expect(result.status).toBe('cancelled')
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})

describe('ReservationService.checkIn', () => {
  it('throws ConflictError when not confirmed', async () => {
    const repo = makeReservationRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeReservation({ status: 'checked_in' })),
    })
    const svc = new ReservationService(repo as any, makeProducer() as any, makeRedlock() as any, ROOM_SERVICE_URL)
    await expect(svc.checkIn('res-1', 'tenant-1')).rejects.toThrow(ConflictError)
  })

  it('checks in a confirmed reservation', async () => {
    const repo = makeReservationRepo({
      updateStatus: vi.fn().mockResolvedValue(makeReservation({ status: 'checked_in', actualCheckIn: new Date() })),
    })
    const producer = makeProducer()
    const svc = new ReservationService(repo as any, producer as any, makeRedlock() as any, ROOM_SERVICE_URL)
    const result = await svc.checkIn('res-1', 'tenant-1')
    expect(result.status).toBe('checked_in')
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})

describe('ReservationService.checkOut', () => {
  it('throws ConflictError when not checked in', async () => {
    const repo = makeReservationRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeReservation({ status: 'confirmed' })),
    })
    const svc = new ReservationService(repo as any, makeProducer() as any, makeRedlock() as any, ROOM_SERVICE_URL)
    await expect(svc.checkOut('res-1', 'tenant-1')).rejects.toThrow(ConflictError)
  })

  it('checks out a checked-in reservation', async () => {
    const repo = makeReservationRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeReservation({ status: 'checked_in' })),
      updateStatus: vi.fn().mockResolvedValue(makeReservation({ status: 'checked_out', actualCheckOut: new Date() })),
    })
    const producer = makeProducer()
    const svc = new ReservationService(repo as any, producer as any, makeRedlock() as any, ROOM_SERVICE_URL)
    const result = await svc.checkOut('res-1', 'tenant-1')
    expect(result.status).toBe('checked_out')
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})
