import { Pool } from 'pg'
import { NotFoundError } from '../domain/errors'
import type { Tenant, PlanType, PropertySettings } from '../domain/types'

function rowToTenant(row: Record<string, unknown>): Tenant {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    slug: row['slug'] as string,
    planType: row['plan_type'] as PlanType,
    settings: row['settings'] as PropertySettings,
    active: row['active'] as boolean,
    createdAt: row['created_at'] as Date,
    updatedAt: row['updated_at'] as Date,
  }
}

const TENANT_COLUMNS = `id, name, slug, plan_type, settings, active, created_at, updated_at`

export class TenantRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<Tenant | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${TENANT_COLUMNS} FROM tenant WHERE id = $1`,
      [id],
    )
    return rows[0] ? rowToTenant(rows[0]) : null
  }

  async findByIdOrThrow(id: string): Promise<Tenant> {
    const tenant = await this.findById(id)
    if (!tenant) throw new NotFoundError('Tenant', id)
    return tenant
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT ${TENANT_COLUMNS} FROM tenant WHERE slug = $1`,
      [slug],
    )
    return rows[0] ? rowToTenant(rows[0]) : null
  }

  async create(input: {
    name: string
    slug: string
    planType: PlanType
    settings: PropertySettings
  }): Promise<Tenant> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO tenant (name, slug, plan_type, settings)
       VALUES ($1, $2, $3, $4)
       RETURNING ${TENANT_COLUMNS}`,
      [input.name, input.slug, input.planType, JSON.stringify(input.settings)],
    )
    return rowToTenant(rows[0]!)
  }

  async update(
    id: string,
    input: { name?: string; planType?: PlanType; active?: boolean },
  ): Promise<Tenant | null> {
    const sets: string[] = []
    const values: unknown[] = []
    let idx = 1

    if (input.name !== undefined) {
      sets.push(`name = $${idx++}`)
      values.push(input.name)
    }
    if (input.planType !== undefined) {
      sets.push(`plan_type = $${idx++}`)
      values.push(input.planType)
    }
    if (input.active !== undefined) {
      sets.push(`active = $${idx++}`)
      values.push(input.active)
    }

    if (sets.length === 0) return this.findById(id)

    sets.push(`updated_at = NOW()`)
    values.push(id)

    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE tenant SET ${sets.join(', ')} WHERE id = $${idx} RETURNING ${TENANT_COLUMNS}`,
      values,
    )
    return rows[0] ? rowToTenant(rows[0]) : null
  }

  async updateSettings(id: string, settings: PropertySettings): Promise<Tenant | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE tenant SET settings = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING ${TENANT_COLUMNS}`,
      [JSON.stringify(settings), id],
    )
    return rows[0] ? rowToTenant(rows[0]) : null
  }
}
