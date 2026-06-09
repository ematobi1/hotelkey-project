import { createLogger } from '@hotel-key/logger'
import type { IntegrationAdapter } from '../domain/types'
import { config } from '../config'

const logger = createLogger({ service: 'integration-service' })

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function backoff(attempt: number) {
  return Math.min(100 * Math.pow(2, attempt) + Math.random() * 50, 30000)
}

async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= 3; attempt++) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 10_000)
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal })
      clearTimeout(t)
      if (res.status >= 500 && attempt < 3) {
        await sleep(backoff(attempt))
        continue
      }
      return res
    } catch (err) {
      clearTimeout(t)
      if (attempt < 3) {
        await sleep(backoff(attempt))
        continue
      }
      throw err
    }
  }
  throw new Error('Max retries exceeded')
}

export class HijiffyAdapter implements IntegrationAdapter {
  readonly name = 'hijiffy'
  readonly category = 'guest_messaging' as const

  async sendMessage(guestId: string, message: string): Promise<void> {
    const apiKey = config.HIJIFFY_API_KEY
    if (!apiKey) {
      logger.warn('HIJIFFY_API_KEY not configured')
      return
    }

    const res = await fetchWithRetry('https://api.hijiffy.com/v2/messages/send', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient_id: guestId,
        channel: 'WHATSAPP',
        message: {
          type: 'text',
          text: message,
        },
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ guestId, status: res.status, body }, 'HiJiffy message send failed')
      throw new Error(`HiJiffy sendMessage failed: HTTP ${res.status}`)
    }

    logger.info({ guestId }, 'HiJiffy WhatsApp message sent')
  }
}
