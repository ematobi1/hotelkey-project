import { Pool } from 'pg'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { config } from '../config'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  return Buffer.from(config.MFA_ENCRYPTION_KEY, 'hex')
}

function encrypt(plaintext: string): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  return { ciphertext, iv, authTag: cipher.getAuthTag() }
}

function decrypt(ciphertext: Buffer, iv: Buffer, authTag: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

export class MfaRepository {
  constructor(private readonly pool: Pool) {}

  async upsertSecret(staffId: string, plaintextSecret: string): Promise<void> {
    const { ciphertext, iv, authTag } = encrypt(plaintextSecret)

    await this.pool.query(
      `INSERT INTO mfa_secret (staff_id, secret_enc, iv, auth_tag, is_verified)
       VALUES ($1, $2, $3, $4, FALSE)
       ON CONFLICT (staff_id) DO UPDATE
         SET secret_enc = EXCLUDED.secret_enc,
             iv = EXCLUDED.iv,
             auth_tag = EXCLUDED.auth_tag,
             is_verified = FALSE,
             created_at = NOW()`,
      [staffId, ciphertext, iv, authTag],
    )
  }

  async getSecret(staffId: string): Promise<{ secret: string; isVerified: boolean } | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT secret_enc, iv, auth_tag, is_verified
         FROM mfa_secret
        WHERE staff_id = $1`,
      [staffId],
    )

    if (!rows[0]) return null

    const secret = decrypt(
      rows[0]['secret_enc'] as Buffer,
      rows[0]['iv'] as Buffer,
      rows[0]['auth_tag'] as Buffer,
    )

    return { secret, isVerified: rows[0]['is_verified'] as boolean }
  }

  async markVerified(staffId: string): Promise<void> {
    await this.pool.query(
      `UPDATE mfa_secret SET is_verified = TRUE WHERE staff_id = $1`,
      [staffId],
    )
  }

  async delete(staffId: string): Promise<void> {
    await this.pool.query(`DELETE FROM mfa_secret WHERE staff_id = $1`, [staffId])
  }
}
