import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { createLogger } from '@hotel-key/logger'
import { AppError } from '@hotel-key/types'
import { config } from './config'
import { guestRoutes } from './routes/guest.routes'

export async function createApp(): Promise<FastifyInstance> {
  const logger = createLogger({ service: 'guest-service', level: config.LOG_LEVEL })
  const app = Fastify({ logger: logger as FastifyBaseLogger })

  await app.register(helmet)
  await app.register(cors, {
    origin: ['http://localhost:3000', 'http://hotel--Publi-67crryVktJSd-2116934759.us-east-1.elb.amazonaws.com'],
    credentials: true,
  })
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })
  await app.register(swagger, { openapi: { info: { title: 'Guest Service', version: '1.0.0' } } })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, ...(error.details ?? {}) },
      })
    }
    if ('validation' in error && error.validation) {
      return reply.status(400).send({ error: { code: 'VALIDATION_FAILED', message: error.message } })
    }
    request.log.error({ err: error }, 'Unhandled error')
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  })

  app.get('/health', async () => ({ status: 'ok', service: 'guest-service' }))
  await app.register(guestRoutes, { prefix: '/v1/guests' })

  return app
}
