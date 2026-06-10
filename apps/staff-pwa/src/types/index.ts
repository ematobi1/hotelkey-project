export type HkTaskType =
  | 'departure_clean'
  | 'stay_over_clean'
  | 'turn_down'
  | 'inspection'
  | 'deep_clean'
  | 'maintenance_prep'
  | 'amenity_restock'

export type HkTaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'skipped'

export type HkPriority = 1 | 2 | 3

export interface HkTask {
  id: string
  tenantId: string
  roomId: string
  reservationId: string | null
  taskType: HkTaskType
  status: HkTaskStatus
  priority: HkPriority
  assignedTo: string | null
  dueAt: string | null
  startedAt: string | null
  completedAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type WorkOrderStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'

export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface WorkOrder {
  id: string
  tenantId: string
  roomId: string | null
  title: string
  description: string
  category: string
  priority: WorkOrderPriority
  status: WorkOrderStatus
  assignedTo: string | null
  dueAt: string | null
  notes: string | null
  reportedBy: string
  createdAt: string
  updatedAt: string
}

export interface StaffProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  tenantId: string
}
