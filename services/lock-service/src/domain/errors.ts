import { AppError } from '@hotel-key/types'

export { NotFoundError, ConflictError, BadRequestError } from '@hotel-key/types'

export class AssaAbloyError extends AppError {
  constructor(message: string) {
    super('ASSA_ABLOY_ERROR', message, 502)
  }
}

export interface Lock {
  id: string
  tenantId: string
  roomId: string
  assaAbloyLockId: string
  label: string
  createdAt: Date
  updatedAt: Date
}

export interface LockCredential {
  id: string
  tenantId: string
  lockId: string
  reservationId: string
  guestId: string
  assaAbloyCredentialId: string
  validFrom: Date
  validUntil: Date
  revokedAt: Date | null
  createdAt: Date
}

export interface CreateCredentialInput {
  tenantId: string
  lockId: string
  reservationId: string
  guestId: string
  assaAbloyCredentialId: string
  validFrom: Date
  validUntil: Date
}
