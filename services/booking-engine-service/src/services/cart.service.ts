import type Redis from 'ioredis'
import { v4 as uuidv4 } from 'uuid'
import type { CartItem } from '../domain/types'
import { CartNotFoundError } from '../domain/errors'

const KEY = (cartId: string) => `be:cart:${cartId}`
const PENDING_KEY = (paymentIntentId: string) => `be:pending:${paymentIntentId}`

export class CartService {
  constructor(
    private readonly redis: Redis,
    private readonly cartTtlSeconds: number,
  ) {}

  async create(data: Omit<CartItem, 'cartId' | 'createdAt'>): Promise<CartItem> {
    const cart: CartItem = {
      ...data,
      cartId: uuidv4(),
      createdAt: new Date().toISOString(),
    }
    await this.redis.set(KEY(cart.cartId), JSON.stringify(cart), 'EX', this.cartTtlSeconds)
    return cart
  }

  async get(cartId: string, tenantId: string): Promise<CartItem> {
    const raw = await this.redis.get(KEY(cartId))
    if (!raw) throw new CartNotFoundError()
    const cart = JSON.parse(raw) as CartItem
    if (cart.tenantId !== tenantId) throw new CartNotFoundError()
    return cart
  }

  async delete(cartId: string): Promise<void> {
    await this.redis.del(KEY(cartId))
  }

  async storePendingPayment(state: import('../domain/types').PendingPaymentState, ttlSeconds: number): Promise<void> {
    await this.redis.set(PENDING_KEY(state.paymentIntentId), JSON.stringify(state), 'EX', ttlSeconds)
  }

  async getPendingPayment(paymentIntentId: string): Promise<import('../domain/types').PendingPaymentState | null> {
    const raw = await this.redis.get(PENDING_KEY(paymentIntentId))
    return raw ? (JSON.parse(raw) as import('../domain/types').PendingPaymentState) : null
  }

  async deletePendingPayment(paymentIntentId: string): Promise<void> {
    await this.redis.del(PENDING_KEY(paymentIntentId))
  }
}
