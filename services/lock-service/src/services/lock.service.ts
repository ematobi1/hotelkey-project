import { NotFoundError } from '../domain/errors'
import type { Lock, LockCredential } from '../domain/errors'
import type { LockRepository } from '../repositories/lock.repository'
import type { AssaAbloyClient, AccessLog } from './assa-abloy.client'

export class LockService {
  constructor(
    private readonly repo: LockRepository,
    private readonly assaClient: AssaAbloyClient,
  ) {}

  async createLock(
    tenantId: string,
    roomId: string,
    assaAbloyLockId: string,
    label: string,
  ): Promise<Lock> {
    return this.repo.createLock(tenantId, roomId, assaAbloyLockId, label)
  }

  async listLocks(tenantId: string): Promise<Lock[]> {
    return this.repo.listLocks(tenantId)
  }

  async listCredentials(lockId: string, tenantId: string): Promise<LockCredential[]> {
    await this.repo.findLockByIdOrThrow(lockId, tenantId)
    return this.repo.listCredentialsByLock(lockId, tenantId)
  }

  async issueMobileKey(
    tenantId: string,
    reservationId: string,
    guestId: string,
    guestEmail: string,
    roomId: string,
    validFrom: Date,
    validUntil: Date,
  ): Promise<LockCredential> {
    const lock = await this.repo.findLockByRoomId(tenantId, roomId)
    if (!lock) throw new NotFoundError('Lock', `room:${roomId}`)

    const { credentialId } = await this.assaClient.issueCredential(
      lock.assaAbloyLockId,
      guestEmail,
      validFrom,
      validUntil,
    )

    return this.repo.createCredential({
      tenantId,
      lockId: lock.id,
      reservationId,
      guestId,
      assaAbloyCredentialId: credentialId,
      validFrom,
      validUntil,
    })
  }

  async issueMobileKeyByLockId(
    tenantId: string,
    lockId: string,
    reservationId: string,
    guestId: string,
    guestEmail: string,
    validFrom: Date,
    validUntil: Date,
  ): Promise<LockCredential> {
    const lock = await this.repo.findLockByIdOrThrow(lockId, tenantId)
    const { credentialId } = await this.assaClient.issueCredential(
      lock.assaAbloyLockId,
      guestEmail,
      validFrom,
      validUntil,
    )
    return this.repo.createCredential({
      tenantId,
      lockId: lock.id,
      reservationId,
      guestId,
      assaAbloyCredentialId: credentialId,
      validFrom,
      validUntil,
    })
  }

  async revokeKey(credentialId: string, tenantId: string): Promise<LockCredential> {
    const credential = await this.repo.findCredentialById(credentialId, tenantId)
    if (!credential) throw new NotFoundError('LockCredential', credentialId)

    await this.assaClient.revokeCredential(credential.assaAbloyCredentialId)
    return this.repo.revokeCredential(credentialId, tenantId)
  }

  async getAccessLog(lockId: string, tenantId: string, since?: Date): Promise<AccessLog> {
    const lock = await this.repo.findLockByIdOrThrow(lockId, tenantId)
    return this.assaClient.getAccessLog(lock.assaAbloyLockId, since)
  }
}
