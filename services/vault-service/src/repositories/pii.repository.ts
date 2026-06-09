import { Pool } from 'pg'
import type { PiiRecord } from '../domain/errors'

const COLUMNS = `id, tenant_id, guest_id, field_name, encrypted_value, iv, auth_tag, key_version, created_at`

function rowToPiiRecord(r: Record<string, unknown>): PiiRecord {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    guestId: r['guest_id'] as string,
    fieldName: r['field_name'] as string,
    encryptedValue: r['encrypted_value'] as string,
    iv: r['iv'] as string,
    authTag: r['auth_tag'] as string,
    keyVersion: r['key_version'] as number,
    createdAt: r['created_at'] as Date,
  }
}

export class PiiRepository {
  constructor(private readonly pool: Pool) {}

  async storeField(
    tenantId: string,
    guestId: string,
    fieldName: string,
    encryptedValue: string,
    iv: string,
    authTag: string,
    keyVersion: number,
  ): Promise<PiiRecord> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO pii_record (tenant_id, guest_id, field_name, encrypted_value, iv, auth_tag, key_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, guest_id, field_name)
       DO UPDATE SET
         encrypted_value = EXCLUDED.encrypted_value,
         iv              = EXCLUDED.iv,
         auth_tag        = EXCLUDED.auth_tag,
         key_version     = EXCLUDED.key_version
       RETURNING ${COLUMNS}`,
      [tenantId, guestId, fieldName, encryptedValue, iv, authTag, keyVersion],
    )
    return rowToPiiRecord(rows[0]!)
  }

  async findByGuest(tenantId: string, guestId: string): Promise<PiiRecord[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM pii_record WHERE tenant_id = $1 AND guest_id = $2`,
      [tenantId, guestId],
    )
    return rows.map(rowToPiiRecord)
  }

  async findByField(
    tenantId: string,
    guestId: string,
    fieldName: string,
  ): Promise<PiiRecord | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${COLUMNS} FROM pii_record WHERE tenant_id = $1 AND guest_id = $2 AND field_name = $3`,
      [tenantId, guestId, fieldName],
    )
    return rows[0] ? rowToPiiRecord(rows[0]) : null
  }

  async deleteByGuest(tenantId: string, guestId: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM pii_record WHERE tenant_id = $1 AND guest_id = $2`,
      [tenantId, guestId],
    )
    return rowCount ?? 0
  }
}
