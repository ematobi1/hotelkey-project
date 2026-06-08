import type { FastifyPluginAsync } from 'fastify'
import * as argon2 from 'argon2'
import crypto from 'crypto'
import { AuthService } from '../services/auth.service'
import { MfaService } from '../services/mfa.service'
import { StaffRepository } from '../repositories/staff.repository'
import { TokenRepository } from '../repositories/token.repository'
import { MfaRepository } from '../repositories/mfa.repository'
import { MagicLinkRepository } from '../repositories/magic-link.repository'
import { getPool } from '../db/client'
import type { StaffRole } from '@hotel-key/types'
import {
  MfaRequiredError,
  InvalidTokenError,
} from '../domain/errors'
import { verifyToken, verifyMfaPartialToken } from '../services/jwt.service'
import { createKafkaClient, createProducer, createCloudEvent } from '@hotel-key/kafka'
import type { HotelKeyProducer } from '@hotel-key/kafka'
import { config } from '../config'

function buildDeps() {
  const pool = getPool()
  const staffRepo = new StaffRepository(pool)
  const tokenRepo = new TokenRepository(pool)
  const mfaRepo = new MfaRepository(pool)
  return {
    authService: new AuthService(staffRepo, tokenRepo),
    mfaService: new MfaService(mfaRepo, staffRepo),
    staffRepo,
    pool,
  }
}

