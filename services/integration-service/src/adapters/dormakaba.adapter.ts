import { createLogger } from '@hotel-key/logger'
import type { IntegrationAdapter } from '../domain/types'
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

export class DormakabaAdapter implements IntegrationAdapter {
  readonly name = 'dormakaba'
  readonly category = 'lock' as const

  async issueKey(reservationId: string, roomId: string): Promise<{ keyCode: string }> {
    const apiKey = config.DORMAKABA_API_KEY
    if (!apiKey) throw new Error('DORMAKABA_API_KEY not configured')

    const res = await fetchWithRetry('https://api.dormakaba.cloud/v1/keys/issue', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reservationId, roomId, keyType: 'MOBILE' }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ reservationId, roomId, status: res.status, body }, 'Dormakaba key issuance failed')
      throw new Error(`Dormakaba issueKey failed: HTTP ${res.status}`)
    }

    const data = await res.json() as { keyCode: string }
    logger.info({ reservationId, roomId }, 'Dormakaba key issued')
    return { keyCode: data.keyCode }
  }

  async revokeKey(reservationId: string, roomId: string): Promise<void> {
    const apiKey = config.DORMAKABA_API_KEY
    if (!apiKey) throw new Error('DORMAKABA_API_KEY not configured')

    const res = await fetchWithRetry('https://api.dormakaba.cloud/v1/keys/revoke', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reservationId, roomId }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ reservationId, roomId, status: res.status, body }, 'Dormakaba key revocation failed')
      throw new Error(`Dormakaba revokeKey failed: HTTP ${res.status}`)
    }

    logger.info({ reservationId, roomId }, 'Dormakaba key revoked')
  }
}
