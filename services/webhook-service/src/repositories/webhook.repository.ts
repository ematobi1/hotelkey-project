import { Pool } from 'pg'
import { NotFoundError } from '../domain/errors'
import type {
  WebhookEndpoint,
  WebhookDelivery,
  CreateEndpointInput,
  UpdateEndpointInput,
  CreateDeliveryInput,
  DeliveryStatus,
} from '../domain/errors'

const ENDPOINT_COLUMNS = `id, tenant_id, url, secret, description, event_types, is_active, created_at, updated_at`
const DELIVERY_COLUMNS = `id, endpoint_id, tenant_id, event_type, event_id, payload, status,
                          attempt_count, last_attempt_at, next_retry_at, response_status, response_body,
                          error_message, created_at`

function rowToEndpoint(r: Record<string, unknown>): WebhookEndpoint {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    url: r['url'] as string,
    secret: r['secret'] as string,
    description: r['description'] as string | null,
    eventTypes: r['event_types'] as string[],
    isActive: r['is_active'] as boolean,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  }
}

function rowToDelivery(r: Record<string, unknown>): WebhookDelivery {
  return {
    id: r['id'] as string,
    endpointId: r['endpoint_id'] as string,
    tenantId: r['tenant_id'] as string,
    eventType: r['event_type'] as string,
    eventId: r['event_id'] as string,
    payload: r['payload'] as Record<string, unknown>,
    status: r['status'] as DeliveryStatus,
    attemptCount: r['attempt_count'] as number,
    lastAttemptAt: r['last_attempt_at'] as Date | null,
    nextRetryAt: r['next_retry_at'] as Date | null,
    responseStatus: r['response_status'] as number | null,
    responseBody: r['response_body'] as string | null,
    errorMessage: r['error_message'] as string | null,
    createdAt: r['created_at'] as Date,
  }
}

export class WebhookRepository {
  constructor(private readonly pool: Pool) {}

