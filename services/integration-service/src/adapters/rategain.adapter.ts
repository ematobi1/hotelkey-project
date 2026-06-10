import { createLogger } from '@hotel-key/logger'
import type { IntegrationAdapter, AvailabilityData, RatesData } from '../domain/types'
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

export class RateGainAdapter implements IntegrationAdapter {
  readonly name = 'rategain'
  readonly category = 'channel_manager' as const

  async sendAvailability(data: AvailabilityData): Promise<void> {
    const apiKey = config.RATEGAIN_API_KEY
    if (!apiKey) {
      logger.warn('RATEGAIN_API_KEY not configured')
      return
    }

    const res = await fetchWithRetry('https://api.rategain.com/channelmanager/v1/availability', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hotelId: data.hotelId,
        roomTypeId: data.roomTypeId,
        availabilityDate: data.date,
        availableRooms: data.available,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ hotelId: data.hotelId, status: res.status, body }, 'RateGain availability push failed')
      throw new Error(`RateGain sendAvailability failed: HTTP ${res.status}`)
    }

    logger.info({ hotelId: data.hotelId, date: data.date }, 'RateGain availability updated')
  }

  async sendRates(data: RatesData): Promise<void> {
    const apiKey = config.RATEGAIN_API_KEY
    if (!apiKey) {
      logger.warn('RATEGAIN_API_KEY not configured')
      return
    }

    const res = await fetchWithRetry('https://api.rategain.com/channelmanager/v1/rates', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hotelId: data.hotelId,
        roomTypeId: data.roomTypeId,
        rateDate: data.date,
        rate: data.rate,
        currency: data.currencyCode,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ hotelId: data.hotelId, status: res.status, body }, 'RateGain rates push failed')
      throw new Error(`RateGain sendRates failed: HTTP ${res.status}`)
    }

    logger.info({ hotelId: data.hotelId, date: data.date }, 'RateGain rates updated')
  }
}
