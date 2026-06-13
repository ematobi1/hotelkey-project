import pg from 'pg'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const { Client } = pg

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const RDS_HOST = 'hotel-key-demo.c0zq8ks60dxz.us-east-1.rds.amazonaws.com'
const RDS_USER = 'hotelkey'
const RDS_PASS = process.env.RDS_PASSWORD

if (!RDS_PASS) {
  console.error('Error: RDS_PASSWORD environment variable is not set.')
  console.error('Run: $env:RDS_PASSWORD = "<password>"; node scripts/run-migrations.mjs')
  process.exit(1)
}

const SERVICE_DB_MAP = {
  'auth-service':            'hotel_key_auth',
  'guest-service':           'hotel_key_guest',
  'reservation-service':     'hotel_key_reservation',
  'room-service':            'hotel_key_room',
  'billing-service':         'hotel_key_billing',
  'housekeeping-service':    'hotel_key_housekeeping',
  'notification-service':    'hotel_key_notification',
  'pms-service':             'hotel_key_pms',
  'channel-manager-service': 'hotel_key_channel_manager',
  'vault-service':           'hotel_key_vault',
  'consent-service':         'hotel_key_consent',
  'integration-service':     'hotel_key_integration',
  'bi-service':              'hotel_key_bi',
  'maintenance-service':     'hotel_key_maintenance',
  'lock-service':            'hotel_key_lock',
  'webhook-service':         'hotel_key_webhook',
}

async function runMigrationsForService(serviceName, dbName) {
  const migrationsDir = join(ROOT, 'services', serviceName, 'src', 'db', 'migrations')

  let files
  try {
    files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  } catch {
    console.log(`  [${serviceName}] no migrations dir — skip`)
    return
  }

  if (files.length === 0) {
    console.log(`  [${serviceName}] no SQL files — skip`)
    return
  }

  const client = new Client({
    host: RDS_HOST,
    port: 5432,
    user: RDS_USER,
    password: RDS_PASS,
    database: dbName,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })

  await client.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const { rows } = await client.query('SELECT filename FROM schema_migrations')
    const applied = new Set(rows.map(r => r.filename))

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  [${serviceName}] ${file} already applied`)
        continue
      }
      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`  [${serviceName}] ${file} applied`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    }
  } finally {
    await client.end()
  }
}

console.log('Running migrations against RDS...\n')
let failed = 0

for (const [service, db] of Object.entries(SERVICE_DB_MAP)) {
  process.stdout.write(`\n${service} -> ${db}\n`)
  try {
    await runMigrationsForService(service, db)
  } catch (err) {
    console.error(`  FAILED: ${err.message}`)
    failed++
  }
}

console.log(`\n${failed === 0 ? 'All migrations complete.' : `Done with ${failed} failure(s).`}`)
