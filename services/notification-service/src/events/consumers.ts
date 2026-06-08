import type { HotelKeyConsumer } from '@hotel-key/kafka'
import { EventTypes } from '@hotel-key/types'
import type { CloudEvent, ReservationCreatedData, ReservationCheckedInData } from '@hotel-key/types'
import type { NotificationService } from '../services/notification.service'
import { Pool } from 'pg'

export function registerConsumers(
  consumer: HotelKeyConsumer,
  notificationService: NotificationService,
  pool: Pool,
): Promise<void> {
  return consumer.subscribe([
    {
      topic: 'hotel-key.reservation',
      handler: async (event: CloudEvent) => {
        if (event.type === EventTypes.RESERVATION_CREATED) {
          const data = event.data as ReservationCreatedData
          const guest = await lookupGuest(pool, data.guestId)
          if (!guest?.email) return

          await notificationService.sendReservationConfirmation({
            tenantId: event.tenantid,
            guestId: data.guestId,
            guestEmail: guest.email,
            guestName: `${guest.firstName} ${guest.lastName}`,
            confirmationCode: `(Reservation ${data.reservationId.slice(0, 8)})`,
            checkInDate: data.checkInDate,
            checkOutDate: data.checkOutDate,
          })
        }

        if (event.type === EventTypes.RESERVATION_CHECKED_IN) {
          const data = event.data as ReservationCheckedInData
          const guest = await lookupGuest(pool, data.guestId)
          if (!guest?.email) return

          await notificationService.sendWelcomeNotification({
            tenantId: event.tenantid,
            guestId: data.guestId,
            guestEmail: guest.email,
            guestName: `${guest.firstName} ${guest.lastName}`,
            roomNumber: '(room)',
            hotelName: 'Hotel Key',
          })
        }
      },
    },
  ])
}

async function lookupGuest(
  pool: Pool,
  guestId: string,
): Promise<{ email: string | null; firstName: string; lastName: string } | null> {
  const { rows } = await pool.query(
    `SELECT email, first_name, last_name FROM guest WHERE id = $1 AND deleted_at IS NULL`,
    [guestId],
  )
  if (!rows[0]) return null
  return {
    email: rows[0]['email'] as string | null,
    firstName: rows[0]['first_name'] as string,
    lastName: rows[0]['last_name'] as string,
  }
}
