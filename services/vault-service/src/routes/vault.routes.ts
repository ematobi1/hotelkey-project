import type { FastifyPluginAsync } from 'fastify'
import { PiiService } from '../services/pii.service'
import { PiiRepository } from '../repositories/pii.repository'
import { VaultClientService } from '../services/vault-client.service'
import { getPool } from '../db/client'

let service: PiiService | null = null

async function getService(): Promise<PiiService> {
  if (!service) {
    const vaultClient = new VaultClientService()
    const crypto = await vaultClient.getEncryptionKey()
    service = new PiiService(new PiiRepository(getPool()), crypto)
  }
  return service
}

export const vaultRoutes: FastifyPluginAsync = async (app) => {
  app.post<{
    Body: { tenantId: string; guestId: string; fields: Record<string, string> }
  }>(
    '/store',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'guestId', 'fields'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            guestId: { type: 'string', format: 'uuid' },
            fields: { type: 'object', additionalProperties: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const { tenantId, guestId, fields } = request.body
      const stored = await svc.store(tenantId, guestId, fields)
      return reply.status(201).send({ data: { stored } })
    },
  )

  app.post<{
    Body: { tenantId: string; guestId: string; fields?: string[] }
  }>(
    '/retrieve',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'guestId'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            guestId: { type: 'string', format: 'uuid' },
            fields: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const { tenantId, guestId, fields } = request.body
      const data = await svc.retrieve(tenantId, guestId, fields)
      return reply.send({ data })
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
      await svc.erase(tenantId, guestId)
      return reply.status(204).send()
    },
  )
}
