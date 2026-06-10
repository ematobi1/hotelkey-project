import type { FastifyPluginAsync } from 'fastify'
import { BiService } from '../services/bi.service'
import { getPool } from '../db/client'

let service: BiService | null = null
function getService(): BiService {
  if (!service) service = new BiService(getPool())
  return service
}

export const biRoutes: FastifyPluginAsync = async (app) => {
  app.post<{
    Body: { tenantId: string; userId: string; question: string }
  }>(
    '/query',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'userId', 'question'],
          properties: {
            tenantId: { type: 'string' },
            userId: { type: 'string' },
            question: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = getService()
      const { tenantId, userId, question } = request.body

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('BI query timed out')), 10000),
      )

      try {
        const result = await Promise.race([svc.query(tenantId, userId, question), timeout])
        return reply.status(200).send({ data: result })
      } catch (err) {
        if ((err as Error).message === 'BI query timed out') {
          return reply.status(408).send({
            error: { code: 'REQUEST_TIMEOUT', message: 'BI query exceeded 10 second limit' },
          })
        }
        throw err
      }
    },
  )

  app.get<{
    Querystring: { tenantId: string; limit?: number }
  }>(
    '/history',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: {
            tenantId: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = getService()
      const { tenantId, limit = 20 } = request.query
      const rows = await svc.getHistory(tenantId, limit)
      return reply.send({ data: rows, meta: { total: rows.length } })
    },
  )

  app.delete<{
    Querystring: { tenantId: string }
  }>(
    '/history',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: {
            tenantId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = getService()
      await svc.deleteHistory(request.query.tenantId)
      return reply.status(204).send()
    },
  )
}
