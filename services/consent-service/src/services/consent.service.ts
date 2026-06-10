import * as crypto from 'crypto'
import { BadRequestError } from '../domain/errors'
import { VALID_PURPOSES } from '../domain/errors'
import type { ConsentRecord, ConsentPurpose } from '../domain/errors'
import type { ConsentRepository } from '../repositories/consent.repository'
import type { FabricClient } from './fabric.client'

function hashGuestId(guestId: string): string {
  return crypto.createHash('sha256').update(guestId).digest('hex')
}

function assertValidPurpose(purpose: string): asserts purpose is ConsentPurpose {
  if (!(VALID_PURPOSES as string[]).includes(purpose)) {
    throw new BadRequestError(
      `Invalid purpose '${purpose}': must be one of ${VALID_PURPOSES.join(', ')}`,
    )
  }
}

export class ConsentService {
  constructor(
    private readonly fabric: FabricClient,
    private readonly repo: ConsentRepository,
  ) {}

  async grantConsent(
    tenantId: string,
    guestId: string,
    purpose: string,
    grantedBy: string,
  ): Promise<string> {
    assertValidPurpose(purpose)
    const guestIdHash = hashGuestId(guestId)

    const txId = await this.fabric.grantConsent(guestIdHash, tenantId, purpose, grantedBy)

    await this.repo.upsert({
      tenantId,
      guestId,
      guestIdHash,
      purpose,
      status: 'granted',
      txId: txId || null,
    })

    return txId
  }

  async revokeConsent(
    tenantId: string,
    guestId: string,
    purpose: string,
    revokedBy: string,
  ): Promise<string> {
    assertValidPurpose(purpose)
    const guestIdHash = hashGuestId(guestId)

    const txId = await this.fabric.revokeConsent(guestIdHash, tenantId, purpose, revokedBy)

    await this.repo.upsert({
      tenantId,
      guestId,
      guestIdHash,
      purpose,
      status: 'revoked',
      txId: txId || null,
    })

    return txId
  }

  async hasConsent(tenantId: string, guestId: string, purpose: string): Promise<boolean> {
    if (purpose === 'essential') return true

    assertValidPurpose(purpose)

    const cached = await this.repo.findByPurpose(tenantId, guestId, purpose)
    if (cached !== null) {
      return cached.status === 'granted'
    }

    const guestIdHash = hashGuestId(guestId)
    return this.fabric.hasConsent(guestIdHash, tenantId, purpose)
  }

  async getConsentHistory(tenantId: string, guestId: string): Promise<ConsentRecord[]> {
    const guestIdHash = hashGuestId(guestId)
    return this.fabric.getConsentHistory(guestIdHash, tenantId)
  }

  async eraseGuestConsent(tenantId: string, guestId: string): Promise<void> {
    const active = await this.repo.listActiveByGuest(tenantId, guestId)

    await Promise.all(
      active.map((record) =>
        this.revokeConsent(tenantId, guestId, record.purpose, 'gdpr-erase'),
      ),
    )
  }
}
