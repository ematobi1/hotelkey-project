export { NotFoundError, ConflictError, BadRequestError, AppError } from '@hotel-key/types'

export interface PiiRecord {
  id: string
  tenantId: string
  guestId: string
  fieldName: string
  encryptedValue: string
  iv: string
  authTag: string
  keyVersion: number
  createdAt: Date
}
