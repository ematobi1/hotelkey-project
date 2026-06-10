import { createLogger } from '@hotel-key/logger'
import type { IntegrationAdapter, AnalyticsData } from '../domain/types'
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

export class LodgisticsAdapter implements IntegrationAdapter {
  readonly name = 'lodgistics'
  readonly category = 'analytics' as const

  async pushAnalytics(data: AnalyticsData): Promise<void> {
    const apiKey = config.LODGISTICS_API_KEY
    if (!apiKey) {
      logger.warn('LODGISTICS_API_KEY not configured')
      return
    }

    const res = await fetchWithRetry('https://api.lodgistics.com/v1/analytics/performance', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        property_id: data.hotelId,
        period: data.period,
        metrics: {
          occupancy_rate: data.occupancyRate,
          revpar: data.revpar,
          adr: data.adr,
          total_revenue: data.totalRevenue,
        },
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ hotelId: data.hotelId, status: res.status, body }, 'Lodgistics analytics push failed')
      throw new Error(`Lodgistics pushAnalytics failed: HTTP ${res.status}`)
    }

    logger.info({ hotelId: data.hotelId, period: data.period }, 'Lodgistics analytics pushed')
  }
}
