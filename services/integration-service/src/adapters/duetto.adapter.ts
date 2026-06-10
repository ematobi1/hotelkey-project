import { createLogger } from '@hotel-key/logger'
import type { IntegrationAdapter, RateRecommendation } from '../domain/types'
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

interface DuettoRec {
  stayDate: string
  suggestedPrice: number
  currencyCode: string
  forecastAccuracy: number
}

export class DuettoAdapter implements IntegrationAdapter {
  readonly name = 'duetto'
  readonly category = 'rms' as const

  async getRateRecommendations(hotelId: string, date: string): Promise<RateRecommendation[]> {
    const apiKey = config.DUETTO_API_KEY
    if (!apiKey) {
      logger.warn('DUETTO_API_KEY not configured')
      return []
    }

    const url = new URL('https://api.duettoresearch.com/gamechanger/v1/pricing/recommendations')
    url.searchParams.set('propertyId', hotelId)
    url.searchParams.set('date', date)

    const res = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ hotelId, date, status: res.status, body }, 'Duetto rate recommendations fetch failed')
      throw new Error(`Duetto getRateRecommendations failed: HTTP ${res.status}`)
    }

    const data = await res.json() as { data: DuettoRec[] }
    return (data.data ?? []).map((r) => ({
      date: r.stayDate,
      recommendedRate: r.suggestedPrice,
      currencyCode: r.currencyCode,
      confidence: r.forecastAccuracy,
    }))
  }
}
