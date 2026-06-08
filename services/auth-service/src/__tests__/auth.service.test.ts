import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthService } from '../services/auth.service'
import {
  InvalidCredentialsError,
  AccountInactiveError,
  MfaRequiredError,
  InvalidTokenError,
  TokenRevokedError,
} from '../domain/errors'

vi.mock('argon2', () => ({
  verify: vi.fn(),
  hash: vi.fn(),
}))
vi.mock('../services/jwt.service', () => ({
  signAccessToken: vi.fn().mockResolvedValue('access-token'),
  signMfaPartialToken: vi.fn().mockResolvedValue('mfa-token'),
  signGuestToken: vi.fn().mockResolvedValue('guest-token'),
  verifyToken: vi.fn(),
}))
vi.mock('../config', () => ({
  config: { JWT_REFRESH_TOKEN_TTL_DAYS: 30 },
}))

import * as argon2 from 'argon2'
import * as jwtService from '../services/jwt.service'

const makeStaff = (overrides = {}) => ({
  id: 'staff-1',
  tenantId: 'tenant-1',
  email: 'staff@hotel.com',
  role: 'front_desk' as const,
  isActive: true,
  mfaEnabled: false,
  passwordHash: 'hash',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeStaffRepo = (overrides = {}) => ({
  findByEmail: vi.fn(),
  findByIdOrThrow: vi.fn(),
  setMfaEnabled: vi.fn(),
  ...overrides,
})

const makeTokenRepo = (overrides = {}) => ({
  findByToken: vi.fn(),
  store: vi.fn().mockResolvedValue('refresh-token'),
  revoke: vi.fn(),
  ...overrides,
})

describe('AuthService.login', () => {
  it('throws InvalidCredentialsError when staff not found', async () => {
    const staffRepo = makeStaffRepo({ findByEmail: vi.fn().mockResolvedValue(null) })
    const svc = new AuthService(staffRepo as any, makeTokenRepo() as any)
    await expect(svc.login('tenant-1', 'x@x.com', 'pw')).rejects.toThrow(InvalidCredentialsError)
  })

  it('throws InvalidCredentialsError on wrong password', async () => {
    const staffRepo = makeStaffRepo({ findByEmail: vi.fn().mockResolvedValue(makeStaff()) })
    vi.mocked(argon2.verify).mockResolvedValue(false)
    const svc = new AuthService(staffRepo as any, makeTokenRepo() as any)
    await expect(svc.login('tenant-1', 'x@x.com', 'wrong')).rejects.toThrow(InvalidCredentialsError)
  })

  it('throws AccountInactiveError for inactive staff', async () => {
    const staffRepo = makeStaffRepo({
      findByEmail: vi.fn().mockResolvedValue(makeStaff({ isActive: false })),
    })
    vi.mocked(argon2.verify).mockResolvedValue(true)
    const svc = new AuthService(staffRepo as any, makeTokenRepo() as any)
    await expect(svc.login('tenant-1', 'x@x.com', 'pw')).rejects.toThrow(AccountInactiveError)
  })

  it('throws MfaRequiredError when MFA is enabled', async () => {
    const staffRepo = makeStaffRepo({
      findByEmail: vi.fn().mockResolvedValue(makeStaff({ mfaEnabled: true })),
    })
    vi.mocked(argon2.verify).mockResolvedValue(true)
    const svc = new AuthService(staffRepo as any, makeTokenRepo() as any)
    const err = await svc.login('tenant-1', 'x@x.com', 'pw').catch((e) => e)
    expect(err).toBeInstanceOf(MfaRequiredError)
    expect(err.mfaToken).toBe('mfa-token')
  })

  it('returns token pair on successful login without MFA', async () => {
    const staffRepo = makeStaffRepo({
      findByEmail: vi.fn().mockResolvedValue(makeStaff()),
    })
    vi.mocked(argon2.verify).mockResolvedValue(true)
    const tokenRepo = makeTokenRepo()
    const svc = new AuthService(staffRepo as any, tokenRepo as any)
    const result = await svc.login('tenant-1', 'x@x.com', 'pw')
    expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' })
  })
})

describe('AuthService.completeMfaLogin', () => {
  it('throws InvalidTokenError when token type is wrong', async () => {
    vi.mocked(jwtService.verifyToken).mockResolvedValue({ type: 'access', sub: 's1', tenantId: 't1', role: 'front_desk' } as any)
    const svc = new AuthService(makeStaffRepo() as any, makeTokenRepo() as any)
    await expect(svc.completeMfaLogin('bad-token')).rejects.toThrow(InvalidTokenError)
  })

  it('throws InvalidTokenError when verifyToken rejects', async () => {
    vi.mocked(jwtService.verifyToken).mockRejectedValue(new Error('expired'))
    const svc = new AuthService(makeStaffRepo() as any, makeTokenRepo() as any)
    await expect(svc.completeMfaLogin('expired-token')).rejects.toThrow(InvalidTokenError)
  })

  it('returns token pair on valid MFA token', async () => {
    vi.mocked(jwtService.verifyToken).mockResolvedValue({ type: 'mfa_partial', sub: 'staff-1', tenantId: 't1', role: 'front_desk' } as any)
    const staffRepo = makeStaffRepo({ findByIdOrThrow: vi.fn().mockResolvedValue(makeStaff()) })
    const tokenRepo = makeTokenRepo()
    const svc = new AuthService(staffRepo as any, tokenRepo as any)
    const result = await svc.completeMfaLogin('valid-mfa-token')
    expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' })
  })
})

describe('AuthService.refresh', () => {
  it('throws InvalidTokenError when token not found', async () => {
    const tokenRepo = makeTokenRepo({ findByToken: vi.fn().mockResolvedValue(null) })
    const svc = new AuthService(makeStaffRepo() as any, tokenRepo as any)
    await expect(svc.refresh('unknown')).rejects.toThrow(InvalidTokenError)
  })

  it('throws TokenRevokedError when token is revoked', async () => {
    const tokenRepo = makeTokenRepo({
      findByToken: vi.fn().mockResolvedValue({
        staffId: 's1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
      }),
    })
    const svc = new AuthService(makeStaffRepo() as any, tokenRepo as any)
    await expect(svc.refresh('revoked')).rejects.toThrow(TokenRevokedError)
  })

  it('throws InvalidTokenError when token is expired', async () => {
    const tokenRepo = makeTokenRepo({
      findByToken: vi.fn().mockResolvedValue({
        staffId: 's1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      }),
    })
    const svc = new AuthService(makeStaffRepo() as any, tokenRepo as any)
    await expect(svc.refresh('expired')).rejects.toThrow(InvalidTokenError)
  })

  it('returns new access token on valid refresh', async () => {
    const tokenRepo = makeTokenRepo({
      findByToken: vi.fn().mockResolvedValue({
        staffId: 'staff-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
      }),
    })
    const staffRepo = makeStaffRepo({ findByIdOrThrow: vi.fn().mockResolvedValue(makeStaff()) })
    const svc = new AuthService(staffRepo as any, tokenRepo as any)
    const result = await svc.refresh('valid-refresh')
    expect(result).toEqual({ accessToken: 'access-token' })
  })
})

describe('AuthService.logout', () => {
  it('delegates to tokenRepo.revoke', async () => {
    const tokenRepo = makeTokenRepo()
    const svc = new AuthService(makeStaffRepo() as any, tokenRepo as any)
    await svc.logout('some-refresh-token')
    expect(tokenRepo.revoke).toHaveBeenCalledWith('some-refresh-token')
  })
})
