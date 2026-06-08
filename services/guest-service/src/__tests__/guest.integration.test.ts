import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'
import { GuestRepository } from '../repositories/guest.repository'

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

describe('GuestRepository (integration)', () => {
  it('creates a guest and retrieves by id', async () => {
    const repo = new GuestRepository(pool)
    const tenantId = crypto.randomUUID()

    const guest = await repo.create({
      tenantId,
      firstName: 'Marie',
      lastName: 'Curie',
      email: `guest-${Date.now()}@example.com`,
      phone: '+447911123456',
      nationality: 'FR',
      vipLevel: 2,
    })

    expect(guest.id).toBeTruthy()
    expect(guest.tenantId).toBe(tenantId)
    expect(guest.firstName).toBe('Marie')
    expect(guest.lastName).toBe('Curie')
    expect(guest.vipLevel).toBe(2)
    expect(guest.isBlocked).toBe(false)
    expect(guest.deletedAt).toBeNull()

    const found = await repo.findById(guest.id, tenantId)
    expect(found?.id).toBe(guest.id)
    expect(found?.email).toBe(guest.email)
  }, 10_000)

  it('returns null for unknown guest id', async () => {
    const repo = new GuestRepository(pool)
    const result = await repo.findById(crypto.randomUUID(), crypto.randomUUID())
    expect(result).toBeNull()
  }, 10_000)

  it('search finds a guest by name', async () => {
    const repo = new GuestRepository(pool)
    const tenantId = crypto.randomUUID()
    const uniqueName = `Searchable-${Date.now()}`

    await repo.create({
      tenantId,
      firstName: uniqueName,
      lastName: 'Findme',
    })

    const results = await repo.search(tenantId, uniqueName)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.firstName).toBe(uniqueName)
  }, 10_000)

  it('search returns empty array when no match', async () => {
    const repo = new GuestRepository(pool)
    const results = await repo.search(crypto.randomUUID(), 'zzz-no-match-zzz')
    expect(results).toEqual([])
  }, 10_000)

  it('softDelete hides the guest from findById', async () => {
    const repo = new GuestRepository(pool)
    const tenantId = crypto.randomUUID()

    const guest = await repo.create({
      tenantId,
      firstName: 'Delete',
      lastName: 'Me',
    })

    const before = await repo.findById(guest.id, tenantId)
    expect(before).not.toBeNull()

    await repo.softDelete(guest.id, tenantId)

    const after = await repo.findById(guest.id, tenantId)
    expect(after).toBeNull()
  }, 10_000)

  it('update changes guest fields', async () => {
    const repo = new GuestRepository(pool)
    const tenantId = crypto.randomUUID()

    const guest = await repo.create({
      tenantId,
      firstName: 'Original',
      lastName: 'Name',
    })

    const updated = await repo.update(guest.id, tenantId, {
      firstName: 'Updated',
      vipLevel: 3,
    })

    expect(updated.firstName).toBe('Updated')
    expect(updated.lastName).toBe('Name')
    expect(updated.vipLevel).toBe(3)
  }, 10_000)

  it('upsertPreferences creates and retrieves guest preferences', async () => {
    const repo = new GuestRepository(pool)
    const tenantId = crypto.randomUUID()

    const guest = await repo.create({
      tenantId,
      firstName: 'Pref',
      lastName: 'Guest',
    })

    const prefs = await repo.upsertPreferences(guest.id, tenantId, {
      floorPreference: 5,
      pillowType: 'firm',
      dietary: ['vegan'],
    })

    expect(prefs.guestId).toBe(guest.id)
    expect(prefs.floorPreference).toBe(5)
    expect(prefs.pillowType).toBe('firm')

    const fetched = await repo.getPreferences(guest.id, tenantId)
    expect(fetched?.floorPreference).toBe(5)
  }, 10_000)
})
