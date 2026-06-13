export interface CartItem {
  cartId: string
  tenantId: string
  roomId: string
  roomTypeId: string
  roomTypeName: string
  checkIn: string
  checkOut: string
  adults: number
  children: number
  ratePerNight: number
  totalAmount: number
  currencyCode: string
  nights: number
  createdAt: string
}

export interface RoomAvailabilityResult {
  roomId: string
  roomNumber: string
  roomTypeId: string
  roomTypeName: string
  floor: number
  maxOccupancy: number
  ratePerNight: number
  currencyCode: string
}

export interface SearchResult extends RoomAvailabilityResult {
  totalAmount: number
  nights: number
}

export interface CheckoutResult {
  status: 'confirmed' | 'pending_payment'
  reservationId: string
  confirmationCode?: string
  guestId: string
  folioId?: string
  paymentIntentId?: string
  clientSecret?: string
}

export interface PendingPaymentState {
  paymentIntentId: string
  reservationId: string
  guestId: string
  tenantId: string
  cartId: string
  totalAmount: number
  currencyCode: string
  ratePerNight: number
  nights: number
}

export interface GuestUpsertInput {
  tenantId: string
  firstName: string
  lastName: string
  email: string
  phone?: string
}
