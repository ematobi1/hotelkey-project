import { createKafkaClient, createConsumer } from '@hotel-key/kafka'
import type { HotelKeyConsumer } from '@hotel-key/kafka'
import type { CloudEvent } from '@hotel-key/types'
import { createLogger } from '@hotel-key/logger'
import { config } from '../config'
import type { WebhookRepository } from '../repositories/webhook.repository'
import type { DeliveryService } from '../services/delivery.service'

const logger = createLogger({ service: 'webhook-service' })

const TOPICS = [
  'hotel-key.reservation',
  'hotel-key.billing',
  'hotel-key.housekeeping',
  'hotel-key.maintenance',
  'hotel-key.guest',
  'hotel-key.auth',
]

export async function startKafkaConsumer(
  repo: WebhookRepository,
  deliveryService: DeliveryService,
): Promise<HotelKeyConsumer> {
  const kafka = createKafkaClient({
    clientId: 'webhook-service',
    brokers: config.KAFKA_BROKERS.split(','),
  })

  const consumer = await createConsumer(kafka, 'webhook-kafka-consumer')

  async function handleEvent(event: CloudEvent): Promise<void> {
    const tenantId = event.tenantid
    const eventType = event.type

    const endpoints = await repo.findActiveEndpointsForEvent(tenantId, eventType)

    if (endpoints.length === 0) return

    logger.info({ eventType, tenantId, endpointCount: endpoints.length }, 'Dispatching webhook event')

    await Promise.allSettled(
      endpoints.map(async (endpoint) => {
        const delivery = await repo.createDelivery({
          endpointId: endpoint.id,
          tenantId,
          eventType,
          eventId: event.id,
          payload: event as unknown as Record<string, unknown>,
        })
        await deliveryService.deliver(delivery, endpoint)
      }),
    )
  }

  await consumer.subscribe(
    TOPICS.map((topic) => ({
      topic,
      handler: (event: CloudEvent) => handleEvent(event),
    })),
  )

  return consumer
}
