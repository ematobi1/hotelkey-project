import { describe, it, expect, vi } from 'vitest'
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
  findAvailableRooms: vi.fn().mockResolvedValue([]),
  findByIdOrThrow: vi.fn().mockResolvedValue(makeReservation()),
  create: vi.fn().mockResolvedValue(makeReservation()),
  list: vi.fn().mockResolvedValue([makeReservation()]),
  updateStatus: vi.fn(),
  getPool: vi.fn(),
  ...overrides,
})

const makeProducer = () => ({ publish: vi.fn().mockResolvedValue(undefined) })

const makeRedlock = () => ({
  acquire: vi.fn().mockResolvedValue({ release: vi.fn() }),
})

describe('ReservationService.getAvailability', () => {
  it('throws BadRequestError when check-out is not after check-in', async () => {
    const svc = new ReservationService(makeReservationRepo() as any, makeProducer() as any, makeRedlock() as any)
    await expect(
      svc.getAvailability({
        tenantId: 'tenant-1',
        checkInDate: new Date('2026-07-05'),
        checkOutDate: new Date('2026-07-01'),
        roomTypeId: undefined,
      }),
    ).rejects.toThrow(BadRequestError)
  })

  it('throws BadRequestError when check-in equals check-out', async () => {
    const svc = new ReservationService(makeReservationRepo() as any, makeProducer() as any, makeRedlock() as any)
    const same = new Date('2026-07-01')
    await expect(
      svc.getAvailability({ tenantId: 'tenant-1', checkInDate: same, checkOutDate: same }),
    ).rejects.toThrow(BadRequestError)
  })

  it('delegates valid query to repository', async () => {
    const repo = makeReservationRepo()
    const svc = new ReservationService(repo as any, makeProducer() as any, makeRedlock() as any)
    await svc.getAvailability({
      tenantId: 'tenant-1',
      checkInDate: new Date('2026-07-01'),
      checkOutDate: new Date('2026-07-05'),
    })
    expect(repo.findAvailableRooms).toHaveBeenCalledOnce()
  })
})

describe('ReservationService.cancelReservation', () => {
  it('throws ConflictError when already cancelled', async () => {
    const repo = makeReservationRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeReservation({ status: 'cancelled' })),
    })
    const svc = new ReservationService(repo as any, makeProducer() as any, makeRedlock() as any)
    await expect(svc.cancelReservation('res-1', 'tenant-1')).rejects.toThrow(ConflictError)
  })

  it('throws ConflictError when already checked out', async () => {
    const repo = makeReservationRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeReservation({ status: 'checked_out' })),
    })
    const svc = new ReservationService(repo as any, makeProducer() as any, makeRedlock() as any)
    await expect(svc.cancelReservation('res-1', 'tenant-1')).rejects.toThrow(ConflictError)
  })

  it('cancels a confirmed reservation and publishes event', async () => {
    const repo = makeReservationRepo({
      updateStatus: vi.fn().mockResolvedValue(makeReservation({ status: 'cancelled' })),
    })
    const producer = makeProducer()
    const svc = new ReservationService(repo as any, producer as any, makeRedlock() as any)
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
    const svc = new ReservationService(repo as any, makeProducer() as any, makeRedlock() as any)
    await expect(svc.checkIn('res-1', 'tenant-1')).rejects.toThrow(ConflictError)
  })

  it('checks in a confirmed reservation', async () => {
    const repo = makeReservationRepo({
      updateStatus: vi.fn().mockResolvedValue(makeReservation({ status: 'checked_in', actualCheckIn: new Date() })),
    })
    const producer = makeProducer()
    const svc = new ReservationService(repo as any, producer as any, makeRedlock() as any)
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
    const svc = new ReservationService(repo as any, makeProducer() as any, makeRedlock() as any)
    await expect(svc.checkOut('res-1', 'tenant-1')).rejects.toThrow(ConflictError)
  })

  it('checks out a checked-in reservation', async () => {
    const repo = makeReservationRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeReservation({ status: 'checked_in' })),
      updateStatus: vi.fn().mockResolvedValue(makeReservation({ status: 'checked_out', actualCheckOut: new Date() })),
    })
    const producer = makeProducer()
    const svc = new ReservationService(repo as any, producer as any, makeRedlock() as any)
    const result = await svc.checkOut('res-1', 'tenant-1')
    expect(result.status).toBe('checked_out')
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})
