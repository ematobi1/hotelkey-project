import type { Guest, GuestPreference, CreateGuestInput, UpdateGuestInput } from '@hotel-key/types'
import type { GuestRepository } from '../repositories/guest.repository'
import type { HotelKeyProducer } from '@hotel-key/kafka'
import { createCloudEvent } from '@hotel-key/kafka'
import { EventTypes } from '@hotel-key/types'

export class GuestService {
  constructor(
    private readonly guestRepo: GuestRepository,
    private readonly producer: HotelKeyProducer,
  ) {}

  async createGuest(input: CreateGuestInput): Promise<Guest> {
    const guest = await this.guestRepo.create(input)

    await this.producer.publish(
      'hotel-key.guest',
      createCloudEvent(EventTypes.GUEST_CREATED, 'guest-service', guest.tenantId, {
        guestId: guest.id,
        email: guest.email,
      }),
    )

    return guest
  }

  async getGuest(id: string, tenantId: string): Promise<Guest> {
    return this.guestRepo.findByIdOrThrow(id, tenantId)
  }

  async updateGuest(id: string, tenantId: string, input: UpdateGuestInput): Promise<Guest> {
    const guest = await this.guestRepo.update(id, tenantId, input)

    await this.producer.publish(
      'hotel-key.guest',
      createCloudEvent(EventTypes.GUEST_UPDATED, 'guest-service', tenantId, {
        guestId: guest.id,
        fields: Object.keys(input),
      }),
    )

    return guest
  }

  async deleteGuest(id: string, tenantId: string): Promise<void> {
    await this.guestRepo.findByIdOrThrow(id, tenantId)
    await this.guestRepo.softDelete(id, tenantId)
    await this.guestRepo.anonymise(id, tenantId)

    await this.producer.publish(
      'hotel-key.guest',
      createCloudEvent(EventTypes.GUEST_DELETED, 'guest-service', tenantId, {
        guestId: id,
      }),
    )
  }

  async searchGuests(tenantId: string, query: string): Promise<Guest[]> {
    return this.guestRepo.search(tenantId, query)
  }

  async getPreferences(guestId: string, tenantId: string): Promise<GuestPreference | null> {
    await this.guestRepo.findByIdOrThrow(guestId, tenantId)
    return this.guestRepo.getPreferences(guestId, tenantId)
  }

  async upsertPreferences(
    guestId: string,
    tenantId: string,
    prefs: Partial<Omit<GuestPreference, 'guestId' | 'tenantId' | 'updatedAt'>>,
  ): Promise<GuestPreference> {
    await this.guestRepo.findByIdOrThrow(guestId, tenantId)
    return this.guestRepo.upsertPreferences(guestId, tenantId, prefs)
  }
}
