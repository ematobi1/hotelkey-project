import { describe, it, expect, vi } from 'vitest'
import { NotificationService } from '../services/notification.service'

const makeEmailService = (overrides = {}) => ({
  send: vi.fn().mockResolvedValue('msg-id-123'),
  ...overrides,
})

const makeMongo = () => {
  const insertOne = vi.fn().mockResolvedValue({ insertedId: 'log-1' })
  return {
    collection: vi.fn().mockReturnValue({ insertOne }),
    insertOne,
  }
}

const makePool = () => ({ query: vi.fn() })

describe('NotificationService.sendReservationConfirmation', () => {
  it('sends email and logs sent status on success', async () => {
    const mongo = makeMongo()
    const emailService = makeEmailService()
    const svc = new NotificationService(mongo as any, makePool() as any, emailService as any)

    await svc.sendReservationConfirmation({
      tenantId: 'tenant-1',
      guestId: 'guest-1',
      guestEmail: 'guest@hotel.com',
      guestName: 'Jane Doe',
      confirmationCode: 'CONF123',
      checkInDate: '2026-07-01',
      checkOutDate: '2026-07-05',
    })

    expect(emailService.send).toHaveBeenCalledOnce()
    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'guest@hotel.com', templateName: 'reservation_confirmation' }),
    )
    expect(mongo.collection('notification_logs').insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', providerRef: 'msg-id-123' }),
    )
  })

  it('logs failed status when email send throws — does not rethrow', async () => {
    const mongo = makeMongo()
    const emailService = makeEmailService({ send: vi.fn().mockRejectedValue(new Error('SES down')) })
    const svc = new NotificationService(mongo as any, makePool() as any, emailService as any)

    await expect(
      svc.sendReservationConfirmation({
        tenantId: 'tenant-1',
        guestId: 'guest-1',
        guestEmail: 'guest@hotel.com',
        guestName: 'Jane Doe',
        confirmationCode: 'CONF123',
        checkInDate: '2026-07-01',
        checkOutDate: '2026-07-05',
      }),
    ).resolves.toBeUndefined()

    expect(mongo.collection('notification_logs').insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorMessage: 'SES down' }),
    )
  })
})

describe('NotificationService.sendWelcomeNotification', () => {
  it('sends email and logs sent status', async () => {
    const mongo = makeMongo()
    const emailService = makeEmailService()
    const svc = new NotificationService(mongo as any, makePool() as any, emailService as any)

    await svc.sendWelcomeNotification({
      tenantId: 'tenant-1',
      guestId: 'guest-1',
      guestEmail: 'guest@hotel.com',
      guestName: 'Jane Doe',
      roomNumber: '101',
      hotelName: 'Grand Hotel',
    })

    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: 'welcome', to: 'guest@hotel.com' }),
    )
    expect(mongo.collection('notification_logs').insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent' }),
    )
  })
})
