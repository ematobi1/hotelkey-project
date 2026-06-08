import { Kafka, Producer, CompressionTypes } from 'kafkajs'
import type { CloudEvent } from '@hotel-key/types'

export interface HotelKeyProducer {
  publish<T>(topic: string, event: CloudEvent<T>): Promise<void>
  close(): Promise<void>
}

export async function createProducer(kafka: Kafka): Promise<HotelKeyProducer> {
  const producer: Producer = kafka.producer({
    idempotent: true,
    transactionTimeout: 30000,
  })

  await producer.connect()

  return {
    async publish<T>(topic: string, event: CloudEvent<T>): Promise<void> {
      await producer.send({
        topic,
        compression: CompressionTypes.GZIP,
        messages: [
          {
            key: event.tenantid,
            value: JSON.stringify(event),
            headers: {
              'ce-specversion': event.specversion,
              'ce-id': event.id,
              'ce-type': event.type,
              'ce-source': event.source,
              'ce-time': event.time,
            },
          },
        ],
      })
    },

    async close(): Promise<void> {
      await producer.disconnect()
    },
  }
}
