import type { FastifyPluginAsync } from 'fastify'
import type { LockService } from '../services/lock.service'

export interface LockRoutesOptions {
  lockService: LockService
}

export const lockRoutes: FastifyPluginAsync<LockRoutesOptions> = async (app, opts) => {
  const { lockService } = opts

  app.get<{ Querystring: { tenantId: string } }>(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const locks = await lockService.listLocks(request.query.tenantId)
      return reply.send({ data: locks, meta: { total: locks.length } })
    },
  )

  app.post<{
    Body: {
      tenantId: string
      roomId: string
      assaAbloyLockId: string
      label: string
    }
  }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'roomId', 'assaAbloyLockId', 'label'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            roomId: { type: 'string', format: 'uuid' },
            assaAbloyLockId: { type: 'string', minLength: 1 },
            label: { type: 'string', minLength: 1, maxLength: 255 },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, roomId, assaAbloyLockId, label } = request.body
      const lock = await lockService.createLock(tenantId, roomId, assaAbloyLockId, label)
      return reply.status(201).send({ data: lock })
    },
  )

  app.get<{
    Params: { lockId: string }
    Querystring: { tenantId: string }
  }>(
    '/:lockId/credentials',
    {
      schema: {
        params: {
          type: 'object',
          properties: { lockId: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: { tenantId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const credentials = await lockService.listCredentials(
        request.params.lockId,
        request.query.tenantId,
      )
      return reply.send({ data: credentials, meta: { total: credentials.length } })
    },
  )

  app.post<{
    Params: { lockId: string }
    Body: {
      tenantId: string
      reservationId: string
      guestId: string
      guestEmail: string
      validFrom: string
      validUntil: string
    }
  }>(
    '/:lockId/credentials',
    {
      schema: {
        params: {
          type: 'object',
          properties: { lockId: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['tenantId', 'reservationId', 'guestId', 'guestEmail', 'validFrom', 'validUntil'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            reservationId: { type: 'string', format: 'uuid' },
            guestId: { type: 'string', format: 'uuid' },
            guestEmail: { type: 'string', format: 'email' },
            validFrom: { type: 'string', format: 'date-time' },
            validUntil: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, reservationId, guestId, guestEmail, validFrom, validUntil } = request.body

      const credential = await lockService.issueMobileKeyByLockId(
        tenantId,
        request.params.lockId,
        reservationId,
        guestId,
        guestEmail,
        new Date(validFrom),
        new Date(validUntil),
      )
      return reply.status(201).send({ data: credential })
    },
  )

  app.delete<{
    Params: { lockId: string; credentialId: string }
    Querystring: { tenantId: string }
  }>(
    '/:lockId/credentials/:credentialId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            lockId: { type: 'string', format: 'uuid' },
            credentialId: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: { tenantId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      await lockService.revokeKey(request.params.credentialId, request.query.tenantId)
      return reply.status(204).send()
    },
  )

  app.get<{
    Params: { lockId: string }
    Querystring: { tenantId: string; since?: string }
  }>(
    '/:lockId/access-log',
    {
      schema: {
        params: {
          type: 'object',
          properties: { lockId: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            since: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, since } = request.query
      const log = await lockService.getAccessLog(
        request.params.lockId,
        tenantId,
        since ? new Date(since) : undefined,
      )
      return reply.send({ data: log.events, meta: { total: log.events.length } })
    },
  )
}
