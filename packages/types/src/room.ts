export type RoomStatus =
  | 'clean'
  | 'dirty'
  | 'occupied'
  | 'inspecting'
  | 'maintenance'
  | 'out_of_order'

export interface RoomType {
  id: string
  tenantId: string
  name: string
  description: string | null
  baseRate: number
  currencyCode: string
  maxOccupancy: number
  bedConfig: BedConfig[]
  sizeSqm: number | null
  images: string[]
  createdAt: Date
  updatedAt: Date
}

export interface BedConfig {
  type: 'king' | 'queen' | 'double' | 'twin' | 'single' | 'sofa'
  count: number
}

export interface Room {
  id: string
  tenantId: string
  roomNumber: string
  floor: number
  wing: string | null
  roomTypeId: string
  status: RoomStatus
  amenities: string[]
  maxOccupancy: number
  isAccessible: boolean
  notes: string | null
  lastMaintenanceDate: Date | null
  nextMaintenanceDue: Date | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface MaintenanceTicket {
  id: string
  tenantId: string
  roomId: string
  issue: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  reportedBy: string
  assignedTo: string | null
  resolvedAt: Date | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateRoomInput {
  tenantId: string
  roomNumber: string
  floor: number
  wing?: string
  roomTypeId: string
  amenities?: string[]
  maxOccupancy: number
  isAccessible?: boolean
  notes?: string
}

export interface CreateRoomTypeInput {
  tenantId: string
  name: string
  description?: string
  baseRate: number
  currencyCode: string
  maxOccupancy: number
  bedConfig: BedConfig[]
  sizeSqm?: number
}
