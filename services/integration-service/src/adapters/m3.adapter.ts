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

export class M3Adapter implements IntegrationAdapter {
  readonly name = 'm3'
  readonly category = 'analytics' as const

  async pushAnalytics(data: AnalyticsData): Promise<void> {
    const apiKey = config.M3_API_KEY
    if (!apiKey) {
      logger.warn('M3_API_KEY not configured')
      return
    }

    const res = await fetchWithRetry('https://api.m3as.com/accounting/v1/journal/import', {
      method: 'POST',
      headers: {
        'X-M3-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propertyCode: data.hotelId,
        period: data.period,
        entries: [
          {
            account: 'REVENUE',
            description: `Total Revenue ${data.period}`,
            amount: data.totalRevenue,
            metrics: {
              occupancyRate: data.occupancyRate,
              revPAR: data.revpar,
              ADR: data.adr,
            },
          },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ hotelId: data.hotelId, status: res.status, body }, 'M3 analytics push failed')
      throw new Error(`M3 pushAnalytics failed: HTTP ${res.status}`)
    }

    logger.info({ hotelId: data.hotelId, period: data.period }, 'M3 analytics pushed')
  }
}
