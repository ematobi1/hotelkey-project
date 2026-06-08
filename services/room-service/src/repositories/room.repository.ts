import { Pool } from 'pg'
import type { Room, RoomType, RoomStatus, CreateRoomInput, CreateRoomTypeInput } from '@hotel-key/types'
import { NotFoundError } from '@hotel-key/types'

function rowToRoom(r: Record<string, unknown>): Room {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    roomNumber: r['room_number'] as string,
    floor: r['floor'] as number,
    wing: r['wing'] as string | null,
    roomTypeId: r['room_type_id'] as string,
    status: r['status'] as RoomStatus,
    amenities: r['amenities'] as string[],
    maxOccupancy: r['max_occupancy'] as number,
    isAccessible: r['is_accessible'] as boolean,
    notes: r['notes'] as string | null,
    lastMaintenanceDate: r['last_maintenance_date'] as Date | null,
    nextMaintenanceDue: r['next_maintenance_due'] as Date | null,
    deletedAt: r['deleted_at'] as Date | null,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  }
}

function rowToRoomType(r: Record<string, unknown>): RoomType {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    name: r['name'] as string,
    description: r['description'] as string | null,
    baseRate: parseFloat(r['base_rate'] as string),
    currencyCode: r['currency_code'] as string,
    maxOccupancy: r['max_occupancy'] as number,
    bedConfig: r['bed_config'] as RoomType['bedConfig'],
    sizeSqm: r['size_sqm'] ? parseFloat(r['size_sqm'] as string) : null,
    images: r['images'] as string[],
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  }
}

export class RoomRepository {
  constructor(private readonly pool: Pool) {}

  async listRooms(tenantId: string): Promise<Room[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, room_number, floor, wing, room_type_id, status,
              amenities, max_occupancy, is_accessible, notes,
              last_maintenance_date, next_maintenance_due, deleted_at, created_at, updated_at
         FROM room
        WHERE tenant_id = $1 AND deleted_at IS NULL
        ORDER BY floor, room_number`,
      [tenantId],
    )
    return rows.map(rowToRoom)
  }

  async findById(id: string, tenantId: string): Promise<Room | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, room_number, floor, wing, room_type_id, status,
              amenities, max_occupancy, is_accessible, notes,
              last_maintenance_date, next_maintenance_due, deleted_at, created_at, updated_at
         FROM room
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId],
    )
    return rows[0] ? rowToRoom(rows[0]) : null
  }

  async findByIdOrThrow(id: string, tenantId: string): Promise<Room> {
    const room = await this.findById(id, tenantId)
    if (!room) throw new NotFoundError('Room', id)
    return room
  }

  async create(input: CreateRoomInput): Promise<Room> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO room (tenant_id, room_number, floor, wing, room_type_id,
                         amenities, max_occupancy, is_accessible, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, tenant_id, room_number, floor, wing, room_type_id, status,
                 amenities, max_occupancy, is_accessible, notes,
                 last_maintenance_date, next_maintenance_due, deleted_at, created_at, updated_at`,
      [
        input.tenantId, input.roomNumber, input.floor, input.wing ?? null,
        input.roomTypeId, JSON.stringify(input.amenities ?? []),
        input.maxOccupancy, input.isAccessible ?? false, input.notes ?? null,
      ],
    )
    return rowToRoom(rows[0]!)
  }

  async updateStatus(id: string, tenantId: string, status: RoomStatus): Promise<Room> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE room SET status = $3, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, room_number, floor, wing, room_type_id, status,
                 amenities, max_occupancy, is_accessible, notes,
                 last_maintenance_date, next_maintenance_due, deleted_at, created_at, updated_at`,
      [id, tenantId, status],
    )
    if (!rows[0]) throw new NotFoundError('Room', id)
    return rowToRoom(rows[0])
  }

  async listRoomTypes(tenantId: string): Promise<RoomType[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, name, description, base_rate, currency_code,
              max_occupancy, bed_config, size_sqm, images, created_at, updated_at
         FROM room_type WHERE tenant_id = $1 ORDER BY name`,
      [tenantId],
    )
    return rows.map(rowToRoomType)
  }

  async findRoomTypeById(id: string, tenantId: string): Promise<RoomType | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, name, description, base_rate, currency_code,
              max_occupancy, bed_config, size_sqm, images, created_at, updated_at
         FROM room_type WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )
    return rows[0] ? rowToRoomType(rows[0]) : null
  }

  async createRoomType(input: CreateRoomTypeInput): Promise<RoomType> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO room_type (tenant_id, name, description, base_rate, currency_code,
                              max_occupancy, bed_config, size_sqm)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, tenant_id, name, description, base_rate, currency_code,
                 max_occupancy, bed_config, size_sqm, images, created_at, updated_at`,
      [
        input.tenantId, input.name, input.description ?? null,
        input.baseRate, input.currencyCode, input.maxOccupancy,
        JSON.stringify(input.bedConfig), input.sizeSqm ?? null,
      ],
    )
    return rowToRoomType(rows[0]!)
  }
}
