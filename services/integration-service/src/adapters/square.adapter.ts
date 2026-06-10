import { createLogger } from '@hotel-key/logger'
import type { IntegrationAdapter, ChargeData } from '../domain/types'
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

export class SquareAdapter implements IntegrationAdapter {
  readonly name = 'square'
  readonly category = 'pos' as const

  async syncCharges(charges: ChargeData[]): Promise<void> {
    const apiKey = config.SQUARE_API_KEY
    if (!apiKey) {
      logger.warn('SQUARE_API_KEY not configured')
      return
    }

    for (const charge of charges) {
      const idempotencyKey = `hotel-key-${charge.chargeId}`
      const res = await fetchWithRetry('https://connect.squareup.com/v2/orders', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Square-Version': '2024-01-18',
        },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          order: {
            reference_id: charge.chargeId,
            line_items: [
              {
                name: charge.description,
                quantity: '1',
                base_price_money: {
                  amount: charge.amount,
                  currency: charge.currencyCode,
                },
              },
            ],
            metadata: { guest_id: charge.guestId },
          },
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        logger.error({ chargeId: charge.chargeId, status: res.status, body }, 'Square charge sync failed')
      } else {
        logger.info({ chargeId: charge.chargeId }, 'Square charge synced')
      }
    }
  }
}
