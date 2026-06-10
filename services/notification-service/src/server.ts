import './tracing' // must be first — starts OTel SDK before anything else loads
import { createApp } from './app'
import { config } from './config'
import { getPool, getMongoDB, closeConnections } from './db/client'
import { createKafkaClient, createConsumer } from '@hotel-key/kafka'
import { NotificationService } from './services/notification.service'
import { EmailService } from './services/email.service'
import { registerConsumers } from './events/consumers'

async function start() {
  const pool = getPool()
  const mongo = await getMongoDB()
  const emailService = new EmailService()
  const notificationService = new NotificationService(mongo, pool, emailService)

  const app = await createApp(notificationService)

  const kafka = createKafkaClient({
    clientId: 'notification-service-consumer',
    brokers: config.KAFKA_BROKERS.split(','),
  })
  const consumer = await createConsumer(kafka, 'notification-service')
  await registerConsumers(consumer, notificationService, pool)

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down')
    await consumer.close()
    await app.close()
    await closeConnections()
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
