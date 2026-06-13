import Redlock from 'redlock'
import Stripe from 'stripe'
import type { CartItem, CheckoutResult, GuestUpsertInput } from '../domain/types'
import type { CartService } from './cart.service'
import type { SearchService } from './search.service'
import { RoomUnavailableError, PaymentFailedError, PendingPaymentNotFoundError, PaymentNotCompletedError } from '../domain/errors'
import { ServiceUnavailableError } from '@hotel-key/types'

export class CheckoutService {
  constructor(
    private readonly cartService: CartService,
    private readonly searchService: SearchService,
    private readonly redlock: Redlock,
    private readonly stripe: Stripe,
    private readonly reservationServiceUrl: string,
    private readonly guestServiceUrl: string,
    private readonly billingServiceUrl: string,
    private readonly pendingTtlSeconds: number,
  ) {}

  async checkout(params: {
    cartId: string
    tenantId: string
    guest: GuestUpsertInput
    stripePaymentMethodId: string
    specialRequests?: string
  }): Promise<CheckoutResult> {
    const cart = await this.cartService.get(params.cartId, params.tenantId)

    const lockKey = `be:room-hold:${cart.roomId}:${cart.checkIn}:${cart.checkOut}`
    const lock = await this.redlock.acquire([lockKey], 15_000).catch(() => {
      throw new RoomUnavailableError()
    })

    let reservationId: string | null = null

    try {
      const available = await this.searchService.verifyAvailability({
        tenantId: params.tenantId,
        checkIn: cart.checkIn,
        checkOut: cart.checkOut,
        adults: cart.adults,
        roomId: cart.roomId,
      })
      if (!available) throw new RoomUnavailableError()

      const guestId = await this.upsertGuest(params.guest)

      const reservation = await this.createReservation({ cart, guestId, specialRequests: params.specialRequests })
      reservationId = reservation.id

      await lock.release()

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(cart.totalAmount * 100),
        currency: cart.currencyCode.toLowerCase(),
        payment_method: params.stripePaymentMethodId,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: {
          reservationId: reservation.id,
          tenantId: params.tenantId,
          cartId: params.cartId,
        },
      })

      if (paymentIntent.status === 'succeeded') {
        const folio = await this.createFolioAndCharge({ reservation, cart, guestId })
        await this.cartService.delete(params.cartId)
        return {
          status: 'confirmed',
          reservationId: reservation.id,
          confirmationCode: reservation.confirmationCode,
          guestId,
          folioId: folio.id,
        }
      }

      if (paymentIntent.status === 'requires_action') {
        await this.cartService.storePendingPayment(
          {
            paymentIntentId: paymentIntent.id,
            reservationId: reservation.id,
            guestId,
            tenantId: params.tenantId,
            cartId: params.cartId,
            totalAmount: cart.totalAmount,
            currencyCode: cart.currencyCode,
            ratePerNight: cart.ratePerNight,
            nights: cart.nights,
          },
          this.pendingTtlSeconds,
        )
        return {
          status: 'pending_payment',
          reservationId: reservation.id,
          guestId,
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret ?? undefined,
        }
      }

