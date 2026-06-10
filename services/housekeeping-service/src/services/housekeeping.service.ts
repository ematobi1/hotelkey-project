import type { HkTask, HkStaff, HkInspection, CreateHkTaskInput } from '@hotel-key/types'
import { ConflictError } from '@hotel-key/types'
import type { TaskRepository } from '../repositories/task.repository'
import type { HotelKeyProducer } from '@hotel-key/kafka'
import { createCloudEvent } from '@hotel-key/kafka'
import { EventTypes } from '@hotel-key/types'

export class HousekeepingService {
  constructor(
    private readonly taskRepo: TaskRepository,
    private readonly producer: HotelKeyProducer,
  ) {}

  async createTask(input: CreateHkTaskInput): Promise<HkTask> {
    const task = await this.taskRepo.create(input)

    await this.producer.publish(
      'hotel-key.housekeeping',
      createCloudEvent(EventTypes.HK_TASK_CREATED, 'housekeeping-service', input.tenantId, {
        taskId: task.id,
        roomId: task.roomId,
        taskType: task.taskType,
        priority: task.priority,
      }),
    )

    return task
  }

  async listTasks(
    tenantId: string,
    filters: { status?: string; floor?: number; assignedTo?: string },
  ): Promise<HkTask[]> {
    return this.taskRepo.list(tenantId, filters)
  }

  async getTask(id: string, tenantId: string): Promise<HkTask> {
    return this.taskRepo.findByIdOrThrow(id, tenantId)
  }

  async assignTask(taskId: string, tenantId: string, staffId: string): Promise<HkTask> {
    const existing = await this.taskRepo.findByIdOrThrow(taskId, tenantId)
    if (!['pending', 'assigned'].includes(existing.status)) {
      throw new ConflictError(`Cannot assign task in status '${existing.status}'`)
    }

    const task = await this.taskRepo.updateStatus(taskId, tenantId, 'assigned', {
      assignedTo: staffId,
    })

    await this.producer.publish(
      'hotel-key.housekeeping',
      createCloudEvent(EventTypes.HK_TASK_ASSIGNED, 'housekeeping-service', tenantId, {
        taskId,
        assignedTo: staffId,
      }),
    )

    return task
  }

  async startTask(taskId: string, tenantId: string): Promise<HkTask> {
    return this.taskRepo.updateStatus(taskId, tenantId, 'in_progress', { startedAt: new Date() })
  }

  async completeTask(taskId: string, tenantId: string): Promise<HkTask> {
    const task = await this.taskRepo.updateStatus(taskId, tenantId, 'completed', {
      completedAt: new Date(),
    })

    await this.producer.publish(
      'hotel-key.housekeeping',
      createCloudEvent(EventTypes.HK_TASK_COMPLETED, 'housekeeping-service', tenantId, {
        taskId,
        roomId: task.roomId,
        completedAt: task.completedAt!.toISOString(),
      }),
    )

    return task
  }

  async createDepartureCleanTask(
    reservationId: string,
    roomId: string,
    tenantId: string,
    checkoutDate: Date,
  ): Promise<HkTask> {
    return this.createTask({
      tenantId,
      roomId,
      reservationId,
      taskType: 'departure_clean',
      priority: 1,
      dueAt: checkoutDate,
    })
  }

  async listStaff(tenantId: string): Promise<HkStaff[]> {
    return this.taskRepo.listStaff(tenantId)
  }

  async submitInspection(input: {
    taskId: string
    tenantId: string
    passed: boolean
    notes: string | null
    inspectorId: string
  }): Promise<HkInspection> {
    const task = await this.taskRepo.findByIdOrThrow(input.taskId, input.tenantId)
    if (task.taskType !== 'inspection') {
      throw new ConflictError('Can only inspect tasks of type "inspection"')
    }

    const inspection = await this.taskRepo.createInspection(input)

    await this.producer.publish(
      'hotel-key.housekeeping',
      createCloudEvent(EventTypes.HK_ROOM_INSPECTED, 'housekeeping-service', input.tenantId, {
        taskId: input.taskId,
        roomId: task.roomId,
        passed: inspection.passed,
        inspectedAt: inspection.inspectedAt.toISOString(),
      }),
    )

    return inspection
  }
}
