import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConsentService } from '../services/consent.service'
import { BadRequestError } from '../domain/errors'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const GUEST_ID = '00000000-0000-0000-0000-000000000002'
const TX_ID = 'fabric-tx-abc123'

const mockFabric = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  grantConsent: vi.fn().mockResolvedValue(TX_ID),
  revokeConsent: vi.fn().mockResolvedValue(TX_ID),
  hasConsent: vi.fn().mockResolvedValue(true),
  getConsentHistory: vi.fn().mockResolvedValue([]),
}

const mockRepo = {
  upsert: vi.fn().mockResolvedValue(undefined),
  findByGuest: vi.fn().mockResolvedValue([]),
  findByPurpose: vi.fn().mockResolvedValue(null),
  listActiveByGuest: vi.fn().mockResolvedValue([]),
}

describe('ConsentService', () => {
  let svc: ConsentService

  beforeEach(() => {
    vi.clearAllMocks()
    svc = new ConsentService(mockFabric as any, mockRepo as any)
  })

  it('grantConsent — hashes guestId, calls fabric client, upserts to cache', async () => {
    const txId = await svc.grantConsent(TENANT_ID, GUEST_ID, 'marketing', 'staff-001')

    expect(txId).toBe(TX_ID)
    expect(mockFabric.grantConsent).toHaveBeenCalledOnce()

    const [guestIdHashArg, tenantIdArg, purposeArg, grantedByArg] =
      mockFabric.grantConsent.mock.calls[0] as [string, string, string, string]

    expect(guestIdHashArg).toMatch(/^[a-f0-9]{64}$/)
    expect(guestIdHashArg).not.toBe(GUEST_ID)
    expect(tenantIdArg).toBe(TENANT_ID)
    expect(purposeArg).toBe('marketing')
    expect(grantedByArg).toBe('staff-001')

    expect(mockRepo.upsert).toHaveBeenCalledOnce()
    const upsertArg = mockRepo.upsert.mock.calls[0]![0] as Record<string, unknown>
    expect(upsertArg['status']).toBe('granted')
    expect(upsertArg['guestIdHash']).toBe(guestIdHashArg)
    expect(upsertArg['txId']).toBe(TX_ID)
  })

  it('revokeConsent — calls fabric revoke, updates cache status to revoked', async () => {
    const txId = await svc.revokeConsent(TENANT_ID, GUEST_ID, 'analytics', 'staff-002')

    expect(txId).toBe(TX_ID)
    expect(mockFabric.revokeConsent).toHaveBeenCalledOnce()

    const [, , purposeArg, revokedByArg] =
      mockFabric.revokeConsent.mock.calls[0] as [string, string, string, string]
    expect(purposeArg).toBe('analytics')
    expect(revokedByArg).toBe('staff-002')

    expect(mockRepo.upsert).toHaveBeenCalledOnce()
    const upsertArg = mockRepo.upsert.mock.calls[0]![0] as Record<string, unknown>
    expect(upsertArg['status']).toBe('revoked')
  })

  it('hasConsent — reads from cache (fast path) when record exists', async () => {
    mockRepo.findByPurpose.mockResolvedValue({
      id: 'some-id',
      tenantId: TENANT_ID,
      guestId: GUEST_ID,
      guestIdHash: 'abc',
      purpose: 'marketing',
      status: 'granted',
      txId: TX_ID,
      recordedAt: new Date(),
      createdAt: new Date(),
    })

    const result = await svc.hasConsent(TENANT_ID, GUEST_ID, 'marketing')

    expect(result).toBe(true)
    expect(mockRepo.findByPurpose).toHaveBeenCalledOnce()
    expect(mockFabric.hasConsent).not.toHaveBeenCalled()
  })

  it('eraseGuestConsent — revokes all active consents for the guest', async () => {
    mockRepo.listActiveByGuest.mockResolvedValue([
      { tenantId: TENANT_ID, guestId: GUEST_ID, purpose: 'marketing', status: 'granted' },
      { tenantId: TENANT_ID, guestId: GUEST_ID, purpose: 'analytics', status: 'granted' },
    ])

    await svc.eraseGuestConsent(TENANT_ID, GUEST_ID)

    expect(mockFabric.revokeConsent).toHaveBeenCalledTimes(2)

    const purposes = mockFabric.revokeConsent.mock.calls.map(
      (call: unknown[]) => (call as string[])[2],
    )
    expect(purposes).toContain('marketing')
    expect(purposes).toContain('analytics')

    const revokedBys = mockFabric.revokeConsent.mock.calls.map(
      (call: unknown[]) => (call as string[])[3],
    )
    expect(revokedBys).toEqual(['gdpr-erase', 'gdpr-erase'])
  })
})
