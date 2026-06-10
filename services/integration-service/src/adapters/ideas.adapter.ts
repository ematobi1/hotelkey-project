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

interface IdeasRecommendation {
  date: string
  recommendedRate: number
  currency: string
  confidence: number
}

export class IdeasAdapter implements IntegrationAdapter {
  readonly name = 'ideas'
  readonly category = 'rms' as const

  async getRateRecommendations(hotelId: string, date: string): Promise<RateRecommendation[]> {
    const apiKey = config.IDEAS_API_KEY
    if (!apiKey) {
      logger.warn('IDEAS_API_KEY not configured')
      return []
    }

    const url = new URL('https://api.ideas.com/g3/v1/recommendations')
    url.searchParams.set('hotelId', hotelId)
    url.searchParams.set('startDate', date)
    url.searchParams.set('endDate', date)

    const res = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ hotelId, date, status: res.status, body }, 'IDeaS rate recommendations fetch failed')
      throw new Error(`IDeaS getRateRecommendations failed: HTTP ${res.status}`)
    }

    const data = await res.json() as { recommendations: IdeasRecommendation[] }
    return (data.recommendations ?? []).map((r) => ({
      date: r.date,
      recommendedRate: r.recommendedRate,
      currencyCode: r.currency,
      confidence: r.confidence,
    }))
  }
}
