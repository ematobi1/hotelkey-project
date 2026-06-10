export type FolioStatus = 'open' | 'closed' | 'disputed'

export type ChargeType =
  | 'accommodation'
  | 'food_beverage'
  | 'spa'
  | 'tax'
  | 'fee'
  | 'minibar'
  | 'parking'
  | 'other'

export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'refunded'
  | 'failed'
  | 'cancelled'

export interface Folio {
  id: string
  tenantId: string
  reservationId: string
  guestId: string
  status: FolioStatus
  closedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface FolioLineItem {
  id: string
  folioId: string
  tenantId: string
  description: string
  chargeType: ChargeType
  quantity: number
  unitAmount: number
  totalAmount: number
  taxAmount: number
  postedAt: Date
  postedBy: string | null
  voidedAt: Date | null
  voidReason: string | null
  idempotencyKey: string | null
}

export interface Payment {
  id: string
  folioId: string
  tenantId: string
  provider: 'stripe'
  providerRef: string
  amount: number
  currencyCode: string
  status: PaymentStatus
  capturedAt: Date | null
  refundedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface PostChargeInput {
  folioId: string
  tenantId: string
  description: string
  chargeType: ChargeType
  quantity: number
  unitAmount: number
  taxAmount?: number
  postedBy?: string
  idempotencyKey?: string
}

export interface CapturePaymentInput {
  folioId: string
  tenantId: string
  amount: number
  currencyCode: string
  stripePaymentMethodId: string
  idempotencyKey: string
}
