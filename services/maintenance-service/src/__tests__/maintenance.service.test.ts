import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MaintenanceService } from '../services/maintenance.service'
import { ConflictError, BadRequestError } from '../domain/errors'
import type { WorkOrder } from '../domain/errors'

function makeWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    tenantId: '00000000-0000-0000-0000-000000000002',
    roomId: null,
    title: 'Fix leaking sink',
    description: 'Sink in room 101 is leaking',
    category: 'plumbing',
    priority: 'medium',
    status: 'open',
    assignedTo: null,
    reportedBy: '00000000-0000-0000-0000-000000000003',
    completedAt: null,
    dueAt: null,
    notes: null,
    createdAt: new Date('2026-06-08T10:00:00Z'),
    updatedAt: new Date('2026-06-08T10:00:00Z'),
    ...overrides,
  }
}

const mockRepo = {
  create: vi.fn(),
  findById: vi.fn(),
  findByIdOrThrow: vi.fn(),
  list: vi.fn(),
  assign: vi.fn(),
  updateStatus: vi.fn(),
}

const mockProducer = {
  publish: vi.fn().mockResolvedValue(undefined),
}

describe('MaintenanceService', () => {
  let svc: MaintenanceService

  beforeEach(() => {
    vi.clearAllMocks()
    svc = new MaintenanceService(mockRepo as any, mockProducer as any)
  })

  it('createWorkOrder — creates work order and publishes created event', async () => {
    const order = makeWorkOrder()
    mockRepo.create.mockResolvedValue(order)

    const result = await svc.createWorkOrder({
      tenantId: order.tenantId,
      roomId: null,
      title: order.title,
      description: order.description,
      category: 'plumbing',
      priority: 'medium',
      reportedBy: order.reportedBy,
    })

    expect(result).toEqual(order)
    expect(mockRepo.create).toHaveBeenCalledOnce()
    expect(mockProducer.publish).toHaveBeenCalledOnce()
    const [topic, event] = mockProducer.publish.mock.calls[0] as [string, { type: string }]
    expect(topic).toBe('hotel-key.maintenance')
    expect(event.type).toBe('hotel-key.maintenance.work_order.created')
  })

  it('assignWorkOrder — throws ConflictError when status is not open', async () => {
    mockRepo.findByIdOrThrow.mockResolvedValue(makeWorkOrder({ status: 'in_progress' }))

    await expect(
      svc.assignWorkOrder('00000000-0000-0000-0000-000000000001', 'staff-id', '00000000-0000-0000-0000-000000000002'),
    ).rejects.toBeInstanceOf(ConflictError)

    expect(mockRepo.assign).not.toHaveBeenCalled()
    expect(mockProducer.publish).not.toHaveBeenCalled()
  })

  it('assignWorkOrder — assigns work order and publishes assigned event when status is open', async () => {
    const staffId = '00000000-0000-0000-0000-000000000099'
    const order = makeWorkOrder({ status: 'open' })
    const assigned = makeWorkOrder({ status: 'assigned', assignedTo: staffId })
    mockRepo.findByIdOrThrow.mockResolvedValue(order)
    mockRepo.assign.mockResolvedValue(assigned)

    const result = await svc.assignWorkOrder(order.id, staffId, order.tenantId)

    expect(result).toEqual(assigned)
    expect(mockRepo.assign).toHaveBeenCalledWith(order.id, order.tenantId, staffId)
    expect(mockProducer.publish).toHaveBeenCalledOnce()
    const [topic, event] = mockProducer.publish.mock.calls[0] as [string, { type: string }]
    expect(topic).toBe('hotel-key.maintenance')
    expect(event.type).toBe('hotel-key.maintenance.work_order.assigned')
  })

  it('updateStatus — throws BadRequestError for invalid transition (completed → in_progress)', async () => {
    mockRepo.findByIdOrThrow.mockResolvedValue(makeWorkOrder({ status: 'completed' }))

    await expect(
      svc.updateStatus('00000000-0000-0000-0000-000000000001', 'in_progress', null, '00000000-0000-0000-0000-000000000002'),
    ).rejects.toBeInstanceOf(BadRequestError)

    expect(mockRepo.updateStatus).not.toHaveBeenCalled()
    expect(mockProducer.publish).not.toHaveBeenCalled()
  })

  it('updateStatus — updates status and publishes updated event for valid transition (assigned → in_progress)', async () => {
    const order = makeWorkOrder({ status: 'assigned' })
    const updated = makeWorkOrder({ status: 'in_progress' })
    mockRepo.findByIdOrThrow.mockResolvedValue(order)
    mockRepo.updateStatus.mockResolvedValue(updated)

    const result = await svc.updateStatus(order.id, 'in_progress', null, order.tenantId)

    expect(result).toEqual(updated)
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(order.id, order.tenantId, 'in_progress', {})
    expect(mockProducer.publish).toHaveBeenCalledOnce()
    const [topic, event] = mockProducer.publish.mock.calls[0] as [string, { type: string }]
    expect(topic).toBe('hotel-key.maintenance')
    expect(event.type).toBe('hotel-key.maintenance.work_order.updated')
  })
})
