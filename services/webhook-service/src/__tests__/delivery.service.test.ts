import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeliveryService } from '../services/delivery.service'
import type { WebhookDelivery, WebhookEndpoint } from '../domain/errors'

vi.mock('../config', () => ({
  config: {
    DELIVERY_MAX_RETRIES: 5,
    DELIVERY_TIMEOUT_MS: 10000,
  },
}))

function makeEndpoint(overrides: Partial<WebhookEndpoint> = {}): WebhookEndpoint {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    tenantId: '00000000-0000-0000-0000-000000000002',
    url: 'https://partner.example.com/webhook',
    secret: 'super-secret-key-at-least-16-chars',
    description: null,
    eventTypes: [],
    isActive: true,
    createdAt: new Date('2026-06-09T10:00:00Z'),
    updatedAt: new Date('2026-06-09T10:00:00Z'),
    ...overrides,
  }
}

function makeDelivery(overrides: Partial<WebhookDelivery> = {}): WebhookDelivery {
  return {
    id: '00000000-0000-0000-0000-000000000010',
    endpointId: '00000000-0000-0000-0000-000000000001',
    tenantId: '00000000-0000-0000-0000-000000000002',
    eventType: 'hotel-key.reservation.created',
    eventId: 'evt-abc123',
    payload: { specversion: '1.0', type: 'hotel-key.reservation.created', data: {} },
    status: 'pending',
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    responseStatus: null,
    responseBody: null,
    errorMessage: null,
    createdAt: new Date('2026-06-09T10:00:00Z'),
    ...overrides,
  }
}

const mockRepo = {
  updateDeliverySuccess: vi.fn().mockResolvedValue(undefined),
  updateDeliveryRetry: vi.fn().mockResolvedValue(undefined),
  updateDeliveryFailed: vi.fn().mockResolvedValue(undefined),
  findPendingDeliveriesDue: vi.fn().mockResolvedValue([]),
  createEndpoint: vi.fn(),
  findEndpointById: vi.fn(),
  findEndpointByIdOrThrow: vi.fn(),
  listEndpoints: vi.fn(),
  updateEndpoint: vi.fn(),
  deactivateEndpoint: vi.fn(),
  findActiveEndpointsForEvent: vi.fn(),
  createDelivery: vi.fn(),
  listDeliveries: vi.fn(),
}

describe('DeliveryService', () => {
  let svc: DeliveryService

  beforeEach(() => {
    vi.clearAllMocks()
    svc = new DeliveryService(mockRepo as any)
    vi.stubGlobal('fetch', undefined)
  })

  it('deliver — signs payload and POSTs to endpoint URL on success', async () => {
    const delivery = makeDelivery()
    const endpoint = makeEndpoint()
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => 'OK',
    })
    vi.stubGlobal('fetch', mockFetch)

    await svc.deliver(delivery, endpoint)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(endpoint.url)
    expect((options.headers as Record<string, string>)['X-HotelKey-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect((options.headers as Record<string, string>)['X-HotelKey-Timestamp']).toBeTruthy()
    expect((options.headers as Record<string, string>)['X-HotelKey-Delivery']).toBe(delivery.id)
    expect(mockRepo.updateDeliverySuccess).toHaveBeenCalledWith(delivery.id, 200, 'OK')
    expect(mockRepo.updateDeliveryRetry).not.toHaveBeenCalled()
    expect(mockRepo.updateDeliveryFailed).not.toHaveBeenCalled()
  })

  it('deliver — schedules retry on 5xx response', async () => {
    const delivery = makeDelivery({ attemptCount: 1 })
    const endpoint = makeEndpoint()
    const mockFetch = vi.fn().mockResolvedValue({
      status: 503,
      text: async () => 'Service Unavailable',
    })
    vi.stubGlobal('fetch', mockFetch)

    await svc.deliver(delivery, endpoint)

    expect(mockRepo.updateDeliveryRetry).toHaveBeenCalledOnce()
    const [id, nextRetryAt] = mockRepo.updateDeliveryRetry.mock.calls[0] as [string, Date]
    expect(id).toBe(delivery.id)
    expect(nextRetryAt).toBeInstanceOf(Date)
    expect(nextRetryAt.getTime()).toBeGreaterThan(Date.now())
    expect(mockRepo.updateDeliveryFailed).not.toHaveBeenCalled()
    expect(mockRepo.updateDeliverySuccess).not.toHaveBeenCalled()
  })

  it('deliver — marks failed after max retries exceeded', async () => {
    const delivery = makeDelivery({ attemptCount: 4 })
    const endpoint = makeEndpoint()
    const mockFetch = vi.fn().mockResolvedValue({
      status: 500,
      text: async () => 'Internal Server Error',
    })
    vi.stubGlobal('fetch', mockFetch)

    await svc.deliver(delivery, endpoint)

    expect(mockRepo.updateDeliveryFailed).toHaveBeenCalledOnce()
    expect(mockRepo.updateDeliveryRetry).not.toHaveBeenCalled()
    expect(mockRepo.updateDeliverySuccess).not.toHaveBeenCalled()
  })

  it('deliver — does NOT retry on 4xx response', async () => {
    const delivery = makeDelivery({ attemptCount: 0 })
    const endpoint = makeEndpoint()
    const mockFetch = vi.fn().mockResolvedValue({
      status: 400,
      text: async () => 'Bad Request',
    })
    vi.stubGlobal('fetch', mockFetch)

    await svc.deliver(delivery, endpoint)

    expect(mockRepo.updateDeliveryFailed).toHaveBeenCalledOnce()
    expect(mockRepo.updateDeliveryRetry).not.toHaveBeenCalled()
    expect(mockRepo.updateDeliverySuccess).not.toHaveBeenCalled()
  })
})
