import type { Room, RoomType, RoomStatus, CreateRoomInput, CreateRoomTypeInput } from '@hotel-key/types'
import { ConflictError } from '@hotel-key/types'
import type { RoomRepository } from '../repositories/room.repository'
import type { HotelKeyProducer } from '@hotel-key/kafka'
import { createCloudEvent } from '@hotel-key/kafka'
import { EventTypes } from '@hotel-key/types'

export class RoomService {
  constructor(
    private readonly roomRepo: RoomRepository,
    private readonly producer: HotelKeyProducer,
  ) {}

  async listRooms(tenantId: string): Promise<Room[]> {
    return this.roomRepo.listRooms(tenantId)
  }

  async getRoom(id: string, tenantId: string): Promise<Room> {
    return this.roomRepo.findByIdOrThrow(id, tenantId)
  }

  async createRoom(input: CreateRoomInput): Promise<Room> {
    const roomType = await this.roomRepo.findRoomTypeById(input.roomTypeId, input.tenantId)
    if (!roomType) throw new ConflictError(`Room type '${input.roomTypeId}' not found`)
    return this.roomRepo.create(input)
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: RoomStatus,
    changedBy: string | null = null,
  ): Promise<Room> {
    const previous = await this.roomRepo.findByIdOrThrow(id, tenantId)
    const room = await this.roomRepo.updateStatus(id, tenantId, status)

    await this.producer.publish(
      'hotel-key.room',
      createCloudEvent(EventTypes.ROOM_STATUS_CHANGED, 'room-service', tenantId, {
        roomId: room.id,
        previousStatus: previous.status,
        newStatus: status,
        changedBy,
      }),
    )

    return room
  }

  async listRoomTypes(tenantId: string): Promise<RoomType[]> {
    return this.roomRepo.listRoomTypes(tenantId)
  }

  async createRoomType(input: CreateRoomTypeInput): Promise<RoomType> {
    return this.roomRepo.createRoomType(input)
  }
}
