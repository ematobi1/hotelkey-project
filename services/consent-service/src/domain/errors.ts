export { NotFoundError, ConflictError, BadRequestError, ServiceUnavailableError } from '@hotel-key/types'

export type ConsentPurpose = 'essential' | 'marketing' | 'analytics' | 'personalisation' | 'third_party'
export type ConsentStatus = 'granted' | 'revoked'

export interface ConsentRecord {
  id: string
  guestIdHash: string
  tenantId: string
  purpose: string
  action: ConsentStatus
  timestamp: string
  grantedBy: string
  transactionId: string
}

export interface ConsentCacheRow {
  id: string
  tenantId: string
  guestId: string
  guestIdHash: string
  purpose: ConsentPurpose
  status: ConsentStatus
  txId: string | null
  recordedAt: Date
  createdAt: Date
}

export const VALID_PURPOSES: ConsentPurpose[] = [
  'essential',
  'marketing',
  'analytics',
  'personalisation',
  'third_party',
]
