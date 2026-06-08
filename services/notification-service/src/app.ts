import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { createLogger } from '@hotel-key/logger'
import { AppError } from '@hotel-key/types'
import { config } from './config'
import type { NotificationService } from './services/notification.service'
import { makeNotificationRoutes } from './routes/notification.routes'

export async function createApp(notificationService: NotificationService): Promise<FastifyInstance> {
  const logger = createLogger({ service: 'notification-service', level: config.LOG_LEVEL })
  const app = Fastify({ logger: logger as FastifyBaseLogger })

  await app.register(helmet)
  await app.register(cors, { origin: config.NODE_ENV === 'development' })
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await app.register(swagger, { openapi: { info: { title: 'Notification Service', version: '1.0.0' } } })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } })
    }
    request.log.error({ err: error }, 'Unhandled error')
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  })

  app.get('/health', async () => ({ status: 'ok', service: 'notification-service' }))
  await app.register(makeNotificationRoutes(notificationService), { prefix: '/v1/notifications' })

  return app
}
