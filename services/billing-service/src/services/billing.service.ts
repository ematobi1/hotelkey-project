import Stripe from 'stripe'
import type { Folio, FolioLineItem, Payment, PostChargeInput, CapturePaymentInput } from '@hotel-key/types'
import { ConflictError, NotFoundError } from '@hotel-key/types'
import type { FolioRepository } from '../repositories/folio.repository'
import type { HotelKeyProducer } from '@hotel-key/kafka'
import { createCloudEvent } from '@hotel-key/kafka'
import { EventTypes } from '@hotel-key/types'
import { Pool } from 'pg'

export class BillingService {
  private readonly stripe: Stripe

  constructor(
    private readonly folioRepo: FolioRepository,
    private readonly producer: HotelKeyProducer,
    private readonly pool: Pool,
    stripeSecretKey: string,
  ) {
    this.stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-04-10' })
  }

  async createFolio(reservationId: string, guestId: string, tenantId: string): Promise<Folio> {
    return this.folioRepo.createForReservation(reservationId, guestId, tenantId)
  }

  async getFolioByReservation(
    reservationId: string,
  ): Promise<{ folio: Folio; lineItems: FolioLineItem[] }> {
    const folio = await this.folioRepo.findByReservationId(reservationId)
    if (!folio) throw new NotFoundError('Folio for reservation', reservationId)
    const lineItems = await this.folioRepo.listLineItems(folio.id)
    return { folio, lineItems }
  }

  async postCharge(input: PostChargeInput): Promise<FolioLineItem> {
    const folio = await this.folioRepo.findByIdOrThrow(input.folioId)
    if (folio.status !== 'open') {
      throw new ConflictError('Cannot post charge to a closed folio')
    }

    const lineItem = await this.folioRepo.postCharge(input)

    await this.producer.publish(
      'hotel-key.billing',
      createCloudEvent(EventTypes.BILLING_CHARGE_POSTED, 'billing-service', input.tenantId, {
        folioId: input.folioId,
        lineItemId: lineItem.id,
        amount: lineItem.totalAmount,
        chargeType: lineItem.chargeType,
      }),
    )

    return lineItem
  }

  async voidCharge(
    lineItemId: string,
    folioId: string,
    reason: string,
  ): Promise<void> {
    const folio = await this.folioRepo.findByIdOrThrow(folioId)
    if (folio.status !== 'open') {
      throw new ConflictError('Cannot void charge on a closed folio')
    }
    await this.folioRepo.voidCharge(lineItemId, folioId, reason)
  }

  async capturePayment(input: CapturePaymentInput): Promise<Payment> {
    const folio = await this.folioRepo.findByIdOrThrow(input.folioId)

    const paymentIntent = await this.stripe.paymentIntents.create(
      {
        amount: Math.round(input.amount * 100),
        currency: input.currencyCode.toLowerCase(),
        payment_method: input.stripePaymentMethodId,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      },
      { idempotencyKey: input.idempotencyKey },
    )

    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO payment (folio_id, tenant_id, provider, provider_ref, amount, currency_code, status, captured_at)
       VALUES ($1, $2, 'stripe', $3, $4, $5, 'captured', NOW())
       RETURNING id, folio_id, tenant_id, provider, provider_ref, amount, currency_code, status, captured_at, refunded_at, created_at, updated_at`,
      [input.folioId, input.tenantId, paymentIntent.id, input.amount, input.currencyCode],
    )

    const payment = rows[0]!

    await this.producer.publish(
      'hotel-key.billing',
      createCloudEvent(EventTypes.BILLING_PAYMENT_CAPTURED, 'billing-service', input.tenantId, {
        folioId: input.folioId,
        paymentId: payment['id'] as string,
        amount: input.amount,
        currencyCode: input.currencyCode,
      }),
    )

    return {
      id: payment['id'] as string,
      folioId: payment['folio_id'] as string,
      tenantId: payment['tenant_id'] as string,
      provider: 'stripe',
      providerRef: payment['provider_ref'] as string,
      amount: parseFloat(payment['amount'] as string),
      currencyCode: payment['currency_code'] as string,
      status: 'captured',
      capturedAt: payment['captured_at'] as Date,
      refundedAt: null,
      createdAt: payment['created_at'] as Date,
      updatedAt: payment['updated_at'] as Date,
    }
  }

  async closeFolioForCheckout(reservationId: string): Promise<Folio> {
    const folio = await this.folioRepo.findByReservationId(reservationId)
    if (!folio) throw new NotFoundError('Folio for reservation', reservationId)

    const closed = await this.folioRepo.closeFolio(folio.id)
    const lineItems = await this.folioRepo.listLineItems(folio.id)
    const totalAmount = lineItems.reduce((sum, li) => sum + li.totalAmount, 0)

    await this.producer.publish(
      'hotel-key.billing',
      createCloudEvent(EventTypes.BILLING_FOLIO_CLOSED, 'billing-service', folio.tenantId, {
        folioId: folio.id,
        reservationId,
        totalAmount,
      }),
    )

    return closed
  }
}
