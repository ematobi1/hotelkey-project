import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LockService } from '../services/lock.service'
import { NotFoundError } from '../domain/errors'
import type { Lock, LockCredential } from '../domain/errors'

function makeLock(overrides: Partial<Lock> = {}): Lock {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    tenantId: '00000000-0000-0000-0000-000000000002',
    roomId: '00000000-0000-0000-0000-000000000003',
    assaAbloyLockId: 'assa-lock-abc',
    label: 'Room 101',
    createdAt: new Date('2026-06-09T10:00:00Z'),
    updatedAt: new Date('2026-06-09T10:00:00Z'),
    ...overrides,
  }
}

function makeCredential(overrides: Partial<LockCredential> = {}): LockCredential {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    tenantId: '00000000-0000-0000-0000-000000000002',
    lockId: '00000000-0000-0000-0000-000000000001',
    reservationId: '00000000-0000-0000-0000-000000000020',
    guestId: '00000000-0000-0000-0000-000000000030',
    assaAbloyCredentialId: 'assa-cred-xyz',
    validFrom: new Date('2026-06-09T15:00:00Z'),
    validUntil: new Date('2026-06-12T12:00:00Z'),
    revokedAt: null,
    createdAt: new Date('2026-06-09T10:00:00Z'),
    ...overrides,
  }
}

const mockRepo = {
  createLock: vi.fn(),
  findLockById: vi.fn(),
  findLockByIdOrThrow: vi.fn(),
  findLockByRoomId: vi.fn(),
  listLocks: vi.fn(),
  createCredential: vi.fn(),
  findCredentialById: vi.fn(),
  findCredentialByReservationId: vi.fn(),
  listCredentialsByLock: vi.fn(),
  revokeCredential: vi.fn(),
}

const mockAssaClient = {
  issueCredential: vi.fn(),
  revokeCredential: vi.fn(),
  getAccessLog: vi.fn(),
}

describe('LockService', () => {
  let svc: LockService

  beforeEach(() => {
    vi.clearAllMocks()
    // reason: mocks satisfy the interface contract at runtime without full type instantiation
    svc = new LockService(mockRepo as any, mockAssaClient as any)
  })

  it('issueMobileKey — happy path, verifies credential stored', async () => {
    const lock = makeLock()
    const credential = makeCredential()
    mockRepo.findLockByRoomId.mockResolvedValue(lock)
    mockAssaClient.issueCredential.mockResolvedValue({ credentialId: 'assa-cred-xyz' })
    mockRepo.createCredential.mockResolvedValue(credential)

    const result = await svc.issueMobileKey(
      lock.tenantId,
      credential.reservationId,
      credential.guestId,
      'guest@example.com',
      lock.roomId,
      credential.validFrom,
      credential.validUntil,
    )

    expect(result).toEqual(credential)
    expect(mockAssaClient.issueCredential).toHaveBeenCalledWith(
      lock.assaAbloyLockId,
      'guest@example.com',
      credential.validFrom,
      credential.validUntil,
    )
    expect(mockRepo.createCredential).toHaveBeenCalledWith(
      expect.objectContaining({ assaAbloyCredentialId: 'assa-cred-xyz' }),
    )
  })

  it('issueMobileKey — throws NotFoundError when room has no registered lock', async () => {
    mockRepo.findLockByRoomId.mockResolvedValue(null)

    await expect(
      svc.issueMobileKey(
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000020',
        '00000000-0000-0000-0000-000000000030',
        'guest@example.com',
        '00000000-0000-0000-0000-000000000099',
        new Date(),
        new Date(),
      ),
    ).rejects.toBeInstanceOf(NotFoundError)

    expect(mockAssaClient.issueCredential).not.toHaveBeenCalled()
    expect(mockRepo.createCredential).not.toHaveBeenCalled()
  })

  it('revokeKey — marks credential revoked', async () => {
    const credential = makeCredential()
    const revoked = makeCredential({ revokedAt: new Date('2026-06-10T08:00:00Z') })
    mockRepo.findCredentialById.mockResolvedValue(credential)
    mockAssaClient.revokeCredential.mockResolvedValue(undefined)
    mockRepo.revokeCredential.mockResolvedValue(revoked)

    const result = await svc.revokeKey(credential.id, credential.tenantId)

    expect(result.revokedAt).not.toBeNull()
    expect(mockAssaClient.revokeCredential).toHaveBeenCalledWith(credential.assaAbloyCredentialId)
    expect(mockRepo.revokeCredential).toHaveBeenCalledWith(credential.id, credential.tenantId)
  })

  it('revokeKey — throws NotFoundError for unknown credential', async () => {
    mockRepo.findCredentialById.mockResolvedValue(null)

    await expect(
      svc.revokeKey('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000002'),
    ).rejects.toBeInstanceOf(NotFoundError)

    expect(mockAssaClient.revokeCredential).not.toHaveBeenCalled()
    expect(mockRepo.revokeCredential).not.toHaveBeenCalled()
  })
})