let kafkaProducer: HotelKeyProducer | null = null
async function getKafkaProducer(): Promise<HotelKeyProducer> {
  if (!kafkaProducer) {
    const kafka = createKafkaClient({ clientId: 'auth-service', brokers: config.KAFKA_BROKERS.split(',') })
    kafkaProducer = await createProducer(kafka)
  }
  return kafkaProducer
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { authService, mfaService, staffRepo, pool } = buildDeps()

  app.post<{
    Body: { email: string; password: string; tenantId: string }
  }>(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'tenantId'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 1 },
            tenantId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await authService.login(
          request.body.tenantId,
          request.body.email,
          request.body.password,
        )
        return reply.send(result)
      } catch (err) {
        if (err instanceof MfaRequiredError) {
          return reply.status(403).send({
            error: {
              code: 'MFA_REQUIRED',
              message: 'MFA verification required',
              mfaToken: err.mfaToken,
            },
          })
        }
        throw err
      }
    },
  )

  app.post<{ Body: { refreshToken: string } }>(
    '/refresh',
    {
      schema: {
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const result = await authService.refresh(request.body.refreshToken)
      return reply.send(result)
    },
  )

  app.post<{ Body: { refreshToken: string } }>(
    '/logout',
    {
      schema: {
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      await authService.logout(request.body.refreshToken)
      return reply.status(204).send()
    },
  )

  app.post(
    '/mfa/setup',
    {
      preHandler: requireAccessToken,
    },
    async (request, reply) => {
      const staff = (request as unknown as { staff: { id: string; email: string; tenantId: string } }).staff
      const result = await mfaService.setup(staff.id, staff.email, staff.tenantId)
      return reply.send(result)
    },
  )

  app.post<{ Body: { code: string; mfaToken: string } }>(
    '/mfa/verify',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code', 'mfaToken'],
          properties: {
            code: { type: 'string', minLength: 6, maxLength: 6 },
            mfaToken: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const payload = await verifyMfaPartialToken(request.body.mfaToken)
      await mfaService.validateCode(payload.sub, request.body.code)
      const result = await authService.completeMfaLogin(request.body.mfaToken)
      return reply.send(result)
    },
  )

  app.post<{
    Body: { confirmationCode: string; tenantId: string; guestId: string; reservationId: string }
  }>(
    '/guest/token',
    {
      schema: {
        body: {
          type: 'object',
          required: ['guestId', 'tenantId', 'reservationId'],
          properties: {
            guestId: { type: 'string', format: 'uuid' },
            tenantId: { type: 'string', format: 'uuid' },
            reservationId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { guestId, tenantId, reservationId } = request.body
      const guestToken = await authService.issueGuestToken(guestId, tenantId, reservationId)
      return reply.send({ guestToken })
    },
  )

  app.post<{
    Body: { tenantId: string; guestId: string; reservationId: string; guestEmail: string }
  }>(
    '/guest/magic-link',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'guestId', 'reservationId', 'guestEmail'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            guestId: { type: 'string', format: 'uuid' },
            reservationId: { type: 'string', format: 'uuid' },
            guestEmail: { type: 'string', format: 'email' },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, guestId, reservationId, guestEmail } = request.body
      const magicLinkRepo = new MagicLinkRepository(pool)
      const { rawToken } = await magicLinkRepo.create({ tenantId, guestId, reservationId, guestEmail, ttlMinutes: 60 })

      try {
        const producer = await getKafkaProducer()
        const event = createCloudEvent(
          'hotel-key.auth.magic_link.created',
          'auth-service',
          tenantId,
          { guestEmail, rawToken, reservationId, tenantId },
        )
        await producer.publish('hotel-key.auth', event)
      } catch {
        // best-effort: email delivery failure must not block the response
      }

      return reply.status(202).send({ message: 'Magic link sent' })
    },
  )

  app.get<{ Querystring: { token: string } }>(
    '/guest/verify',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const tokenHash = crypto.createHash('sha256').update(request.query.token).digest('hex')

      const magicLinkRepo = new MagicLinkRepository(pool)
      const link = await magicLinkRepo.findByTokenHash(tokenHash)

      if (!link) {
        return reply.status(400).send({ error: { code: 'INVALID_TOKEN', message: 'Token is invalid or expired' } })
      }
      if (link.usedAt) {
        return reply.status(400).send({ error: { code: 'TOKEN_ALREADY_USED', message: 'This magic link has already been used' } })
      }
      if (new Date() > link.expiresAt) {
        return reply.status(400).send({ error: { code: 'TOKEN_EXPIRED', message: 'This magic link has expired' } })
      }

      await magicLinkRepo.markUsed(link.id)
      const guestToken = await authService.issueGuestToken(link.guestId, link.tenantId, link.reservationId)
      return reply.send({ guestToken })
    },
  )

  app.get(
    '/me',
    { preHandler: requireAccessToken },
    async (request, reply) => {
      const staff = (request as unknown as { staff: { id: string } }).staff
      const fullStaff = await staffRepo.findByIdOrThrow(staff.id)
      return reply.send({ data: fullStaff })
    },
  )

  app.post<{
    Body: {
      tenantId: string
      email: string
      password: string
      firstName: string
      lastName: string
      role: StaffRole
    }
  }>(
    '/staff',
    {
      preHandler: requireAccessToken,
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'email', 'password', 'firstName', 'lastName', 'role'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            firstName: { type: 'string', minLength: 1 },
            lastName: { type: 'string', minLength: 1 },
            role: { type: 'string', enum: ['super_admin', 'admin', 'front_desk', 'housekeeping', 'maintenance'] },
          },
        },
      },
    },
    async (request, reply) => {
      const caller = (request as unknown as { staff: { role: string } }).staff
      if (!['super_admin', 'admin'].includes(caller.role)) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } })
      }
      const { tenantId, email, password, firstName, lastName, role } = request.body
      const passwordHash = await argon2.hash(password)
      const newStaff = await staffRepo.create({ tenantId, email, passwordHash, firstName, lastName, role })
      return reply.status(201).send({ data: newStaff })
    },
  )

  app.post<{ Body: { code: string } }>(
    '/mfa/enable',
    {
      preHandler: requireAccessToken,
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string', minLength: 6, maxLength: 6 },
          },
        },
      },
    },
    async (request, reply) => {
      const staff = (request as unknown as { staff: { id: string } }).staff
      await mfaService.verify(staff.id, request.body.code)
      return reply.send({ message: 'MFA enabled successfully' })
    },
  )
}

async function requireAccessToken(request: { headers: { authorization?: string }; staff?: unknown }, reply: { status: (n: number) => { send: (v: unknown) => unknown } }) {
  const auth = request.headers['authorization']
  if (!auth?.startsWith('Bearer ')) {
    reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } })
    return
  }

  try {
    const token = auth.slice(7)
    const payload = await verifyToken(token)
    if (payload.type !== 'access') throw new InvalidTokenError()
    ;(request as unknown as { staff: unknown }).staff = payload
  } catch {
    reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } })
  }
}
