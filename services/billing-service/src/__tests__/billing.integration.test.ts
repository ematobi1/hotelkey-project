import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'
import { FolioRepository } from '../repositories/folio.repository'

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

describe('FolioRepository (integration)', () => {
  it('createForReservation creates a folio with open status', async () => {
    const repo = new FolioRepository(pool)
    const tenantId = crypto.randomUUID()
    const reservationId = crypto.randomUUID()
    const guestId = crypto.randomUUID()

    const folio = await repo.createForReservation(reservationId, guestId, tenantId)

    expect(folio.id).toBeTruthy()
    expect(folio.tenantId).toBe(tenantId)
    expect(folio.reservationId).toBe(reservationId)
    expect(folio.guestId).toBe(guestId)
    expect(folio.status).toBe('open')
    expect(folio.closedAt).toBeNull()
  }, 10_000)

  it('createForReservation is idempotent for the same reservationId', async () => {
    const repo = new FolioRepository(pool)
    const tenantId = crypto.randomUUID()
    const reservationId = crypto.randomUUID()
    const guestId = crypto.randomUUID()

    const first = await repo.createForReservation(reservationId, guestId, tenantId)
    const second = await repo.createForReservation(reservationId, guestId, tenantId)

    expect(first.id).toBe(second.id)
  }, 10_000)

  it('findByReservationId returns the folio', async () => {
    const repo = new FolioRepository(pool)
    const tenantId = crypto.randomUUID()
    const reservationId = crypto.randomUUID()

    await repo.createForReservation(reservationId, crypto.randomUUID(), tenantId)
    const found = await repo.findByReservationId(reservationId)

    expect(found).not.toBeNull()
    expect(found?.reservationId).toBe(reservationId)
  }, 10_000)

  it('listLineItems returns empty array for a fresh folio', async () => {
    const repo = new FolioRepository(pool)
    const tenantId = crypto.randomUUID()

    const folio = await repo.createForReservation(
      crypto.randomUUID(),
      crypto.randomUUID(),
      tenantId,
    )

    const items = await repo.listLineItems(folio.id)
    expect(items).toEqual([])
  }, 10_000)

  it('postCharge adds a line item to the folio', async () => {
    const repo = new FolioRepository(pool)
    const tenantId = crypto.randomUUID()

    const folio = await repo.createForReservation(
      crypto.randomUUID(),
      crypto.randomUUID(),
      tenantId,
    )

    const lineItem = await repo.postCharge({
      folioId: folio.id,
      tenantId,
      description: 'Room rate night 1',
      chargeType: 'accommodation',
      quantity: 1,
      unitAmount: 200.00,
      taxAmount: 20.00,
    })

    expect(lineItem.id).toBeTruthy()
    expect(lineItem.folioId).toBe(folio.id)
    expect(lineItem.description).toBe('Room rate night 1')
    expect(lineItem.chargeType).toBe('accommodation')
    expect(lineItem.quantity).toBe(1)
    expect(lineItem.unitAmount).toBe(200.00)
    expect(lineItem.totalAmount).toBe(200.00)
    expect(lineItem.taxAmount).toBe(20.00)
    expect(lineItem.voidedAt).toBeNull()
  }, 10_000)

  it('postCharge appears in listLineItems', async () => {
    const repo = new FolioRepository(pool)
    const tenantId = crypto.randomUUID()

    const folio = await repo.createForReservation(
      crypto.randomUUID(),
      crypto.randomUUID(),
      tenantId,
    )

    await repo.postCharge({
      folioId: folio.id,
      tenantId,
      description: 'Minibar',
      chargeType: 'minibar',
      quantity: 2,
      unitAmount: 8.50,
    })
    await repo.postCharge({
      folioId: folio.id,
      tenantId,
      description: 'Parking',
      chargeType: 'parking',
      quantity: 1,
      unitAmount: 25.00,
    })

    const items = await repo.listLineItems(folio.id)
    expect(items.length).toBe(2)
    expect(items.map(i => i.chargeType)).toContain('minibar')
    expect(items.map(i => i.chargeType)).toContain('parking')
  }, 10_000)

  it('voidCharge hides the item from listLineItems', async () => {
    const repo = new FolioRepository(pool)
    const tenantId = crypto.randomUUID()

    const folio = await repo.createForReservation(
      crypto.randomUUID(),
      crypto.randomUUID(),
      tenantId,
    )

    const item = await repo.postCharge({
      folioId: folio.id,
      tenantId,
      description: 'Erroneous charge',
      chargeType: 'other',
      quantity: 1,
      unitAmount: 50.00,
    })

    const before = await repo.listLineItems(folio.id)
    expect(before.length).toBe(1)

    await repo.voidCharge(item.id, folio.id, 'Posted in error')

    const after = await repo.listLineItems(folio.id)
    expect(after.length).toBe(0)
  }, 10_000)

  it('closeFolio changes status to closed', async () => {
    const repo = new FolioRepository(pool)
    const tenantId = crypto.randomUUID()

    const folio = await repo.createForReservation(
      crypto.randomUUID(),
      crypto.randomUUID(),
      tenantId,
    )

    expect(folio.status).toBe('open')

    const closed = await repo.closeFolio(folio.id)

    expect(closed.status).toBe('closed')
    expect(closed.closedAt).not.toBeNull()
    expect(closed.id).toBe(folio.id)
  }, 10_000)
})
