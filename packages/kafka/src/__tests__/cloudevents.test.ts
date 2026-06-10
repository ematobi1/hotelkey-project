import { describe, it, expect } from 'vitest'
import { createCloudEvent } from '../cloudevents'

describe('createCloudEvent', () => {
  it('produces a valid CloudEvents 1.0 envelope', () => {
    const event = createCloudEvent(
      'hotel-key.reservation.created',
      'reservation-service',
      'tenant-1',
      { reservationId: 'r1' },
    )

    expect(event.specversion).toBe('1.0')
    expect(event.type).toBe('hotel-key.reservation.created')
    expect(event.source).toBe('reservation-service')
    expect(event.tenantid).toBe('tenant-1')
    expect(event.datacontenttype).toBe('application/json')
    expect(event.data).toEqual({ reservationId: 'r1' })
    expect(typeof event.id).toBe('string')
    expect(event.id.length).toBeGreaterThan(0)
    expect(typeof event.time).toBe('string')
    expect(new Date(event.time).getTime()).not.toBeNaN()
  })

  it('generates a unique id per call', () => {
    const a = createCloudEvent('type', 'src', 'tenant', {})
    const b = createCloudEvent('type', 'src', 'tenant', {})
    expect(a.id).not.toBe(b.id)
  })
})
