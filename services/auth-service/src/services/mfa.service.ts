import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import type { MfaSetupResult } from '@hotel-key/types'
import type { MfaRepository } from '../repositories/mfa.repository'
import type { StaffRepository } from '../repositories/staff.repository'
import {
  InvalidMfaCodeError,
  MfaAlreadyEnabledError,
} from '../domain/errors'

export class MfaService {
  constructor(
    private readonly mfaRepo: MfaRepository,
    private readonly staffRepo: StaffRepository,
  ) {}

  async setup(staffId: string, email: string, tenantId: string): Promise<MfaSetupResult> {
    const staff = await this.staffRepo.findByIdOrThrow(staffId)
    if (staff.mfaEnabled) throw new MfaAlreadyEnabledError()

    const secret = authenticator.generateSecret()
    await this.mfaRepo.upsertSecret(staffId, secret)

    const otpauthUrl = authenticator.keyuri(
      email,
      `HotelKey (${tenantId})`,
      secret,
    )
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl)

    return { secret, qrCodeUrl }
  }

  async verify(staffId: string, code: string): Promise<void> {
    const stored = await this.mfaRepo.getSecret(staffId)
    if (!stored) throw new InvalidMfaCodeError()

    const isValid = authenticator.check(code, stored.secret)
    if (!isValid) throw new InvalidMfaCodeError()

    await this.mfaRepo.markVerified(staffId)
    await this.staffRepo.setMfaEnabled(staffId, true)
  }

  async validateCode(staffId: string, code: string): Promise<void> {
    const stored = await this.mfaRepo.getSecret(staffId)
    if (!stored || !stored.isVerified) throw new InvalidMfaCodeError()

    const isValid = authenticator.check(code, stored.secret)
    if (!isValid) throw new InvalidMfaCodeError()
  }
}
