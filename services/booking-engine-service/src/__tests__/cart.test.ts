import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CartService } from '../services/cart.service'

const mockRedis = {
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn(),
  del: vi.fn().mockResolvedValue(1),
}

describe('CartService', () => {
  let cartService: CartService

  beforeEach(() => {
    vi.clearAllMocks()
    cartService = new CartService(mockRedis as never, 900)
  })

  it('creates a cart and stores it in Redis', async () => {
    const data = {
      tenantId: '00000000-0000-0000-0000-000000000001',
      roomId: '00000000-0000-0000-0000-000000000002',
      roomTypeId: '00000000-0000-0000-0000-000000000003',
      roomTypeName: 'Deluxe King',
      checkIn: '2026-07-01',
      checkOut: '2026-07-03',
      adults: 2,
      children: 0,
      ratePerNight: 200,
      totalAmount: 400,
      currencyCode: 'USD',
      nights: 2,
    }

    const cart = await cartService.create(data)

    expect(cart.cartId).toBeDefined()
    expect(cart.tenantId).toBe(data.tenantId)
    expect(cart.totalAmount).toBe(400)
    expect(mockRedis.set).toHaveBeenCalledWith(
      `be:cart:${cart.cartId}`,
      JSON.stringify(cart),
      'EX',
      900,
    )
  })

  it('retrieves a cart by id and tenantId', async () => {
    const stored = {
      cartId: 'abc',
      tenantId: '00000000-0000-0000-0000-000000000001',
      roomId: 'r1',
      roomTypeId: 'rt1',
      roomTypeName: 'Standard',
      checkIn: '2026-07-01',
      checkOut: '2026-07-02',
      adults: 1,
      children: 0,
      ratePerNight: 100,
      totalAmount: 100,
      currencyCode: 'USD',
      nights: 1,
      createdAt: new Date().toISOString(),
    }
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(stored))

    const cart = await cartService.get('abc', '00000000-0000-0000-0000-000000000001')
    expect(cart.cartId).toBe('abc')
  })

  it('throws CartNotFoundError when cart is missing', async () => {
    mockRedis.get.mockResolvedValueOnce(null)
    await expect(
      cartService.get('missing', '00000000-0000-0000-0000-000000000001'),
    ).rejects.toMatchObject({ code: 'CART_NOT_FOUND', statusCode: 404 })
  })

  it('throws CartNotFoundError when tenantId does not match', async () => {
    const stored = {
      cartId: 'abc',
      tenantId: '00000000-0000-0000-0000-000000000001',
    }
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(stored))

    await expect(
      cartService.get('abc', '00000000-0000-0000-0000-000000000099'),
    ).rejects.toMatchObject({ code: 'CART_NOT_FOUND' })
  })

  it('deletes a cart', async () => {
    await cartService.delete('abc')
    expect(mockRedis.del).toHaveBeenCalledWith('be:cart:abc')
  })
})
