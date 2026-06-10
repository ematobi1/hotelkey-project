import type { TenantRepository } from '../repositories/tenant.repository'
import { NotFoundError, ConflictError } from '../domain/errors'
import type { Tenant, PlanType, PropertySettings } from '../domain/types'

const DEFAULT_SETTINGS: PropertySettings = {
  timezone: 'UTC',
  currency: 'USD',
  checkInTime: '14:00',
  checkOutTime: '11:00',
  defaultLanguage: 'en',
}

export class TenantService {
  constructor(private readonly tenantRepo: TenantRepository) {}

  async getTenant(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findById(id)
    if (!tenant) throw new NotFoundError('Tenant', id)
    return tenant
  }

  async createTenant(input: {
    name: string
    slug: string
    planType: PlanType
    settings?: Partial<PropertySettings>
  }): Promise<Tenant> {
    const existing = await this.tenantRepo.findBySlug(input.slug)
    if (existing) throw new ConflictError(`Slug '${input.slug}' is already taken`)

    return this.tenantRepo.create({
      name: input.name,
      slug: input.slug,
      planType: input.planType,
      settings: { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) },
    })
  }

  async updateTenant(
    id: string,
    input: { name?: string; planType?: PlanType; active?: boolean },
  ): Promise<Tenant> {
    const tenant = await this.tenantRepo.update(id, input)
    if (!tenant) throw new NotFoundError('Tenant', id)
    return tenant
  }

  async getSettings(id: string): Promise<PropertySettings> {
    const tenant = await this.tenantRepo.findByIdOrThrow(id)
    return { ...DEFAULT_SETTINGS, ...tenant.settings }
  }

  async updateSettings(id: string, settings: PropertySettings): Promise<Tenant> {
    const tenant = await this.tenantRepo.updateSettings(id, settings)
    if (!tenant) throw new NotFoundError('Tenant', id)
    return tenant
  }
}
