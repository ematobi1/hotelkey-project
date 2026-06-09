import { Pool } from 'pg'
import type { ChannelBooking, ChannelBookingStatus, CreateChannelBookingInput } from '../domain/errors'

const COLUMNS = `id, tenant_id, siteminder_booking_id, reservation_id, raw_payload, status, error_message, created_at, updated_at`

function rowToBooking(r: Record<string, unknown>): ChannelBooking {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    siteMinderBookingId: r['siteminder_booking_id'] as string,
    reservationId: r['reservation_id'] as string | null,
    rawPayload: r['raw_payload'] as Record<string, unknown>,
    status: r['status'] as ChannelBookingStatus,
    errorMessage: r['error_message'] as string | null,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  }
}

export class ChannelBookingRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateChannelBookingInput): Promise<ChannelBooking> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO channel_booking (tenant_id, siteminder_booking_id, raw_payload)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [input.tenantId, input.siteMinderBookingId, JSON.stringify(input.rawPayload)],
    )
    return rowToBooking(rows[0]!)
  }

  async markProcessed(id: string, reservationId: string): Promise<ChannelBooking> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE channel_booking
          SET status = 'processed', reservation_id = $2, updated_at = NOW()
        WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, reservationId],
    )
    return rowToBooking(rows[0]!)
  }

  async markFailed(id: string, errorMessage: string): Promise<ChannelBooking> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE channel_booking
          SET status = 'failed', error_message = $2, updated_at = NOW()
        WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, errorMessage],
    )
    return rowToBooking(rows[0]!)
  }

  async list(tenantId: string, status?: ChannelBookingStatus): Promise<ChannelBooking[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${COLUMNS}
         FROM channel_booking
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR status = $2)
        ORDER BY created_at DESC`,
      [tenantId, status ?? null],
    )
    return rows.map(rowToBooking)
  }
}
