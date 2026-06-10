import type { Pool } from 'pg'
import crypto from 'crypto'

export interface MagicLink {
  id: string
  tenantId: string
  guestId: string
  reservationId: string
  guestEmail: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
}

export class MagicLinkRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: {
    tenantId: string
    guestId: string
    reservationId: string
    guestEmail: string
    ttlMinutes?: number
  }): Promise<{ magicLink: MagicLink; rawToken: string }> {
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const ttl = input.ttlMinutes ?? 60

    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO guest_magic_link
         (tenant_id, guest_id, reservation_id, guest_email, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' minutes')::INTERVAL)
       RETURNING id, tenant_id, guest_id, reservation_id, guest_email, token_hash, expires_at, used_at, created_at`,
      [input.tenantId, input.guestId, input.reservationId, input.guestEmail, tokenHash, ttl],
    )
    const row = rows[0]!
    return {
      rawToken,
      magicLink: this.mapRow(row),
    }
  }

  async findByTokenHash(tokenHash: string): Promise<MagicLink | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, guest_id, reservation_id, guest_email, token_hash, expires_at, used_at, created_at
       FROM guest_magic_link WHERE token_hash = $1`,
      [tokenHash],
    )
    return rows[0] ? this.mapRow(rows[0]) : null
  }

  async markUsed(id: string): Promise<void> {
    await this.pool.query(`UPDATE guest_magic_link SET used_at = NOW() WHERE id = $1`, [id])
  }

  private mapRow(row: Record<string, unknown>): MagicLink {
    return {
      id: row['id'] as string,
      tenantId: row['tenant_id'] as string,
      guestId: row['guest_id'] as string,
      reservationId: row['reservation_id'] as string,
      guestEmail: row['guest_email'] as string,
      tokenHash: row['token_hash'] as string,
      expiresAt: row['expires_at'] as Date,
      usedAt: row['used_at'] as Date | null,
      createdAt: row['created_at'] as Date,
    }
  }
}
