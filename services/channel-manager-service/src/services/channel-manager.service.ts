import { NotFoundError } from '../domain/errors'
import type { ChannelMapping, ChannelBooking, ChannelBookingStatus, CreateChannelMappingInput } from '../domain/errors'
import type { ChannelMappingRepository } from '../repositories/channel-mapping.repository'
import type { ChannelBookingRepository } from '../repositories/channel-booking.repository'
import type { SiteMinderClient, SiteMinderBooking } from './siteminder.client'
import type { ReservationClient } from './reservation.client'

interface AvailabilityDate {
  date: string
  available: number
  minStay?: number
}

interface RateDate {
  date: string
  rate: number
  currencyCode: string
}

export class ChannelManagerService {
  constructor(
    private readonly mappingRepo: ChannelMappingRepository,
    private readonly bookingRepo: ChannelBookingRepository,
    private readonly siteMinderClient: SiteMinderClient,
    private readonly reservationClient: ReservationClient,
  ) {}

  async listMappings(tenantId: string): Promise<ChannelMapping[]> {
    return this.mappingRepo.list(tenantId)
  }

  async createMapping(input: CreateChannelMappingInput): Promise<ChannelMapping> {
    return this.mappingRepo.create(input)
  }

  async deleteMapping(id: string, tenantId: string): Promise<void> {
    return this.mappingRepo.deleteById(id, tenantId)
  }

  async pushAvailability(
    tenantId: string,
    roomTypeId: string,
    hotelCode: string,
    dates: AvailabilityDate[],
  ): Promise<void> {
    const mapping = await this.mappingRepo.findByRoomTypeId(tenantId, roomTypeId)
    if (!mapping) throw new NotFoundError('ChannelMapping', roomTypeId)

    await this.siteMinderClient.pushAvailability(hotelCode, mapping.siteMinderRoomTypeCode, dates)
  }

  async pushRates(
    tenantId: string,
    roomTypeId: string,
    hotelCode: string,
    dates: RateDate[],
  ): Promise<void> {
    const mapping = await this.mappingRepo.findByRoomTypeId(tenantId, roomTypeId)
    if (!mapping) throw new NotFoundError('ChannelMapping', roomTypeId)

    await this.siteMinderClient.pushRates(
      hotelCode,
      mapping.siteMinderRoomTypeCode,
      mapping.siteMinderRatePlanCode,
      dates,
    )
  }

  async processIncomingBooking(tenantId: string, smBooking: SiteMinderBooking): Promise<ChannelBooking> {
    const booking = await this.bookingRepo.create({
      tenantId,
      siteMinderBookingId: smBooking.bookingId,
      rawPayload: smBooking as unknown as Record<string, unknown>,
    })

    try {
      const mapping = await this.mappingRepo.findBySiteMinderRoomCode(tenantId, smBooking.roomTypeCode)
      if (!mapping) throw new NotFoundError('ChannelMapping', smBooking.roomTypeCode)

      const { id: reservationId } = await this.reservationClient.createReservation({
        tenantId,
        roomTypeId: mapping.hotelKeyRoomTypeId,
        guestFirstName: smBooking.guestFirstName,
        guestLastName: smBooking.guestLastName,
        guestEmail: smBooking.guestEmail,
        checkInDate: smBooking.checkInDate,
        checkOutDate: smBooking.checkOutDate,
        adults: smBooking.adults,
        children: smBooking.children,
        ratePerNight: smBooking.ratePerNight,
        currencyCode: smBooking.currencyCode,
        specialRequests: smBooking.specialRequests,
        source: 'channel_manager',
      })

      return this.bookingRepo.markProcessed(booking.id, reservationId)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      return this.bookingRepo.markFailed(booking.id, errorMessage)
    }
  }

  async listBookings(tenantId: string, status?: ChannelBookingStatus): Promise<ChannelBooking[]> {
    return this.bookingRepo.list(tenantId, status)
  }
}
