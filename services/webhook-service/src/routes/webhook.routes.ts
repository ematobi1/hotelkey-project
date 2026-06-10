import type { FastifyPluginAsync } from 'fastify'
import { WebhookRepository } from '../repositories/webhook.repository'
import { DeliveryService } from '../services/delivery.service'
import { getPool } from '../db/client'
import type { DeliveryStatus } from '../domain/errors'
import { createHmac } from 'node:crypto'

function getServices(): { repo: WebhookRepository; delivery: DeliveryService } {
  const repo = new WebhookRepository(getPool())
  const delivery = new DeliveryService(repo)
  return { repo, delivery }
}

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.post<{
    Body: {
      tenantId: string
      url: string
      secret: string
      description?: string
      eventTypes?: string[]
    }
  }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'url', 'secret'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            url: { type: 'string', format: 'uri' },
            secret: { type: 'string', minLength: 16 },
            description: { type: 'string', maxLength: 255 },
            eventTypes: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const { repo } = getServices()
      const endpoint = await repo.createEndpoint({
        tenantId: request.body.tenantId,
        url: request.body.url,
        secret: request.body.secret,
        description: request.body.description ?? null,
        eventTypes: request.body.eventTypes ?? [],
      })
      return reply.status(201).send({ data: endpoint })
    },
  )

  app.get<{ Querystring: { tenantId: string } }>(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: { tenantId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { repo } = getServices()
      const endpoints = await repo.listEndpoints(request.query.tenantId)
      return reply.send({ data: endpoints, meta: { total: endpoints.length } })
    },
  )

  app.get<{ Params: { id: string }; Querystring: { tenantId: string } }>(
    '/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: { tenantId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { repo } = getServices()
      const endpoint = await repo.findEndpointByIdOrThrow(request.params.id, request.query.tenantId)
      return reply.send({ data: endpoint })
    },
  )

  app.patch<{
    Params: { id: string }
    Body: {
      tenantId: string
      url?: string
      secret?: string
      eventTypes?: string[]
      isActive?: boolean
    }
  }>(
    '/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['tenantId'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            url: { type: 'string', format: 'uri' },
            secret: { type: 'string', minLength: 16 },
            eventTypes: { type: 'array', items: { type: 'string' } },
            isActive: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { repo } = getServices()
      const endpoint = await repo.updateEndpoint(request.params.id, request.body.tenantId, {
        url: request.body.url,
        secret: request.body.secret,
        eventTypes: request.body.eventTypes,
        isActive: request.body.isActive,
      })
      return reply.send({ data: endpoint })
    },
  )

  app.delete<{ Params: { id: string }; Body: { tenantId: string } }>(
    '/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['tenantId'],
          properties: { tenantId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { repo } = getServices()
      await repo.deactivateEndpoint(request.params.id, request.body.tenantId)
      return reply.status(204).send()
    },
  )

  app.get<{
    Params: { id: string }
    Querystring: {
      tenantId: string
      status?: DeliveryStatus
      limit?: number
      offset?: number
    }
  }>(
    '/:id/deliveries',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['pending', 'delivered', 'failed'] },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const { repo } = getServices()
      const q = request.query
      const { deliveries, total } = await repo.listDeliveries(
        request.params.id,
        q.tenantId,
        q.status,
        q.limit ?? 50,
        q.offset ?? 0,
      )
      return reply.send({ data: deliveries, meta: { total } })
    },
  )

  app.post<{
    Params: { id: string }
    Body: { tenantId: string }
  }>(
    '/:id/test',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['tenantId'],
          properties: { tenantId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { repo, delivery } = getServices()
      const endpoint = await repo.findEndpointByIdOrThrow(request.params.id, request.body.tenantId)

      const testPayload = {
        specversion: '1.0',
        id: `test-${Date.now()}`,
        source: 'webhook-service',
        type: 'hotel-key.webhook.test',
        time: new Date().toISOString(),
        datacontenttype: 'application/json',
        tenantid: endpoint.tenantId,
        data: { message: 'This is a test webhook delivery from Hotel Key.' },
      }

      const record = await repo.createDelivery({
        endpointId: endpoint.id,
        tenantId: endpoint.tenantId,
        eventType: 'hotel-key.webhook.test',
        eventId: testPayload.id,
        payload: testPayload as unknown as Record<string, unknown>,
      })

      await delivery.deliver(record, endpoint)

      return reply.send({ data: { deliveryId: record.id } })
    },
  )
}
