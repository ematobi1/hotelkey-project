export interface CloudEvent<T = unknown> {
  specversion: '1.0'
  id: string
  source: string
  type: string
  time: string
  datacontenttype: 'application/json'
  tenantid: string
  data: T
}

export interface ReservationCreatedData {
  reservationId: string
  guestId: string
  roomId: string
  checkInDate: string
  checkOutDate: string
  totalAmount: number
  currencyCode: string
}

export interface ReservationCheckedInData {
  reservationId: string
  guestId: string
  roomId: string
  actualCheckIn: string
}

export interface ReservationCheckedOutData {
  reservationId: string
  guestId: string
  roomId: string
  actualCheckOut: string
}

export interface ReservationCancelledData {
  reservationId: string
  guestId: string
  roomId: string
  reason: string | null
}

export interface ReservationNoShowData {
  reservationId: string
  guestId: string
  roomId: string
}

export interface RoomStatusChangedData {
  roomId: string
  previousStatus: string
  newStatus: string
  changedBy: string | null
}

export interface GuestCreatedData {
  guestId: string
  email: string | null
}

export interface GuestUpdatedData {
  guestId: string
  fields: string[]
}

export interface GuestDeletedData {
  guestId: string
}

export interface HkTaskCreatedData {
  taskId: string
  roomId: string
  taskType: string
  priority: number
}

export interface HkTaskAssignedData {
  taskId: string
  assignedTo: string
}

export interface HkTaskCompletedData {
  taskId: string
  roomId: string
  completedAt: string
}

export interface BillingChargePostedData {
  folioId: string
  lineItemId: string
  amount: number
  chargeType: string
}

export interface BillingPaymentCapturedData {
  folioId: string
  paymentId: string
  amount: number
  currencyCode: string
}

export interface BillingFolioClosedData {
  folioId: string
  reservationId: string
  totalAmount: number
}

export const EventTypes = {
  RESERVATION_CREATED: 'hotel-key.reservation.created',
  RESERVATION_MODIFIED: 'hotel-key.reservation.modified',
  RESERVATION_CANCELLED: 'hotel-key.reservation.cancelled',
  RESERVATION_CHECKED_IN: 'hotel-key.reservation.checked_in',
  RESERVATION_CHECKED_OUT: 'hotel-key.reservation.checked_out',
  RESERVATION_NO_SHOW: 'hotel-key.reservation.no_show',
  ROOM_STATUS_CHANGED: 'hotel-key.room.status_changed',
  ROOM_MAINTENANCE_SCHEDULED: 'hotel-key.room.maintenance_scheduled',
  GUEST_CREATED: 'hotel-key.guest.created',
  GUEST_UPDATED: 'hotel-key.guest.updated',
  GUEST_DELETED: 'hotel-key.guest.deleted',
  HK_TASK_CREATED: 'hotel-key.housekeeping.task_created',
  HK_TASK_ASSIGNED: 'hotel-key.housekeeping.task_assigned',
  HK_TASK_COMPLETED: 'hotel-key.housekeeping.task_completed',
  HK_ROOM_INSPECTED: 'hotel-key.housekeeping.room_inspected',
  BILLING_CHARGE_POSTED: 'hotel-key.billing.charge_posted',
  BILLING_PAYMENT_CAPTURED: 'hotel-key.billing.payment_captured',
  BILLING_FOLIO_CLOSED: 'hotel-key.billing.folio_closed',
  BILLING_REFUND_ISSUED: 'hotel-key.billing.refund_issued',
} as const

export type EventType = (typeof EventTypes)[keyof typeof EventTypes]
