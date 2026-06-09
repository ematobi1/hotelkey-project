import { ConflictError, BadRequestError } from '../domain/errors'
import type {
  WorkOrder,
  WorkOrderStatus,
  CreateWorkOrderInput,
  ListWorkOrdersFilters,
} from '../domain/errors'
import type { WorkOrderRepository, RoomMaintenanceStats } from '../repositories/work-order.repository'
import type { HotelKeyProducer } from '@hotel-key/kafka'
import { createCloudEvent } from '@hotel-key/kafka'

const TOPIC = 'hotel-key.maintenance'

const EVENT_WORK_ORDER_CREATED = 'hotel-key.maintenance.work_order.created'
const EVENT_WORK_ORDER_UPDATED = 'hotel-key.maintenance.work_order.updated'
const EVENT_WORK_ORDER_ASSIGNED = 'hotel-key.maintenance.work_order.assigned'

const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  open: ['cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export class MaintenanceService {
  constructor(
    private readonly repo: WorkOrderRepository,
    private readonly producer: HotelKeyProducer,
  ) {}

  async createWorkOrder(input: CreateWorkOrderInput): Promise<WorkOrder> {
    const order = await this.repo.create(input)

    await this.producer.publish(
      TOPIC,
      createCloudEvent(EVENT_WORK_ORDER_CREATED, 'maintenance-service', input.tenantId, {
        workOrderId: order.id,
        title: order.title,
        category: order.category,
        priority: order.priority,
        roomId: order.roomId,
      }),
    )

    return order
  }

  async assignWorkOrder(id: string, staffId: string, tenantId: string): Promise<WorkOrder> {
    const existing = await this.repo.findByIdOrThrow(id, tenantId)

    if (existing.status !== 'open') {
      throw new ConflictError(`Cannot assign work order in status '${existing.status}'`)
    }

    const order = await this.repo.assign(id, tenantId, staffId)

    await this.producer.publish(
      TOPIC,
      createCloudEvent(EVENT_WORK_ORDER_ASSIGNED, 'maintenance-service', tenantId, {
        workOrderId: id,
        assignedTo: staffId,
      }),
    )

    return order
  }

  async updateStatus(
    id: string,
    status: WorkOrderStatus,
    notes: string | null,
    tenantId: string,
  ): Promise<WorkOrder> {
    const existing = await this.repo.findByIdOrThrow(id, tenantId)

    if (!VALID_TRANSITIONS[existing.status].includes(status)) {
      throw new BadRequestError(
        `Invalid status transition from '${existing.status}' to '${status}'`,
      )
    }

    const extra: { notes?: string | null; completedAt?: Date } = {}
    if (notes !== null) extra.notes = notes
    if (status === 'completed') extra.completedAt = new Date()

    const order = await this.repo.updateStatus(id, tenantId, status, extra)

    await this.producer.publish(
      TOPIC,
      createCloudEvent(EVENT_WORK_ORDER_UPDATED, 'maintenance-service', tenantId, {
        workOrderId: id,
        status,
        completedAt: order.completedAt?.toISOString() ?? null,
      }),
    )

    return order
  }

  async listWorkOrders(filters: ListWorkOrdersFilters): Promise<WorkOrder[]> {
    return this.repo.list(filters)
  }

  async getWorkOrder(id: string, tenantId: string): Promise<WorkOrder> {
    return this.repo.findByIdOrThrow(id, tenantId)
  }

  async listRoomsForPrediction(): Promise<RoomMaintenanceStats[]> {
    return this.repo.findRoomsForPrediction()
  }
}
