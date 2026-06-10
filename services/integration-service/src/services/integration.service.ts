import { createLogger } from '@hotel-key/logger'
import type { IntegrationAdapter, IntegrationConfig } from '../domain/types'
import type { IntegrationRepository } from '../repositories/integration.repository'

const logger = createLogger({ service: 'integration-service' })

export class IntegrationService {
  private readonly adapters: Map<string, IntegrationAdapter>

  constructor(
    adapters: IntegrationAdapter[],
    private readonly repo: IntegrationRepository,
  ) {
    this.adapters = new Map(adapters.map((a) => [a.name, a]))
  }

  listIntegrations(): { name: string; category: string }[] {
    return Array.from(this.adapters.values()).map((a) => ({
      name: a.name,
      category: a.category,
    }))
  }

  async getActiveForTenant(tenantId: string): Promise<IntegrationConfig[]> {
    return this.repo.findActiveForTenant(tenantId)
  }

  async upsertConfig(
    tenantId: string,
    integrationName: string,
    cfg: Record<string, unknown>,
  ): Promise<IntegrationConfig> {
    const adapter = this.adapters.get(integrationName)
    if (!adapter) {
      throw new Error(`Unknown integration: ${integrationName}`)
    }
    return this.repo.upsertConfig(tenantId, integrationName, adapter.category, cfg)
  }

  async deactivate(tenantId: string, integrationName: string): Promise<void> {
    return this.repo.deactivate(tenantId, integrationName)
  }

  async executeForTenant(tenantId: string, operation: string, data: unknown): Promise<void> {
    const activeConfigs = await this.repo.findActiveForTenant(tenantId)

    await Promise.allSettled(
      activeConfigs.map(async (cfg) => {
        const adapter = this.adapters.get(cfg.integrationName)
        if (!adapter) return

        const method = (adapter as unknown as Record<string, unknown>)[operation]
        if (typeof method !== 'function') return

        try {
          await (method as (data: unknown) => Promise<void>).call(adapter, data)
          await this.repo.logEvent(
            tenantId,
            cfg.integrationName,
            operation,
            'outbound',
            'success',
            data as Record<string, unknown>,
            null,
          )
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          logger.error({ tenantId, integration: cfg.integrationName, operation, err }, 'Integration operation failed')
          await this.repo.logEvent(
            tenantId,
            cfg.integrationName,
            operation,
            'outbound',
            'failed',
            data as Record<string, unknown>,
            errorMessage,
          )
        }
      }),
    )
  }
}
