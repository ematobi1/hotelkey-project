import type { FastifyPluginAsync } from 'fastify'
import { RoomService } from '../services/room.service'
import { RoomRepository } from '../repositories/room.repository'
import { getPool } from '../db/client'
import { createKafkaClient, createProducer } from '@hotel-key/kafka'
import { config } from '../config'
import type { RoomStatus } from '@hotel-key/types'

const VALID_STATUSES: RoomStatus[] = ['clean', 'dirty', 'occupied', 'inspecting', 'maintenance', 'out_of_order']

let service: RoomService | null = null
async function getService(): Promise<RoomService> {
  if (!service) {
    const producer = { publish: async () => {}, close: async () => {} }
    ;(async () => {
      try {
        const kafka = createKafkaClient({ clientId: 'room-service', brokers: config.KAFKA_BROKERS.split(',') })
        Object.assign(producer, await createProducer(kafka))
      } catch { /* Kafka unavailable — events silently dropped */ }
    })()
    service = new RoomService(new RoomRepository(getPool()), producer)
  }
  return service
}

export const roomRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { tenantId: string } }>(
    '/',
    { schema: { querystring: { type: 'object', properties: { tenantId: { type: 'string', format: 'uuid' } }, required: ['tenantId'] } } },
    async (request, reply) => {
      const svc = await getService()
      const rooms = await svc.listRooms(request.query.tenantId)
      return reply.send({ data: rooms, meta: { total: rooms.length } })
    },
  )

  app.get<{ Params: { id: string }; Querystring: { tenantId: string } }>(
    '/:id',
    async (request, reply) => {
      const svc = await getService()
      const room = await svc.getRoom(request.params.id, request.query['tenantId'] as string)
      return reply.send({ data: room })
    },
  )

  app.post<{
    Body: { tenantId: string; roomNumber: string; floor: number; roomTypeId: string; maxOccupancy: number; wing?: string; amenities?: string[]; isAccessible?: boolean }
  }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'roomNumber', 'floor', 'roomTypeId', 'maxOccupancy'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            roomNumber: { type: 'string', minLength: 1 },
            floor: { type: 'integer', minimum: 0 },
            roomTypeId: { type: 'string', format: 'uuid' },
            maxOccupancy: { type: 'integer', minimum: 1 },
            wing: { type: 'string' },
            amenities: { type: 'array', items: { type: 'string' } },
            isAccessible: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const room = await svc.createRoom(request.body)
      return reply.status(201).send({ data: room })
    },
  )

  app.patch<{
    Params: { id: string }
    Body: { tenantId: string; status: RoomStatus; changedBy?: string }
  }>(
    '/:id/status',
    {
      schema: {
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
        body: {
          type: 'object',
          required: ['tenantId', 'status'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: VALID_STATUSES },
            changedBy: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const room = await svc.updateStatus(
        request.params.id,
        request.body.tenantId,
        request.body.status,
        request.body.changedBy ?? null,
      )
      return reply.send({ data: room })
    },
  )

  app.get<{ Querystring: { tenantId: string } }>(
    '/types',
    { schema: { querystring: { type: 'object', properties: { tenantId: { type: 'string', format: 'uuid' } }, required: ['tenantId'] } } },
    async (request, reply) => {
      const svc = await getService()
      const types = await svc.listRoomTypes(request.query.tenantId)
      return reply.send({ data: types, meta: { total: types.length } })
    },
  )

  app.post<{
    Body: { tenantId: string; name: string; baseRate: number; currencyCode: string; maxOccupancy: number; bedConfig: unknown[] }
  }>(
    '/types',
    async (request, reply) => {
      const svc = await getService()
      const type = await svc.createRoomType(request.body as Parameters<RoomService['createRoomType']>[0])
      return reply.status(201).send({ data: type })
    },
  )
}
