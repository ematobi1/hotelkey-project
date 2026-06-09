export { NotFoundError, ConflictError, BadRequestError, AppError } from '@hotel-key/types'

export type ChannelBookingStatus = 'received' | 'processed' | 'failed'

export interface ChannelMapping {
  id: string
  tenantId: string
  hotelKeyRoomTypeId: string
  siteMinderRoomTypeCode: string
  siteMinderRatePlanCode: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateChannelMappingInput {
  tenantId: string
  hotelKeyRoomTypeId: string
  siteMinderRoomTypeCode: string
  siteMinderRatePlanCode: string
}

export interface ChannelBooking {
  id: string
  tenantId: string
  siteMinderBookingId: string
  reservationId: string | null
  rawPayload: Record<string, unknown>
  status: ChannelBookingStatus
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateChannelBookingInput {
  tenantId: string
  siteMinderBookingId: string
  rawPayload: Record<string, unknown>
}
