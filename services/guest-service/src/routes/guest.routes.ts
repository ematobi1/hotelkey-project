import type { FastifyPluginAsync } from 'fastify'
import { GuestService } from '../services/guest.service'
import { GuestRepository } from '../repositories/guest.repository'
import { getPool } from '../db/client'
import { createKafkaClient, createProducer } from '@hotel-key/kafka'
import { config } from '../config'

let service: GuestService | null = null
async function getService(): Promise<GuestService> {
  if (!service) {
    const producer = { publish: async () => {}, close: async () => {} }
    ;(async () => {
      try {
        const kafka = createKafkaClient({ clientId: 'guest-service', brokers: config.KAFKA_BROKERS.split(',') })
        Object.assign(producer, await createProducer(kafka))
      } catch { /* Kafka unavailable — events silently dropped */ }
    })()
    service = new GuestService(new GuestRepository(getPool()), producer)
  }
  return service
}

export const guestRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { tenantId: string; firstName: string; lastName: string; email?: string; phone?: string; nationality?: string } }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'firstName', 'lastName'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            firstName: { type: 'string', minLength: 1 },
            lastName: { type: 'string', minLength: 1 },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            nationality: { type: 'string', minLength: 2, maxLength: 2 },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const guest = await svc.createGuest(request.body)
      return reply.status(201).send({ data: guest })
    },
  )

  app.get<{ Params: { id: string }; Querystring: { tenantId: string } }>(
    '/:id',
    {
      schema: {
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
        querystring: { type: 'object', properties: { tenantId: { type: 'string', format: 'uuid' } }, required: ['tenantId'] },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const guest = await svc.getGuest(request.params.id, request.query.tenantId)
      return reply.send({ data: guest })
    },
  )

  app.patch<{
    Params: { id: string }
    Querystring: { tenantId: string }
    Body: { firstName?: string; lastName?: string; email?: string; phone?: string }
  }>(
    '/:id',
    {
      schema: {
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
        querystring: { type: 'object', properties: { tenantId: { type: 'string', format: 'uuid' } }, required: ['tenantId'] },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const guest = await svc.updateGuest(request.params.id, request.query.tenantId, request.body)
      return reply.send({ data: guest })
    },
  )

  app.delete<{ Params: { id: string }; Querystring: { tenantId: string } }>(
    '/:id',
    {
      schema: {
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
        querystring: { type: 'object', properties: { tenantId: { type: 'string', format: 'uuid' } }, required: ['tenantId'] },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      await svc.deleteGuest(request.params.id, request.query.tenantId)
      return reply.status(204).send()
    },
  )

  app.get<{ Querystring: { tenantId: string; q: string } }>(
    '/search',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            q: { type: 'string', minLength: 2 },
          },
          required: ['tenantId', 'q'],
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const guests = await svc.searchGuests(request.query.tenantId, request.query.q)
      return reply.send({ data: guests, meta: { total: guests.length } })
    },
  )

  app.post<{ Params: { id: string }; Body: { tenantId: string } }>(
    '/:id/erase',
    {
      schema: {
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
        body: {
          type: 'object',
          required: ['tenantId'],
          properties: { tenantId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      await svc.eraseGuest(request.params.id, request.body.tenantId)
      return reply.status(204).send()
    },
  )

  app.get<{ Params: { id: string }; Querystring: { tenantId: string } }>(
    '/:id/preferences',
    async (request, reply) => {
      const svc = await getService()
      const prefs = await svc.getPreferences(request.params.id, request.query['tenantId'] as string)
      return reply.send({ data: prefs })
    },
  )

  app.put<{ Params: { id: string }; Querystring: { tenantId: string }; Body: Record<string, unknown> }>(
    '/:id/preferences',
    async (request, reply) => {
      const svc = await getService()
      const prefs = await svc.upsertPreferences(
        request.params.id,
        request.query['tenantId'] as string,
        request.body,
      )
      return reply.send({ data: prefs })
    },
  )
}
