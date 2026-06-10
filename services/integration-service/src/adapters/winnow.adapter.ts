import { createLogger } from '@hotel-key/logger'
import type { IntegrationAdapter, SustainabilityMetrics } from '../domain/types'
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

interface WinnowResponse {
  site_id: string
  period: string
  total_waste_kg: number
  co2_equivalent_kg: number
}

export class WinnowAdapter implements IntegrationAdapter {
  readonly name = 'winnow'
  readonly category = 'sustainability' as const

  async getSustainabilityData(hotelId: string): Promise<SustainabilityMetrics> {
    const apiKey = config.WINNOW_API_KEY
    if (!apiKey) {
      logger.warn('WINNOW_API_KEY not configured')
      return { hotelId, period: new Date().toISOString().slice(0, 7) }
    }

    const period = new Date().toISOString().slice(0, 7)
    const url = new URL('https://vision.winnowsolutions.com/api/v1/waste/summary')
    url.searchParams.set('siteId', hotelId)
    url.searchParams.set('period', period)

    const res = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ hotelId, status: res.status, body }, 'Winnow sustainability data fetch failed')
      throw new Error(`Winnow getSustainabilityData failed: HTTP ${res.status}`)
    }

    const data = await res.json() as WinnowResponse
    logger.info({ hotelId, period }, 'Winnow food waste data fetched')

    return {
      hotelId,
      period: data.period,
      foodWasteKg: data.total_waste_kg,
      co2Kg: data.co2_equivalent_kg,
    }
  }
}
