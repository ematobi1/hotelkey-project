export type VipLevel = 0 | 1 | 2 | 3

export interface Guest {
  id: string
  tenantId: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  nationality: string | null
  dateOfBirth: Date | null
  vipLevel: VipLevel
  isBlocked: boolean
  blockReason: string | null
  deletedAt: Date | null
  anonymisedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface GuestPreference {
  guestId: string
  tenantId: string
  roomTypeId: string | null
  floorPreference: number | null
  pillowType: string | null
  dietary: string[]
  otherPreferences: Record<string, unknown>
  updatedAt: Date
}

export interface GuestDocument {
  id: string
  guestId: string
  tenantId: string
  docType: string
  issuingCountry: string | null
  expiryDate: Date | null
  createdAt: Date
}

export interface CreateGuestInput {
  tenantId: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  nationality?: string
  dateOfBirth?: Date
  vipLevel?: VipLevel
}

export interface UpdateGuestInput {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  nationality?: string
  dateOfBirth?: Date
  vipLevel?: VipLevel
}
