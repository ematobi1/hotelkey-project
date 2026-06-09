import type { FastifyPluginAsync } from 'fastify'
import { ConsentService } from '../services/consent.service'
import { ConsentRepository } from '../repositories/consent.repository'
import { FabricClient } from '../services/fabric.client'
import { getPool } from '../db/client'

let service: ConsentService | null = null

async function getService(): Promise<ConsentService> {
  if (!service) {
    const fabric = new FabricClient()
    await fabric.connect()
    service = new ConsentService(fabric, new ConsentRepository(getPool()))
  }
  return service
}

export const consentRoutes: FastifyPluginAsync = async (app) => {
  app.post<{
    Body: { tenantId: string; guestId: string; purpose: string; grantedBy: string }
  }>(
    '/grant',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'guestId', 'purpose', 'grantedBy'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            guestId: { type: 'string', format: 'uuid' },
            purpose: {
              type: 'string',
              enum: ['essential', 'marketing', 'analytics', 'personalisation', 'third_party'],
            },
            grantedBy: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const { tenantId, guestId, purpose, grantedBy } = request.body
      const txId = await svc.grantConsent(tenantId, guestId, purpose, grantedBy)
      return reply.status(201).send({ data: { txId } })
    },
  )

  app.post<{
    Body: { tenantId: string; guestId: string; purpose: string; revokedBy: string }
  }>(
    '/revoke',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'guestId', 'purpose', 'revokedBy'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            guestId: { type: 'string', format: 'uuid' },
            purpose: {
              type: 'string',
              enum: ['essential', 'marketing', 'analytics', 'personalisation', 'third_party'],
            },
            revokedBy: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const { tenantId, guestId, purpose, revokedBy } = request.body
      const txId = await svc.revokeConsent(tenantId, guestId, purpose, revokedBy)
      return reply.send({ data: { txId } })
    },
  )

  app.get<{
    Querystring: { tenantId: string; guestId: string; purpose: string }
  }>(
    '/check',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['tenantId', 'guestId', 'purpose'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            guestId: { type: 'string', format: 'uuid' },
            purpose: {
              type: 'string',
              enum: ['essential', 'marketing', 'analytics', 'personalisation', 'third_party'],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const { tenantId, guestId, purpose } = request.query
      const hasConsent = await svc.hasConsent(tenantId, guestId, purpose)
      return reply.send({ data: { hasConsent } })
    },
  )

  app.get<{
    Querystring: { tenantId: string; guestId: string }
  }>(
    '/history',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['tenantId', 'guestId'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            guestId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const { tenantId, guestId } = request.query
      const records = await svc.getConsentHistory(tenantId, guestId)
      return reply.send({ data: records, meta: { total: records.length } })
    },
  )

  app.delete<{
    Body: { tenantId: string; guestId: string }
  }>(
    '/erase',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'guestId'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            guestId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const { tenantId, guestId } = request.body
      await svc.eraseGuestConsent(tenantId, guestId)
      return reply.status(204).send()
    },
  )
}
