import { Pool } from 'pg'
import { createHash, randomBytes } from 'crypto'

interface StoredRefreshToken {
  id: string
  staffId: string
  tokenHash: string
  expiresAt: Date
  revokedAt: Date | null
  createdAt: Date
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export class TokenRepository {
  constructor(private readonly pool: Pool) {}

  generateToken(): string {
    return randomBytes(48).toString('hex')
  }

  async store(staffId: string, ttlDays: number): Promise<string> {
    const token = this.generateToken()
    const tokenHash = hashToken(token)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + ttlDays)

    await this.pool.query(
      `INSERT INTO refresh_token (staff_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [staffId, tokenHash, expiresAt],
    )

    return token
  }

  async findByToken(token: string): Promise<StoredRefreshToken | null> {
    const tokenHash = hashToken(token)
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, staff_id, token_hash, expires_at, revoked_at, created_at
         FROM refresh_token
        WHERE token_hash = $1`,
      [tokenHash],
    )

    if (!rows[0]) return null

    return {
      id: rows[0]['id'] as string,
      staffId: rows[0]['staff_id'] as string,
      tokenHash: rows[0]['token_hash'] as string,
      expiresAt: rows[0]['expires_at'] as Date,
      revokedAt: rows[0]['revoked_at'] as Date | null,
      createdAt: rows[0]['created_at'] as Date,
    }
  }

  async revoke(token: string): Promise<void> {
    const tokenHash = hashToken(token)
    await this.pool.query(
      `UPDATE refresh_token SET revoked_at = NOW() WHERE token_hash = $1`,
      [tokenHash],
    )
  }

  async revokeAllForStaff(staffId: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_token SET revoked_at = NOW()
       WHERE staff_id = $1 AND revoked_at IS NULL`,
      [staffId],
    )
  }
}
