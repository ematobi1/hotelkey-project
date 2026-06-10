import { Pool } from 'pg'
import type { Guest, GuestPreference, CreateGuestInput, UpdateGuestInput } from '@hotel-key/types'
import { NotFoundError } from '@hotel-key/types'

function rowToGuest(r: Record<string, unknown>): Guest {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    firstName: r['first_name'] as string,
    lastName: r['last_name'] as string,
    email: r['email'] as string | null,
    phone: r['phone'] as string | null,
    nationality: r['nationality'] as string | null,
    dateOfBirth: r['date_of_birth'] as Date | null,
    vipLevel: r['vip_level'] as 0 | 1 | 2 | 3,
    isBlocked: r['is_blocked'] as boolean,
    blockReason: r['block_reason'] as string | null,
    deletedAt: r['deleted_at'] as Date | null,
    anonymisedAt: r['anonymised_at'] as Date | null,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  }
}

export class GuestRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string, tenantId: string): Promise<Guest | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, first_name, last_name, email, phone, nationality,
              date_of_birth, vip_level, is_blocked, block_reason,
              deleted_at, anonymised_at, created_at, updated_at
         FROM guest
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId],
    )
    return rows[0] ? rowToGuest(rows[0]) : null
  }

  async findByIdOrThrow(id: string, tenantId: string): Promise<Guest> {
    const guest = await this.findById(id, tenantId)
    if (!guest) throw new NotFoundError('Guest', id)
    return guest
  }

  async search(tenantId: string, query: string, limit = 20): Promise<Guest[]> {
    const term = `%${query.toLowerCase()}%`
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, first_name, last_name, email, phone, nationality,
              date_of_birth, vip_level, is_blocked, block_reason,
              deleted_at, anonymised_at, created_at, updated_at
         FROM guest
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND (
            LOWER(first_name || ' ' || last_name) LIKE $2
            OR LOWER(email) LIKE $2
            OR phone LIKE $2
          )
        ORDER BY last_name, first_name
        LIMIT $3`,
      [tenantId, term, limit],
    )
    return rows.map(rowToGuest)
  }

  async create(input: CreateGuestInput): Promise<Guest> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO guest (tenant_id, first_name, last_name, email, phone,
                          nationality, date_of_birth, vip_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, tenant_id, first_name, last_name, email, phone, nationality,
                 date_of_birth, vip_level, is_blocked, block_reason,
                 deleted_at, anonymised_at, created_at, updated_at`,
      [
        input.tenantId,
        input.firstName,
        input.lastName,
        input.email ?? null,
        input.phone ?? null,
        input.nationality ?? null,
        input.dateOfBirth ?? null,
        input.vipLevel ?? 0,
      ],
    )
    return rowToGuest(rows[0]!)
  }

  async update(id: string, tenantId: string, input: UpdateGuestInput): Promise<Guest> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE guest
          SET first_name    = COALESCE($3, first_name),
              last_name     = COALESCE($4, last_name),
              email         = COALESCE($5, email),
              phone         = COALESCE($6, phone),
              nationality   = COALESCE($7, nationality),
              date_of_birth = COALESCE($8, date_of_birth),
              vip_level     = COALESCE($9, vip_level),
              updated_at    = NOW()
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, tenant_id, first_name, last_name, email, phone, nationality,
                 date_of_birth, vip_level, is_blocked, block_reason,
                 deleted_at, anonymised_at, created_at, updated_at`,
      [
        id, tenantId,
        input.firstName ?? null,
        input.lastName ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.nationality ?? null,
        input.dateOfBirth ?? null,
        input.vipLevel ?? null,
      ],
    )
    if (!rows[0]) throw new NotFoundError('Guest', id)
    return rowToGuest(rows[0])
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    await this.pool.query(
      `UPDATE guest SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, tenantId],
    )
  }

  async anonymise(id: string, tenantId: string): Promise<void> {
    await this.pool.query(
      `UPDATE guest
          SET email         = NULL,
              phone         = NULL,
              nationality   = NULL,
              date_of_birth = NULL,
              first_name    = 'ANONYMISED',
              last_name     = 'ANONYMISED',
              anonymised_at = NOW(),
              updated_at    = NOW()
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )
  }

  async upsertPreferences(
    guestId: string,
    tenantId: string,
    prefs: Partial<Omit<GuestPreference, 'guestId' | 'tenantId' | 'updatedAt'>>,
  ): Promise<GuestPreference> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO guest_preference (guest_id, tenant_id, room_type_id, floor_preference,
                                     pillow_type, dietary, other_preferences)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (guest_id) DO UPDATE
         SET room_type_id      = COALESCE($3, guest_preference.room_type_id),
             floor_preference  = COALESCE($4, guest_preference.floor_preference),
             pillow_type       = COALESCE($5, guest_preference.pillow_type),
             dietary           = COALESCE($6, guest_preference.dietary),
             other_preferences = COALESCE($7, guest_preference.other_preferences),
             updated_at        = NOW()
       RETURNING guest_id, tenant_id, room_type_id, floor_preference,
                 pillow_type, dietary, other_preferences, updated_at`,
      [
        guestId, tenantId,
        prefs.roomTypeId ?? null,
        prefs.floorPreference ?? null,
        prefs.pillowType ?? null,
        prefs.dietary ?? null,
        JSON.stringify(prefs.otherPreferences ?? {}),
      ],
    )
    const r = rows[0]!
    return {
      guestId: r['guest_id'] as string,
      tenantId: r['tenant_id'] as string,
      roomTypeId: r['room_type_id'] as string | null,
      floorPreference: r['floor_preference'] as number | null,
      pillowType: r['pillow_type'] as string | null,
      dietary: r['dietary'] as string[],
      otherPreferences: r['other_preferences'] as Record<string, unknown>,
      updatedAt: r['updated_at'] as Date,
    }
  }

  async eraseGuest(id: string, tenantId: string): Promise<void> {
    await this.pool.query(
      `UPDATE guest
          SET first_name    = '[ERASED]',
              last_name     = '[ERASED]',
              email         = NULL,
              phone         = NULL,
              nationality   = NULL,
              date_of_birth = NULL,
              deleted_at    = NOW(),
              updated_at    = NOW()
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )
    await this.pool.query(
      `DELETE FROM guest_document WHERE guest_id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )
  }

  async getPreferences(guestId: string, tenantId: string): Promise<GuestPreference | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT guest_id, tenant_id, room_type_id, floor_preference,
              pillow_type, dietary, other_preferences, updated_at
         FROM guest_preference
        WHERE guest_id = $1 AND tenant_id = $2`,
      [guestId, tenantId],
    )
    if (!rows[0]) return null
    const r = rows[0]
    return {
      guestId: r['guest_id'] as string,
      tenantId: r['tenant_id'] as string,
      roomTypeId: r['room_type_id'] as string | null,
      floorPreference: r['floor_preference'] as number | null,
      pillowType: r['pillow_type'] as string | null,
      dietary: r['dietary'] as string[],
      otherPreferences: r['other_preferences'] as Record<string, unknown>,
      updatedAt: r['updated_at'] as Date,
    }
  }
}
