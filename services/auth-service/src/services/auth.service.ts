import * as argon2 from 'argon2'
import type { Staff, TokenPair } from '@hotel-key/types'
import type { StaffRepository } from '../repositories/staff.repository'
import type { TokenRepository } from '../repositories/token.repository'
import {
  InvalidCredentialsError,
  AccountInactiveError,
  MfaRequiredError,
  InvalidTokenError,
  TokenRevokedError,
} from '../domain/errors'
import {
  signAccessToken,
  signMfaPartialToken,
  signGuestToken,
  verifyToken,
} from './jwt.service'
import { config } from '../config'

export class AuthService {
  constructor(
    private readonly staffRepo: StaffRepository,
    private readonly tokenRepo: TokenRepository,
  ) {}

  async login(
    tenantId: string,
    email: string,
    password: string,
  ): Promise<TokenPair | { requiresMfa: true; mfaToken: string }> {
    const staff = await this.staffRepo.findByEmail(tenantId, email)
    if (!staff) throw new InvalidCredentialsError()

    const passwordValid = await argon2.verify(staff.passwordHash, password)
    if (!passwordValid) throw new InvalidCredentialsError()

    if (!staff.isActive) throw new AccountInactiveError()

    if (staff.mfaEnabled) {
      const mfaToken = await signMfaPartialToken({
        sub: staff.id,
        tenantId: staff.tenantId,
        role: staff.role,
      })
      throw new MfaRequiredError(mfaToken)
    }

    return this.issueTokenPair(staff)
  }

  async completeMfaLogin(mfaToken: string): Promise<TokenPair> {
    let payload: Awaited<ReturnType<typeof verifyToken>>
    try {
      payload = await verifyToken(mfaToken)
    } catch {
      throw new InvalidTokenError()
    }

    if (payload.type !== 'mfa_partial') throw new InvalidTokenError()

    const staff = await this.staffRepo.findByIdOrThrow(payload.sub)
    if (!staff.isActive) throw new AccountInactiveError()

    return this.issueTokenPair(staff)
  }

  async refresh(
    refreshToken: string,
  ): Promise<{ accessToken: string }> {
    const stored = await this.tokenRepo.findByToken(refreshToken)
    if (!stored) throw new InvalidTokenError()
    if (stored.revokedAt) throw new TokenRevokedError()
    if (stored.expiresAt < new Date()) throw new InvalidTokenError()

    const staff = await this.staffRepo.findByIdOrThrow(stored.staffId)
    if (!staff.isActive) throw new AccountInactiveError()

    const accessToken = await signAccessToken({
      sub: staff.id,
      tenantId: staff.tenantId,
      role: staff.role,
    })

    return { accessToken }
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenRepo.revoke(refreshToken)
  }

  async issueGuestToken(
    guestId: string,
    tenantId: string,
    reservationId: string,
  ): Promise<string> {
    return signGuestToken(guestId, tenantId, reservationId)
  }

  private async issueTokenPair(staff: Staff): Promise<TokenPair> {
    const accessToken = await signAccessToken({
      sub: staff.id,
      tenantId: staff.tenantId,
      role: staff.role,
    })

    const refreshToken = await this.tokenRepo.store(
      staff.id,
      config.JWT_REFRESH_TOKEN_TTL_DAYS,
    )

    return { accessToken, refreshToken }
  }
}
