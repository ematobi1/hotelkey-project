import type { FastifyPluginAsync } from 'fastify'
import { AuthService } from '../services/auth.service'
import { MfaService } from '../services/mfa.service'
import { StaffRepository } from '../repositories/staff.repository'
import { TokenRepository } from '../repositories/token.repository'
import { MfaRepository } from '../repositories/mfa.repository'
import { getPool } from '../db/client'
import {
  MfaRequiredError,
  InvalidTokenError,
} from '../domain/errors'
import { verifyToken, verifyMfaPartialToken } from '../services/jwt.service'

function buildDeps() {
  const pool = getPool()
  const staffRepo = new StaffRepository(pool)
  const tokenRepo = new TokenRepository(pool)
  const mfaRepo = new MfaRepository(pool)
  return {
    authService: new AuthService(staffRepo, tokenRepo),
    mfaService: new MfaService(mfaRepo, staffRepo),
    staffRepo,
  }
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { authService, mfaService, staffRepo } = buildDeps()

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

  app.get(
    '/me',
    { preHandler: requireAccessToken },
    async (request, reply) => {
      const staff = (request as unknown as { staff: { id: string } }).staff
      const fullStaff = await staffRepo.findByIdOrThrow(staff.id)
      return reply.send({ data: fullStaff })
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
