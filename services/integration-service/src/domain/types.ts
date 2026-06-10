export type IntegrationCategory =
  | 'pos'
  | 'lock'
  | 'channel_manager'
  | 'guest_messaging'
  | 'upselling'
  | 'rms'
  | 'analytics'
  | 'sustainability'

export interface AvailabilityData {
  hotelId: string
  roomTypeId: string
  date: string
  available: number
}

export interface RatesData {
  hotelId: string
  roomTypeId: string
  date: string
  rate: number
  currencyCode: string
}

export interface BookingData {
  externalId: string
  guestName: string
  email: string | null
  phone: string | null
  roomTypeId: string
  checkIn: string
  checkOut: string
  totalAmount: number
  currencyCode: string
}

export interface ChargeData {
  chargeId: string
  guestId: string
  amount: number
  currencyCode: string
  description: string
  postedAt: string
}

export interface RateRecommendation {
  date: string
  recommendedRate: number
  currencyCode: string
  confidence: number
}

export interface AnalyticsData {
  hotelId: string
  period: string
  occupancyRate: number
  revpar: number
  adr: number
  totalRevenue: number
}

export interface SustainabilityMetrics {
  hotelId: string
  period: string
  energyKwh?: number
  waterLitres?: number
  foodWasteKg?: number
  co2Kg?: number
}

export interface IntegrationAdapter {
  readonly name: string
  readonly category: IntegrationCategory
  sendAvailability?(data: AvailabilityData): Promise<void>
  sendRates?(data: RatesData): Promise<void>
  receiveBooking?(raw: unknown): Promise<BookingData>
  sendMessage?(guestId: string, message: string): Promise<void>
  syncCharges?(charges: ChargeData[]): Promise<void>
  getRateRecommendations?(hotelId: string, date: string): Promise<RateRecommendation[]>
  pushAnalytics?(data: AnalyticsData): Promise<void>
  getSustainabilityData?(hotelId: string): Promise<SustainabilityMetrics>
  issueKey?(reservationId: string, roomId: string): Promise<{ keyCode: string }>
  revokeKey?(reservationId: string, roomId: string): Promise<void>
  sendUpsellOffers?(guestId: string, offers: string[]): Promise<void>
  sendRoomUpgrade?(guestId: string, upgradeRoomId: string): Promise<void>
}

export interface IntegrationConfig {
  id: string
  tenantId: string
  integrationName: string
  category: string
  isActive: boolean
  config: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface IntegrationEventLog {
  id: string
  tenantId: string
  integrationName: string
  eventType: string
  direction: 'inbound' | 'outbound'
  status: 'success' | 'failed'
  payload: Record<string, unknown> | null
  errorMessage: string | null
  createdAt: Date
}
