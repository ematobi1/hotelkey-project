import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { webhookRoutes } from '../routes/webhook.routes'

vi.mock('../config', () => ({
  config: {
    STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    KAFKA_BROKERS: 'localhost:9094',
  },
}))

vi.mock('../db/client', () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }),
}))

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: vi.fn().mockImplementation((body, sig) => {
        if (sig === 'valid') {
          return {
            type: 'payment_intent.succeeded',
            data: { object: { id: 'pi_test', amount: 10000 } },
          }
        }
        throw new Error('Invalid signature')
      }),
    },
  })),
}))

describe('POST /webhooks/stripe', () => {
  it('returns 400 when signature is invalid', async () => {
    const app = Fastify()
    await app.register(webhookRoutes)
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'stripe-signature': 'invalid', 'content-type': 'application/json' },
      body: Buffer.from('{}'),
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 200 when signature is valid', async () => {
    const app = Fastify()
    await app.register(webhookRoutes)
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/stripe',
      headers: { 'stripe-signature': 'valid', 'content-type': 'application/json' },
      body: Buffer.from('{}'),
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { received: boolean }
    expect(body.received).toBe(true)
  })
})
