export type ReservationStatus =
  | 'tentative'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'no_show'

export interface RatePlan {
  id: string
  tenantId: string
  name: string
  code: string
  description: string | null
  rateMultiplier: number
  minNights: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Reservation {
  id: string
  tenantId: string
  confirmationCode: string
  guestId: string
  roomId: string
  ratePlanId: string | null
  checkInDate: Date
  checkOutDate: Date
  actualCheckIn: Date | null
  actualCheckOut: Date | null
  status: ReservationStatus
  source: string
  channelBookingRef: string | null
  adults: number
  children: number
  ratePerNight: number
  totalAmount: number
  currencyCode: string
  specialRequests: string | null
  internalNotes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface AvailabilityResult {
  roomId: string
  roomNumber: string
  roomTypeId: string
  roomTypeName: string
  floor: number
  isAccessible: boolean
  amenities: string[]
  ratePerNight: number
  totalAmount: number
  currencyCode: string
  nights: number
}

export interface CreateReservationInput {
  tenantId: string
  guestId: string
  roomId: string
  ratePlanId?: string
  checkInDate: Date
  checkOutDate: Date
  adults: number
  children?: number
  ratePerNight: number
  currencyCode: string
  source?: string
  channelBookingRef?: string
  specialRequests?: string
}

export interface AvailabilityQuery {
  tenantId: string
  checkInDate: Date
  checkOutDate: Date
  adults: number
  children?: number
  roomTypeId?: string
  isAccessible?: boolean
}
