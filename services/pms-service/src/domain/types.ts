export type PlanType = 'starter' | 'professional' | 'enterprise'

export interface PropertySettings {
  timezone: string
  currency: string
  checkInTime: string
  checkOutTime: string
  defaultLanguage: string
}

export interface Tenant {
  id: string
  name: string
  slug: string
  planType: PlanType
  settings: PropertySettings
  active: boolean
  createdAt: Date
  updatedAt: Date
}

export interface RoomType {
  id: string
  tenantId: string
  name: string
  bedConfig: string
  maxOccupancy: number
  baseRateAmount: number
  baseRateCurrency: string
  amenities: string[]
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
