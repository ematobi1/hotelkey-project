import { createLogger } from '@hotel-key/logger'
import type { IntegrationAdapter } from '../domain/types'

const logger = createLogger({ service: 'integration-service' })

const ASSA_ABLOY_API_KEY = process.env['ASSA_ABLOY_API_KEY']
const ASSA_ABLOY_API_URL = process.env['ASSA_ABLOY_API_URL'] ?? 'https://api.assaabloy.com/visionline/v1'

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

export class AssaAbloyAdapter implements IntegrationAdapter {
  readonly name = 'assa-abloy'
  readonly category = 'lock' as const

  async issueKey(reservationId: string, roomId: string): Promise<{ keyCode: string }> {
    if (!ASSA_ABLOY_API_KEY) throw new Error('ASSA_ABLOY_API_KEY not configured')

    const res = await fetchWithRetry(`${ASSA_ABLOY_API_URL}/keys/encode`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ASSA_ABLOY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reservationId,
        doorId: roomId,
        keyType: 'MOBILE_CREDENTIAL',
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ reservationId, roomId, status: res.status, body }, 'Assa Abloy key issuance failed')
      throw new Error(`AssaAbloy issueKey failed: HTTP ${res.status}`)
    }

    const data = await res.json() as { credentialCode: string }
    logger.info({ reservationId, roomId }, 'Assa Abloy key issued')
    return { keyCode: data.credentialCode }
  }

  async revokeKey(reservationId: string, roomId: string): Promise<void> {
    if (!ASSA_ABLOY_API_KEY) throw new Error('ASSA_ABLOY_API_KEY not configured')

    const res = await fetchWithRetry(`${ASSA_ABLOY_API_URL}/keys/revoke`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ASSA_ABLOY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reservationId, doorId: roomId }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ reservationId, roomId, status: res.status, body }, 'Assa Abloy key revocation failed')
      throw new Error(`AssaAbloy revokeKey failed: HTTP ${res.status}`)
    }

    logger.info({ reservationId, roomId }, 'Assa Abloy key revoked')
  }
}
