import { describe, it, expect, vi } from 'vitest'
import { TenantService } from '../services/tenant.service'
import { NotFoundError, ConflictError } from '../domain/errors'
import type { Tenant } from '../domain/types'

const makeTenant = (overrides: Partial<Tenant> = {}): Tenant => ({
  id: 'tenant-1',
  name: 'Hotel ABC',
  slug: 'hotel-abc',
  planType: 'starter',
  settings: {
    timezone: 'America/New_York',
    currency: 'USD',
    checkInTime: '15:00',
    checkOutTime: '11:00',
    defaultLanguage: 'en',
  },
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeTenantRepo = (overrides = {}) => ({
  findById: vi.fn(),
  findByIdOrThrow: vi.fn(),
  findBySlug: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateSettings: vi.fn(),
  ...overrides,
})

describe('TenantService', () => {
  it('throws NotFoundError when tenant not found', async () => {
    const tenantRepo = makeTenantRepo({ findById: vi.fn().mockResolvedValue(null) })
    const svc = new TenantService(tenantRepo as any)
    await expect(svc.getTenant('missing-id')).rejects.toThrow(NotFoundError)
  })

  it('creates tenant successfully', async () => {
    const tenant = makeTenant()
    const tenantRepo = makeTenantRepo({
      findBySlug: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(tenant),
    })
    const svc = new TenantService(tenantRepo as any)
    const result = await svc.createTenant({
      name: 'Hotel ABC',
      slug: 'hotel-abc',
      planType: 'starter',
    })
    expect(result).toEqual(tenant)
    expect(tenantRepo.create).toHaveBeenCalledOnce()
  })

  it('throws ConflictError when slug already taken', async () => {
    const tenantRepo = makeTenantRepo({
      findBySlug: vi.fn().mockResolvedValue(makeTenant()),
    })
    const svc = new TenantService(tenantRepo as any)
    await expect(
      svc.createTenant({ name: 'Hotel ABC', slug: 'hotel-abc', planType: 'starter' }),
    ).rejects.toThrow(ConflictError)
  })

  it('getSettings returns defaults when settings empty', async () => {
    const tenant = makeTenant({ settings: {} as any })
    const tenantRepo = makeTenantRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(tenant),
    })
    const svc = new TenantService(tenantRepo as any)
    const settings = await svc.getSettings('tenant-1')
    expect(settings).toEqual({
      timezone: 'UTC',
      currency: 'USD',
      checkInTime: '14:00',
      checkOutTime: '11:00',
      defaultLanguage: 'en',
    })
  })
})
