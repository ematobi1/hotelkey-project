import { Pool } from 'pg'
import type { HkTask, HkStaff, HkInspection, CreateHkTaskInput } from '@hotel-key/types'
import { NotFoundError } from '@hotel-key/types'

function rowToTask(r: Record<string, unknown>): HkTask {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    roomId: r['room_id'] as string,
    reservationId: r['reservation_id'] as string | null,
    taskType: r['task_type'] as HkTask['taskType'],
    status: r['status'] as HkTask['status'],
    priority: r['priority'] as HkTask['priority'],
    assignedTo: r['assigned_to'] as string | null,
    dueAt: r['due_at'] as Date | null,
    startedAt: r['started_at'] as Date | null,
    completedAt: r['completed_at'] as Date | null,
    notes: r['notes'] as string | null,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  }
}

function rowToStaff(r: Record<string, unknown>): HkStaff {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    firstName: r['first_name'] as string,
    lastName: r['last_name'] as string,
    currentFloor: r['current_floor'] as number | null,
    shiftStart: r['shift_start'] as string,
    shiftEnd: r['shift_end'] as string,
    status: r['status'] as HkStaff['status'],
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  }
}

export class TaskRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateHkTaskInput): Promise<HkTask> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO hk_task (tenant_id, room_id, reservation_id, task_type, priority, due_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, tenant_id, room_id, reservation_id, task_type, status,
                 priority, assigned_to, due_at, started_at, completed_at, notes, created_at, updated_at`,
      [
        input.tenantId, input.roomId, input.reservationId ?? null,
        input.taskType, input.priority ?? 2, input.dueAt ?? null, input.notes ?? null,
      ],
    )
    return rowToTask(rows[0]!)
  }

  async findById(id: string, tenantId: string): Promise<HkTask | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, room_id, reservation_id, task_type, status,
              priority, assigned_to, due_at, started_at, completed_at, notes, created_at, updated_at
         FROM hk_task WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )
    return rows[0] ? rowToTask(rows[0]) : null
  }

  async findByIdOrThrow(id: string, tenantId: string): Promise<HkTask> {
    const task = await this.findById(id, tenantId)
    if (!task) throw new NotFoundError('Task', id)
    return task
  }

  async list(
    tenantId: string,
    filters: { status?: string; floor?: number; assignedTo?: string; limit?: number },
  ): Promise<HkTask[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT t.id, t.tenant_id, t.room_id, t.reservation_id, t.task_type, t.status,
              t.priority, t.assigned_to, t.due_at, t.started_at, t.completed_at, t.notes, t.created_at, t.updated_at
         FROM hk_task t
        WHERE t.tenant_id = $1
          AND ($2::text IS NULL OR t.status = $2)
          AND ($3::uuid IS NULL OR t.assigned_to = $3)
        ORDER BY t.priority ASC, t.due_at ASC NULLS LAST
        LIMIT $4`,
      [tenantId, filters.status ?? null, filters.assignedTo ?? null, filters.limit ?? 50],
    )
    return rows.map(rowToTask)
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: HkTask['status'],
    extra?: { assignedTo?: string; startedAt?: Date; completedAt?: Date },
  ): Promise<HkTask> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE hk_task
          SET status       = $3,
              assigned_to  = COALESCE($4, assigned_to),
              started_at   = COALESCE($5, started_at),
              completed_at = COALESCE($6, completed_at),
              updated_at   = NOW()
        WHERE id = $1 AND tenant_id = $2
       RETURNING id, tenant_id, room_id, reservation_id, task_type, status,
                 priority, assigned_to, due_at, started_at, completed_at, notes, created_at, updated_at`,
      [id, tenantId, status, extra?.assignedTo ?? null, extra?.startedAt ?? null, extra?.completedAt ?? null],
    )
    if (!rows[0]) throw new NotFoundError('Task', id)
    return rowToTask(rows[0])
  }

  async listStaff(tenantId: string): Promise<HkStaff[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, first_name, last_name, current_floor, shift_start, shift_end, status, created_at, updated_at
         FROM hk_staff WHERE tenant_id = $1 ORDER BY last_name, first_name`,
      [tenantId],
    )
    return rows.map(rowToStaff)
  }

  async createInspection(input: {
    taskId: string
    tenantId: string
    passed: boolean
    notes: string | null
    inspectorId: string
  }): Promise<HkInspection> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO hk_inspection (task_id, tenant_id, passed, notes, inspector_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, task_id, tenant_id, passed, notes, inspector_id, inspected_at`,
      [input.taskId, input.tenantId, input.passed, input.notes, input.inspectorId],
    )
    const r = rows[0]!
    return {
      id: r['id'] as string,
      taskId: r['task_id'] as string,
      tenantId: r['tenant_id'] as string,
      passed: r['passed'] as boolean,
      notes: r['notes'] as string | null,
      inspectorId: r['inspector_id'] as string,
      inspectedAt: r['inspected_at'] as Date,
    }
  }
}
