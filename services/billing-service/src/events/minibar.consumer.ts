import type { HotelKeyConsumer } from '@hotel-key/kafka'
import { createLogger } from '@hotel-key/logger'
import type { BillingService } from '../services/billing.service'
import { config } from '../config'

interface MinibarItem {
  name: string
  quantity: number
  unitAmount: number
}

interface MinibarChargeEvent {
  reservationId: string
  folioId: string
  tenantId: string
  items: MinibarItem[]
  postedBy: string
}

const logger = createLogger({ service: 'billing-service', level: config.LOG_LEVEL })

export async function startMinibarConsumer(
  consumer: HotelKeyConsumer,
  billingService: BillingService,
): Promise<void> {
  await consumer.subscribe([
    {
      topic: 'hotel-key.minibar',
      handler: async (event) => {
        const charge = event.data as MinibarChargeEvent
        const { reservationId, folioId, tenantId, items } = charge

        for (const item of items) {
          try {
            await billingService.postCharge({
              folioId,
              tenantId,
              chargeType: 'minibar',
              description: item.name,
              quantity: item.quantity,
              unitAmount: item.unitAmount,
              idempotencyKey: `${event.id}:${item.name}`,
            })
          } catch (err) {
            logger.error({ err, reservationId, item }, 'Failed to post minibar charge')
          }
        }
      },
    },
  ])
}
