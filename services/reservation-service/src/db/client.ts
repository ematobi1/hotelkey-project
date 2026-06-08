import { Pool } from 'pg'
import { config } from '../config'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.DATABASE_URL, max: 20 })
    pool.on('error', (err) => console.error('Idle PostgreSQL client error', err))
  }
  return pool
}

export async function closePool(): Promise<void> {
  if (pool) { await pool.end(); pool = null }
}
