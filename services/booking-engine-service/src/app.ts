import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { createLogger } from '@hotel-key/logger'
import { AppError } from '@hotel-key/types'
import { config } from './config'
import { bookingEngineRoutes } from './routes/booking-engine.routes'

export async function createApp(): Promise<FastifyInstance> {
  const logger = createLogger({ service: 'booking-engine-service', level: config.LOG_LEVEL })

  const app = Fastify({ logger: logger as FastifyBaseLogger })

  await app.register(helmet)
  await app.register(cors, { origin: config.NODE_ENV === 'development' })

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  })

  await app.register(swagger, {
    openapi: {
      info: { title: 'Booking Engine Service', version: '1.0.0' },
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

    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'Too many requests — slow down' },
      })
    }

    request.log.error({ err: error }, 'Unhandled error')
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    })
  })

  app.addHook('preHandler', (request, reply, done) => {
    const tenantId = request.headers['x-tenant-id']
    if (!tenantId && !request.url.startsWith('/health') && !request.url.startsWith('/docs')) {
      return reply.status(400).send({
        error: { code: 'MISSING_TENANT', message: 'X-Tenant-Id header is required' },
      })
    }
    done()
  })

  app.get('/health', async () => ({ status: 'ok', service: 'booking-engine-service' }))

  await app.register(bookingEngineRoutes, { prefix: '/v1/booking-engine' })

  return app
}
