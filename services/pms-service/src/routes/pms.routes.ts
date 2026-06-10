import type { FastifyPluginAsync } from 'fastify'
import { TenantService } from '../services/tenant.service'
import { RoomTypeService } from '../services/room-type.service'
import { TenantRepository } from '../repositories/tenant.repository'
import { RoomTypeRepository } from '../repositories/room-type.repository'
import { getPool } from '../db/client'

function buildDeps() {
  const pool = getPool()
  return {
    tenantService: new TenantService(new TenantRepository(pool)),
    roomTypeService: new RoomTypeService(new RoomTypeRepository(pool)),
  }
}

export const pmsRoutes: FastifyPluginAsync = async (app) => {
  const { tenantService, roomTypeService } = buildDeps()

  // ── Tenants ─────────────────────────────────────────────────────────────────

  app.post<{
    Body: {
      name: string
      slug: string
      planType: 'starter' | 'professional' | 'enterprise'
      settings?: Record<string, unknown>
    }
  }>(
    '/tenants',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'slug', 'planType'],
          properties: {
            name: { type: 'string', minLength: 1 },
            slug: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-z0-9-]+$' },
            planType: { type: 'string', enum: ['starter', 'professional', 'enterprise'] },
            settings: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const tenant = await tenantService.createTenant(request.body)
      return reply.status(201).send({ data: tenant })
    },
  )

  app.get<{ Params: { id: string } }>(
    '/tenants/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const tenant = await tenantService.getTenant(request.params.id)
      return reply.send({ data: tenant })
    },
  )

  app.patch<{
    Params: { id: string }
    Body: { name?: string; planType?: 'starter' | 'professional' | 'enterprise'; active?: boolean }
  }>(
    '/tenants/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            planType: { type: 'string', enum: ['starter', 'professional', 'enterprise'] },
            active: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const tenant = await tenantService.updateTenant(request.params.id, request.body)
      return reply.send({ data: tenant })
    },
  )

  app.get<{ Params: { id: string } }>(
    '/tenants/:id/settings',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const settings = await tenantService.getSettings(request.params.id)
      return reply.send({ data: settings })
    },
  )

  app.put<{
    Params: { id: string }
    Body: {
      timezone: string
      currency: string
      checkInTime: string
      checkOutTime: string
      defaultLanguage: string
    }
  }>(
    '/tenants/:id/settings',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['timezone', 'currency', 'checkInTime', 'checkOutTime', 'defaultLanguage'],
          properties: {
            timezone: { type: 'string', minLength: 1 },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            checkInTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
            checkOutTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
            defaultLanguage: { type: 'string', minLength: 2 },
          },
        },
      },
    },
    async (request, reply) => {
      const tenant = await tenantService.updateSettings(request.params.id, request.body)
      return reply.send({ data: tenant })
    },
  )

  // ── Room Types ───────────────────────────────────────────────────────────────

  app.post<{
    Body: {
      tenantId: string
      name: string
      bedConfig: string
      maxOccupancy: number
      baseRateAmount: number
      baseRateCurrency: string
      amenities: string[]
    }
  }>(
    '/room-types',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'name', 'bedConfig', 'maxOccupancy', 'baseRateAmount', 'baseRateCurrency'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            name: { type: 'string', minLength: 1 },
            bedConfig: { type: 'string', minLength: 1 },
            maxOccupancy: { type: 'integer', minimum: 1 },
            baseRateAmount: { type: 'number', minimum: 0 },
            baseRateCurrency: { type: 'string', minLength: 3, maxLength: 3 },
            amenities: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const roomType = await roomTypeService.createRoomType({
        ...request.body,
        amenities: request.body.amenities ?? [],
      })
      return reply.status(201).send({ data: roomType })
    },
  )

  app.get<{ Querystring: { tenantId: string } }>(
    '/room-types',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: { tenantId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const roomTypes = await roomTypeService.listRoomTypes(request.query.tenantId)
      return reply.send({ data: roomTypes, meta: { total: roomTypes.length } })
    },
  )

  app.get<{ Params: { id: string } }>(
    '/room-types/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const roomType = await roomTypeService.getRoomType(request.params.id)
      return reply.send({ data: roomType })
    },
  )

  app.patch<{
    Params: { id: string }
    Body: {
      name?: string
      bedConfig?: string
      maxOccupancy?: number
      baseRateAmount?: number
      baseRateCurrency?: string
      amenities?: string[]
    }
  }>(
    '/room-types/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            bedConfig: { type: 'string', minLength: 1 },
            maxOccupancy: { type: 'integer', minimum: 1 },
            baseRateAmount: { type: 'number', minimum: 0 },
            baseRateCurrency: { type: 'string', minLength: 3, maxLength: 3 },
            amenities: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const roomType = await roomTypeService.updateRoomType(request.params.id, request.body)
      return reply.send({ data: roomType })
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/room-types/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      await roomTypeService.deleteRoomType(request.params.id)
      return reply.status(204).send()
    },
  )
}
