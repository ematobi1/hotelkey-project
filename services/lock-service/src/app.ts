import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { createLogger } from '@hotel-key/logger'
import { AppError } from '@hotel-key/types'
import { createKafkaClient, createConsumer } from '@hotel-key/kafka'
import { config } from './config'
import { getPool } from './db/client'
import { LockRepository } from './repositories/lock.repository'
import { AssaAbloyClient } from './services/assa-abloy.client'
import { LockService } from './services/lock.service'
import { ReservationConsumer } from './events/reservation.consumer'
import { lockRoutes } from './routes/lock.routes'

export async function createApp(): Promise<FastifyInstance> {
  const logger = createLogger({ service: 'lock-service', level: config.LOG_LEVEL })

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
      info: { title: 'Lock Service', version: '1.0.0' },
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

  const pool = getPool()
  const lockRepo = new LockRepository(pool)
  const assaClient = new AssaAbloyClient(config.ASSA_ABLOY_API_BASE_URL, config.ASSA_ABLOY_API_KEY)
  const lockService = new LockService(lockRepo, assaClient)

  app.addHook('onReady', async () => {
    // Fire-and-forget: don't block onReady waiting for Kafka connection
    ;(async () => {
      try {
        const kafka = createKafkaClient({
          clientId: 'lock-service',
          brokers: config.KAFKA_BROKERS.split(','),
        })
        const hotelKeyConsumer = await createConsumer(kafka, 'lock-reservation-consumer')
        const reservationConsumer = new ReservationConsumer(hotelKeyConsumer, lockService, lockRepo)
        await reservationConsumer.start()
        app.addHook('onClose', async () => {
          await reservationConsumer.close()
        })
      } catch (err) {
        app.log.warn({ err }, 'Kafka unavailable — reservation consumer disabled')
      }
    })()
  })

  app.get('/health', async () => ({ status: 'ok', service: 'lock-service' }))

  await app.register(lockRoutes, { prefix: '/v1/locks', lockService })

  return app
}
