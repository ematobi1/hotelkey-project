import type { HotelKeyConsumer } from '@hotel-key/kafka'
import { createLogger } from '@hotel-key/logger'
import type { LockService } from '../services/lock.service'
import type { LockRepository } from '../repositories/lock.repository'
import { config } from '../config'

interface CheckedInEventData {
  reservationId: string
  guestId: string
  roomId: string
  guestEmail?: string
  checkOutDate: string
  tenantId: string
}

interface CheckedOutEventData {
  reservationId: string
  tenantId: string
}

const logger = createLogger({ service: 'lock-service', level: config.LOG_LEVEL })

const TOPIC = 'hotel-key.reservation'

export class ReservationConsumer {
  constructor(
    private readonly consumer: HotelKeyConsumer,
    private readonly lockService: LockService,
    private readonly lockRepo: LockRepository,
  ) {}

  async start(): Promise<void> {
    await this.consumer.subscribe([
      {
        topic: TOPIC,
        handler: async (event) => {
          if (event.type === 'hotel-key.reservation.checked_in') {
            await this.handleCheckedIn(event.data as CheckedInEventData)
          } else if (event.type === 'hotel-key.reservation.checked_out') {
            await this.handleCheckedOut(event.data as CheckedOutEventData)
          }
        },
      },
    ])
  }

  async close(): Promise<void> {
    await this.consumer.close()
  }

  private async handleCheckedIn(data: CheckedInEventData): Promise<void> {
    const { reservationId, guestId, roomId, guestEmail, checkOutDate, tenantId } = data

    try {
      const credential = await this.lockService.issueMobileKey(
        tenantId,
        reservationId,
        guestId,
        guestEmail ?? '',
        roomId,
        new Date(),
        new Date(checkOutDate),
      )
      logger.info({ credentialId: credential.id, reservationId }, 'Mobile key issued')
    } catch (err) {
      logger.error({ err, reservationId, roomId }, 'Failed to issue mobile key on check-in')
    }
  }

  private async handleCheckedOut(data: CheckedOutEventData): Promise<void> {
    const { reservationId, tenantId } = data

    try {
      const credential = await this.lockRepo.findCredentialByReservationId(reservationId)
      if (!credential) {
        logger.info({ reservationId }, 'No active credential found for checked-out reservation')
        return
      }
      if (credential.revokedAt) {
        logger.info({ reservationId, credentialId: credential.id }, 'Credential already revoked')
        return
      }
      await this.lockService.revokeKey(credential.id, tenantId)
      logger.info({ credentialId: credential.id, reservationId }, 'Mobile key revoked on check-out')
    } catch (err) {
      logger.error({ err, reservationId }, 'Failed to revoke mobile key on check-out')
    }
  }
}
