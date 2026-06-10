import { Pool } from 'pg'
import type { ConsentPurpose, ConsentStatus } from '../domain/errors'

const COLUMNS = `id, tenant_id, guest_id, guest_id_hash, purpose, status, tx_id, recorded_at, created_at`

export interface UpsertConsentInput {
  tenantId: string
  guestId: string
  guestIdHash: string
  purpose: ConsentPurpose
  status: ConsentStatus
  txId: string | null
}

export interface ConsentCacheRecord {
  id: string
  tenantId: string
  guestId: string
  guestIdHash: string
  purpose: ConsentPurpose
  status: ConsentStatus
  txId: string | null
  recordedAt: Date
  createdAt: Date
}

function rowToRecord(r: Record<string, unknown>): ConsentCacheRecord {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    guestId: r['guest_id'] as string,
    guestIdHash: r['guest_id_hash'] as string,
    purpose: r['purpose'] as ConsentPurpose,
    status: r['status'] as ConsentStatus,
    txId: r['tx_id'] as string | null,
    recordedAt: r['recorded_at'] as Date,
    createdAt: r['created_at'] as Date,
  }
}

export class ConsentRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(input: UpsertConsentInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO consent_cache (tenant_id, guest_id, guest_id_hash, purpose, status, tx_id, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (tenant_id, guest_id, purpose)
       DO UPDATE SET status = $5, tx_id = $6, recorded_at = NOW()`,
      [input.tenantId, input.guestId, input.guestIdHash, input.purpose, input.status, input.txId],
    )
  }

  async findByGuest(tenantId: string, guestId: string): Promise<ConsentCacheRecord[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM consent_cache WHERE tenant_id = $1 AND guest_id = $2`,
      [tenantId, guestId],
    )
    return rows.map(rowToRecord)
  }

  async findByPurpose(
    tenantId: string,
    guestId: string,
    purpose: string,
  ): Promise<ConsentCacheRecord | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM consent_cache WHERE tenant_id = $1 AND guest_id = $2 AND purpose = $3`,
      [tenantId, guestId, purpose],
    )
    return rows[0] ? rowToRecord(rows[0]) : null
  }

  async listActiveByGuest(tenantId: string, guestId: string): Promise<ConsentCacheRecord[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM consent_cache WHERE tenant_id = $1 AND guest_id = $2 AND status = 'granted'`,
      [tenantId, guestId],
    )
    return rows.map(rowToRecord)
  }
}
