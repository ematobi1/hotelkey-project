import Redlock from 'redlock'
import type {
  Reservation,
  ReservationStatus,
  AvailabilityQuery,
  AvailabilityResult,
  CreateReservationInput,
  Room,
  RoomType,
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
    private readonly roomServiceUrl: string,
  ) {}

  async getAvailability(query: AvailabilityQuery): Promise<AvailabilityResult[]> {
    if (query.checkInDate >= query.checkOutDate) {
      throw new BadRequestError('Check-out date must be after check-in date')
    }

    const nights = Math.ceil(
      (query.checkOutDate.getTime() - query.checkInDate.getTime()) / (1000 * 60 * 60 * 24),
    )

    const [roomsRes, typesRes] = await Promise.all([
      fetch(`${this.roomServiceUrl}/v1/rooms?tenantId=${query.tenantId}`),
      fetch(`${this.roomServiceUrl}/v1/rooms/types?tenantId=${query.tenantId}`),
    ])

    if (!roomsRes.ok || !typesRes.ok) {
      throw new Error('Failed to fetch room data from room-service')
    }

    const roomsData = (await roomsRes.json()) as { data: Room[] }
    const typesData = (await typesRes.json()) as { data: RoomType[] }

    const typeMap = new Map(typesData.data.map((t) => [t.id, t]))

    const minOccupancy = query.adults + (query.children ?? 0)
    const eligible = roomsData.data.filter(
      (r) =>
        r.status === 'clean' &&
        !r.deletedAt &&
        r.maxOccupancy >= minOccupancy &&
        (!query.roomTypeId || r.roomTypeId === query.roomTypeId) &&
        (query.isAccessible === undefined || r.isAccessible === query.isAccessible),
    )

    if (eligible.length === 0) return []

    const conflicted = await this.reservationRepo.findConflictedRoomIds(
      query.tenantId,
      eligible.map((r) => r.id),
      query.checkInDate,
      query.checkOutDate,
    )
    const conflictedSet = new Set(conflicted)

    return eligible
      .filter((r) => !conflictedSet.has(r.id))
      .flatMap((r) => {
        const roomType = typeMap.get(r.roomTypeId)
        if (!roomType) return []
        return [{
          roomId: r.id,
          roomNumber: r.roomNumber,
          roomTypeId: r.roomTypeId,
          roomTypeName: roomType.name,
          floor: r.floor,
          isAccessible: r.isAccessible,
          amenities: r.amenities,
          ratePerNight: roomType.baseRate,
          totalAmount: roomType.baseRate * nights,
          currencyCode: roomType.currencyCode,
          nights,
        }]
      })
      .sort((a, b) => a.floor - b.floor || a.roomNumber.localeCompare(b.roomNumber))
  }

  async createReservation(input: CreateReservationInput): Promise<Reservation> {
    if (input.checkInDate >= input.checkOutDate) {
      throw new BadRequestError('Check-out date must be after check-in date')
    }

    const lockKey = `reservation:room:${input.roomId}:${input.checkInDate.toISOString()}:${input.checkOutDate.toISOString()}`
    const lock = await this.redlock.acquire([lockKey], 10000).catch(() => null)

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
      await lock?.release().catch(() => {})
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

  async modifyReservation(
    id: string,
    tenantId: string,
    changes: {
      checkInDate?: Date
      checkOutDate?: Date
      adults?: number
      children?: number
      specialRequests?: string
      internalNotes?: string
    },
  ): Promise<Reservation> {
    const existing = await this.reservationRepo.findByIdOrThrow(id, tenantId)

    if (!['tentative', 'confirmed'].includes(existing.status)) {
      throw new ConflictError(`Reservation cannot be modified in status '${existing.status}'`)
    }

    const newCheckIn = changes.checkInDate ?? existing.checkInDate
    const newCheckOut = changes.checkOutDate ?? existing.checkOutDate

    if (newCheckIn >= newCheckOut) {
      throw new BadRequestError('Check-out date must be after check-in date')
    }

    const datesChanged =
      changes.checkInDate !== undefined || changes.checkOutDate !== undefined

    if (datesChanged) {
      const lockKey = `reservation:room:${existing.roomId}:${newCheckIn.toISOString()}:${newCheckOut.toISOString()}`
      const lock = await this.redlock.acquire([lockKey], 10000).catch(() => null)

      try {
        const pool = this.reservationRepo.getPool()
        const client = await pool.connect()
        try {
          await client.query('BEGIN')

          const conflicts = await client.query(
            `SELECT id FROM reservation
              WHERE room_id = $1
                AND id != $4
                AND status NOT IN ('cancelled', 'no_show')
                AND check_in_date < $3
                AND check_out_date > $2
              FOR UPDATE SKIP LOCKED`,
            [existing.roomId, newCheckIn, newCheckOut, id],
          )

          if (conflicts.rows.length > 0) {
            await client.query('ROLLBACK')
            throw new ConflictError('Room is not available for the new dates')
          }

          const nights = Math.ceil(
            (newCheckOut.getTime() - newCheckIn.getTime()) / (1000 * 60 * 60 * 24),
          )
          const totalAmount = existing.ratePerNight * nights

          const reservation = await this.reservationRepo.update(
            id,
            tenantId,
            { ...changes, checkInDate: newCheckIn, checkOutDate: newCheckOut, totalAmount },
            client,
          )
          await client.query('COMMIT')
          return reservation
        } catch (err) {
          await client.query('ROLLBACK')
          throw err
        } finally {
          client.release()
        }
      } finally {
        await lock?.release().catch(() => {})
      }
    }

    return this.reservationRepo.update(id, tenantId, changes)
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
