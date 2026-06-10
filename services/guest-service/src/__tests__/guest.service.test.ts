import { describe, it, expect, vi } from 'vitest'
import { GuestService } from '../services/guest.service'

vi.mock('@hotel-key/kafka', () => ({
  createCloudEvent: vi.fn().mockReturnValue({ id: 'evt-1', type: 'test' }),
}))

const makeGuest = (overrides = {}) => ({
  id: 'guest-1',
  tenantId: 'tenant-1',
  email: 'guest@hotel.com',
  firstName: 'Jane',
  lastName: 'Doe',
  phone: null,
  nationality: null,
  dateOfBirth: null,
  vipLevel: 'none' as const,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeGuestRepo = (overrides = {}) => ({
  create: vi.fn().mockResolvedValue(makeGuest()),
  findByIdOrThrow: vi.fn().mockResolvedValue(makeGuest()),
  update: vi.fn().mockResolvedValue(makeGuest()),
  softDelete: vi.fn().mockResolvedValue(undefined),
  anonymise: vi.fn().mockResolvedValue(undefined),
  search: vi.fn().mockResolvedValue([makeGuest()]),
  getPreferences: vi.fn().mockResolvedValue(null),
  upsertPreferences: vi.fn(),
  ...overrides,
})

const makeProducer = () => ({ publish: vi.fn().mockResolvedValue(undefined) })

describe('GuestService.createGuest', () => {
  it('creates guest and publishes event', async () => {
    const guestRepo = makeGuestRepo()
    const producer = makeProducer()
    const svc = new GuestService(guestRepo as any, producer as any)

    const result = await svc.createGuest({
      tenantId: 'tenant-1',
      email: 'guest@hotel.com',
      firstName: 'Jane',
      lastName: 'Doe',
    })

    expect(result.id).toBe('guest-1')
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})

describe('GuestService.getGuest', () => {
  it('delegates to repository', async () => {
    const guestRepo = makeGuestRepo()
    const svc = new GuestService(guestRepo as any, makeProducer() as any)
    await svc.getGuest('guest-1', 'tenant-1')
    expect(guestRepo.findByIdOrThrow).toHaveBeenCalledWith('guest-1', 'tenant-1')
  })
})

describe('GuestService.updateGuest', () => {
  it('updates guest and publishes event', async () => {
    const guestRepo = makeGuestRepo()
    const producer = makeProducer()
    const svc = new GuestService(guestRepo as any, producer as any)
    await svc.updateGuest('guest-1', 'tenant-1', { phone: '+1234567890' })
    expect(guestRepo.update).toHaveBeenCalledWith('guest-1', 'tenant-1', { phone: '+1234567890' })
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})

describe('GuestService.deleteGuest', () => {
  it('soft-deletes, anonymises, and publishes event', async () => {
    const guestRepo = makeGuestRepo()
    const producer = makeProducer()
    const svc = new GuestService(guestRepo as any, producer as any)
    await svc.deleteGuest('guest-1', 'tenant-1')
    expect(guestRepo.softDelete).toHaveBeenCalledWith('guest-1', 'tenant-1')
    expect(guestRepo.anonymise).toHaveBeenCalledWith('guest-1', 'tenant-1')
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})

describe('GuestService.searchGuests', () => {
  it('delegates to repository', async () => {
    const guestRepo = makeGuestRepo()
    const svc = new GuestService(guestRepo as any, makeProducer() as any)
    const results = await svc.searchGuests('tenant-1', 'Jane')
    expect(guestRepo.search).toHaveBeenCalledWith('tenant-1', 'Jane')
    expect(results).toHaveLength(1)
  })
})
