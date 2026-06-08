import { Pool, PoolClient } from 'pg'
import type {
  Reservation,
  ReservationStatus,
  CreateReservationInput,
  AvailabilityQuery,
  AvailabilityResult,
} from '@hotel-key/types'
import { NotFoundError } from '@hotel-key/types'

function generateConfirmationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'HK-'
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function rowToReservation(r: Record<string, unknown>): Reservation {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    confirmationCode: r['confirmation_code'] as string,
    guestId: r['guest_id'] as string,
    roomId: r['room_id'] as string,
    ratePlanId: r['rate_plan_id'] as string | null,
    checkInDate: r['check_in_date'] as Date,
    checkOutDate: r['check_out_date'] as Date,
    actualCheckIn: r['actual_check_in'] as Date | null,
    actualCheckOut: r['actual_check_out'] as Date | null,
    status: r['status'] as ReservationStatus,
    source: r['source'] as string,
    channelBookingRef: r['channel_booking_ref'] as string | null,
    adults: r['adults'] as number,
    children: r['children'] as number,
    ratePerNight: parseFloat(r['rate_per_night'] as string),
    totalAmount: parseFloat(r['total_amount'] as string),
    currencyCode: r['currency_code'] as string,
    specialRequests: r['special_requests'] as string | null,
    internalNotes: r['internal_notes'] as string | null,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  }
}

export class ReservationRepository {
  constructor(private readonly pool: Pool) {}

  async findAvailableRooms(query: AvailabilityQuery): Promise<AvailabilityResult[]> {
    const nights = Math.ceil(
      (query.checkOutDate.getTime() - query.checkInDate.getTime()) / (1000 * 60 * 60 * 24),
    )

    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT r.id AS room_id,
              r.room_number,
              r.room_type_id,
              rt.name AS room_type_name,
              r.floor,
              r.is_accessible,
              r.amenities,
              rt.base_rate AS rate_per_night,
              rt.base_rate * $3 AS total_amount,
              rt.currency_code
         FROM room r
         JOIN room_type rt ON rt.id = r.room_type_id
        WHERE r.tenant_id = $1
          AND r.deleted_at IS NULL
          AND r.status = 'clean'
          AND r.max_occupancy >= $4
          AND ($5::uuid IS NULL OR r.room_type_id = $5)
          AND ($6::boolean IS NULL OR r.is_accessible = $6)
          AND NOT EXISTS (
            SELECT 1 FROM reservation res
             WHERE res.room_id = r.id
               AND res.status NOT IN ('cancelled', 'no_show')
               AND res.check_in_date < $2
               AND res.check_out_date > $1
          )
        ORDER BY r.floor, r.room_number`,
      [
        query.checkInDate,
        query.checkOutDate,
        nights,
        query.adults + (query.children ?? 0),
        query.roomTypeId ?? null,
        query.isAccessible ?? null,
      ],
    )

    return rows.map((r) => ({
      roomId: r['room_id'] as string,
      roomNumber: r['room_number'] as string,
      roomTypeId: r['room_type_id'] as string,
      roomTypeName: r['room_type_name'] as string,
      floor: r['floor'] as number,
      isAccessible: r['is_accessible'] as boolean,
      amenities: r['amenities'] as string[],
      ratePerNight: parseFloat(r['rate_per_night'] as string),
      totalAmount: parseFloat(r['total_amount'] as string),
      currencyCode: r['currency_code'] as string,
      nights,
    }))
  }

  async create(input: CreateReservationInput, client?: PoolClient): Promise<Reservation> {
    const db = client ?? this.pool
    const nights = Math.ceil(
      (input.checkOutDate.getTime() - input.checkInDate.getTime()) / (1000 * 60 * 60 * 24),
    )
    const totalAmount = input.ratePerNight * nights
    const code = generateConfirmationCode()

    const { rows } = await db.query<Record<string, unknown>>(
      `INSERT INTO reservation (tenant_id, confirmation_code, guest_id, room_id, rate_plan_id,
                                check_in_date, check_out_date, adults, children,
                                rate_per_night, total_amount, currency_code,
                                source, channel_booking_ref, special_requests)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        input.tenantId, code, input.guestId, input.roomId, input.ratePlanId ?? null,
        input.checkInDate, input.checkOutDate,
        input.adults, input.children ?? 0,
        input.ratePerNight, totalAmount, input.currencyCode,
        input.source ?? 'direct', input.channelBookingRef ?? null,
        input.specialRequests ?? null,
      ],
    )
    return rowToReservation(rows[0]!)
  }

  async findById(id: string, tenantId: string): Promise<Reservation | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM reservation WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )
    return rows[0] ? rowToReservation(rows[0]) : null
  }

  async findByIdOrThrow(id: string, tenantId: string): Promise<Reservation> {
    const r = await this.findById(id, tenantId)
    if (!r) throw new NotFoundError('Reservation', id)
    return r
  }

  async findByIdForUpdate(id: string, tenantId: string, client: PoolClient): Promise<Reservation> {
    const { rows } = await client.query<Record<string, unknown>>(
      `SELECT * FROM reservation WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId],
    )
    if (!rows[0]) throw new NotFoundError('Reservation', id)
    return rowToReservation(rows[0])
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: ReservationStatus,
    extra?: { actualCheckIn?: Date; actualCheckOut?: Date },
  ): Promise<Reservation> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE reservation
          SET status          = $3,
              actual_check_in = COALESCE($4, actual_check_in),
              actual_check_out = COALESCE($5, actual_check_out),
              updated_at      = NOW()
        WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId, status, extra?.actualCheckIn ?? null, extra?.actualCheckOut ?? null],
    )
    if (!rows[0]) throw new NotFoundError('Reservation', id)
    return rowToReservation(rows[0])
  }

  async list(
    tenantId: string,
    filters: { status?: ReservationStatus; guestId?: string; limit?: number; offset?: number },
  ): Promise<Reservation[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM reservation
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR status = $2)
          AND ($3::uuid IS NULL OR guest_id = $3)
        ORDER BY created_at DESC
        LIMIT $4 OFFSET $5`,
      [tenantId, filters.status ?? null, filters.guestId ?? null, filters.limit ?? 20, filters.offset ?? 0],
    )
    return rows.map(rowToReservation)
  }

  getPool(): Pool {
    return this.pool
  }
}
