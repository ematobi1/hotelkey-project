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

export class RoomdexAdapter implements IntegrationAdapter {
  readonly name = 'roomdex'
  readonly category = 'upselling' as const

  async sendRoomUpgrade(guestId: string, upgradeRoomId: string): Promise<void> {
    const apiKey = config.ROOMDEX_API_KEY
    if (!apiKey) {
      logger.warn('ROOMDEX_API_KEY not configured')
      return
    }

    const res = await fetchWithRetry('https://api.roomdex.com/v1/upgrades/offer', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        guest_id: guestId,
        upgrade_room_id: upgradeRoomId,
        bidding_enabled: true,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      logger.error({ guestId, upgradeRoomId, status: res.status, body }, 'Roomdex room upgrade send failed')
      throw new Error(`Roomdex sendRoomUpgrade failed: HTTP ${res.status}`)
    }

    logger.info({ guestId, upgradeRoomId }, 'Roomdex room upgrade offer sent')
  }
}
