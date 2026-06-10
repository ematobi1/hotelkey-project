import { Pool } from 'pg'

export interface DidRecord {
  id: string
  tenantId: string
  guestId: string
  did: string
  didDocument: Record<string, unknown>
  publicKeyMultibase: string
  createdAt: Date
}

const COLUMNS = `id, tenant_id, guest_id, did, did_document, public_key_multibase, created_at`

function rowToDidRecord(r: Record<string, unknown>): DidRecord {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    guestId: r['guest_id'] as string,
    did: r['did'] as string,
    didDocument: r['did_document'] as Record<string, unknown>,
    publicKeyMultibase: r['public_key_multibase'] as string,
    createdAt: r['created_at'] as Date,
  }
}

export class DidRepository {
  constructor(private readonly pool: Pool) {}

  async create(
    tenantId: string,
    guestId: string,
    did: string,
    didDocument: Record<string, unknown>,
    publicKeyMultibase: string,
  ): Promise<DidRecord> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO guest_did (tenant_id, guest_id, did, did_document, public_key_multibase)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [tenantId, guestId, did, JSON.stringify(didDocument), publicKeyMultibase],
    )
    return rowToDidRecord(rows[0]!)
  }

  async findByGuestId(guestId: string, tenantId: string): Promise<DidRecord | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM guest_did WHERE guest_id = $1 AND tenant_id = $2`,
      [guestId, tenantId],
    )
    return rows[0] ? rowToDidRecord(rows[0]) : null
  }

  async findByDid(did: string): Promise<DidRecord | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM guest_did WHERE did = $1`,
      [did],
    )
    return rows[0] ? rowToDidRecord(rows[0]) : null
  }
}
