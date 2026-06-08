import { describe, it, expect, vi } from 'vitest'
import { BillingService } from '../services/billing.service'
import { ConflictError, NotFoundError } from '@hotel-key/types'

vi.mock('@hotel-key/kafka', () => ({
  createCloudEvent: vi.fn().mockReturnValue({ id: 'evt-1' }),
}))
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      paymentIntents: { create: vi.fn() },
    })),
  }
})

const makeFolio = (overrides = {}) => ({
  id: 'folio-1',
  tenantId: 'tenant-1',
  reservationId: 'res-1',
  status: 'open' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  closedAt: null,
  ...overrides,
})

const makeLineItem = (overrides = {}) => ({
  id: 'li-1',
  folioId: 'folio-1',
  tenantId: 'tenant-1',
  chargeType: 'room_rate' as const,
  description: 'Room charge',
  quantity: 1,
  unitAmount: 100,
  totalAmount: 100,
  currencyCode: 'USD',
  postedAt: new Date(),
  voidedAt: null,
  voidReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeFolioRepo = (overrides = {}) => ({
  findByReservationId: vi.fn().mockResolvedValue(makeFolio()),
  findByIdOrThrow: vi.fn().mockResolvedValue(makeFolio()),
  listLineItems: vi.fn().mockResolvedValue([makeLineItem()]),
  postCharge: vi.fn().mockResolvedValue(makeLineItem()),
  voidCharge: vi.fn().mockResolvedValue(undefined),
  closeFolio: vi.fn().mockResolvedValue(makeFolio({ status: 'closed' })),
  ...overrides,
})

const makeProducer = () => ({ publish: vi.fn().mockResolvedValue(undefined) })
const makePool = () => ({ query: vi.fn() })

const buildService = (folioRepoOverrides = {}, poolOverrides = {}) => {
  const folioRepo = makeFolioRepo(folioRepoOverrides)
  const producer = makeProducer()
  const pool = { ...makePool(), ...poolOverrides }
  const svc = new BillingService(folioRepo as any, producer as any, pool as any, 'sk_test_fake')
  return { svc, folioRepo, producer, pool }
}

describe('BillingService.getFolioByReservation', () => {
  it('throws NotFoundError when folio does not exist', async () => {
    const { svc } = buildService({ findByReservationId: vi.fn().mockResolvedValue(null) })
    await expect(svc.getFolioByReservation('res-missing')).rejects.toThrow(NotFoundError)
  })

  it('returns folio and line items', async () => {
    const { svc } = buildService()
    const result = await svc.getFolioByReservation('res-1')
    expect(result.folio.id).toBe('folio-1')
    expect(result.lineItems).toHaveLength(1)
  })
})

describe('BillingService.postCharge', () => {
  it('throws ConflictError when folio is closed', async () => {
    const { svc } = buildService({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeFolio({ status: 'closed' })),
    })
    await expect(
      svc.postCharge({ folioId: 'folio-1', tenantId: 'tenant-1', chargeType: 'room_rate', description: 'Test', quantity: 1, unitAmount: 100, currencyCode: 'USD' }),
    ).rejects.toThrow(ConflictError)
  })

  it('posts charge and publishes event on open folio', async () => {
    const { svc, producer } = buildService()
    await svc.postCharge({ folioId: 'folio-1', tenantId: 'tenant-1', chargeType: 'room_rate', description: 'Room', quantity: 1, unitAmount: 100, currencyCode: 'USD' })
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})

describe('BillingService.voidCharge', () => {
  it('throws ConflictError when folio is closed', async () => {
    const { svc } = buildService({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeFolio({ status: 'closed' })),
    })
    await expect(svc.voidCharge('li-1', 'folio-1', 'error')).rejects.toThrow(ConflictError)
  })

  it('delegates to folioRepo.voidCharge on open folio', async () => {
    const { svc, folioRepo } = buildService()
    await svc.voidCharge('li-1', 'folio-1', 'mistake')
    expect(folioRepo.voidCharge).toHaveBeenCalledWith('li-1', 'folio-1', 'mistake')
  })
})

describe('BillingService.closeFolioForCheckout', () => {
  it('throws NotFoundError when folio does not exist', async () => {
    const { svc } = buildService({ findByReservationId: vi.fn().mockResolvedValue(null) })
    await expect(svc.closeFolioForCheckout('res-missing')).rejects.toThrow(NotFoundError)
  })

  it('closes folio and publishes event', async () => {
    const { svc, producer } = buildService()
    const folio = await svc.closeFolioForCheckout('res-1')
    expect(folio.status).toBe('closed')
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})
