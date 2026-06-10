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

interface EcoSmartResponse {
  propertyId: string
  period: string
  energy: { kwh: number }
  water: { litres: number }
  carbon: { kg: number }
}

export class EcoSmartAdapter implements IntegrationAdapter {
  readonly name = 'ecosmart'
  readonly category = 'sustainability' as const

  async getSustainabilityData(hotelId: string): Promise<SustainabilityMetrics> {
    const apiKey = config.ECOSMART_API_KEY
    if (!apiKey) {
      logger.warn('ECOSMART_API_KEY not configured')
      return { hotelId, period: new Date().toISOString().slice(0, 7) }
    }

    const period = new Date().toISOString().slice(0, 7)
    const url = new URL('https://api.ecosmart.io/v1/consumption/summary')
    url.searchParams.set('propertyId', hotelId)
    url.searchParams.set('period', period)

    const res = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ hotelId, status: res.status, body }, 'EcoSmart sustainability data fetch failed')
      throw new Error(`EcoSmart getSustainabilityData failed: HTTP ${res.status}`)
    }

    const data = await res.json() as EcoSmartResponse
    logger.info({ hotelId, period }, 'EcoSmart sustainability data fetched')

    return {
      hotelId,
      period: data.period,
      energyKwh: data.energy?.kwh,
      waterLitres: data.water?.litres,
      co2Kg: data.carbon?.kg,
    }
  }
}
