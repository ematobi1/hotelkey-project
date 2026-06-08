import { Pool } from 'pg'
import type { RoomType } from '../domain/types'

function rowToRoomType(row: Record<string, unknown>): RoomType {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    name: row['name'] as string,
    bedConfig: row['bed_config'] as string,
    maxOccupancy: row['max_occupancy'] as number,
    baseRateAmount: parseFloat(row['base_rate_amount'] as string),
    baseRateCurrency: row['base_rate_currency'] as string,
    amenities: row['amenities'] as string[],
    deletedAt: row['deleted_at'] ? (row['deleted_at'] as Date) : null,
    createdAt: row['created_at'] as Date,
    updatedAt: row['updated_at'] as Date,
  }
}

const ROOM_TYPE_COLUMNS = `id, tenant_id, name, bed_config, max_occupancy,
  base_rate_amount, base_rate_currency, amenities, deleted_at, created_at, updated_at`

export class RoomTypeRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<RoomType | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${ROOM_TYPE_COLUMNS} FROM room_type WHERE id = $1`,
      [id],
    )
    return rows[0] ? rowToRoomType(rows[0]) : null
  }

  async findByTenantId(tenantId: string): Promise<RoomType[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${ROOM_TYPE_COLUMNS} FROM room_type
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [tenantId],
    )
    return rows.map(rowToRoomType)
  }

  async create(input: {
    tenantId: string
    name: string
    bedConfig: string
    maxOccupancy: number
    baseRateAmount: number
    baseRateCurrency: string
    amenities: string[]
  }): Promise<RoomType> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO room_type
         (tenant_id, name, bed_config, max_occupancy, base_rate_amount, base_rate_currency, amenities)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${ROOM_TYPE_COLUMNS}`,
      [
        input.tenantId,
        input.name,
        input.bedConfig,
        input.maxOccupancy,
        input.baseRateAmount,
        input.baseRateCurrency,
        input.amenities,
      ],
    )
    return rowToRoomType(rows[0]!)
  }

  async update(
    id: string,
    input: {
      name?: string
      bedConfig?: string
      maxOccupancy?: number
      baseRateAmount?: number
      baseRateCurrency?: string
      amenities?: string[]
    },
  ): Promise<RoomType | null> {
    const sets: string[] = []
    const values: unknown[] = []
    let idx = 1

    if (input.name !== undefined) {
      sets.push(`name = $${idx++}`)
      values.push(input.name)
    }
    if (input.bedConfig !== undefined) {
      sets.push(`bed_config = $${idx++}`)
      values.push(input.bedConfig)
    }
    if (input.maxOccupancy !== undefined) {
      sets.push(`max_occupancy = $${idx++}`)
      values.push(input.maxOccupancy)
    }
    if (input.baseRateAmount !== undefined) {
      sets.push(`base_rate_amount = $${idx++}`)
      values.push(input.baseRateAmount)
    }
    if (input.baseRateCurrency !== undefined) {
      sets.push(`base_rate_currency = $${idx++}`)
      values.push(input.baseRateCurrency)
    }
    if (input.amenities !== undefined) {
      sets.push(`amenities = $${idx++}`)
      values.push(input.amenities)
    }

    if (sets.length === 0) return this.findById(id)

    sets.push(`updated_at = NOW()`)
    values.push(id)

    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE room_type SET ${sets.join(', ')} WHERE id = $${idx} RETURNING ${ROOM_TYPE_COLUMNS}`,
      values,
    )
    return rows[0] ? rowToRoomType(rows[0]) : null
  }

  async softDelete(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE room_type SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id],
    )
  }
}
