import Redlock from 'redlock'
import type {
  Reservation,
  ReservationStatus,
  AvailabilityQuery,
  AvailabilityResult,
  CreateReservationInput,
} from '@hotel-key/types'
import { ConflictError, BadRequestError } from '@hotel-key/types'
import type { ReservationRepository } from '../repositories/reservation.repository'
import type { HotelKeyProducer } from '@hotel-key/kafka'
import { createCloudEvent } from '@hotel-key/kafka'
import { EventTypes } from '@hotel-key/types'

type ListFilters = {
  status?: ReservationStatus
  guestId?: string
  limit?: number
  offset?: number
}

export class ReservationService {
  constructor(
    private readonly reservationRepo: ReservationRepository,
    private readonly producer: HotelKeyProducer,
    private readonly redlock: Redlock,
  ) {}

  async getAvailability(query: AvailabilityQuery): Promise<AvailabilityResult[]> {
    if (query.checkInDate >= query.checkOutDate) {
      throw new BadRequestError('Check-out date must be after check-in date')
    }
    return this.reservationRepo.findAvailableRooms(query)
  }

  async createReservation(input: CreateReservationInput): Promise<Reservation> {
    if (input.checkInDate >= input.checkOutDate) {
      throw new BadRequestError('Check-out date must be after check-in date')
    }

    const lockKey = `reservation:room:${input.roomId}:${input.checkInDate.toISOString()}:${input.checkOutDate.toISOString()}`
    const lock = await this.redlock.acquire([lockKey], 10000).catch(() => {
      throw new ConflictError('Room is temporarily unavailable — please try again')
    })

    try {
      const pool = this.reservationRepo.getPool()
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        const conflicts = await client.query(
          `SELECT id FROM reservation
            WHERE room_id = $1
              AND status NOT IN ('cancelled', 'no_show')
              AND check_in_date < $3
              AND check_out_date > $2
            FOR UPDATE SKIP LOCKED`,
          [input.roomId, input.checkInDate, input.checkOutDate],
        )

        if (conflicts.rows.length > 0) {
          await client.query('ROLLBACK')
          throw new ConflictError('Room is not available for the requested dates')
        }

        const reservation = await this.reservationRepo.create(input, client)
        await client.query('COMMIT')

        await this.producer.publish(
          'hotel-key.reservation',
          createCloudEvent(EventTypes.RESERVATION_CREATED, 'reservation-service', reservation.tenantId, {
            reservationId: reservation.id,
            guestId: reservation.guestId,
            roomId: reservation.roomId,
            checkInDate: reservation.checkInDate.toISOString(),
            checkOutDate: reservation.checkOutDate.toISOString(),
            totalAmount: reservation.totalAmount,
            currencyCode: reservation.currencyCode,
          }),
        )

        return reservation
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    } finally {
      await lock.release()
    }
  }

  async getReservation(id: string, tenantId: string): Promise<Reservation> {
    return this.reservationRepo.findByIdOrThrow(id, tenantId)
  }

  async listReservations(tenantId: string, filters: ListFilters): Promise<Reservation[]> {
    return this.reservationRepo.list(tenantId, filters)
  }

  async cancelReservation(id: string, tenantId: string): Promise<Reservation> {
    const existing = await this.reservationRepo.findByIdOrThrow(id, tenantId)

    if (['cancelled', 'checked_out'].includes(existing.status)) {
      throw new ConflictError(`Reservation cannot be cancelled in status '${existing.status}'`)
    }

    const reservation = await this.reservationRepo.updateStatus(id, tenantId, 'cancelled')

    await this.producer.publish(
      'hotel-key.reservation',
      createCloudEvent(EventTypes.RESERVATION_CANCELLED, 'reservation-service', tenantId, {
        reservationId: id,
        guestId: reservation.guestId,
        roomId: reservation.roomId,
        reason: null,
      }),
    )

    return reservation
  }

  async checkIn(id: string, tenantId: string): Promise<Reservation> {
    const existing = await this.reservationRepo.findByIdOrThrow(id, tenantId)

    if (existing.status !== 'confirmed') {
      throw new ConflictError(`Cannot check in — reservation is '${existing.status}'`)
    }

    const reservation = await this.reservationRepo.updateStatus(id, tenantId, 'checked_in', {
      actualCheckIn: new Date(),
    })

    await this.producer.publish(
      'hotel-key.reservation',
      createCloudEvent(EventTypes.RESERVATION_CHECKED_IN, 'reservation-service', tenantId, {
        reservationId: id,
        guestId: reservation.guestId,
        roomId: reservation.roomId,
        actualCheckIn: reservation.actualCheckIn!.toISOString(),
      }),
    )

    return reservation
  }

  async checkOut(id: string, tenantId: string): Promise<Reservation> {
    const existing = await this.reservationRepo.findByIdOrThrow(id, tenantId)

    if (existing.status !== 'checked_in') {
      throw new ConflictError(`Cannot check out — reservation is '${existing.status}'`)
    }

    const reservation = await this.reservationRepo.updateStatus(id, tenantId, 'checked_out', {
      actualCheckOut: new Date(),
    })

    await this.producer.publish(
      'hotel-key.reservation',
      createCloudEvent(EventTypes.RESERVATION_CHECKED_OUT, 'reservation-service', tenantId, {
        reservationId: id,
        guestId: reservation.guestId,
        roomId: reservation.roomId,
        actualCheckOut: reservation.actualCheckOut!.toISOString(),
      }),
    )

    return reservation
  }
}
