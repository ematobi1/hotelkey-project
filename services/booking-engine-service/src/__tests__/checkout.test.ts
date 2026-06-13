import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CheckoutService } from '../services/checkout.service'
import type { CartService } from '../services/cart.service'
import type { SearchService } from '../services/search.service'
import type { CartItem } from '../domain/types'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const ROOM_ID = '00000000-0000-0000-0000-000000000002'
const GUEST_ID = '00000000-0000-0000-0000-000000000003'
const RESERVATION_ID = '00000000-0000-0000-0000-000000000004'
const FOLIO_ID = '00000000-0000-0000-0000-000000000005'

const mockCart: CartItem = {
  cartId: 'cart-1',
  tenantId: TENANT_ID,
  roomId: ROOM_ID,
  roomTypeId: 'rt1',
  roomTypeName: 'Deluxe King',
  checkIn: '2026-07-01',
  checkOut: '2026-07-03',
  adults: 2,
  children: 0,
  ratePerNight: 200,
  totalAmount: 400,
  currencyCode: 'USD',
  nights: 2,
  createdAt: new Date().toISOString(),
}

function makeCartService(overrides: Partial<CartService> = {}): CartService {
  return {
    get: vi.fn().mockResolvedValue(mockCart),
    delete: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    storePendingPayment: vi.fn().mockResolvedValue(undefined),
    getPendingPayment: vi.fn(),
    deletePendingPayment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as CartService
}

function makeSearchService(available = true): SearchService {
  return {
    verifyAvailability: vi.fn().mockResolvedValue(available),
    search: vi.fn(),
  } as unknown as SearchService
}

function makeRedlock() {
  return {
    acquire: vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined), expiration: Date.now() + 15_000 }),
  }
}

function makeStripe(status: string, clientSecret: string | null = null) {
  return {
    paymentIntents: {
      create: vi.fn().mockResolvedValue({ id: 'pi_test', status, client_secret: clientSecret, last_payment_error: null }),
      retrieve: vi.fn().mockResolvedValue({ id: 'pi_test', status }),
    },
  }
}

beforeEach(() => {
  global.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: GUEST_ID, email: 'test@example.com' } }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: RESERVATION_ID, confirmationCode: 'HK-001' } }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: FOLIO_ID } }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 'charge-1' } }) } as Response)
})

describe('CheckoutService', () => {
  it('returns confirmed booking when Stripe payment succeeds', async () => {
    const stripe = makeStripe('succeeded')
    const svc = new CheckoutService(
      makeCartService(),
      makeSearchService(true),
      makeRedlock() as never,
      stripe as never,
      'http://res:3003',
      'http://guest:3002',
      'http://billing:3005',
      1800,
    )

    const result = await svc.checkout({
      cartId: 'cart-1',
      tenantId: TENANT_ID,
      guest: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', tenantId: TENANT_ID },
      stripePaymentMethodId: 'pm_test_123',
    })

    expect(result.status).toBe('confirmed')
    expect(result.reservationId).toBe(RESERVATION_ID)
    expect(result.guestId).toBe(GUEST_ID)
    expect(result.folioId).toBe(FOLIO_ID)
  })

  it('returns pending_payment with clientSecret when Stripe requires action', async () => {
    const stripe = makeStripe('requires_action', 'pi_test_secret')
    const svc = new CheckoutService(
      makeCartService(),
      makeSearchService(true),
      makeRedlock() as never,
      stripe as never,
      'http://res:3003',
      'http://guest:3002',
      'http://billing:3005',
      1800,
    )

    const result = await svc.checkout({
      cartId: 'cart-1',
      tenantId: TENANT_ID,
      guest: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', tenantId: TENANT_ID },
      stripePaymentMethodId: 'pm_test_123',
    })

    expect(result.status).toBe('pending_payment')
    expect(result.clientSecret).toBe('pi_test_secret')
    expect(result.paymentIntentId).toBe('pi_test')
  })

  it('throws RoomUnavailableError when room is no longer available', async () => {
    const svc = new CheckoutService(
      makeCartService(),
      makeSearchService(false),
      makeRedlock() as never,
      makeStripe('succeeded') as never,
      'http://res:3003',
      'http://guest:3002',
      'http://billing:3005',
      1800,
    )

    await expect(
      svc.checkout({
        cartId: 'cart-1',
        tenantId: TENANT_ID,
        guest: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', tenantId: TENANT_ID },
        stripePaymentMethodId: 'pm_test_123',
      }),
    ).rejects.toMatchObject({ code: 'ROOM_UNAVAILABLE', statusCode: 409 })
  })

  it('throws PaymentFailedError and cancels reservation when Stripe payment fails', async () => {
    const stripe = makeStripe('requires_payment_method')
    const cancelFetch = vi.fn().mockResolvedValue({ ok: true } as Response)
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: GUEST_ID } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: RESERVATION_ID, confirmationCode: 'HK-001' } }) } as Response)
      .mockImplementationOnce(cancelFetch)

    const svc = new CheckoutService(
      makeCartService(),
      makeSearchService(true),
      makeRedlock() as never,
      stripe as never,
      'http://res:3003',
      'http://guest:3002',
      'http://billing:3005',
      1800,
    )

    await expect(
      svc.checkout({
        cartId: 'cart-1',
        tenantId: TENANT_ID,
        guest: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', tenantId: TENANT_ID },
        stripePaymentMethodId: 'pm_test_123',
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_FAILED' })
  })
})
