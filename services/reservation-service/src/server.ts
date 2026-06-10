import './tracing' // must be first — starts OTel SDK before anything else loads
import { createApp } from './app'
import { config } from './config'
import { closePool } from './db/client'

async function start() {
  const app = await createApp()
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down')
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
