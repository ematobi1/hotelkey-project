import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SearchService } from '../services/search.service'

const RESERVATION_URL = 'http://reservation:3003'
const ROOM_URL = 'http://room:3004'

describe('SearchService', () => {
  let searchService: SearchService

  beforeEach(() => {
    searchService = new SearchService(RESERVATION_URL, ROOM_URL)
    vi.restoreAllMocks()
  })

  it('returns search results with computed nights and totalAmount', async () => {
    const mockRooms = [
      {
        roomId: 'r1',
        roomNumber: '101',
        roomTypeId: 'rt1',
        roomTypeName: 'Standard King',
        floor: 1,
        maxOccupancy: 2,
        ratePerNight: 150,
        currencyCode: 'USD',
      },
    ]

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockRooms }),
    } as Response)

    const results = await searchService.search({
      tenantId: '00000000-0000-0000-0000-000000000001',
      checkIn: '2026-07-01',
      checkOut: '2026-07-03',
      adults: 2,
    })

    expect(results).toHaveLength(1)
    expect(results[0].nights).toBe(2)
    expect(results[0].totalAmount).toBe(300)
    expect(results[0].roomId).toBe('r1')
  })

  it('throws ServiceUnavailableError when reservation-service is down', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('connection refused'))

    await expect(
      searchService.search({
        tenantId: '00000000-0000-0000-0000-000000000001',
        checkIn: '2026-07-01',
        checkOut: '2026-07-03',
        adults: 2,
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  })

  it('verifyAvailability returns true when room is in results', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ roomId: 'target-room', roomNumber: '202', roomTypeId: 'rt1', roomTypeName: 'Suite', floor: 2, maxOccupancy: 4, ratePerNight: 300, currencyCode: 'USD' }],
      }),
    } as Response)

    const available = await searchService.verifyAvailability({
      tenantId: '00000000-0000-0000-0000-000000000001',
      checkIn: '2026-07-01',
      checkOut: '2026-07-02',
      adults: 2,
      roomId: 'target-room',
    })

    expect(available).toBe(true)
  })

  it('verifyAvailability returns false when room is not in results', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response)

    const available = await searchService.verifyAvailability({
      tenantId: '00000000-0000-0000-0000-000000000001',
      checkIn: '2026-07-01',
      checkOut: '2026-07-02',
      adults: 2,
      roomId: 'booked-room',
    })

    expect(available).toBe(false)
  })
})
