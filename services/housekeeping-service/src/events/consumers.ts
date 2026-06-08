import type { HotelKeyConsumer } from '@hotel-key/kafka'
import { EventTypes } from '@hotel-key/types'
import type { CloudEvent, ReservationCheckedOutData } from '@hotel-key/types'
import type { HousekeepingService } from '../services/housekeeping.service'

export function registerConsumers(
  consumer: HotelKeyConsumer,
  housekeepingService: HousekeepingService,
): Promise<void> {
  return consumer.subscribe([
    {
      topic: 'hotel-key.reservation',
      handler: async (event: CloudEvent) => {
        if (event.type === EventTypes.RESERVATION_CHECKED_OUT) {
          const data = event.data as ReservationCheckedOutData
          await housekeepingService.createDepartureCleanTask(
            data.reservationId,
            data.roomId,
            event.tenantid,
            new Date(data.actualCheckOut),
          )
        }
      },
    },
  ])
}
