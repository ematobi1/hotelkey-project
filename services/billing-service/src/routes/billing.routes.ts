import type { FastifyPluginAsync } from 'fastify'
import { BillingService } from '../services/billing.service'
import { FolioRepository } from '../repositories/folio.repository'
import { getPool } from '../db/client'
import { createKafkaClient, createProducer } from '@hotel-key/kafka'
import { config } from '../config'

async function buildService() {
  const kafka = createKafkaClient({ clientId: 'billing-service', brokers: config.KAFKA_BROKERS.split(',') })
  const producer = await createProducer(kafka)
  const pool = getPool()
  return new BillingService(new FolioRepository(pool), producer, pool, config.STRIPE_SECRET_KEY)
}

let service: BillingService | null = null
async function getService() {
  if (!service) service = await buildService()
  return service
}

export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { reservationId: string } }>(
    '/folios/:reservationId',
    async (request, reply) => {
      const svc = await getService()
      const result = await svc.getFolioByReservation(request.params.reservationId)
      return reply.send({ data: result })
    },
  )

  app.post<{
    Params: { reservationId: string }
    Body: {
      folioId: string
      tenantId: string
      description: string
      chargeType: string
      quantity: number
      unitAmount: number
      taxAmount?: number
      postedBy?: string
      idempotencyKey?: string
    }
  }>(
    '/folios/:reservationId/charges',
    {
      schema: {
        body: {
          type: 'object',
          required: ['folioId', 'tenantId', 'description', 'chargeType', 'quantity', 'unitAmount'],
          properties: {
            folioId: { type: 'string', format: 'uuid' },
            tenantId: { type: 'string', format: 'uuid' },
            description: { type: 'string', minLength: 1 },
            chargeType: { type: 'string' },
            quantity: { type: 'number', minimum: 0.001 },
            unitAmount: { type: 'number', minimum: 0 },
            taxAmount: { type: 'number', minimum: 0 },
            postedBy: { type: 'string' },
            idempotencyKey: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const lineItem = await svc.postCharge(request.body as Parameters<BillingService['postCharge']>[0])
      return reply.status(201).send({ data: lineItem })
    },
  )

  app.delete<{ Params: { reservationId: string; chargeId: string }; Body: { folioId: string; reason: string } }>(
    '/folios/:reservationId/charges/:chargeId',
    async (request, reply) => {
      const svc = await getService()
      await svc.voidCharge(request.params.chargeId, request.body.folioId, request.body.reason)
      return reply.status(204).send()
    },
  )

  app.post<{
    Body: {
      folioId: string
      tenantId: string
      amount: number
      currencyCode: string
      stripePaymentMethodId: string
      idempotencyKey: string
    }
  }>(
    '/payments',
    async (request, reply) => {
      const svc = await getService()
      const payment = await svc.capturePayment(request.body)
      return reply.status(201).send({ data: payment })
    },
  )
}
