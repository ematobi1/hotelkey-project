import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'
import { RoomRepository } from '../repositories/room.repository'

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

describe('RoomRepository (integration)', () => {
  it('createRoomType creates a room type and listRoomTypes returns it', async () => {
    const repo = new RoomRepository(pool)
    const tenantId = crypto.randomUUID()

    const roomType = await repo.createRoomType({
      tenantId,
      name: 'Deluxe King',
      description: 'A deluxe room with a king bed',
      baseRate: 250.00,
      currencyCode: 'USD',
      maxOccupancy: 2,
      bedConfig: [{ type: 'king', count: 1 }],
      sizeSqm: 35,
    })

    expect(roomType.id).toBeTruthy()
    expect(roomType.tenantId).toBe(tenantId)
    expect(roomType.name).toBe('Deluxe King')
    expect(roomType.baseRate).toBe(250.00)
    expect(roomType.maxOccupancy).toBe(2)

    const types = await repo.listRoomTypes(tenantId)
    expect(types.length).toBe(1)
    expect(types[0]?.id).toBe(roomType.id)
  }, 10_000)

  it('listRoomTypes returns empty array when no types exist', async () => {
    const repo = new RoomRepository(pool)
    const types = await repo.listRoomTypes(crypto.randomUUID())
    expect(types).toEqual([])
  }, 10_000)

  it('creates a room with a valid room_type FK', async () => {
    const repo = new RoomRepository(pool)
    const tenantId = crypto.randomUUID()

    const roomType = await repo.createRoomType({
      tenantId,
      name: 'Standard Twin',
      baseRate: 150.00,
      currencyCode: 'EUR',
      maxOccupancy: 2,
      bedConfig: [{ type: 'twin', count: 2 }],
    })

    const room = await repo.create({
      tenantId,
      roomNumber: '101',
      floor: 1,
      roomTypeId: roomType.id,
      amenities: ['wifi', 'minibar'],
      maxOccupancy: 2,
      isAccessible: false,
    })

    expect(room.id).toBeTruthy()
    expect(room.tenantId).toBe(tenantId)
    expect(room.roomNumber).toBe('101')
    expect(room.floor).toBe(1)
    expect(room.roomTypeId).toBe(roomType.id)
    expect(room.status).toBe('clean')
    expect(room.isAccessible).toBe(false)
  }, 10_000)

  it('listRooms returns all non-deleted rooms for a tenant', async () => {
    const repo = new RoomRepository(pool)
    const tenantId = crypto.randomUUID()

    const roomType = await repo.createRoomType({
      tenantId,
      name: 'Suite',
      baseRate: 500.00,
      currencyCode: 'USD',
      maxOccupancy: 4,
      bedConfig: [{ type: 'king', count: 2 }],
    })

    await repo.create({
      tenantId,
      roomNumber: '201',
      floor: 2,
      roomTypeId: roomType.id,
      maxOccupancy: 4,
    })
    await repo.create({
      tenantId,
      roomNumber: '202',
      floor: 2,
      roomTypeId: roomType.id,
      maxOccupancy: 4,
    })

    const rooms = await repo.listRooms(tenantId)
    expect(rooms.length).toBe(2)
    expect(rooms.map(r => r.roomNumber)).toContain('201')
    expect(rooms.map(r => r.roomNumber)).toContain('202')
  }, 10_000)

  it('updateStatus changes room status', async () => {
    const repo = new RoomRepository(pool)
    const tenantId = crypto.randomUUID()

    const roomType = await repo.createRoomType({
      tenantId,
      name: 'Economy',
      baseRate: 80.00,
      currencyCode: 'USD',
      maxOccupancy: 2,
      bedConfig: [{ type: 'queen', count: 1 }],
    })

    const room = await repo.create({
      tenantId,
      roomNumber: '301',
      floor: 3,
      roomTypeId: roomType.id,
      maxOccupancy: 2,
    })

    expect(room.status).toBe('clean')

    const dirty = await repo.updateStatus(room.id, tenantId, 'dirty')
    expect(dirty.status).toBe('dirty')

    const occupied = await repo.updateStatus(room.id, tenantId, 'occupied')
    expect(occupied.status).toBe('occupied')

    const backToClean = await repo.updateStatus(room.id, tenantId, 'clean')
    expect(backToClean.status).toBe('clean')
  }, 10_000)

  it('findById returns null when room does not exist', async () => {
    const repo = new RoomRepository(pool)
    const result = await repo.findById(crypto.randomUUID(), crypto.randomUUID())
    expect(result).toBeNull()
  }, 10_000)

  it('findRoomTypeById returns null when type does not exist', async () => {
    const repo = new RoomRepository(pool)
    const result = await repo.findRoomTypeById(crypto.randomUUID(), crypto.randomUUID())
    expect(result).toBeNull()
  }, 10_000)
})
