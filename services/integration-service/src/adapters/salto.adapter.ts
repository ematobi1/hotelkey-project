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

export class SaltoAdapter implements IntegrationAdapter {
  readonly name = 'salto'
  readonly category = 'lock' as const

  async issueKey(reservationId: string, roomId: string): Promise<{ keyCode: string }> {
    const apiKey = config.SALTO_API_KEY
    if (!apiKey) throw new Error('SALTO_API_KEY not configured')

    const res = await fetchWithRetry('https://api.saltoks.com/api/v1/access/grant', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reservation_id: reservationId,
        door_id: roomId,
        access_type: 'MOBILE_KEY',
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ reservationId, roomId, status: res.status, body }, 'SALTO key issuance failed')
      throw new Error(`SALTO issueKey failed: HTTP ${res.status}`)
    }

    const data = await res.json() as { pin: string }
    logger.info({ reservationId, roomId }, 'SALTO key issued')
    return { keyCode: data.pin }
  }

  async revokeKey(reservationId: string, roomId: string): Promise<void> {
    const apiKey = config.SALTO_API_KEY
    if (!apiKey) throw new Error('SALTO_API_KEY not configured')

    const res = await fetchWithRetry('https://api.saltoks.com/api/v1/access/revoke', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reservation_id: reservationId,
        door_id: roomId,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ reservationId, roomId, status: res.status, body }, 'SALTO key revocation failed')
      throw new Error(`SALTO revokeKey failed: HTTP ${res.status}`)
    }

    logger.info({ reservationId, roomId }, 'SALTO key revoked')
  }
}
