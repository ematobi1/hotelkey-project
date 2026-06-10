import { Pool } from 'pg'
import type { Staff, StaffWithPassword, StaffRole } from '@hotel-key/types'
import { NotFoundError } from '@hotel-key/types'

function rowToStaff(row: Record<string, unknown>): Staff {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    email: row['email'] as string,
    firstName: row['first_name'] as string,
    lastName: row['last_name'] as string,
    role: row['role'] as StaffRole,
    isActive: row['is_active'] as boolean,
    mfaEnabled: row['mfa_enabled'] as boolean,
    createdAt: row['created_at'] as Date,
    updatedAt: row['updated_at'] as Date,
  }
}

function rowToStaffWithPassword(row: Record<string, unknown>): StaffWithPassword {
  return {
    ...rowToStaff(row),
    passwordHash: row['password_hash'] as string,
  }
}

export class StaffRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(
    tenantId: string,
    email: string,
  ): Promise<StaffWithPassword | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, email, password_hash, first_name, last_name,
              role, is_active, mfa_enabled, created_at, updated_at
         FROM staff
        WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email.toLowerCase()],
    )
    return rows[0] ? rowToStaffWithPassword(rows[0]) : null
  }

  async findById(id: string): Promise<Staff | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, email, first_name, last_name,
              role, is_active, mfa_enabled, created_at, updated_at
         FROM staff
        WHERE id = $1`,
      [id],
    )
    return rows[0] ? rowToStaff(rows[0]) : null
  }

  async findByIdOrThrow(id: string): Promise<Staff> {
    const staff = await this.findById(id)
    if (!staff) throw new NotFoundError('Staff', id)
    return staff
  }

  async create(input: {
    tenantId: string
    email: string
    passwordHash: string
    firstName: string
    lastName: string
    role: StaffRole
  }): Promise<Staff> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO staff (tenant_id, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, tenant_id, email, first_name, last_name,
                 role, is_active, mfa_enabled, created_at, updated_at`,
      [
        input.tenantId,
        input.email.toLowerCase(),
        input.passwordHash,
        input.firstName,
        input.lastName,
        input.role,
      ],
    )
    return rowToStaff(rows[0]!)
  }

  async setMfaEnabled(staffId: string, enabled: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE staff SET mfa_enabled = $1, updated_at = NOW() WHERE id = $2`,
      [enabled, staffId],
    )
  }
}
