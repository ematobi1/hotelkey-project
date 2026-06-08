import type { FastifyPluginAsync } from 'fastify'
import { MaintenanceService } from '../services/maintenance.service'
import { WorkOrderRepository } from '../repositories/work-order.repository'
import { getPool } from '../db/client'
import { createKafkaClient, createProducer } from '@hotel-key/kafka'
import { config } from '../config'
import type { WorkOrderStatus, WorkOrderPriority, WorkOrderCategory } from '../domain/errors'

async function buildService(): Promise<MaintenanceService> {
  const kafka = createKafkaClient({
    clientId: 'maintenance-service',
    brokers: config.KAFKA_BROKERS.split(','),
  })
  const producer = await createProducer(kafka)
  return new MaintenanceService(new WorkOrderRepository(getPool()), producer)
}

let service: MaintenanceService | null = null
async function getService(): Promise<MaintenanceService> {
  if (!service) service = await buildService()
  return service
}

export const maintenanceRoutes: FastifyPluginAsync = async (app) => {
  app.post<{
    Body: {
      tenantId: string
      roomId?: string
      title: string
      description: string
      category: WorkOrderCategory
      priority: WorkOrderPriority
      reportedBy: string
      dueAt?: string
    }
  }>(
    '/work-orders',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'title', 'description', 'category', 'priority', 'reportedBy'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            roomId: { type: 'string', format: 'uuid' },
            title: { type: 'string', minLength: 1, maxLength: 255 },
            description: { type: 'string' },
            category: { type: 'string', enum: ['plumbing', 'electrical', 'hvac', 'furniture', 'cleaning', 'safety', 'other'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            reportedBy: { type: 'string', format: 'uuid' },
            dueAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const body = request.body
      const order = await svc.createWorkOrder({
        tenantId: body.tenantId,
        roomId: body.roomId ?? null,
        title: body.title,
        description: body.description,
        category: body.category,
        priority: body.priority,
        reportedBy: body.reportedBy,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
      })
      return reply.status(201).send({ data: order })
    },
  )

  app.get<{
    Querystring: {
      tenantId: string
      status?: WorkOrderStatus
      priority?: WorkOrderPriority
      roomId?: string
      assignedTo?: string
    }
  }>(
    '/work-orders',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['tenantId'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['open', 'assigned', 'in_progress', 'completed', 'cancelled'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            roomId: { type: 'string', format: 'uuid' },
            assignedTo: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const q = request.query
      const orders = await svc.listWorkOrders({
        tenantId: q.tenantId,
        status: q.status,
        priority: q.priority,
        roomId: q.roomId,
        assignedTo: q.assignedTo,
      })
      return reply.send({ data: orders, meta: { total: orders.length } })
    },
  )

  app.get<{ Params: { id: string }; Querystring: { tenantId: string } }>(
    '/work-orders/:id',
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
      const svc = await getService()
      const order = await svc.getWorkOrder(request.params.id, request.query.tenantId)
      return reply.send({ data: order })
    },
  )

  app.patch<{
    Params: { id: string }
    Body: { staffId: string; tenantId: string }
  }>(
    '/work-orders/:id/assign',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['staffId', 'tenantId'],
          properties: {
            staffId: { type: 'string', format: 'uuid' },
            tenantId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const order = await svc.assignWorkOrder(
        request.params.id,
        request.body.staffId,
        request.body.tenantId,
      )
      return reply.send({ data: order })
    },
  )

  app.patch<{
    Params: { id: string }
    Body: { status: WorkOrderStatus; notes?: string; tenantId: string }
  }>(
    '/work-orders/:id/status',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['status', 'tenantId'],
          properties: {
            status: { type: 'string', enum: ['open', 'assigned', 'in_progress', 'completed', 'cancelled'] },
            notes: { type: 'string' },
            tenantId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const order = await svc.updateStatus(
        request.params.id,
        request.body.status,
        request.body.notes ?? null,
        request.body.tenantId,
      )
      return reply.send({ data: order })
    },
  )

  app.delete<{
    Params: { id: string }
    Body: { tenantId: string }
  }>(
    '/work-orders/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['tenantId'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      await svc.updateStatus(request.params.id, 'cancelled', null, request.body.tenantId)
      return reply.status(204).send()
    },
  )
}
