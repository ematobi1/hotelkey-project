export interface Reservation {
  id: string
  tenantId: string
  guestId: string
  roomId: string
  status: 'tentative' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
  checkInDate: string
  checkOutDate: string
  totalAmount: number
  currencyCode: string
  confirmationCode: string
}

export interface Room {
  id: string
  tenantId: string
  roomNumber: string
  floor: number
  roomTypeId: string
  status: 'clean' | 'dirty' | 'occupied' | 'inspecting' | 'maintenance' | 'out_of_order'
}

export interface HkTask {
  id: string
  tenantId: string
  roomId: string
  taskType: string
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
  assignedTo: string | null
  priority: string
}

export interface WorkOrder {
  id: string
  tenantId: string
  roomId: string | null
  title: string
  category: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
}

export interface CreateWorkOrderInput {
  tenantId: string
  roomId?: string
  title: string
  description: string
  category: string
  priority: string
  reportedBy: string
}

export interface StaffProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  tenantId: string
}
