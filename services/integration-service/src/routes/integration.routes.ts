import type { FastifyPluginAsync } from 'fastify'
import { IntegrationService } from '../services/integration.service'
import { IntegrationRepository } from '../repositories/integration.repository'
import { getPool } from '../db/client'
import { buildAdapters } from '../adapters'

let service: IntegrationService | null = null

function getService(): IntegrationService {
  if (!service) {
    const repo = new IntegrationRepository(getPool())
    service = new IntegrationService(buildAdapters(), repo)
  }
  return service
}

export const integrationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (_request, reply) => {
    const svc = getService()
    return reply.send({ data: svc.listIntegrations(), meta: { total: svc.listIntegrations().length } })
  })

  app.get<{ Querystring: { tenantId: string } }>(
    '/active',
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
      const svc = getService()
      const configs = await svc.getActiveForTenant(request.query.tenantId)
      return reply.send({ data: configs, meta: { total: configs.length } })
    },
  )

  app.post<{
    Params: { name: string }
    Body: { tenantId: string; config: Record<string, unknown> }
  }>(
    '/:name/configure',
    {
      schema: {
        params: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['tenantId', 'config'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            config: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = getService()
      const cfg = await svc.upsertConfig(
        request.body.tenantId,
        request.params.name,
        request.body.config,
      )
      return reply.status(201).send({ data: cfg })
    },
  )

  app.delete<{
    Params: { name: string }
    Body: { tenantId: string }
  }>(
    '/:name',
    {
      schema: {
        params: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['tenantId'],
          properties: { tenantId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const svc = getService()
      await svc.deactivate(request.body.tenantId, request.params.name)
      return reply.status(204).send()
    },
  )

  app.get<{
    Querystring: {
      tenantId: string
      integrationName?: string
      limit?: number
      offset?: number
    }
  }>(
    '/event-log',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            integrationName: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const repo = new IntegrationRepository(getPool())
      const q = request.query
      const { logs, total } = await repo.listEventLog(
        q.tenantId,
        q.integrationName,
        q.limit ?? 50,
        q.offset ?? 0,
      )
      return reply.send({ data: logs, meta: { total } })
    },
  )
}
