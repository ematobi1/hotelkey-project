import { config } from '../config'

export interface CreateReservationInput {
  tenantId: string
  roomTypeId: string
  guestFirstName: string
  guestLastName: string
  guestEmail: string
  checkInDate: string
  checkOutDate: string
  adults: number
  children: number
  ratePerNight: number
  currencyCode: string
  specialRequests?: string
  source: 'channel_manager'
}

export interface CreatedReservation {
  id: string
  confirmationCode: string
}

export class ReservationClient {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async createReservation(input: CreateReservationInput): Promise<CreatedReservation> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/v1/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`reservation-service createReservation failed ${response.status}: ${text}`)
    }

    const body = await response.json() as { data: CreatedReservation }
    return body.data
  }
}

export const reservationClient = new ReservationClient(config.RESERVATION_SERVICE_URL)
