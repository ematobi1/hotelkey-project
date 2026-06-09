import { createHmac } from 'node:crypto'
import { createLogger } from '@hotel-key/logger'
import { config } from '../config'
import type { WebhookDelivery, WebhookEndpoint } from '../domain/errors'
import type { WebhookRepository } from '../repositories/webhook.repository'

const logger = createLogger({ service: 'webhook-service' })

function computeSignature(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')
}

function nextRetryDelay(attempt: number): number {
  const base = Math.min(Math.pow(2, attempt) * 30, 3600)
  const jitter = Math.random() * 30
  return (base + jitter) * 1000
}

export class DeliveryService {
  constructor(private readonly repo: WebhookRepository) {}

  async deliver(delivery: WebhookDelivery, endpoint: WebhookEndpoint): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000)
    const body = JSON.stringify(delivery.payload)
    const signature = computeSignature(endpoint.secret, timestamp, body)

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), config.DELIVERY_TIMEOUT_MS)

    let responseStatus: number | null = null
    let responseBody: string | null = null

    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-HotelKey-Signature': `sha256=${signature}`,
          'X-HotelKey-Timestamp': String(timestamp),
          'X-HotelKey-Delivery': delivery.id,
        },
        body,
      })

      clearTimeout(timer)
      responseStatus = res.status
      responseBody = await res.text().catch(() => '')

      if (res.status >= 200 && res.status < 300) {
        await this.repo.updateDeliverySuccess(delivery.id, responseStatus, responseBody)
        logger.info({ deliveryId: delivery.id, status: responseStatus }, 'Webhook delivered successfully')
        return
      }

      if (res.status >= 400 && res.status < 500) {
        await this.repo.updateDeliveryFailed(delivery.id, responseStatus, `Client error: HTTP ${responseStatus}`)
        logger.warn({ deliveryId: delivery.id, status: responseStatus }, 'Webhook failed with 4xx — not retrying')
        return
      }

      await this.scheduleRetryOrFail(delivery, responseStatus, `Server error: HTTP ${responseStatus}`)
    } catch (err) {
      clearTimeout(timer)
      const message = err instanceof Error ? err.message : 'Unknown error'
      await this.scheduleRetryOrFail(delivery, responseStatus, message)
      logger.warn({ deliveryId: delivery.id, err: message }, 'Webhook delivery error')
    }
  }

  private async scheduleRetryOrFail(
    delivery: WebhookDelivery,
    responseStatus: number | null,
    errorMessage: string,
  ): Promise<void> {
    const nextAttempt = delivery.attemptCount + 1
    if (nextAttempt >= config.DELIVERY_MAX_RETRIES) {
      await this.repo.updateDeliveryFailed(delivery.id, responseStatus, errorMessage)
      logger.error({ deliveryId: delivery.id }, 'Webhook delivery permanently failed after max retries')
      return
    }

    const delayMs = nextRetryDelay(nextAttempt)
    const nextRetryAt = new Date(Date.now() + delayMs)
    await this.repo.updateDeliveryRetry(delivery.id, nextRetryAt, responseStatus, errorMessage)
    logger.info({ deliveryId: delivery.id, nextRetryAt }, 'Webhook delivery scheduled for retry')
  }

  async scheduleRetries(): Promise<void> {
    const pending = await this.repo.findPendingDeliveriesDue()
    if (pending.length === 0) return

    logger.info({ count: pending.length }, 'Processing pending webhook retries')

    await Promise.allSettled(
      pending.map(({ delivery, endpoint }) => this.deliver(delivery, endpoint)),
    )
  }
}
