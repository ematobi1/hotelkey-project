import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'
import { ReservationRepository } from '../repositories/reservation.repository'

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

// findAvailableRooms is not tested here: its SQL cross-joins `room` and
// `room_type` tables that belong to room-service's own DB, and the query has a
// parameter-binding bug where $1 is bound to checkInDate but the WHERE clause
// also uses $1 for `r.tenant_id` (a UUID column), causing a type-mismatch error
// at bind time. Fix the repository before adding that test.

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

function tomorrow(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d
}

function dayAfterTomorrow(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  return d
}

describe('ReservationRepository (integration)', () => {
  it('creates a reservation and retrieves it by id', async () => {
    const repo = new ReservationRepository(pool)
    const tenantId = crypto.randomUUID()
    const guestId = crypto.randomUUID()
    const roomId = crypto.randomUUID()

    const reservation = await repo.create({
      tenantId,
      guestId,
      roomId,
      checkInDate: tomorrow(),
      checkOutDate: dayAfterTomorrow(),
      adults: 2,
      ratePerNight: 150.00,
      currencyCode: 'USD',
    })

    expect(reservation.id).toBeTruthy()
    expect(reservation.tenantId).toBe(tenantId)
    expect(reservation.guestId).toBe(guestId)
    expect(reservation.roomId).toBe(roomId)
    expect(reservation.confirmationCode).toMatch(/^HK-[A-Z0-9]{6}$/)
    expect(reservation.status).toBe('confirmed')
    expect(reservation.adults).toBe(2)
    expect(reservation.ratePerNight).toBe(150.00)
    expect(reservation.totalAmount).toBe(150.00)
    expect(reservation.currencyCode).toBe('USD')

    const found = await repo.findById(reservation.id, tenantId)
    expect(found?.id).toBe(reservation.id)
    expect(found?.confirmationCode).toBe(reservation.confirmationCode)
  }, 10_000)

  it('returns null for unknown reservation id', async () => {
    const repo = new ReservationRepository(pool)
    const result = await repo.findById(crypto.randomUUID(), crypto.randomUUID())
    expect(result).toBeNull()
  }, 10_000)

  it('lists reservations for a tenant', async () => {
    const repo = new ReservationRepository(pool)
    const tenantId = crypto.randomUUID()

    await repo.create({
      tenantId,
      guestId: crypto.randomUUID(),
      roomId: crypto.randomUUID(),
      checkInDate: tomorrow(),
      checkOutDate: dayAfterTomorrow(),
      adults: 1,
      ratePerNight: 100.00,
      currencyCode: 'EUR',
    })
    await repo.create({
      tenantId,
      guestId: crypto.randomUUID(),
      roomId: crypto.randomUUID(),
      checkInDate: tomorrow(),
      checkOutDate: dayAfterTomorrow(),
      adults: 2,
      ratePerNight: 200.00,
      currencyCode: 'EUR',
    })

    const results = await repo.list(tenantId, {})
    expect(results.length).toBe(2)
  }, 10_000)

  it('list filters by status', async () => {
    const repo = new ReservationRepository(pool)
    const tenantId = crypto.randomUUID()

    const r = await repo.create({
      tenantId,
      guestId: crypto.randomUUID(),
      roomId: crypto.randomUUID(),
      checkInDate: tomorrow(),
      checkOutDate: dayAfterTomorrow(),
      adults: 1,
      ratePerNight: 90.00,
      currencyCode: 'GBP',
    })

    await repo.updateStatus(r.id, tenantId, 'cancelled')

    const confirmed = await repo.list(tenantId, { status: 'confirmed' })
    const cancelled = await repo.list(tenantId, { status: 'cancelled' })

    expect(confirmed.every(res => res.status === 'confirmed')).toBe(true)
    expect(cancelled.some(res => res.id === r.id)).toBe(true)
  }, 10_000)

  it('updateStatus transitions to checked_in', async () => {
    const repo = new ReservationRepository(pool)
    const tenantId = crypto.randomUUID()

    const reservation = await repo.create({
      tenantId,
      guestId: crypto.randomUUID(),
      roomId: crypto.randomUUID(),
      checkInDate: tomorrow(),
      checkOutDate: dayAfterTomorrow(),
      adults: 1,
      ratePerNight: 120.00,
      currencyCode: 'USD',
    })

    const checkedIn = await repo.updateStatus(reservation.id, tenantId, 'checked_in', {
      actualCheckIn: new Date(),
    })

    expect(checkedIn.status).toBe('checked_in')
    expect(checkedIn.actualCheckIn).not.toBeNull()
  }, 10_000)

  it('updateStatus transitions through full lifecycle', async () => {
    const repo = new ReservationRepository(pool)
    const tenantId = crypto.randomUUID()

    const reservation = await repo.create({
      tenantId,
      guestId: crypto.randomUUID(),
      roomId: crypto.randomUUID(),
      checkInDate: tomorrow(),
      checkOutDate: dayAfterTomorrow(),
      adults: 2,
      ratePerNight: 80.00,
      currencyCode: 'USD',
    })

    expect(reservation.status).toBe('confirmed')

    const checkedIn = await repo.updateStatus(reservation.id, tenantId, 'checked_in')
    expect(checkedIn.status).toBe('checked_in')

    const checkedOut = await repo.updateStatus(reservation.id, tenantId, 'checked_out', {
      actualCheckOut: new Date(),
    })
    expect(checkedOut.status).toBe('checked_out')
    expect(checkedOut.actualCheckOut).not.toBeNull()
  }, 10_000)
})
