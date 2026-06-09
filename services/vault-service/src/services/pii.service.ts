import type { CryptoService } from './crypto.service'
import type { PiiRepository } from '../repositories/pii.repository'

const KEY_VERSION = 1

export class PiiService {
  constructor(
    private readonly repo: PiiRepository,
    private readonly crypto: CryptoService,
  ) {}

  async store(
    tenantId: string,
    guestId: string,
    fields: Record<string, string>,
  ): Promise<string[]> {
    const stored: string[] = []

    for (const [fieldName, plaintext] of Object.entries(fields)) {
      const { encryptedValue, iv, authTag } = this.crypto.encrypt(plaintext)
      await this.repo.storeField(
        tenantId,
        guestId,
        fieldName,
        encryptedValue,
        iv,
        authTag,
        KEY_VERSION,
      )
      stored.push(fieldName)
    }

    return stored
  }

  async retrieve(
    tenantId: string,
    guestId: string,
    fieldNames?: string[],
  ): Promise<Record<string, string>> {
    const records = fieldNames
      ? await Promise.all(
          fieldNames.map((name) => this.repo.findByField(tenantId, guestId, name)),
        ).then((results) => results.filter((r): r is NonNullable<typeof r> => r !== null))
      : await this.repo.findByGuest(tenantId, guestId)

    const result: Record<string, string> = {}
    for (const record of records) {
      result[record.fieldName] = this.crypto.decrypt(
        record.encryptedValue,
        record.iv,
        record.authTag,
      )
    }
    return result
  }

  async erase(tenantId: string, guestId: string): Promise<void> {
    await this.repo.deleteByGuest(tenantId, guestId)
  }
}
