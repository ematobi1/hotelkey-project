export { NotFoundError, ConflictError, BadRequestError, ValidationError } from '@hotel-key/types'

export type DeliveryStatus = 'pending' | 'delivered' | 'failed'

export interface WebhookEndpoint {
  id: string
  tenantId: string
  url: string
  secret: string
  description: string | null
  eventTypes: string[]
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface WebhookDelivery {
  id: string
  endpointId: string
  tenantId: string
  eventType: string
  eventId: string
  payload: Record<string, unknown>
  status: DeliveryStatus
  attemptCount: number
  lastAttemptAt: Date | null
  nextRetryAt: Date | null
  responseStatus: number | null
  responseBody: string | null
  errorMessage: string | null
  createdAt: Date
}

export interface CreateEndpointInput {
  tenantId: string
  url: string
  secret: string
  description?: string | null
  eventTypes?: string[]
}

export interface UpdateEndpointInput {
  url?: string
  secret?: string
  eventTypes?: string[]
  isActive?: boolean
}

export interface CreateDeliveryInput {
  endpointId: string
  tenantId: string
  eventType: string
  eventId: string
  payload: Record<string, unknown>
}
