export { NotFoundError, ConflictError, BadRequestError } from '@hotel-key/types'

export type WorkOrderStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'urgent'
export type WorkOrderCategory = 'plumbing' | 'electrical' | 'hvac' | 'furniture' | 'cleaning' | 'safety' | 'other'

export interface WorkOrder {
  id: string
  tenantId: string
  roomId: string | null
  title: string
  description: string
  category: WorkOrderCategory
  priority: WorkOrderPriority
  status: WorkOrderStatus
  assignedTo: string | null
  reportedBy: string
  completedAt: Date | null
  dueAt: Date | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateWorkOrderInput {
  tenantId: string
  roomId?: string | null
  title: string
  description: string
  category: WorkOrderCategory
  priority: WorkOrderPriority
  reportedBy: string
  dueAt?: Date | null
}

export interface ListWorkOrdersFilters {
  tenantId: string
  status?: WorkOrderStatus
  priority?: WorkOrderPriority
  roomId?: string
  assignedTo?: string
}
