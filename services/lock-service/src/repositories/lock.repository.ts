import { Pool } from 'pg'
import { NotFoundError } from '../domain/errors'
import type { Lock, LockCredential, CreateCredentialInput } from '../domain/errors'

const LOCK_COLS = `id, tenant_id, room_id, assa_abloy_lock_id, label, created_at, updated_at`
const CRED_COLS = `id, tenant_id, lock_id, reservation_id, guest_id, assa_abloy_credential_id,
                   valid_from, valid_until, revoked_at, created_at`

function rowToLock(r: Record<string, unknown>): Lock {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    roomId: r['room_id'] as string,
    assaAbloyLockId: r['assa_abloy_lock_id'] as string,
    label: r['label'] as string,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  }
}

function rowToCredential(r: Record<string, unknown>): LockCredential {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    lockId: r['lock_id'] as string,
    reservationId: r['reservation_id'] as string,
    guestId: r['guest_id'] as string,
    assaAbloyCredentialId: r['assa_abloy_credential_id'] as string,
    validFrom: r['valid_from'] as Date,
    validUntil: r['valid_until'] as Date,
    revokedAt: r['revoked_at'] as Date | null,
    createdAt: r['created_at'] as Date,
  }
}

export class LockRepository {
  constructor(private readonly pool: Pool) {}

  async createLock(
    tenantId: string,
    roomId: string,
    assaAbloyLockId: string,
    label: string,
  ): Promise<Lock> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO lock (tenant_id, room_id, assa_abloy_lock_id, label)
       VALUES ($1, $2, $3, $4)
       RETURNING ${LOCK_COLS}`,
      [tenantId, roomId, assaAbloyLockId, label],
    )
    return rowToLock(rows[0]!)
  }

  async findLockById(id: string, tenantId: string): Promise<Lock | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${LOCK_COLS} FROM lock WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )
    return rows[0] ? rowToLock(rows[0]) : null
  }

  async findLockByIdOrThrow(id: string, tenantId: string): Promise<Lock> {
    const lock = await this.findLockById(id, tenantId)
    if (!lock) throw new NotFoundError('Lock', id)
    return lock
  }

  async findLockByRoomId(tenantId: string, roomId: string): Promise<Lock | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${LOCK_COLS} FROM lock WHERE tenant_id = $1 AND room_id = $2`,
      [tenantId, roomId],
    )
    return rows[0] ? rowToLock(rows[0]) : null
  }

  async listLocks(tenantId: string): Promise<Lock[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${LOCK_COLS} FROM lock WHERE tenant_id = $1 ORDER BY label ASC`,
      [tenantId],
    )
    return rows.map(rowToLock)
  }

  async createCredential(input: CreateCredentialInput): Promise<LockCredential> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO lock_credential
         (tenant_id, lock_id, reservation_id, guest_id, assa_abloy_credential_id, valid_from, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${CRED_COLS}`,
      [
        input.tenantId,
        input.lockId,
        input.reservationId,
        input.guestId,
        input.assaAbloyCredentialId,
        input.validFrom,
        input.validUntil,
      ],
    )
    return rowToCredential(rows[0]!)
  }

  async findCredentialById(id: string, tenantId: string): Promise<LockCredential | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${CRED_COLS} FROM lock_credential WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )
    return rows[0] ? rowToCredential(rows[0]) : null
  }

  async findCredentialByReservationId(reservationId: string): Promise<LockCredential | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${CRED_COLS} FROM lock_credential
       WHERE reservation_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [reservationId],
    )
    return rows[0] ? rowToCredential(rows[0]) : null
  }

  async listCredentialsByLock(lockId: string, tenantId: string): Promise<LockCredential[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${CRED_COLS} FROM lock_credential
       WHERE lock_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [lockId, tenantId],
    )
    return rows.map(rowToCredential)
  }

  async revokeCredential(id: string, tenantId: string): Promise<LockCredential> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE lock_credential
          SET revoked_at = NOW()
        WHERE id = $1 AND tenant_id = $2
       RETURNING ${CRED_COLS}`,
      [id, tenantId],
    )
    if (!rows[0]) throw new NotFoundError('LockCredential', id)
    return rowToCredential(rows[0])
  }
}
