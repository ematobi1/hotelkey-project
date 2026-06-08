import { AppError, UnauthorizedError } from '@hotel-key/types'

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('Invalid email or password')
    this.name = 'InvalidCredentialsError'
  }
}

export class AccountInactiveError extends AppError {
  constructor() {
    super('ACCOUNT_INACTIVE', 'This account has been deactivated', 403)
  }
}

export class MfaRequiredError extends AppError {
  constructor(public readonly mfaToken: string) {
    super('MFA_REQUIRED', 'Multi-factor authentication is required', 403)
  }
}

export class InvalidMfaCodeError extends UnauthorizedError {
  constructor() {
    super('Invalid or expired MFA code')
    this.name = 'InvalidMfaCodeError'
  }
}

export class InvalidTokenError extends UnauthorizedError {
  constructor() {
    super('Invalid or expired token')
    this.name = 'InvalidTokenError'
  }
}

export class TokenRevokedError extends UnauthorizedError {
  constructor() {
    super('Token has been revoked')
    this.name = 'TokenRevokedError'
  }
}

export class MfaAlreadyEnabledError extends AppError {
  constructor() {
    super('MFA_ALREADY_ENABLED', 'MFA is already enabled for this account', 409)
  }
}

export { AppError, UnauthorizedError }
