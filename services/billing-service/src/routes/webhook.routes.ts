import type { FastifyPluginAsync } from 'fastify'
import Stripe from 'stripe'
import { config } from '../config'
import { getPool } from '../db/client'

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    done(null, body)
  })

  app.post('/webhooks/stripe', async (request, reply) => {
    const sig = request.headers['stripe-signature'] as string
    const stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(
        request.body as Buffer,
        sig,
        config.STRIPE_WEBHOOK_SECRET,
      )
    } catch {
      return reply.status(400).send({
        error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' },
      })
    }

    const pool = getPool()

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        await pool.query(
          `UPDATE payment SET status = 'captured', captured_at = NOW(), updated_at = NOW() WHERE provider_ref = $1`,
          [pi.id],
        )
        break
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent
        await pool.query(
          `UPDATE payment SET status = 'failed', updated_at = NOW() WHERE provider_ref = $1`,
          [pi.id],
        )
        break
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        if (charge.payment_intent) {
          await pool.query(
            `UPDATE payment SET status = 'refunded', refunded_at = NOW(), updated_at = NOW() WHERE provider_ref = $1`,
            [charge.payment_intent as string],
          )
        }
        break
      }
      default:
        break
    }

    return reply.send({ received: true })
  })
}
