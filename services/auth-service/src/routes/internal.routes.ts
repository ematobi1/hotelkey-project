import type { FastifyPluginAsync } from 'fastify'
import { verifyToken } from '../services/jwt.service'
import { InvalidTokenError } from '../domain/errors'

export const internalRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { token: string } }>(
    '/validate',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      try {
        const payload = await verifyToken(request.body.token)
        return reply.send({ valid: true, payload })
      } catch (err) {
        if (err instanceof InvalidTokenError) {
          return reply.send({ valid: false })
        }
        throw err
      }
    },
  )
}
