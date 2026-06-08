import './tracing' // must be first — starts OTel SDK before anything else loads
import { createApp } from './app'
import { config } from './config'
import { closePool, getPool } from './db/client'
import { createKafkaClient, createConsumer, createProducer } from '@hotel-key/kafka'
import { startMinibarConsumer } from './events/minibar.consumer'
import { BillingService } from './services/billing.service'
import { FolioRepository } from './repositories/folio.repository'

async function start() {
  const app = await createApp()

  const kafka = createKafkaClient({
    clientId: 'billing-service-consumer',
    brokers: config.KAFKA_BROKERS.split(','),
  })
  const consumer = await createConsumer(kafka, 'billing-minibar-consumer')
  const pool = getPool()
  const producer = await createProducer(kafka)
  const billingService = new BillingService(
    new FolioRepository(pool),
    producer,
    pool,
    config.STRIPE_SECRET_KEY,
  )
  await startMinibarConsumer(consumer, billingService)

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down')
    await consumer.close()
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
}

void start()
