import type { SearchResult } from '../domain/types'
import { ServiceUnavailableError } from '@hotel-key/types'

export class SearchService {
  constructor(
    private readonly reservationServiceUrl: string,
    private readonly roomServiceUrl: string,
  ) {}

  async search(params: {
    tenantId: string
    checkIn: string
    checkOut: string
    adults: number
    children?: number
    roomTypeId?: string
  }): Promise<SearchResult[]> {
    const checkInDate = new Date(params.checkIn)
    const checkOutDate = new Date(params.checkOut)
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86_400_000)

    const qs = new URLSearchParams({
      tenantId: params.tenantId,
      checkInDate: params.checkIn,
      checkOutDate: params.checkOut,
      adults: String(params.adults),
      ...(params.roomTypeId ? { roomTypeId: params.roomTypeId } : {}),
    })

    const res = await fetch(`${this.reservationServiceUrl}/v1/reservations/availability?${qs}`, {
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      throw new ServiceUnavailableError('reservation-service')
    })

    if (!res.ok) throw new ServiceUnavailableError('reservation-service')

    const body = (await res.json()) as { data: Array<{
      roomId: string
      roomNumber: string
      roomTypeId: string
      roomTypeName: string
      floor: number
      maxOccupancy: number
      ratePerNight: number
      currencyCode: string
    }> }

    return body.data.map((r) => ({
      ...r,
      totalAmount: parseFloat((r.ratePerNight * nights).toFixed(2)),
      nights,
    }))
  }

  async verifyAvailability(params: {
    tenantId: string
    checkIn: string
    checkOut: string
    adults: number
    roomId: string
  }): Promise<boolean> {
    const results = await this.search(params)
    return results.some((r) => r.roomId === params.roomId)
  }
}
