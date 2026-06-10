import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IntegrationService } from '../services/integration.service'
import type { IntegrationAdapter, IntegrationConfig } from '../domain/types'

function makeConfig(name: string, overrides: Partial<IntegrationConfig> = {}): IntegrationConfig {
  return {
    id: `00000000-0000-0000-0000-00000000000${name.length}`,
    tenantId: '00000000-0000-0000-0000-000000000002',
    integrationName: name,
    category: 'pos',
    isActive: true,
    config: {},
    createdAt: new Date('2026-06-09T10:00:00Z'),
    updatedAt: new Date('2026-06-09T10:00:00Z'),
    ...overrides,
  }
}

function makeAdapter(name: string, methods: Partial<IntegrationAdapter> = {}): IntegrationAdapter {
  return {
    name,
    category: 'pos',
    ...methods,
  }
}

const mockRepo = {
  upsertConfig: vi.fn(),
  findActiveForTenant: vi.fn(),
  findByNameOrThrow: vi.fn(),
  deactivate: vi.fn(),
  logEvent: vi.fn().mockResolvedValue(undefined),
  listEventLog: vi.fn(),
}

describe('IntegrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('executeForTenant — calls all active adapters supporting the operation', async () => {
    const syncCharges = vi.fn().mockResolvedValue(undefined)
    const adapter1 = makeAdapter('pos-a', { syncCharges })
    const adapter2 = makeAdapter('pos-b', { syncCharges })
    const svc = new IntegrationService([adapter1, adapter2], mockRepo as any)

    mockRepo.findActiveForTenant.mockResolvedValue([
      makeConfig('pos-a'),
      makeConfig('pos-b'),
    ])

    await svc.executeForTenant('00000000-0000-0000-0000-000000000002', 'syncCharges', [])

    expect(syncCharges).toHaveBeenCalledTimes(2)
    expect(mockRepo.logEvent).toHaveBeenCalledTimes(2)
    const calls = mockRepo.logEvent.mock.calls as unknown[][]
    expect((calls[0] as string[])[4]).toBe('success')
    expect((calls[1] as string[])[4]).toBe('success')
  })

  it('executeForTenant — skips inactive integrations', async () => {
    const syncCharges = vi.fn().mockResolvedValue(undefined)
    const adapter1 = makeAdapter('pos-a', { syncCharges })
    const adapter2 = makeAdapter('pos-b', { syncCharges })
    const svc = new IntegrationService([adapter1, adapter2], mockRepo as any)

    mockRepo.findActiveForTenant.mockResolvedValue([
      makeConfig('pos-a', { isActive: true }),
    ])

    await svc.executeForTenant('00000000-0000-0000-0000-000000000002', 'syncCharges', [])

    expect(syncCharges).toHaveBeenCalledTimes(1)
    expect(mockRepo.logEvent).toHaveBeenCalledTimes(1)
  })

  it('upsertConfig — saves config and marks integration active', async () => {
    const adapter = makeAdapter('lightspeed')
    const svc = new IntegrationService([adapter], mockRepo as any)
    const saved = makeConfig('lightspeed')
    mockRepo.upsertConfig.mockResolvedValue(saved)

    const result = await svc.upsertConfig(
      '00000000-0000-0000-0000-000000000002',
      'lightspeed',
      { apiKey: 'sk-test' },
    )

    expect(mockRepo.upsertConfig).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000002',
      'lightspeed',
      'pos',
      { apiKey: 'sk-test' },
    )
    expect(result).toEqual(saved)
  })

  it('executeForTenant — logs failure to event log when adapter throws', async () => {
    const syncCharges = vi.fn().mockRejectedValue(new Error('API timeout'))
    const adapter = makeAdapter('pos-a', { syncCharges })
    const svc = new IntegrationService([adapter], mockRepo as any)

    mockRepo.findActiveForTenant.mockResolvedValue([makeConfig('pos-a')])

    await svc.executeForTenant('00000000-0000-0000-0000-000000000002', 'syncCharges', [])

    expect(mockRepo.logEvent).toHaveBeenCalledOnce()
    const logArgs = mockRepo.logEvent.mock.calls[0] as string[]
    expect(logArgs[4]).toBe('failed')
    expect(logArgs[6]).toBe('API timeout')
  })
})
