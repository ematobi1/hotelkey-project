import type { RoomTypeRepository } from '../repositories/room-type.repository'
import { NotFoundError } from '../domain/errors'
import type { RoomType } from '../domain/types'

export class RoomTypeService {
  constructor(private readonly roomTypeRepo: RoomTypeRepository) {}

  async getRoomType(id: string): Promise<RoomType> {
    const roomType = await this.roomTypeRepo.findById(id)
    if (!roomType || roomType.deletedAt !== null) throw new NotFoundError('RoomType', id)
    return roomType
  }

  async listRoomTypes(tenantId: string): Promise<RoomType[]> {
    return this.roomTypeRepo.findByTenantId(tenantId)
  }

  async createRoomType(input: {
    tenantId: string
    name: string
    bedConfig: string
    maxOccupancy: number
    baseRateAmount: number
    baseRateCurrency: string
    amenities: string[]
  }): Promise<RoomType> {
    return this.roomTypeRepo.create(input)
  }

  async updateRoomType(
    id: string,
    input: {
      name?: string
      bedConfig?: string
      maxOccupancy?: number
      baseRateAmount?: number
      baseRateCurrency?: string
      amenities?: string[]
    },
  ): Promise<RoomType> {
    const existing = await this.roomTypeRepo.findById(id)
    if (!existing || existing.deletedAt !== null) throw new NotFoundError('RoomType', id)
    const roomType = await this.roomTypeRepo.update(id, input)
    if (!roomType) throw new NotFoundError('RoomType', id)
    return roomType
  }

  async deleteRoomType(id: string): Promise<void> {
    const existing = await this.roomTypeRepo.findById(id)
    if (!existing || existing.deletedAt !== null) throw new NotFoundError('RoomType', id)
    await this.roomTypeRepo.softDelete(id)
  }
}
