import crypto from 'crypto'

export class CryptoService {
  constructor(private readonly key: Buffer) {}

  encrypt(plaintext: string): { encryptedValue: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return {
      encryptedValue: encrypted.toString('base64'),
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
    }
  }

  decrypt(encryptedValue: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'hex'))
    decipher.setAuthTag(Buffer.from(authTag, 'hex'))
    return decipher.update(Buffer.from(encryptedValue, 'base64')) + decipher.final('utf8')
  }
}

export function deriveKeyFromSecret(secret: string): Buffer {
  return crypto.scryptSync(secret, 'hotel-key-pii-salt', 32)
}
