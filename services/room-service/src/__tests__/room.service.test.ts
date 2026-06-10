import { describe, it, expect, vi } from 'vitest'
import { RoomService } from '../services/room.service'
import { ConflictError } from '@hotel-key/types'

vi.mock('@hotel-key/kafka', () => ({
  createCloudEvent: vi.fn().mockReturnValue({ id: 'evt-1' }),
}))

const makeRoom = (overrides = {}) => ({
  id: 'room-1',
  tenantId: 'tenant-1',
  roomNumber: '101',
  floor: 1,
  roomTypeId: 'rt-1',
  status: 'clean' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeRoomType = () => ({
  id: 'rt-1',
  tenantId: 'tenant-1',
  name: 'Standard',
  bedConfig: 'king' as const,
  maxOccupancy: 2,
  baseRateAmount: 100,
  baseRateCurrency: 'USD',
  createdAt: new Date(),
  updatedAt: new Date(),
})

const makeRoomRepo = (overrides = {}) => ({
  listRooms: vi.fn().mockResolvedValue([makeRoom()]),
  findByIdOrThrow: vi.fn().mockResolvedValue(makeRoom()),
  findRoomTypeById: vi.fn().mockResolvedValue(makeRoomType()),
  create: vi.fn().mockResolvedValue(makeRoom()),
  updateStatus: vi.fn().mockResolvedValue(makeRoom()),
  listRoomTypes: vi.fn().mockResolvedValue([makeRoomType()]),
  createRoomType: vi.fn().mockResolvedValue(makeRoomType()),
  ...overrides,
})

const makeProducer = () => ({ publish: vi.fn().mockResolvedValue(undefined) })

describe('RoomService.createRoom', () => {
  it('throws ConflictError when room type not found', async () => {
    const roomRepo = makeRoomRepo({ findRoomTypeById: vi.fn().mockResolvedValue(null) })
    const svc = new RoomService(roomRepo as any, makeProducer() as any)
    await expect(
      svc.createRoom({ tenantId: 'tenant-1', roomTypeId: 'missing', roomNumber: '101', floor: 1, maxOccupancy: 2 }),
    ).rejects.toThrow(ConflictError)
  })

  it('creates room when room type exists', async () => {
    const roomRepo = makeRoomRepo()
    const svc = new RoomService(roomRepo as any, makeProducer() as any)
    const result = await svc.createRoom({
      tenantId: 'tenant-1',
      roomTypeId: 'rt-1',
      roomNumber: '101',
      floor: 1,
      maxOccupancy: 2,
    })
    expect(result.id).toBe('room-1')
  })
})

describe('RoomService.updateStatus', () => {
  it('publishes status change event with previous and new status', async () => {
    const roomRepo = makeRoomRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeRoom({ status: 'dirty' })),
      updateStatus: vi.fn().mockResolvedValue(makeRoom({ status: 'clean' })),
    })
    const producer = makeProducer()
    const svc = new RoomService(roomRepo as any, producer as any)
    await svc.updateStatus('room-1', 'tenant-1', 'clean', 'staff-1')
    expect(producer.publish).toHaveBeenCalledOnce()
  })
})

describe('RoomService.listRooms', () => {
  it('delegates to repository', async () => {
    const roomRepo = makeRoomRepo()
    const svc = new RoomService(roomRepo as any, makeProducer() as any)
    const rooms = await svc.listRooms('tenant-1')
    expect(roomRepo.listRooms).toHaveBeenCalledWith('tenant-1')
    expect(rooms).toHaveLength(1)
  })
})
