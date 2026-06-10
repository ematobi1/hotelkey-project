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

const SITEMINDER_API_KEY = process.env['SITEMINDER_API_KEY']

export class SiteMinderAdapter implements IntegrationAdapter {
  readonly name = 'siteminder'
  readonly category = 'channel_manager' as const

  async sendAvailability(data: AvailabilityData): Promise<void> {
    if (!SITEMINDER_API_KEY) {
      logger.warn('SITEMINDER_API_KEY not configured')
      return
    }

    const res = await fetchWithRetry('https://api.siteminder.com/v1/property/inventory', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${SITEMINDER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propertyId: data.hotelId,
        roomTypeId: data.roomTypeId,
        date: data.date,
        available: data.available,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ hotelId: data.hotelId, status: res.status, body }, 'SiteMinder availability push failed')
      throw new Error(`SiteMinder sendAvailability failed: HTTP ${res.status}`)
    }

    logger.info({ hotelId: data.hotelId, date: data.date }, 'SiteMinder availability updated')
  }

  async sendRates(data: RatesData): Promise<void> {
    if (!SITEMINDER_API_KEY) {
      logger.warn('SITEMINDER_API_KEY not configured')
      return
    }

    const res = await fetchWithRetry('https://api.siteminder.com/v1/property/rates', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${SITEMINDER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propertyId: data.hotelId,
        roomTypeId: data.roomTypeId,
        date: data.date,
        amount: data.rate,
        currency: data.currencyCode,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ hotelId: data.hotelId, status: res.status, body }, 'SiteMinder rates push failed')
      throw new Error(`SiteMinder sendRates failed: HTTP ${res.status}`)
    }

    logger.info({ hotelId: data.hotelId, date: data.date }, 'SiteMinder rates updated')
  }

  async receiveBooking(raw: unknown): Promise<BookingData> {
    const r = raw as Record<string, unknown>
    const reservation = r['reservation'] as Record<string, unknown>
    const guest = (reservation['guest'] ?? {}) as Record<string, unknown>

    return {
      externalId: String(reservation['reservationId'] ?? ''),
      guestName: String(guest['fullName'] ?? ''),
      email: (guest['email'] as string | null) ?? null,
      phone: (guest['phone'] as string | null) ?? null,
      roomTypeId: String(reservation['roomTypeId'] ?? ''),
      checkIn: String(reservation['arrival'] ?? ''),
      checkOut: String(reservation['departure'] ?? ''),
      totalAmount: Number(reservation['totalAmount'] ?? 0),
      currencyCode: String(reservation['currency'] ?? 'USD'),
    }
  }
}
