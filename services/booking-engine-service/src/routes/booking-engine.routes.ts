import type { FastifyPluginAsync } from 'fastify'
import Redis from 'ioredis'
import Redlock from 'redlock'
import Stripe from 'stripe'
import { z } from 'zod'
import { config } from '../config'
import { CartService } from '../services/cart.service'
import { SearchService } from '../services/search.service'
import { CheckoutService } from '../services/checkout.service'
import { BadRequestError } from '@hotel-key/types'

function getServices() {
  const redis = new Redis(config.REDIS_URL)
  const redlock = new Redlock([redis], { retryCount: 3, retryDelay: 200 })
  const stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })
  const cartService = new CartService(redis, config.CART_TTL_SECONDS)
  const searchService = new SearchService(config.RESERVATION_SERVICE_URL, config.ROOM_SERVICE_URL)
  const checkoutService = new CheckoutService(
    cartService,
    searchService,
    redlock,
    stripe,
    config.RESERVATION_SERVICE_URL,
    config.GUEST_SERVICE_URL,
    config.BILLING_SERVICE_URL,
    config.PENDING_PAYMENT_TTL_SECONDS,
  )
  return { cartService, searchService, checkoutService }
}

let _services: ReturnType<typeof getServices> | null = null
function services() {
  if (!_services) _services = getServices()
  return _services
}

const searchQuerySchema = z.object({
  tenantId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(10),
  children: z.coerce.number().int().min(0).max(10).optional(),
  roomTypeId: z.string().uuid().optional(),
})

const addToCartSchema = z.object({
  tenantId: z.string().uuid(),
  roomId: z.string().uuid(),
  roomTypeId: z.string().uuid(),
  roomTypeName: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1),
  children: z.number().int().min(0).default(0),
  ratePerNight: z.number().positive(),
  totalAmount: z.number().positive(),
  currencyCode: z.string().length(3),
  nights: z.number().int().positive(),
})

const checkoutBodySchema = z.object({
  tenantId: z.string().uuid(),
  guest: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
  }),
  stripePaymentMethodId: z.string().startsWith('pm_'),
  specialRequests: z.string().optional(),
})

export const bookingEngineRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: Record<string, string> }>('/search', async (request, reply) => {
    const query = searchQuerySchema.safeParse(request.query)
    if (!query.success) {
      throw new BadRequestError(query.error.issues.map((i) => i.message).join('; '))
    }
    const results = await services().searchService.search(query.data)
    return reply.send({ data: results, meta: { total: results.length } })
  })

  app.post<{ Body: Record<string, unknown> }>('/cart', async (request, reply) => {
    const body = addToCartSchema.safeParse(request.body)
    if (!body.success) {
      throw new BadRequestError(body.error.issues.map((i) => i.message).join('; '))
    }
    const cart = await services().cartService.create(body.data)
    return reply.status(201).send({ data: cart })
  })

  app.get<{ Params: { cartId: string }; Querystring: { tenantId: string } }>(
    '/cart/:cartId',
    async (request, reply) => {
      const { tenantId } = request.query
      if (!tenantId) throw new BadRequestError('tenantId is required')
      const cart = await services().cartService.get(request.params.cartId, tenantId)
      return reply.send({ data: cart })
    },
  )

  app.delete<{ Params: { cartId: string }; Querystring: { tenantId: string } }>(
    '/cart/:cartId',
    async (request, reply) => {
      const { tenantId } = request.query
      if (!tenantId) throw new BadRequestError('tenantId is required')
      await services().cartService.get(request.params.cartId, tenantId)
      await services().cartService.delete(request.params.cartId)
      return reply.status(204).send()
    },
  )

  app.post<{ Params: { cartId: string }; Body: Record<string, unknown> }>(
    '/cart/:cartId/checkout',
    async (request, reply) => {
      const body = checkoutBodySchema.safeParse(request.body)
      if (!body.success) {
        throw new BadRequestError(body.error.issues.map((i) => i.message).join('; '))
      }
      const result = await services().checkoutService.checkout({
        cartId: request.params.cartId,
        tenantId: body.data.tenantId,
        guest: { ...body.data.guest, tenantId: body.data.tenantId },
        stripePaymentMethodId: body.data.stripePaymentMethodId,
        specialRequests: body.data.specialRequests,
      })
      const status = result.status === 'confirmed' ? 201 : 202
      return reply.status(status).send({ data: result })
    },
  )

  app.post<{ Params: { paymentIntentId: string } }>(
    '/booking/:paymentIntentId/confirm',
    async (request, reply) => {
      const result = await services().checkoutService.confirm(request.params.paymentIntentId)
      return reply.status(201).send({ data: result })
    },
  )
}
