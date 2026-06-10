import { Pool } from 'pg'
import { NotFoundError } from '../domain/errors'
import type { IntegrationConfig, IntegrationEventLog } from '../domain/types'

const CONFIG_COLUMNS = `id, tenant_id, integration_name, category, is_active, config, created_at, updated_at`
const LOG_COLUMNS = `id, tenant_id, integration_name, event_type, direction, status, payload, error_message, created_at`

function rowToConfig(r: Record<string, unknown>): IntegrationConfig {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    integrationName: r['integration_name'] as string,
    category: r['category'] as string,
    isActive: r['is_active'] as boolean,
    config: r['config'] as Record<string, unknown>,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  }
}

function rowToLog(r: Record<string, unknown>): IntegrationEventLog {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    integrationName: r['integration_name'] as string,
    eventType: r['event_type'] as string,
    direction: r['direction'] as 'inbound' | 'outbound',
    status: r['status'] as 'success' | 'failed',
    payload: r['payload'] as Record<string, unknown> | null,
    errorMessage: r['error_message'] as string | null,
    createdAt: r['created_at'] as Date,
  }
}

export class IntegrationRepository {
  constructor(private readonly pool: Pool) {}

  async upsertConfig(
    tenantId: string,
    integrationName: string,
    category: string,
    cfg: Record<string, unknown>,
  ): Promise<IntegrationConfig> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO integration_config (tenant_id, integration_name, category, config, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (tenant_id, integration_name)
       DO UPDATE SET config = $4, is_active = TRUE, updated_at = NOW()
       RETURNING ${CONFIG_COLUMNS}`,
      [tenantId, integrationName, category, JSON.stringify(cfg)],
    )
    return rowToConfig(rows[0]!)
  }

  async findActiveForTenant(tenantId: string): Promise<IntegrationConfig[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${CONFIG_COLUMNS} FROM integration_config WHERE tenant_id = $1 AND is_active = TRUE`,
      [tenantId],
    )
    return rows.map(rowToConfig)
  }

  async findByNameOrThrow(tenantId: string, integrationName: string): Promise<IntegrationConfig> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${CONFIG_COLUMNS} FROM integration_config WHERE tenant_id = $1 AND integration_name = $2`,
      [tenantId, integrationName],
    )
    if (!rows[0]) throw new NotFoundError('IntegrationConfig', integrationName)
    return rowToConfig(rows[0])
  }

  async deactivate(tenantId: string, integrationName: string): Promise<void> {
    await this.pool.query(
      `UPDATE integration_config SET is_active = FALSE, updated_at = NOW()
        WHERE tenant_id = $1 AND integration_name = $2`,
      [tenantId, integrationName],
    )
  }

  async logEvent(
    tenantId: string,
    integrationName: string,
    eventType: string,
    direction: 'inbound' | 'outbound',
    status: 'success' | 'failed',
    payload: Record<string, unknown> | null,
    errorMessage: string | null,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO integration_event_log
         (tenant_id, integration_name, event_type, direction, status, payload, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, integrationName, eventType, direction, status, payload ? JSON.stringify(payload) : null, errorMessage],
    )
  }

  async listEventLog(
    tenantId: string,
    integrationName?: string,
    limit = 50,
    offset = 0,
  ): Promise<{ logs: IntegrationEventLog[]; total: number }> {
    const nameFilter = integrationName ? `AND integration_name = '${integrationName}'` : ''
    const [{ rows }, { rows: countRows }] = await Promise.all([
      this.pool.query<Record<string, unknown>>(
        `SELECT ${LOG_COLUMNS} FROM integration_event_log
          WHERE tenant_id = $1 ${nameFilter}
          ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM integration_event_log WHERE tenant_id = $1 ${nameFilter}`,
        [tenantId],
      ),
    ])
    return {
      logs: rows.map(rowToLog),
      total: parseInt(countRows[0]!.count, 10),
    }
  }
}
