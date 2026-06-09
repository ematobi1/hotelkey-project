import { createLogger } from '@hotel-key/logger'
import type { IntegrationAdapter, AvailabilityData, RatesData, BookingData } from '../domain/types'
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

export class CloudbedsAdapter implements IntegrationAdapter {
  readonly name = 'cloudbeds'
  readonly category = 'channel_manager' as const

  async sendAvailability(data: AvailabilityData): Promise<void> {
    const apiKey = config.CLOUDBEDS_API_KEY
    if (!apiKey) {
      logger.warn('CLOUDBEDS_API_KEY not configured')
      return
    }

    const res = await fetchWithRetry(
      `https://api.cloudbeds.com/api/v3/rooms/inventory`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          propertyID: data.hotelId,
          roomTypeID: data.roomTypeId,
          date: data.date,
          availability: data.available,
        }),
      },
    )

    if (!res.ok) {
      const body = await res.text()
      logger.error({ hotelId: data.hotelId, status: res.status, body }, 'Cloudbeds availability push failed')
      throw new Error(`Cloudbeds sendAvailability failed: HTTP ${res.status}`)
    }

    logger.info({ hotelId: data.hotelId, date: data.date }, 'Cloudbeds availability updated')
  }

  async sendRates(data: RatesData): Promise<void> {
    const apiKey = config.CLOUDBEDS_API_KEY
    if (!apiKey) {
      logger.warn('CLOUDBEDS_API_KEY not configured')
      return
    }

    const res = await fetchWithRetry(
      `https://api.cloudbeds.com/api/v3/rooms/rates`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          propertyID: data.hotelId,
          roomTypeID: data.roomTypeId,
          date: data.date,
          price: data.rate,
          currency: data.currencyCode,
        }),
      },
    )

    if (!res.ok) {
      const body = await res.text()
      logger.error({ hotelId: data.hotelId, status: res.status, body }, 'Cloudbeds rates push failed')
      throw new Error(`Cloudbeds sendRates failed: HTTP ${res.status}`)
    }

    logger.info({ hotelId: data.hotelId, date: data.date }, 'Cloudbeds rates updated')
  }

  async receiveBooking(raw: unknown): Promise<BookingData> {
    const r = raw as Record<string, unknown>
    const booking = r['booking'] as Record<string, unknown>
    const guest = (booking['guest'] ?? {}) as Record<string, unknown>

    return {
      externalId: String(booking['reservationID'] ?? ''),
      guestName: `${guest['firstName'] ?? ''} ${guest['lastName'] ?? ''}`.trim(),
      email: (guest['email'] as string | null) ?? null,
      phone: (guest['phone'] as string | null) ?? null,
      roomTypeId: String(booking['roomTypeID'] ?? ''),
      checkIn: String(booking['startDate'] ?? ''),
      checkOut: String(booking['endDate'] ?? ''),
      totalAmount: Number(booking['balance'] ?? 0),
      currencyCode: String(booking['currencyCode'] ?? 'USD'),
    }
  }
}
