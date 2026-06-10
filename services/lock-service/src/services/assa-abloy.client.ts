import { AssaAbloyError } from '../domain/errors'

export interface AccessLogEvent {
  time: string
  action: string
  credentialId: string
}

export interface AccessLog {
  events: AccessLogEvent[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffMs(attempt: number): number {
  return 100 * Math.pow(2, attempt) + Math.random() * 50
}

export class AssaAbloyClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
    const MAX_RETRIES = 3

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': this.apiKey,
            ...(options.headers as Record<string, string> | undefined),
          },
        })
        clearTimeout(timeout)

        if (response.status >= 500 && attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt))
          continue
        }

        return response
      } catch (err) {
        clearTimeout(timeout)
        if (attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt))
          continue
        }
        throw err
      }
    }

    throw new AssaAbloyError('Max retries exceeded')
  }

  private async assertOk(response: Response, context: string): Promise<void> {
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new AssaAbloyError(`${context} failed (${response.status}): ${body}`)
    }
  }

  async issueCredential(
    lockId: string,
    guestEmail: string,
    validFrom: Date,
    validUntil: Date,
  ): Promise<{ credentialId: string }> {
    const response = await this.fetchWithRetry(`${this.baseUrl}/credentials`, {
      method: 'POST',
      body: JSON.stringify({
        lockId,
        guestEmail,
        validFrom: validFrom.toISOString(),
        validUntil: validUntil.toISOString(),
      }),
    })

    await this.assertOk(response, 'issueCredential')
    const data = (await response.json()) as { credentialId: string }
    return { credentialId: data.credentialId }
  }

  async revokeCredential(credentialId: string): Promise<void> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}/credentials/${credentialId}`,
      { method: 'DELETE' },
    )
    await this.assertOk(response, 'revokeCredential')
  }

  async getAccessLog(lockId: string, since?: Date): Promise<AccessLog> {
    const url = new URL(`${this.baseUrl}/locks/${lockId}/access-log`)
    if (since) url.searchParams.set('since', since.toISOString())

    const response = await this.fetchWithRetry(url.toString(), { method: 'GET' })
    await this.assertOk(response, 'getAccessLog')
    return (await response.json()) as AccessLog
  }
}
