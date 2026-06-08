import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MfaService } from '../services/mfa.service'
import { InvalidMfaCodeError, MfaAlreadyEnabledError } from '../domain/errors'

vi.mock('otplib', () => ({
  authenticator: {
    generateSecret: vi.fn().mockReturnValue('TOTPSECRET'),
    keyuri: vi.fn().mockReturnValue('otpauth://totp/...'),
    check: vi.fn(),
  },
}))
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,...') },
}))

import { authenticator } from 'otplib'

const makeMfaRepo = (overrides = {}) => ({
  upsertSecret: vi.fn().mockResolvedValue(undefined),
  getSecret: vi.fn(),
  markVerified: vi.fn().mockResolvedValue(undefined),
  ...overrides,
})

const makeStaffRepo = (overrides = {}) => ({
  findByIdOrThrow: vi.fn().mockResolvedValue({ id: 's1', mfaEnabled: false }),
  setMfaEnabled: vi.fn().mockResolvedValue(undefined),
  ...overrides,
})

describe('MfaService.setup', () => {
  it('throws MfaAlreadyEnabledError when MFA already active', async () => {
    const staffRepo = makeStaffRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue({ id: 's1', mfaEnabled: true }),
    })
    const svc = new MfaService(makeMfaRepo() as any, staffRepo as any)
    await expect(svc.setup('s1', 'e@e.com', 'tenant-1')).rejects.toThrow(MfaAlreadyEnabledError)
  })

  it('returns secret and QR code URL', async () => {
    const svc = new MfaService(makeMfaRepo() as any, makeStaffRepo() as any)
    const result = await svc.setup('s1', 'e@e.com', 'tenant-1')
    expect(result.secret).toBe('TOTPSECRET')
    expect(result.qrCodeUrl).toMatch(/^data:image\/png/)
  })
})

describe('MfaService.verify', () => {
  it('throws InvalidMfaCodeError when secret not found', async () => {
    const mfaRepo = makeMfaRepo({ getSecret: vi.fn().mockResolvedValue(null) })
    const svc = new MfaService(mfaRepo as any, makeStaffRepo() as any)
    await expect(svc.verify('s1', '123456')).rejects.toThrow(InvalidMfaCodeError)
  })

  it('throws InvalidMfaCodeError on wrong code', async () => {
    const mfaRepo = makeMfaRepo({
      getSecret: vi.fn().mockResolvedValue({ secret: 'SECRET', isVerified: false }),
    })
    vi.mocked(authenticator.check).mockReturnValue(false)
    const svc = new MfaService(mfaRepo as any, makeStaffRepo() as any)
    await expect(svc.verify('s1', '000000')).rejects.toThrow(InvalidMfaCodeError)
  })

  it('marks verified and enables MFA on valid code', async () => {
    const mfaRepo = makeMfaRepo({
      getSecret: vi.fn().mockResolvedValue({ secret: 'SECRET', isVerified: false }),
    })
    const staffRepo = makeStaffRepo()
    vi.mocked(authenticator.check).mockReturnValue(true)
    const svc = new MfaService(mfaRepo as any, staffRepo as any)
    await svc.verify('s1', '123456')
    expect(mfaRepo.markVerified).toHaveBeenCalledWith('s1')
    expect(staffRepo.setMfaEnabled).toHaveBeenCalledWith('s1', true)
  })
})

describe('MfaService.validateCode', () => {
  it('throws InvalidMfaCodeError when secret unverified', async () => {
    const mfaRepo = makeMfaRepo({
      getSecret: vi.fn().mockResolvedValue({ secret: 'SECRET', isVerified: false }),
    })
    const svc = new MfaService(mfaRepo as any, makeStaffRepo() as any)
    await expect(svc.validateCode('s1', '123456')).rejects.toThrow(InvalidMfaCodeError)
  })

  it('does not throw on valid code', async () => {
    const mfaRepo = makeMfaRepo({
      getSecret: vi.fn().mockResolvedValue({ secret: 'SECRET', isVerified: true }),
    })
    vi.mocked(authenticator.check).mockReturnValue(true)
    const svc = new MfaService(mfaRepo as any, makeStaffRepo() as any)
    await expect(svc.validateCode('s1', '123456')).resolves.toBeUndefined()
  })
})
