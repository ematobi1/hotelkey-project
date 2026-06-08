import { Pool } from 'pg'
import { NotFoundError } from '../domain/errors'
import type {
  WorkOrder,
  WorkOrderStatus,
  CreateWorkOrderInput,
  ListWorkOrdersFilters,
} from '../domain/errors'

function rowToWorkOrder(r: Record<string, unknown>): WorkOrder {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    roomId: r['room_id'] as string | null,
    title: r['title'] as string,
    description: r['description'] as string,
    category: r['category'] as WorkOrder['category'],
    priority: r['priority'] as WorkOrder['priority'],
    status: r['status'] as WorkOrderStatus,
    assignedTo: r['assigned_to'] as string | null,
    reportedBy: r['reported_by'] as string,
    completedAt: r['completed_at'] as Date | null,
    dueAt: r['due_at'] as Date | null,
    notes: r['notes'] as string | null,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  }
}

const COLUMNS = `id, tenant_id, room_id, title, description, category, priority, status,
                 assigned_to, reported_by, completed_at, due_at, notes, created_at, updated_at`

export class WorkOrderRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateWorkOrderInput): Promise<WorkOrder> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO work_order
         (tenant_id, room_id, title, description, category, priority, reported_by, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUMNS}`,
      [
        input.tenantId,
        input.roomId ?? null,
        input.title,
        input.description,
        input.category,
        input.priority,
        input.reportedBy,
        input.dueAt ?? null,
      ],
    )
    return rowToWorkOrder(rows[0]!)
  }

  async findById(id: string, tenantId: string): Promise<WorkOrder | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM work_order WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )
    return rows[0] ? rowToWorkOrder(rows[0]) : null
  }

  async findByIdOrThrow(id: string, tenantId: string): Promise<WorkOrder> {
    const order = await this.findById(id, tenantId)
    if (!order) throw new NotFoundError('WorkOrder', id)
    return order
  }

  async list(filters: ListWorkOrdersFilters): Promise<WorkOrder[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${COLUMNS}
         FROM work_order
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR status = $2::work_order_status)
          AND ($3::text IS NULL OR priority = $3::work_order_priority)
          AND ($4::uuid IS NULL OR room_id = $4)
          AND ($5::uuid IS NULL OR assigned_to = $5)
        ORDER BY
          CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          created_at ASC`,
      [
        filters.tenantId,
        filters.status ?? null,
        filters.priority ?? null,
        filters.roomId ?? null,
        filters.assignedTo ?? null,
      ],
    )
    return rows.map(rowToWorkOrder)
  }

  async assign(id: string, tenantId: string, staffId: string): Promise<WorkOrder> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE work_order
          SET status      = 'assigned',
              assigned_to = $3,
              updated_at  = NOW()
        WHERE id = $1 AND tenant_id = $2
       RETURNING ${COLUMNS}`,
      [id, tenantId, staffId],
    )
    if (!rows[0]) throw new NotFoundError('WorkOrder', id)
    return rowToWorkOrder(rows[0])
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: WorkOrderStatus,
    extra?: { notes?: string | null; completedAt?: Date },
  ): Promise<WorkOrder> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE work_order
          SET status       = $3::work_order_status,
              notes        = COALESCE($4, notes),
              completed_at = COALESCE($5, completed_at),
              updated_at   = NOW()
        WHERE id = $1 AND tenant_id = $2
       RETURNING ${COLUMNS}`,
      [id, tenantId, status, extra?.notes ?? null, extra?.completedAt ?? null],
    )
    if (!rows[0]) throw new NotFoundError('WorkOrder', id)
    return rowToWorkOrder(rows[0])
  }
}
