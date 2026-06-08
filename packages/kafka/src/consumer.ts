import { Kafka, Consumer, EachMessagePayload } from 'kafkajs'
import type { CloudEvent } from '@hotel-key/types'

export type MessageHandler<T = unknown> = (
  event: CloudEvent<T>,
  payload: EachMessagePayload,
) => Promise<void>

export interface TopicHandler {
  topic: string
  handler: MessageHandler
}

export interface HotelKeyConsumer {
  subscribe(handlers: TopicHandler[]): Promise<void>
  close(): Promise<void>
}

export async function createConsumer(
  kafka: Kafka,
  groupId: string,
): Promise<HotelKeyConsumer> {
  const consumer: Consumer = kafka.consumer({ groupId })
  const handlerMap = new Map<string, MessageHandler>()

  await consumer.connect()

  return {
    async subscribe(handlers: TopicHandler[]): Promise<void> {
      for (const { topic, handler } of handlers) {
        await consumer.subscribe({ topic, fromBeginning: false })
        handlerMap.set(topic, handler)
      }

      await consumer.run({
        eachMessage: async (payload) => {
          const { topic, message } = payload
          const handler = handlerMap.get(topic)

          if (!handler || !message.value) return

          const event = JSON.parse(message.value.toString()) as CloudEvent
          await handler(event, payload)
        },
      })
    },

    async close(): Promise<void> {
      await consumer.disconnect()
    },
  }
}
