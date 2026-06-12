import './tracing' // must be first — starts OTel SDK before anything else loads
import { createApp } from './app'
import { config } from './config'
import { closePool } from './db/client'
import { createKafkaClient, createConsumer, createProducer } from '@hotel-key/kafka'
import { TaskRepository } from './repositories/task.repository'
import { HousekeepingService } from './services/housekeeping.service'
import { registerConsumers } from './events/consumers'
import { getPool } from './db/client'

async function start() {
  const app = await createApp()

  let consumer: Awaited<ReturnType<typeof createConsumer>> | undefined
  let producer: Awaited<ReturnType<typeof createProducer>> | undefined

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down')
    await consumer?.close()
    await producer?.close()
    await app.close()
    await closePool()
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  try {
    await app.listen({ port: config.PORT, host: config.HOST })
  } catch (err) {
    app.log.error(err, 'Failed to start server')
    process.exit(1)
  }

  // Kafka init after server is listening so health checks pass immediately
  try {
    const kafka = createKafkaClient({
      clientId: 'housekeeping-service-consumer',
      brokers: config.KAFKA_BROKERS.split(','),
    })
    producer = await createProducer(kafka)
    consumer = await createConsumer(kafka, 'housekeeping-service')
    const housekeepingService = new HousekeepingService(new TaskRepository(getPool()), producer)
    await registerConsumers(consumer, housekeepingService)
  } catch (err) {
    app.log.warn({ err }, 'Kafka unavailable — consumers disabled')
  }
}

void start()
