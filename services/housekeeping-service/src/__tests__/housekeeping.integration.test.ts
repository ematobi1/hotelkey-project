import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'
import { TaskRepository } from '../repositories/task.repository'

let container: StartedPostgreSqlContainer
let pool: Pool

async function runMigrations(pool: Pool, migrationsDir: string): Promise<void> {
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    await pool.query(sql)
  }
}

async function disableRls(pool: Pool): Promise<void> {
  await pool.query(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' DISABLE ROW LEVEL SECURITY';
      END LOOP;
    END $$
  `)
}

async function insertHkStaff(pool: Pool, tenantId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO hk_staff (tenant_id, first_name, last_name, shift_start, shift_end, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [tenantId, 'Clean', 'Person', '08:00', '16:00', 'available'],
  )
  return rows[0]!.id
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test')
    .withPassword('test')
    .start()

  pool = new Pool({ connectionString: container.getConnectionUri() })

  const migrationsDir = path.join(__dirname, '../db/migrations')
  await runMigrations(pool, migrationsDir)
  await disableRls(pool)
}, 60_000)

afterAll(async () => {
  await pool.end()
  await container.stop()
})

describe('TaskRepository (integration)', () => {
  it('creates a task with pending status', async () => {
    const repo = new TaskRepository(pool)
    const tenantId = crypto.randomUUID()
    const roomId = crypto.randomUUID()

    const task = await repo.create({
      tenantId,
      roomId,
      taskType: 'departure_clean',
      priority: 1,
      notes: 'VIP checkout',
    })

    expect(task.id).toBeTruthy()
    expect(task.tenantId).toBe(tenantId)
    expect(task.roomId).toBe(roomId)
    expect(task.taskType).toBe('departure_clean')
    expect(task.status).toBe('pending')
    expect(task.priority).toBe(1)
    expect(task.assignedTo).toBeNull()
    expect(task.startedAt).toBeNull()
    expect(task.completedAt).toBeNull()
  }, 10_000)

  it('findById retrieves a created task', async () => {
    const repo = new TaskRepository(pool)
    const tenantId = crypto.randomUUID()

    const task = await repo.create({
      tenantId,
      roomId: crypto.randomUUID(),
      taskType: 'stay_over_clean',
      priority: 2,
    })

    const found = await repo.findById(task.id, tenantId)
    expect(found?.id).toBe(task.id)
    expect(found?.taskType).toBe('stay_over_clean')
  }, 10_000)

  it('findById returns null for unknown task', async () => {
    const repo = new TaskRepository(pool)
    const result = await repo.findById(crypto.randomUUID(), crypto.randomUUID())
    expect(result).toBeNull()
  }, 10_000)

  it('assignTask transitions status to assigned', async () => {
    const repo = new TaskRepository(pool)
    const tenantId = crypto.randomUUID()
    const staffId = await insertHkStaff(pool, tenantId)

    const task = await repo.create({
      tenantId,
      roomId: crypto.randomUUID(),
      taskType: 'turn_down',
      priority: 2,
    })

    const assigned = await repo.updateStatus(task.id, tenantId, 'assigned', {
      assignedTo: staffId,
    })

    expect(assigned.status).toBe('assigned')
    expect(assigned.assignedTo).toBe(staffId)
  }, 10_000)

  it('startTask transitions status to in_progress', async () => {
    const repo = new TaskRepository(pool)
    const tenantId = crypto.randomUUID()
    const staffId = await insertHkStaff(pool, tenantId)

    const task = await repo.create({
      tenantId,
      roomId: crypto.randomUUID(),
      taskType: 'amenity_restock',
      priority: 3,
    })

    await repo.updateStatus(task.id, tenantId, 'assigned', { assignedTo: staffId })

    const started = await repo.updateStatus(task.id, tenantId, 'in_progress', {
      startedAt: new Date(),
    })

    expect(started.status).toBe('in_progress')
    expect(started.startedAt).not.toBeNull()
  }, 10_000)

  it('completeTask transitions status to completed', async () => {
    const repo = new TaskRepository(pool)
    const tenantId = crypto.randomUUID()
    const staffId = await insertHkStaff(pool, tenantId)

    const task = await repo.create({
      tenantId,
      roomId: crypto.randomUUID(),
      taskType: 'deep_clean',
      priority: 1,
    })

    await repo.updateStatus(task.id, tenantId, 'assigned', { assignedTo: staffId })
    const started = new Date()
    await repo.updateStatus(task.id, tenantId, 'in_progress', { startedAt: started })

    const completed = await repo.updateStatus(task.id, tenantId, 'completed', {
      completedAt: new Date(),
    })

    expect(completed.status).toBe('completed')
    expect(completed.completedAt).not.toBeNull()
  }, 10_000)

  it('full lifecycle: pending → assigned → in_progress → completed', async () => {
    const repo = new TaskRepository(pool)
    const tenantId = crypto.randomUUID()
    const staffId = await insertHkStaff(pool, tenantId)
    const roomId = crypto.randomUUID()

    const task = await repo.create({
      tenantId,
      roomId,
      taskType: 'inspection',
      priority: 2,
    })
    expect(task.status).toBe('pending')

    const assigned = await repo.updateStatus(task.id, tenantId, 'assigned', {
      assignedTo: staffId,
    })
    expect(assigned.status).toBe('assigned')
    expect(assigned.assignedTo).toBe(staffId)

    const inProgress = await repo.updateStatus(task.id, tenantId, 'in_progress', {
      startedAt: new Date(),
    })
    expect(inProgress.status).toBe('in_progress')

    const done = await repo.updateStatus(task.id, tenantId, 'completed', {
      completedAt: new Date(),
    })
    expect(done.status).toBe('completed')
    expect(done.startedAt).not.toBeNull()
    expect(done.completedAt).not.toBeNull()
  }, 10_000)

  it('list filters tasks by status', async () => {
    const repo = new TaskRepository(pool)
    const tenantId = crypto.randomUUID()

    const t1 = await repo.create({
      tenantId,
      roomId: crypto.randomUUID(),
      taskType: 'departure_clean',
      priority: 1,
    })
    await repo.create({
      tenantId,
      roomId: crypto.randomUUID(),
      taskType: 'departure_clean',
      priority: 2,
    })

    await repo.updateStatus(t1.id, tenantId, 'skipped')

    const pending = await repo.list(tenantId, { status: 'pending' })
    const skipped = await repo.list(tenantId, { status: 'skipped' })

    expect(pending.every(t => t.status === 'pending')).toBe(true)
    expect(skipped.some(t => t.id === t1.id)).toBe(true)
  }, 10_000)

  it('listStaff returns inserted staff member', async () => {
    const repo = new TaskRepository(pool)
    const tenantId = crypto.randomUUID()

    await insertHkStaff(pool, tenantId)
    await insertHkStaff(pool, tenantId)

    const staff = await repo.listStaff(tenantId)
    expect(staff.length).toBe(2)
    expect(staff.every(s => s.tenantId === tenantId)).toBe(true)
  }, 10_000)
})
