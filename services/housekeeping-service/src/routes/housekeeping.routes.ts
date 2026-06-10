import type { FastifyPluginAsync } from 'fastify'
import { HousekeepingService } from '../services/housekeeping.service'
import { TaskRepository } from '../repositories/task.repository'
import { getPool } from '../db/client'
import { createKafkaClient, createProducer } from '@hotel-key/kafka'
import { config } from '../config'
import type { HkTaskType, HkPriority } from '@hotel-key/types'
import { predictWorkload } from '../services/ml.client'

async function buildService() {
  const kafka = createKafkaClient({ clientId: 'housekeeping-service', brokers: config.KAFKA_BROKERS.split(',') })
  const producer = await createProducer(kafka)
  return new HousekeepingService(new TaskRepository(getPool()), producer)
}

let service: HousekeepingService | null = null
async function getService() {
  if (!service) service = await buildService()
  return service
}

export const housekeepingRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { tenantId: string; status?: string; assignedTo?: string } }>(
    '/tasks',
    async (request, reply) => {
      const svc = await getService()
      const tasks = await svc.listTasks(request.query.tenantId, {
        status: request.query.status,
        assignedTo: request.query.assignedTo,
      })
      return reply.send({ data: tasks, meta: { total: tasks.length } })
    },
  )

  app.post<{
    Body: {
      tenantId: string
      roomId: string
      reservationId?: string
      taskType: HkTaskType
      priority?: HkPriority
      dueAt?: string
      notes?: string
    }
  }>(
    '/tasks',
    {
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'roomId', 'taskType'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            roomId: { type: 'string', format: 'uuid' },
            reservationId: { type: 'string', format: 'uuid' },
            taskType: { type: 'string', enum: ['departure_clean', 'stay_over_clean', 'turn_down', 'inspection', 'deep_clean', 'maintenance_prep', 'amenity_restock'] },
            priority: { type: 'integer', minimum: 1, maximum: 3 },
            dueAt: { type: 'string', format: 'date-time' },
            notes: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const body = request.body
      const task = await svc.createTask({
        tenantId: body.tenantId,
        roomId: body.roomId,
        reservationId: body.reservationId,
        taskType: body.taskType,
        priority: body.priority,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
        notes: body.notes,
      })
      return reply.status(201).send({ data: task })
    },
  )

  app.patch<{
    Params: { id: string }
    Body: { tenantId: string; status: string; assignedTo?: string }
  }>(
    '/tasks/:id',
    async (request, reply) => {
      const svc = await getService()
      const { id } = request.params
      const { tenantId, status, assignedTo } = request.body

      let task
      if (status === 'assigned' && assignedTo) {
        task = await svc.assignTask(id, tenantId, assignedTo)
      } else if (status === 'in_progress') {
        task = await svc.startTask(id, tenantId)
      } else if (status === 'completed') {
        task = await svc.completeTask(id, tenantId)
      } else {
        task = await svc.getTask(id, tenantId)
      }

      return reply.send({ data: task })
    },
  )

  app.get<{ Querystring: { tenantId: string } }>(
    '/staff',
    async (request, reply) => {
      const svc = await getService()
      const staff = await svc.listStaff(request.query.tenantId)
      return reply.send({ data: staff, meta: { total: staff.length } })
    },
  )

  app.get<{ Querystring: { tenantId: string; date: string } }>(
    '/workload-forecast',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['tenantId', 'date'],
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            date: { type: 'string', format: 'date' },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId } = request.query
      const now = new Date()
      const prediction = await predictWorkload({
        tenantId,
        hourOfDay: now.getHours(),
        dayOfWeek: now.getDay() === 0 ? 6 : now.getDay() - 1,
        occupancyRate: 0.7,
        checkoutsToday: 0,
        avgTaskDuration7d: 30,
        tasksInProgress: 0,
        staffOnDuty: 5,
      })

      if (!prediction) {
        return reply.send({
          data: {
            fallback: true,
            recommendation: 'Use standard task assignment',
          },
        })
      }

      const minutesPerRoom = prediction.predictedMinutesPerRoom
      const topDrivers = Object.entries(prediction.shap_values)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 3)
        .map(([feature, value]) => ({ feature, contribution: value }))

      return reply.send({
        data: {
          fallback: false,
          predictedMinutesPerRoom: minutesPerRoom,
          modelVersion: prediction.modelVersion,
          topDrivers,
          recommendation:
            minutesPerRoom > 35
              ? 'High workload predicted — consider adding staff or extending shift windows'
              : 'Normal workload — standard task assignment applies',
        },
      })
    },
  )

  app.post<{
    Body: { taskId: string; tenantId: string; passed: boolean; notes?: string; inspectorId: string }
  }>(
    '/inspect',
    {
      schema: {
        body: {
          type: 'object',
          required: ['taskId', 'tenantId', 'passed', 'inspectorId'],
          properties: {
            taskId: { type: 'string', format: 'uuid' },
            tenantId: { type: 'string', format: 'uuid' },
            passed: { type: 'boolean' },
            notes: { type: 'string' },
            inspectorId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const svc = await getService()
      const inspection = await svc.submitInspection({
        taskId: request.body.taskId,
        tenantId: request.body.tenantId,
        passed: request.body.passed,
        notes: request.body.notes ?? null,
        inspectorId: request.body.inspectorId,
      })
      return reply.status(201).send({ data: inspection })
    },
  )
}
