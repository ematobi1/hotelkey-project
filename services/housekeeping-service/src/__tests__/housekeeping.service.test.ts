import { describe, it, expect, vi } from 'vitest'
import { HousekeepingService } from '../services/housekeeping.service'
import { ConflictError } from '@hotel-key/types'

vi.mock('@hotel-key/kafka', () => ({
  createCloudEvent: vi.fn().mockReturnValue({ id: 'evt-1' }),
}))

const makeTask = (overrides = {}) => ({
  id: 'task-1',
  tenantId: 'tenant-1',
  roomId: 'room-1',
  reservationId: null,
  taskType: 'departure_clean' as const,
  status: 'pending' as const,
  priority: 1,
  assignedTo: null,
  dueAt: new Date(),
  startedAt: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeTaskRepo = (overrides = {}) => ({
  create: vi.fn().mockResolvedValue(makeTask()),
  list: vi.fn().mockResolvedValue([makeTask()]),
  findByIdOrThrow: vi.fn().mockResolvedValue(makeTask()),
  updateStatus: vi.fn().mockResolvedValue(makeTask()),
  listStaff: vi.fn().mockResolvedValue([]),
  createInspection: vi.fn(),
  ...overrides,
})

const makeProducer = () => ({ publish: vi.fn().mockResolvedValue(undefined) })

describe('HousekeepingService.createTask', () => {
  it('creates task and publishes event', async () => {
    const taskRepo = makeTaskRepo()
    const producer = makeProducer()
    const svc = new HousekeepingService(taskRepo as any, producer as any)
    const result = await svc.createTask({
      tenantId: 'tenant-1',
      roomId: 'room-1',
      taskType: 'departure_clean',
      priority: 1,
      dueAt: new Date(),
    })
    expect(result.id).toBe('task-1')
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})

describe('HousekeepingService.assignTask', () => {
  it('throws ConflictError when task is in_progress', async () => {
    const taskRepo = makeTaskRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeTask({ status: 'in_progress' })),
    })
    const svc = new HousekeepingService(taskRepo as any, makeProducer() as any)
    await expect(svc.assignTask('task-1', 'tenant-1', 'staff-1')).rejects.toThrow(ConflictError)
  })

  it('throws ConflictError when task is completed', async () => {
    const taskRepo = makeTaskRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeTask({ status: 'completed' })),
    })
    const svc = new HousekeepingService(taskRepo as any, makeProducer() as any)
    await expect(svc.assignTask('task-1', 'tenant-1', 'staff-1')).rejects.toThrow(ConflictError)
  })

  it('assigns a pending task and publishes event', async () => {
    const taskRepo = makeTaskRepo({
      updateStatus: vi.fn().mockResolvedValue(makeTask({ status: 'assigned', assignedTo: 'staff-1' })),
    })
    const producer = makeProducer()
    const svc = new HousekeepingService(taskRepo as any, producer as any)
    const result = await svc.assignTask('task-1', 'tenant-1', 'staff-1')
    expect(result.status).toBe('assigned')
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})

describe('HousekeepingService.completeTask', () => {
  it('marks task completed and publishes event', async () => {
    const taskRepo = makeTaskRepo({
      updateStatus: vi.fn().mockResolvedValue(makeTask({ status: 'completed', completedAt: new Date() })),
    })
    const producer = makeProducer()
    const svc = new HousekeepingService(taskRepo as any, producer as any)
    const result = await svc.completeTask('task-1', 'tenant-1')
    expect(result.status).toBe('completed')
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})

describe('HousekeepingService.submitInspection', () => {
  it('throws ConflictError when task type is not inspection', async () => {
    const taskRepo = makeTaskRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeTask({ taskType: 'departure_clean' })),
    })
    const svc = new HousekeepingService(taskRepo as any, makeProducer() as any)
    await expect(
      svc.submitInspection({ taskId: 'task-1', tenantId: 'tenant-1', passed: true, notes: null, inspectorId: 'staff-1' }),
    ).rejects.toThrow(ConflictError)
  })

  it('creates inspection and publishes event for inspection tasks', async () => {
    const inspection = {
      id: 'insp-1',
      taskId: 'task-1',
      tenantId: 'tenant-1',
      passed: true,
      notes: null,
      inspectorId: 'staff-1',
      inspectedAt: new Date(),
      createdAt: new Date(),
    }
    const taskRepo = makeTaskRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeTask({ taskType: 'inspection', roomId: 'room-1' })),
      createInspection: vi.fn().mockResolvedValue(inspection),
    })
    const producer = makeProducer()
    const svc = new HousekeepingService(taskRepo as any, producer as any)
    const result = await svc.submitInspection({ taskId: 'task-1', tenantId: 'tenant-1', passed: true, notes: null, inspectorId: 'staff-1' })
    expect(result.passed).toBe(true)
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})

describe('HousekeepingService.createDepartureCleanTask', () => {
  it('creates a departure_clean task with priority 1', async () => {
    const taskRepo = makeTaskRepo()
    const svc = new HousekeepingService(taskRepo as any, makeProducer() as any)
    await svc.createDepartureCleanTask('res-1', 'room-1', 'tenant-1', new Date())
    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'departure_clean', priority: 1, reservationId: 'res-1' }),
    )
  })
})