  async createEndpoint(input: CreateEndpointInput): Promise<WebhookEndpoint> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO webhook_endpoint (tenant_id, url, secret, description, event_types)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${ENDPOINT_COLUMNS}`,
      [
        input.tenantId,
        input.url,
        input.secret,
        input.description ?? null,
        input.eventTypes ?? [],
      ],
    )
    return rowToEndpoint(rows[0]!)
  }

  async findEndpointById(id: string, tenantId: string): Promise<WebhookEndpoint | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${ENDPOINT_COLUMNS} FROM webhook_endpoint WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )
    return rows[0] ? rowToEndpoint(rows[0]) : null
  }

  async findEndpointByIdOrThrow(id: string, tenantId: string): Promise<WebhookEndpoint> {
    const endpoint = await this.findEndpointById(id, tenantId)
    if (!endpoint) throw new NotFoundError('WebhookEndpoint', id)
    return endpoint
  }

  async listEndpoints(tenantId: string): Promise<WebhookEndpoint[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${ENDPOINT_COLUMNS} FROM webhook_endpoint WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    )
    return rows.map(rowToEndpoint)
  }

  async updateEndpoint(id: string, tenantId: string, input: UpdateEndpointInput): Promise<WebhookEndpoint> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE webhook_endpoint
          SET url         = COALESCE($3, url),
              secret      = COALESCE($4, secret),
              event_types = COALESCE($5, event_types),
              is_active   = COALESCE($6, is_active),
              updated_at  = NOW()
        WHERE id = $1 AND tenant_id = $2
       RETURNING ${ENDPOINT_COLUMNS}`,
      [id, tenantId, input.url ?? null, input.secret ?? null, input.eventTypes ?? null, input.isActive ?? null],
    )
    if (!rows[0]) throw new NotFoundError('WebhookEndpoint', id)
    return rowToEndpoint(rows[0])
  }

  async deactivateEndpoint(id: string, tenantId: string): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_endpoint SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )
  }

  async findActiveEndpointsForEvent(tenantId: string, eventType: string): Promise<WebhookEndpoint[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${ENDPOINT_COLUMNS}
         FROM webhook_endpoint
        WHERE tenant_id = $1
          AND is_active = TRUE
          AND (
            array_length(event_types, 1) IS NULL
            OR event_types = '{}'
            OR $2 = ANY(event_types)
          )`,
      [tenantId, eventType],
    )
    return rows.map(rowToEndpoint)
  }

  async createDelivery(input: CreateDeliveryInput): Promise<WebhookDelivery> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO webhook_delivery (endpoint_id, tenant_id, event_type, event_id, payload)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${DELIVERY_COLUMNS}`,
      [input.endpointId, input.tenantId, input.eventType, input.eventId, JSON.stringify(input.payload)],
    )
    return rowToDelivery(rows[0]!)
  }

  async updateDeliverySuccess(
    id: string,
    responseStatus: number,
    responseBody: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_delivery
          SET status          = 'delivered',
              attempt_count   = attempt_count + 1,
              last_attempt_at = NOW(),
              response_status = $2,
              response_body   = $3,
              next_retry_at   = NULL
        WHERE id = $1`,
      [id, responseStatus, responseBody],
    )
  }

  async updateDeliveryRetry(
    id: string,
    nextRetryAt: Date,
    responseStatus: number | null,
    errorMessage: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_delivery
          SET attempt_count   = attempt_count + 1,
              last_attempt_at = NOW(),
              next_retry_at   = $2,
              response_status = $3,
              error_message   = $4
        WHERE id = $1`,
      [id, nextRetryAt, responseStatus, errorMessage],
    )
  }

  async updateDeliveryFailed(
    id: string,
    responseStatus: number | null,
    errorMessage: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_delivery
          SET status          = 'failed',
              attempt_count   = attempt_count + 1,
              last_attempt_at = NOW(),
              next_retry_at   = NULL,
              response_status = $2,
              error_message   = $3
        WHERE id = $1`,
      [id, responseStatus, errorMessage],
    )
  }

  async findPendingDeliveriesDue(): Promise<Array<{ delivery: WebhookDelivery; endpoint: WebhookEndpoint }>> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT
         d.id, d.endpoint_id, d.tenant_id, d.event_type, d.event_id, d.payload, d.status,
         d.attempt_count, d.last_attempt_at, d.next_retry_at, d.response_status, d.response_body,
         d.error_message, d.created_at,
         e.url AS e_url, e.secret AS e_secret, e.description AS e_description,
         e.event_types AS e_event_types, e.is_active AS e_is_active,
         e.created_at AS e_created_at, e.updated_at AS e_updated_at,
         e.tenant_id AS e_tenant_id
       FROM webhook_delivery d
       JOIN webhook_endpoint e ON e.id = d.endpoint_id
      WHERE d.status = 'pending'
        AND d.next_retry_at IS NOT NULL
        AND d.next_retry_at <= NOW()`,
    )
    return rows.map((r) => ({
      delivery: rowToDelivery(r),
      endpoint: {
        id: r['endpoint_id'] as string,
        tenantId: r['e_tenant_id'] as string,
        url: r['e_url'] as string,
        secret: r['e_secret'] as string,
        description: r['e_description'] as string | null,
        eventTypes: r['e_event_types'] as string[],
        isActive: r['e_is_active'] as boolean,
        createdAt: r['e_created_at'] as Date,
        updatedAt: r['e_updated_at'] as Date,
      },
    }))
  }

  async listDeliveries(
    endpointId: string,
    tenantId: string,
    status?: DeliveryStatus,
    limit = 50,
    offset = 0,
  ): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    const statusFilter = status ? `AND status = '${status}'` : ''
    const [{ rows }, { rows: countRows }] = await Promise.all([
      this.pool.query<Record<string, unknown>>(
        `SELECT ${DELIVERY_COLUMNS} FROM webhook_delivery
          WHERE endpoint_id = $1 AND tenant_id = $2 ${statusFilter}
          ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
        [endpointId, tenantId, limit, offset],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM webhook_delivery
          WHERE endpoint_id = $1 AND tenant_id = $2 ${statusFilter}`,
        [endpointId, tenantId],
      ),
    ])
    return {
      deliveries: rows.map(rowToDelivery),
      total: parseInt(countRows[0]!.count, 10),
    }
  }
}
