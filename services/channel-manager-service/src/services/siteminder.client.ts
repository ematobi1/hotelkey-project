import { config } from '../config'

export interface SiteMinderBooking {
  bookingId: string
  guestFirstName: string
  guestLastName: string
  guestEmail: string
  roomTypeCode: string
  ratePlanCode: string
  checkInDate: string   // YYYY-MM-DD
  checkOutDate: string  // YYYY-MM-DD
  adults: number
  children: number
  ratePerNight: number
  currencyCode: string
  specialRequests?: string
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0

  while (true) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeout)

      if (response.ok) return response
      if (response.status >= 400 && response.status < 500) return response

      attempt++
      if (attempt >= maxRetries) return response

      const delay = Math.pow(2, attempt) * 100 + Math.random() * 100
      await sleep(delay)
    } catch (err) {
      clearTimeout(timeout)
      attempt++
      if (attempt >= maxRetries) throw err

      const delay = Math.pow(2, attempt) * 100 + Math.random() * 100
      await sleep(delay)
    }
  }
}

function makeHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.SITEMINDER_API_KEY}`,
  }
}

export class SiteMinderClient {
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async pushAvailability(
    hotelCode: string,
    roomTypeCode: string,
    dates: AvailabilityDate[],
  ): Promise<void> {
    const url = `${this.baseUrl}/hotels/${hotelCode}/rooms/${roomTypeCode}/availability`
    const response = await fetchWithRetry(url, {
      method: 'PUT',
      headers: makeHeaders(),
      body: JSON.stringify({ dates }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`SiteMinder pushAvailability failed ${response.status}: ${text}`)
    }
  }

  async pushRates(
    hotelCode: string,
    roomTypeCode: string,
    ratePlanCode: string,
    dates: RateDate[],
  ): Promise<void> {
    const url = `${this.baseUrl}/hotels/${hotelCode}/rooms/${roomTypeCode}/rate-plans/${ratePlanCode}/rates`
    const response = await fetchWithRetry(url, {
      method: 'PUT',
      headers: makeHeaders(),
      body: JSON.stringify({ dates }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`SiteMinder pushRates failed ${response.status}: ${text}`)
    }
  }

  async getNewBookings(hotelCode: string, since?: Date): Promise<SiteMinderBooking[]> {
    const sinceParam = since ? `?since=${since.toISOString()}` : ''
    const url = `${this.baseUrl}/hotels/${hotelCode}/bookings${sinceParam}`
    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers: makeHeaders(),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`SiteMinder getNewBookings failed ${response.status}: ${text}`)
    }

    const data = await response.json() as { bookings: SiteMinderBooking[] }
    return data.bookings
  }
}

export const siteMinderClient = new SiteMinderClient(config.SITEMINDER_API_BASE_URL)
