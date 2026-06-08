import type { FastifyPluginAsync } from 'fastify'
import Redis from 'ioredis'
import Redlock from 'redlock'
import { ReservationService } from '../services/reservation.service'
import { ReservationRepository } from '../repositories/reservation.repository'
import { getPool } from '../db/client'
import { createKafkaClient, createProducer } from '@hotel-key/kafka'
import { config } from '../config'

async function buildService() {
  const kafka = createKafkaClient({
    clientId: 'reservation-service',
    brokers: config.KAFKA_BROKERS.split(','),
  })
  const producer = await createProducer(kafka)
  const redis = new Redis(config.REDIS_URL)
  const redlock = new Redlock([redis], { retryCount: 3, retryDelay: 200 })
  return new ReservationService(new ReservationRepository(getPool()), producer, redlock)
}

let service: ReservationService | null = null
async function getService() {
  if (!service) service = await buildService()
  return service
}

export const reservationRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Querystring: {
      tenantId: string
      checkInDate: string
      checkOutDate: string
      adults: string
      roomTypeId?: string
    }
  }>(
    '/availability',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['tenantId', 'checkInDate', 'checkOutDate', 'adults'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            checkInDate: { type: 'string', format: 'date' },
            checkOutDate: { type: 'string', format: 'date' },
            adults: { type: 'string' },
            roomTypeId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const { tenantId, checkInDate, checkOutDate, adults, roomTypeId } = request.query
      const results = await svc.getAvailability({
        tenantId,
        checkInDate: new Date(checkInDate),
        checkOutDate: new Date(checkOutDate),
        adults: parseInt(adults, 10),
        roomTypeId,
      })
      return reply.send({ data: results, meta: { total: results.length } })
    },
  )

  app.post<{
    Body: {
      tenantId: string
      guestId: string
      roomId: string
      checkInDate: string
      checkOutDate: string
      adults: number
      children?: number
      ratePerNight: number
      currencyCode: string
      source?: string
      specialRequests?: string
    }
  }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'guestId', 'roomId', 'checkInDate', 'checkOutDate', 'adults', 'ratePerNight', 'currencyCode'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            guestId: { type: 'string', format: 'uuid' },
            roomId: { type: 'string', format: 'uuid' },
            checkInDate: { type: 'string', format: 'date' },
            checkOutDate: { type: 'string', format: 'date' },
            adults: { type: 'integer', minimum: 1 },
            children: { type: 'integer', minimum: 0 },
            ratePerNight: { type: 'number', minimum: 0 },
            currencyCode: { type: 'string', minLength: 3, maxLength: 3 },
            source: { type: 'string' },
            specialRequests: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const body = request.body
      const reservation = await svc.createReservation({
        ...body,
        checkInDate: new Date(body.checkInDate),
        checkOutDate: new Date(body.checkOutDate),
      })
      return reply.status(201).send({ data: reservation })
    },
  )

  app.get<{ Querystring: { tenantId: string; status?: string; guestId?: string; limit?: string; offset?: string } }>(
    '/',
    async (request, reply) => {
      const svc = await getService()
      const { tenantId, status, guestId, limit, offset } = request.query
      const reservations = await svc.listReservations(tenantId, {
        status: status as never,
        guestId,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      })
      return reply.send({ data: reservations, meta: { total: reservations.length } })
    },
  )

  app.get<{ Params: { id: string }; Querystring: { tenantId: string } }>(
    '/:id',
    async (request, reply) => {
      const svc = await getService()
      const reservation = await svc.getReservation(request.params.id, request.query['tenantId'] as string)
      return reply.send({ data: reservation })
    },
  )

  app.delete<{ Params: { id: string }; Querystring: { tenantId: string } }>(
    '/:id',
    async (request, reply) => {
      const svc = await getService()
      const reservation = await svc.cancelReservation(request.params.id, request.query['tenantId'] as string)
      return reply.send({ data: reservation })
    },
  )

  app.post<{ Params: { id: string }; Body: { tenantId: string } }>(
    '/:id/check-in',
    async (request, reply) => {
      const svc = await getService()
      const reservation = await svc.checkIn(request.params.id, request.body.tenantId)
      return reply.send({ data: reservation })
    },
  )

  app.post<{ Params: { id: string }; Body: { tenantId: string } }>(
    '/:id/check-out',
    async (request, reply) => {
      const svc = await getService()
      const reservation = await svc.checkOut(request.params.id, request.body.tenantId)
      return reply.send({ data: reservation })
    },
  )
}
