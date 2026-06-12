import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { createLogger } from '@hotel-key/logger'
import { AppError } from '@hotel-key/types'
import { config } from './config'
import { webhookRoutes } from './routes/webhook.routes'
import { getPool } from './db/client'
import { WebhookRepository } from './repositories/webhook.repository'
import { DeliveryService } from './services/delivery.service'
import { startKafkaConsumer } from './events/kafka.consumer'

export async function createApp(): Promise<FastifyInstance> {
  const logger = createLogger({ service: 'webhook-service', level: config.LOG_LEVEL })

  const app = Fastify({ logger: logger as FastifyBaseLogger })

  await app.register(helmet)
  await app.register(cors, { origin: config.NODE_ENV === 'development' })
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) =>
      (req.headers['x-tenant-id'] as string | undefined) ?? req.ip,
  })

  await app.register(swagger, {
    openapi: {
      info: { title: 'Webhook Service', version: '1.0.0' },
    },
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, ...(error.details ?? {}) },
      })
    }

    if ('validation' in error && error.validation) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_FAILED', message: error.message },
      })
    }

    request.log.error({ err: error }, 'Unhandled error')
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    })
  })

  app.get('/health', async () => ({ status: 'ok', service: 'webhook-service' }))

  await app.register(webhookRoutes, { prefix: '/v1/webhooks' })

  app.addHook('onReady', async () => {
    const repo = new WebhookRepository(getPool())
    const deliveryService = new DeliveryService(repo)

    const retryInterval = setInterval(() => {
      void deliveryService.scheduleRetries().catch((err) => {
        app.log.error({ err }, 'Retry scheduler error')
      })
    }, 30_000)

    app.addHook('onClose', async () => {
      clearInterval(retryInterval)
    })

    // Connect to Kafka without blocking server startup
    startKafkaConsumer(repo, deliveryService)
      .then((consumer) => {
        app.addHook('onClose', async () => {
          await consumer.close()
        })
      })
      .catch((err) => {
        app.log.warn({ err }, 'Kafka consumer failed to start — webhook delivery via retry only')
      })
  })

  return app
}
