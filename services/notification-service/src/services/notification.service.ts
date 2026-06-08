import type { Db } from 'mongodb'
import type { Pool } from 'pg'
import type { EmailService } from './email.service'

interface LogEntry {
  tenantId: string
  recipientId?: string
  channel: string
  eventType: string
  templateName?: string
  status: 'pending' | 'sent' | 'failed' | 'skipped'
  providerRef?: string
  errorMessage?: string
  sentAt?: Date
  createdAt: Date
}

export class NotificationService {
  constructor(
    private readonly mongo: Db,
    private readonly pool: Pool,
    private readonly emailService: EmailService,
  ) {}

  private async log(entry: LogEntry): Promise<void> {
    await this.mongo.collection('notification_logs').insertOne({
      ...entry,
      createdAt: new Date(),
    })
  }

  async sendReservationConfirmation(data: {
    tenantId: string
    guestId: string
    guestEmail: string
    guestName: string
    confirmationCode: string
    checkInDate: string
    checkOutDate: string
  }): Promise<void> {
    try {
      const ref = await this.emailService.send({
        to: data.guestEmail,
        subject: `Booking Confirmed — ${data.confirmationCode}`,
        templateName: 'reservation_confirmation',
        templateData: {
          guestName: data.guestName,
          confirmationCode: data.confirmationCode,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
        },
      })

      await this.log({
        tenantId: data.tenantId,
        recipientId: data.guestId,
        channel: 'email',
        eventType: 'hotel-key.reservation.created',
        templateName: 'reservation_confirmation',
        status: 'sent',
        providerRef: ref ?? undefined,
        sentAt: new Date(),
        createdAt: new Date(),
      })
    } catch (err) {
      await this.log({
        tenantId: data.tenantId,
        recipientId: data.guestId,
        channel: 'email',
        eventType: 'hotel-key.reservation.created',
        templateName: 'reservation_confirmation',
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        createdAt: new Date(),
      })
    }
  }

  async sendWelcomeNotification(data: {
    tenantId: string
    guestId: string
    guestEmail: string
    guestName: string
    roomNumber: string
    hotelName: string
  }): Promise<void> {
    try {
      const ref = await this.emailService.send({
        to: data.guestEmail,
        subject: `Welcome to ${data.hotelName}!`,
        templateName: 'welcome',
        templateData: { guestName: data.guestName, hotelName: data.hotelName, roomNumber: data.roomNumber },
      })

      await this.log({
        tenantId: data.tenantId,
        recipientId: data.guestId,
        channel: 'email',
        eventType: 'hotel-key.reservation.checked_in',
        templateName: 'welcome',
        status: 'sent',
        providerRef: ref ?? undefined,
        sentAt: new Date(),
        createdAt: new Date(),
      })
    } catch (err) {
      await this.log({
        tenantId: data.tenantId,
        recipientId: data.guestId,
        channel: 'email',
        eventType: 'hotel-key.reservation.checked_in',
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        createdAt: new Date(),
      })
    }
  }

  async getLog(tenantId: string, limit = 50): Promise<LogEntry[]> {
    return this.mongo
      .collection<LogEntry>('notification_logs')
      .find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()
  }
}
