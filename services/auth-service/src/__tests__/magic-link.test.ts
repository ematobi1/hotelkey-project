import { describe, it, expect, vi } from 'vitest'
import crypto from 'crypto'
import { MagicLinkRepository } from '../repositories/magic-link.repository'

const makePool = (rows: Record<string, unknown>[]) => ({
  query: vi.fn().mockResolvedValue({ rows }),
})

describe('MagicLinkRepository', () => {
  it('creates a magic link and returns raw token', async () => {
    const token = 'abc123'
    vi.spyOn(crypto, 'randomBytes').mockReturnValue(Buffer.from(token) as never)
    const pool = makePool([{
      id: 'link-1',
      tenant_id: 'tenant-1',
      guest_id: 'guest-1',
      reservation_id: 'res-1',
      guest_email: 'guest@example.com',
      token_hash: 'hash',
      expires_at: new Date(Date.now() + 3600000),
      used_at: null,
      created_at: new Date(),
    }])
    const repo = new MagicLinkRepository(pool as never)
    const result = await repo.create({ tenantId: 'tenant-1', guestId: 'guest-1', reservationId: 'res-1', guestEmail: 'guest@example.com' })
    expect(result.rawToken).toBeTruthy()
    expect(result.magicLink.id).toBe('link-1')
  })

  it('returns null when token not found', async () => {
    const pool = makePool([])
    const repo = new MagicLinkRepository(pool as never)
    const result = await repo.findByTokenHash('nonexistent')
    expect(result).toBeNull()
  })
})
