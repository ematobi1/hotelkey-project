import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PiiService } from '../services/pii.service'
import type { PiiRecord } from '../domain/errors'

function makePiiRecord(overrides: Partial<PiiRecord> = {}): PiiRecord {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    tenantId: '00000000-0000-0000-0000-000000000002',
    guestId: '00000000-0000-0000-0000-000000000003',
    fieldName: 'email',
    encryptedValue: 'enc_abc123',
    iv: 'aabbccdd',
    authTag: '11223344',
    keyVersion: 1,
    createdAt: new Date('2026-06-09T00:00:00Z'),
    ...overrides,
  }
}

const mockRepo = {
  storeField: vi.fn(),
  findByGuest: vi.fn(),
  findByField: vi.fn(),
  deleteByGuest: vi.fn(),
}

const mockCrypto = {
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}

describe('PiiService', () => {
  let svc: PiiService

  beforeEach(() => {
    vi.clearAllMocks()
    svc = new PiiService(mockRepo as any, mockCrypto as any) // reason: test mock injection
  })

  it('store — encrypts fields and stores via repository', async () => {
    mockCrypto.encrypt.mockReturnValue({
      encryptedValue: 'enc_abc123',
      iv: 'aabbccdd',
      authTag: '11223344',
    })
    mockRepo.storeField.mockResolvedValue(makePiiRecord())

    const result = await svc.store(
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      { email: 'guest@example.com', phone: '+1234567890' },
    )

    expect(result).toEqual(['email', 'phone'])
    expect(mockCrypto.encrypt).toHaveBeenCalledTimes(2)
    expect(mockRepo.storeField).toHaveBeenCalledTimes(2)
    expect(mockRepo.storeField).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      'email',
      'enc_abc123',
      'aabbccdd',
      '11223344',
      1,
    )
  })

  it('retrieve — decrypts all fields from repository when no filter given', async () => {
    mockRepo.findByGuest.mockResolvedValue([
      makePiiRecord({ fieldName: 'email', encryptedValue: 'enc_email', iv: 'iv1', authTag: 'tag1' }),
      makePiiRecord({ fieldName: 'phone', encryptedValue: 'enc_phone', iv: 'iv2', authTag: 'tag2' }),
    ])
    mockCrypto.decrypt
      .mockReturnValueOnce('guest@example.com')
      .mockReturnValueOnce('+1234567890')

    const result = await svc.retrieve(
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
    )

    expect(result).toEqual({ email: 'guest@example.com', phone: '+1234567890' })
    expect(mockRepo.findByGuest).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
    )
    expect(mockCrypto.decrypt).toHaveBeenCalledTimes(2)
  })

  it('retrieve — returns only requested field names when fieldNames filter is provided', async () => {
    mockRepo.findByField.mockResolvedValue(
      makePiiRecord({ fieldName: 'email', encryptedValue: 'enc_email', iv: 'iv1', authTag: 'tag1' }),
    )
    mockCrypto.decrypt.mockReturnValue('guest@example.com')

    const result = await svc.retrieve(
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      ['email'],
    )

    expect(result).toEqual({ email: 'guest@example.com' })
    expect(mockRepo.findByField).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      'email',
    )
    expect(mockRepo.findByGuest).not.toHaveBeenCalled()
  })

  it('erase — calls repository deleteByGuest', async () => {
    mockRepo.deleteByGuest.mockResolvedValue(3)

    await svc.erase(
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
    )

    expect(mockRepo.deleteByGuest).toHaveBeenCalledOnce()
    expect(mockRepo.deleteByGuest).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
    )
  })
})
