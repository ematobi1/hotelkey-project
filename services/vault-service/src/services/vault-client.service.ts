import { config } from '../config'
import { CryptoService, deriveKeyFromSecret } from './crypto.service'

const TRANSIT_KEY_NAME = 'hotel-key-pii'

interface VaultTransitExportResponse {
  data: {
    keys: Record<string, string>
    name: string
    type: string
  }
}

export class VaultClientService {
  async getEncryptionKey(): Promise<CryptoService> {
    if (config.VAULT_TOKEN) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10_000)

        const response = await fetch(
          `${config.VAULT_ADDR}/v1/transit/export/encryption-key/${TRANSIT_KEY_NAME}`,
          {
            headers: {
              'X-Vault-Token': config.VAULT_TOKEN,
            },
            signal: controller.signal,
          },
        ).finally(() => clearTimeout(timeout))

        if (response.ok) {
          const body = (await response.json()) as VaultTransitExportResponse
          const keys = body.data.keys
          const latestVersion = Math.max(...Object.keys(keys).map(Number))
          const keyMaterial = keys[String(latestVersion)]
          if (!keyMaterial) throw new Error('No key material in Vault response')
          const derivedKey = deriveKeyFromSecret(keyMaterial)
          return new CryptoService(derivedKey)
        }
      } catch {
        // fall through to local fallback
      }
    }

    return this.localFallback()
  }

  private localFallback(): CryptoService {
    if (!config.ENCRYPTION_KEY) {
      throw new Error(
        'No encryption key available: VAULT_TOKEN is not set and ENCRYPTION_KEY is not configured',
      )
    }
    const key = Buffer.from(config.ENCRYPTION_KEY, 'hex')
    return new CryptoService(key)
  }
}
