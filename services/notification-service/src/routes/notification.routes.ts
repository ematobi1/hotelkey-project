import type { FastifyPluginAsync } from 'fastify'
import type { NotificationService } from '../services/notification.service'

export function makeNotificationRoutes(service: NotificationService): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Querystring: { tenantId: string; limit?: string } }>(
      '/log',
      {
        schema: {
          querystring: {
            type: 'object',
            required: ['tenantId'],
            properties: {
              tenantId: { type: 'string', format: 'uuid' },
              limit: { type: 'string' },
            },
          },
        },
      },
      async (request, reply) => {
        const logs = await service.getLog(
          request.query.tenantId,
          request.query.limit ? parseInt(request.query.limit, 10) : undefined,
        )
        return reply.send({ data: logs, meta: { total: logs.length } })
      },
    )
  }
}
