import { Pool } from 'pg'
import { NotFoundError } from '../domain/errors'
import type { ChannelMapping, CreateChannelMappingInput } from '../domain/errors'

const COLUMNS = `id, tenant_id, hotel_key_room_type_id, siteminder_room_type_code, siteminder_rate_plan_code, created_at, updated_at`

function rowToMapping(r: Record<string, unknown>): ChannelMapping {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    hotelKeyRoomTypeId: r['hotel_key_room_type_id'] as string,
    siteMinderRoomTypeCode: r['siteminder_room_type_code'] as string,
    siteMinderRatePlanCode: r['siteminder_rate_plan_code'] as string,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  }
}

export class ChannelMappingRepository {
  constructor(private readonly pool: Pool) {}

  async list(tenantId: string): Promise<ChannelMapping[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM channel_mapping WHERE tenant_id = $1 ORDER BY created_at ASC`,
      [tenantId],
    )
    return rows.map(rowToMapping)
  }

  async create(input: CreateChannelMappingInput): Promise<ChannelMapping> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO channel_mapping (tenant_id, hotel_key_room_type_id, siteminder_room_type_code, siteminder_rate_plan_code)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [
        input.tenantId,
        input.hotelKeyRoomTypeId,
        input.siteMinderRoomTypeCode,
        input.siteMinderRatePlanCode,
      ],
    )
    return rowToMapping(rows[0]!)
  }

  async findByRoomTypeId(tenantId: string, hotelKeyRoomTypeId: string): Promise<ChannelMapping | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM channel_mapping WHERE tenant_id = $1 AND hotel_key_room_type_id = $2`,
      [tenantId, hotelKeyRoomTypeId],
    )
    return rows[0] ? rowToMapping(rows[0]) : null
  }

  async findBySiteMinderRoomCode(tenantId: string, siteMinderRoomTypeCode: string): Promise<ChannelMapping | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM channel_mapping WHERE tenant_id = $1 AND siteminder_room_type_code = $2`,
      [tenantId, siteMinderRoomTypeCode],
    )
    return rows[0] ? rowToMapping(rows[0]) : null
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const result = await this.pool.query(
      `DELETE FROM channel_mapping WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )
    if (result.rowCount === 0) throw new NotFoundError('ChannelMapping', id)
  }
}
