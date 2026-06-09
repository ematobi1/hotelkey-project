import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChannelManagerService } from '../services/channel-manager.service'
import { NotFoundError } from '../domain/errors'
import type { ChannelMapping, ChannelBooking } from '../domain/errors'
import type { SiteMinderBooking } from '../services/siteminder.client'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const ROOM_TYPE_ID = '00000000-0000-0000-0000-000000000002'
const BOOKING_ID = '00000000-0000-0000-0000-000000000003'
const RESERVATION_ID = '00000000-0000-0000-0000-000000000004'
const HOTEL_CODE = 'HOTEL_001'

function makeMapping(overrides: Partial<ChannelMapping> = {}): ChannelMapping {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    tenantId: TENANT_ID,
    hotelKeyRoomTypeId: ROOM_TYPE_ID,
    siteMinderRoomTypeCode: 'SM_KING',
    siteMinderRatePlanCode: 'SM_BAR',
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  }
}

function makeBooking(overrides: Partial<ChannelBooking> = {}): ChannelBooking {
  return {
    id: BOOKING_ID,
    tenantId: TENANT_ID,
    siteMinderBookingId: 'SM-BOOKING-999',
    reservationId: null,
    rawPayload: {},
    status: 'received',
    errorMessage: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  }
}

function makeSiteMinderBooking(overrides: Partial<SiteMinderBooking> = {}): SiteMinderBooking {
  return {
    bookingId: 'SM-BOOKING-999',
    guestFirstName: 'Jane',
    guestLastName: 'Doe',
    guestEmail: 'jane.doe@example.com',
    roomTypeCode: 'SM_KING',
    ratePlanCode: 'SM_BAR',
    checkInDate: '2026-07-01',
    checkOutDate: '2026-07-05',
    adults: 2,
    children: 0,
    ratePerNight: 150,
    currencyCode: 'USD',
    ...overrides,
  }
}

const mockMappingRepo = {
  list: vi.fn(),
  create: vi.fn(),
  findByRoomTypeId: vi.fn(),
  findBySiteMinderRoomCode: vi.fn(),
  deleteById: vi.fn(),
}

const mockBookingRepo = {
  create: vi.fn(),
  markProcessed: vi.fn(),
  markFailed: vi.fn(),
  list: vi.fn(),
}

const mockSiteMinderClient = {
  pushAvailability: vi.fn(),
  pushRates: vi.fn(),
  getNewBookings: vi.fn(),
}

const mockReservationClient = {
  createReservation: vi.fn(),
}

describe('ChannelManagerService', () => {
  let svc: ChannelManagerService

  beforeEach(() => {
    vi.clearAllMocks()
    svc = new ChannelManagerService(
      mockMappingRepo as never,
      mockBookingRepo as never,
      mockSiteMinderClient as never,
      mockReservationClient as never,
    )
  })

  it('pushAvailability — finds mapping and calls SiteMinder client with correct args', async () => {
    const mapping = makeMapping()
    mockMappingRepo.findByRoomTypeId.mockResolvedValue(mapping)
    mockSiteMinderClient.pushAvailability.mockResolvedValue(undefined)

    const dates = [{ date: '2026-07-01', available: 5 }]
    await svc.pushAvailability(TENANT_ID, ROOM_TYPE_ID, HOTEL_CODE, dates)

    expect(mockMappingRepo.findByRoomTypeId).toHaveBeenCalledWith(TENANT_ID, ROOM_TYPE_ID)
    expect(mockSiteMinderClient.pushAvailability).toHaveBeenCalledWith(
      HOTEL_CODE,
      mapping.siteMinderRoomTypeCode,
      dates,
    )
  })

  it('pushAvailability — throws NotFoundError when no mapping exists', async () => {
    mockMappingRepo.findByRoomTypeId.mockResolvedValue(null)

    await expect(
      svc.pushAvailability(TENANT_ID, ROOM_TYPE_ID, HOTEL_CODE, []),
    ).rejects.toBeInstanceOf(NotFoundError)

    expect(mockSiteMinderClient.pushAvailability).not.toHaveBeenCalled()
  })

  it('processIncomingBooking — stores booking, calls reservation client, marks processed', async () => {
    const smBooking = makeSiteMinderBooking()
    const mapping = makeMapping()
    const receivedBooking = makeBooking()
    const processedBooking = makeBooking({ status: 'processed', reservationId: RESERVATION_ID })

    mockBookingRepo.create.mockResolvedValue(receivedBooking)
    mockMappingRepo.findBySiteMinderRoomCode.mockResolvedValue(mapping)
    mockReservationClient.createReservation.mockResolvedValue({
      id: RESERVATION_ID,
      confirmationCode: 'CONF-001',
    })
    mockBookingRepo.markProcessed.mockResolvedValue(processedBooking)

    const result = await svc.processIncomingBooking(TENANT_ID, smBooking)

    expect(mockBookingRepo.create).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      siteMinderBookingId: smBooking.bookingId,
      rawPayload: smBooking,
    })
    expect(mockMappingRepo.findBySiteMinderRoomCode).toHaveBeenCalledWith(TENANT_ID, smBooking.roomTypeCode)
    expect(mockReservationClient.createReservation).toHaveBeenCalledOnce()
    expect(mockBookingRepo.markProcessed).toHaveBeenCalledWith(receivedBooking.id, RESERVATION_ID)
    expect(result.status).toBe('processed')
    expect(result.reservationId).toBe(RESERVATION_ID)
  })

  it('processIncomingBooking — stores booking with status=failed when reservation creation throws', async () => {
    const smBooking = makeSiteMinderBooking()
    const mapping = makeMapping()
    const receivedBooking = makeBooking()
    const failedBooking = makeBooking({ status: 'failed', errorMessage: 'reservation-service error' })

    mockBookingRepo.create.mockResolvedValue(receivedBooking)
    mockMappingRepo.findBySiteMinderRoomCode.mockResolvedValue(mapping)
    mockReservationClient.createReservation.mockRejectedValue(new Error('reservation-service error'))
    mockBookingRepo.markFailed.mockResolvedValue(failedBooking)

    const result = await svc.processIncomingBooking(TENANT_ID, smBooking)

    expect(mockBookingRepo.create).toHaveBeenCalledOnce()
    expect(mockBookingRepo.markFailed).toHaveBeenCalledWith(receivedBooking.id, 'reservation-service error')
    expect(mockBookingRepo.markProcessed).not.toHaveBeenCalled()
    expect(result.status).toBe('failed')
  })
})
