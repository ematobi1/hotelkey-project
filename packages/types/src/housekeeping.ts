export type HkTaskType =
  | 'departure_clean'
  | 'stay_over_clean'
  | 'turn_down'
  | 'inspection'
  | 'deep_clean'
  | 'maintenance_prep'
  | 'amenity_restock'

export type HkTaskStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'skipped'

export type HkPriority = 1 | 2 | 3

export type HkStaffStatus = 'available' | 'busy' | 'off_duty'

export interface HkTask {
  id: string
  tenantId: string
  roomId: string
  reservationId: string | null
  taskType: HkTaskType
  status: HkTaskStatus
  priority: HkPriority
  assignedTo: string | null
  dueAt: Date | null
  startedAt: Date | null
  completedAt: Date | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface HkStaff {
  id: string
  tenantId: string
  firstName: string
  lastName: string
  currentFloor: number | null
  shiftStart: string
  shiftEnd: string
  status: HkStaffStatus
  createdAt: Date
  updatedAt: Date
}

export interface HkInspection {
  id: string
  taskId: string
  tenantId: string
  passed: boolean
  notes: string | null
  inspectorId: string
  inspectedAt: Date
}

export interface CreateHkTaskInput {
  tenantId: string
  roomId: string
  reservationId?: string
  taskType: HkTaskType
  priority?: HkPriority
  dueAt?: Date
  notes?: string
}
