import { AppError } from '@hotel-key/types'

export class CartNotFoundError extends AppError {
  constructor() {
    super('CART_NOT_FOUND', 'Cart not found or has expired', 404)
  }
}

export class RoomUnavailableError extends AppError {
  constructor() {
    super('ROOM_UNAVAILABLE', 'Room is no longer available for the selected dates', 409)
  }
}

export class PaymentFailedError extends AppError {
  constructor(detail = 'Payment could not be processed') {
    super('PAYMENT_FAILED', detail, 402)
  }
}

export class PendingPaymentNotFoundError extends AppError {
  constructor() {
    super('PENDING_PAYMENT_NOT_FOUND', 'No pending payment found for this payment intent', 404)
  }
}

export class PaymentNotCompletedError extends AppError {
  constructor(stripeStatus: string) {
    super('PAYMENT_NOT_COMPLETED', `Payment status is '${stripeStatus}' — cannot confirm booking`, 402)
  }
}