      await this.cancelReservation(reservation.id, params.tenantId)
      await this.cartService.delete(params.cartId)
      throw new PaymentFailedError(
        paymentIntent.last_payment_error?.message ?? 'Card declined',
      )
    } catch (err) {
      if (lock.expiration > Date.now()) {
        await lock.release().catch(() => {})
      }
      if (reservationId && err instanceof PaymentFailedError) {
        await this.cancelReservation(reservationId, params.tenantId).catch(() => {})
        await this.cartService.delete(params.cartId).catch(() => {})
      }
      throw err
    }
  }

  async confirm(paymentIntentId: string): Promise<CheckoutResult> {
    const pending = await this.cartService.getPendingPayment(paymentIntentId)
    if (!pending) throw new PendingPaymentNotFoundError()

    const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId)
    if (pi.status !== 'succeeded') throw new PaymentNotCompletedError(pi.status)

    const reservationRes = await fetch(
      `${this.reservationServiceUrl}/v1/reservations/${pending.reservationId}?tenantId=${pending.tenantId}`,
      { signal: AbortSignal.timeout(10_000) },
    ).catch(() => { throw new ServiceUnavailableError('reservation-service') })

    const reservationBody = (await reservationRes.json()) as { data: { id: string; confirmationCode: string } }

    const folio = await this.createFolioAndCharge({
      reservation: {
        id: pending.reservationId,
        confirmationCode: reservationBody.data.confirmationCode,
      },
      cart: {
        tenantId: pending.tenantId,
        ratePerNight: pending.ratePerNight,
        totalAmount: pending.totalAmount,
        currencyCode: pending.currencyCode,
        nights: pending.nights,
      } as CartItem,
      guestId: pending.guestId,
    })

    await Promise.all([
      this.cartService.delete(pending.cartId),
      this.cartService.deletePendingPayment(paymentIntentId),
    ])

    return {
      status: 'confirmed',
      reservationId: pending.reservationId,
      confirmationCode: reservationBody.data.confirmationCode,
      guestId: pending.guestId,
      folioId: folio.id,
    }
  }

  private async upsertGuest(input: GuestUpsertInput): Promise<string> {
    const searchRes = await fetch(
      `${this.guestServiceUrl}/v1/guests/search?tenantId=${input.tenantId}&q=${encodeURIComponent(input.email)}`,
      { signal: AbortSignal.timeout(10_000) },
    ).catch(() => { throw new ServiceUnavailableError('guest-service') })

    if (searchRes.ok) {
      const body = (await searchRes.json()) as { data: Array<{ id: string; email: string }> }
      const existing = body.data.find((g) => g.email === input.email)
      if (existing) return existing.id
    }

    const createRes = await fetch(`${this.guestServiceUrl}/v1/guests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => { throw new ServiceUnavailableError('guest-service') })

    if (!createRes.ok) throw new ServiceUnavailableError('guest-service')
    const created = (await createRes.json()) as { data: { id: string } }
    return created.data.id
  }

  private async createReservation(params: {
    cart: CartItem
    guestId: string
    specialRequests?: string
  }): Promise<{ id: string; confirmationCode: string }> {
    const res = await fetch(`${this.reservationServiceUrl}/v1/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: params.cart.tenantId,
        guestId: params.guestId,
        roomId: params.cart.roomId,
        checkInDate: params.cart.checkIn,
        checkOutDate: params.cart.checkOut,
        adults: params.cart.adults,
        children: params.cart.children,
        ratePerNight: params.cart.ratePerNight,
        currencyCode: params.cart.currencyCode,
        source: 'booking-engine',
        specialRequests: params.specialRequests,
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => { throw new ServiceUnavailableError('reservation-service') })

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
      if (res.status === 409) throw new RoomUnavailableError()
      throw new ServiceUnavailableError(body.error?.message ?? 'reservation-service')
    }

    const body = (await res.json()) as { data: { id: string; confirmationCode: string } }
    return body.data
  }

  private async createFolioAndCharge(params: {
    reservation: { id: string; confirmationCode: string }
    cart: Pick<CartItem, 'tenantId' | 'ratePerNight' | 'totalAmount' | 'currencyCode' | 'nights'>
    guestId: string
  }): Promise<{ id: string }> {
    const folioRes = await fetch(`${this.billingServiceUrl}/v1/billing/folios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: params.reservation.id,
        guestId: params.guestId,
        tenantId: params.cart.tenantId,
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => { throw new ServiceUnavailableError('billing-service') })

    if (!folioRes.ok) throw new ServiceUnavailableError('billing-service')
    const folio = (await folioRes.json()) as { data: { id: string } }

    const chargeRes = await fetch(
      `${this.billingServiceUrl}/v1/billing/folios/${params.reservation.id}/charges`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folioId: folio.data.id,
          tenantId: params.cart.tenantId,
          description: `Accommodation — ${params.cart.nights} night${params.cart.nights !== 1 ? 's' : ''}`,
          chargeType: 'accommodation',
          quantity: params.cart.nights,
          unitAmount: params.cart.ratePerNight,
          idempotencyKey: `accom-${params.reservation.id}`,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    ).catch(() => { throw new ServiceUnavailableError('billing-service') })

    if (!chargeRes.ok) throw new ServiceUnavailableError('billing-service')
    return folio.data
  }

  private async cancelReservation(reservationId: string, tenantId: string): Promise<void> {
    await fetch(`${this.reservationServiceUrl}/v1/reservations/${reservationId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {})
  }
}
