import { Kafka, KafkaConfig } from 'kafkajs'

export { createProducer } from './producer'
export { createConsumer } from './consumer'
export { createCloudEvent } from './cloudevents'
export type { HotelKeyProducer } from './producer'
export type { HotelKeyConsumer, TopicHandler, MessageHandler } from './consumer'

export function createKafkaClient(config: KafkaConfig): Kafka {
  return new Kafka({
    ...config,
    retry: {
      initialRetryTime: 300,
      retries: 10,
    },
  })
}
