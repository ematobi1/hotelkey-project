import { createHmac, timingSafeEqual } from 'crypto'
import type { FastifyPluginAsync } from 'fastify'
import { ChannelManagerService } from '../services/channel-manager.service'
import { ChannelMappingRepository } from '../repositories/channel-mapping.repository'
import { ChannelBookingRepository } from '../repositories/channel-booking.repository'
import { siteMinderClient } from '../services/siteminder.client'
import { reservationClient } from '../services/reservation.client'
import { getPool } from '../db/client'
import { config } from '../config'
import type { ChannelBookingStatus } from '../domain/errors'
import type { SiteMinderBooking } from '../services/siteminder.client'

function buildService(): ChannelManagerService {
  const pool = getPool()
  return new ChannelManagerService(
    new ChannelMappingRepository(pool),
    new ChannelBookingRepository(pool),
    siteMinderClient,
    reservationClient,
  )
}

let service: ChannelManagerService | null = null
function getService(): ChannelManagerService {
  if (!service) service = buildService()
  return service
}

function verifySignature(body: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const expectedBuf = Buffer.from(expected)
  const signatureBuf = Buffer.from(signature)
  if (expectedBuf.length !== signatureBuf.length) return false
  return timingSafeEqual(expectedBuf, signatureBuf)
}

export const channelManagerRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { tenantId: string } }>(
    '/mappings',
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
      const svc = getService()
      const mappings = await svc.listMappings(request.query.tenantId)
      return reply.send({ data: mappings, meta: { total: mappings.length } })
    },
  )

  app.post<{
    Body: {
      tenantId: string
      hotelKeyRoomTypeId: string
      siteMinderRoomTypeCode: string
      siteMinderRatePlanCode: string
    }
  }>(
    '/mappings',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'hotelKeyRoomTypeId', 'siteMinderRoomTypeCode', 'siteMinderRatePlanCode'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            hotelKeyRoomTypeId: { type: 'string', format: 'uuid' },
            siteMinderRoomTypeCode: { type: 'string', minLength: 1, maxLength: 50 },
            siteMinderRatePlanCode: { type: 'string', minLength: 1, maxLength: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = getService()
      const mapping = await svc.createMapping({
        tenantId: request.body.tenantId,
        hotelKeyRoomTypeId: request.body.hotelKeyRoomTypeId,
        siteMinderRoomTypeCode: request.body.siteMinderRoomTypeCode,
        siteMinderRatePlanCode: request.body.siteMinderRatePlanCode,
      })
      return reply.status(201).send({ data: mapping })
    },
  )

  app.delete<{
    Params: { id: string }
    Querystring: { tenantId: string }
  }>(
    '/mappings/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: { tenantId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const svc = getService()
      await svc.deleteMapping(request.params.id, request.query.tenantId)
      return reply.status(204).send()
    },
  )

  app.post<{
    Body: {
      tenantId: string
      roomTypeId: string
      hotelCode: string
      dates: Array<{ date: string; available: number; minStay?: number }>
    }
  }>(
    '/push-availability',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'roomTypeId', 'hotelCode', 'dates'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            roomTypeId: { type: 'string', format: 'uuid' },
            hotelCode: { type: 'string', minLength: 1 },
            dates: {
              type: 'array',
              items: {
                type: 'object',
                required: ['date', 'available'],
                properties: {
                  date: { type: 'string', format: 'date' },
                  available: { type: 'integer', minimum: 0 },
                  minStay: { type: 'integer', minimum: 1 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = getService()
      const { tenantId, roomTypeId, hotelCode, dates } = request.body
      await svc.pushAvailability(tenantId, roomTypeId, hotelCode, dates)
      return reply.send({ data: { ok: true } })
    },
  )

  app.post<{
    Body: {
      tenantId: string
      roomTypeId: string
      hotelCode: string
      dates: Array<{ date: string; rate: number; currencyCode: string }>
    }
  }>(
    '/push-rates',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'roomTypeId', 'hotelCode', 'dates'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            roomTypeId: { type: 'string', format: 'uuid' },
            hotelCode: { type: 'string', minLength: 1 },
            dates: {
              type: 'array',
              items: {
                type: 'object',
                required: ['date', 'rate', 'currencyCode'],
                properties: {
                  date: { type: 'string', format: 'date' },
                  rate: { type: 'number', minimum: 0 },
                  currencyCode: { type: 'string', minLength: 3, maxLength: 3 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = getService()
      const { tenantId, roomTypeId, hotelCode, dates } = request.body
      await svc.pushRates(tenantId, roomTypeId, hotelCode, dates)
      return reply.send({ data: { ok: true } })
    },
  )

  app.get<{ Querystring: { tenantId: string; status?: string } }>(
    '/bookings',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['received', 'processed', 'failed'] },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = getService()
      const bookings = await svc.listBookings(
        request.query.tenantId,
        request.query.status as ChannelBookingStatus | undefined,
      )
      return reply.send({ data: bookings, meta: { total: bookings.length } })
    },
  )

  // Webhook is registered in its own scope to isolate the raw body content-type parser
  await app.register(async (webhookScope) => {
    webhookScope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
      done(null, body)
    })

    webhookScope.post<{ Querystring: { tenantId: string } }>(
      '/siteminder/webhook',
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
        const signature = request.headers['x-siteminder-signature'] as string | undefined
        const rawBody = request.body as Buffer

        if (!signature || !verifySignature(rawBody, signature, config.SITEMINDER_WEBHOOK_SECRET)) {
          return reply.status(400).send({
            error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' },
          })
        }

        let smBooking: SiteMinderBooking
        try {
          smBooking = JSON.parse(rawBody.toString('utf-8')) as SiteMinderBooking
        } catch {
          return reply.status(400).send({
            error: { code: 'INVALID_PAYLOAD', message: 'Request body is not valid JSON' },
          })
        }

        const svc = getService()
        const tenantId = request.query.tenantId

        try {
          await svc.processIncomingBooking(tenantId, smBooking)
        } catch (err) {
          request.log.error({ err }, 'Failed to process SiteMinder webhook booking')
        }

        return reply.send({ received: true })
      },
    )
  })
}
