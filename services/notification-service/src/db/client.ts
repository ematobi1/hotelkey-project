import { Pool } from 'pg'
import { MongoClient, Db } from 'mongodb'
import { config } from '../config'

let pgPool: Pool | null = null
let mongoClient: MongoClient | null = null
let mongoDb: Db | null = null

export function getPool(): Pool {
  if (!pgPool) {
    pgPool = new Pool({ connectionString: config.DATABASE_URL, max: 10 })
    pgPool.on('error', (err) => console.error('Idle PostgreSQL client error', err))
  }
  return pgPool
}

export async function getMongoDB(): Promise<Db> {
  if (!mongoClient) {
    mongoClient = new MongoClient(config.MONGODB_URL, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    })
    mongoDb = mongoClient.db()
  }
  return mongoDb!
}

export async function closeConnections(): Promise<void> {
  if (pgPool) { await pgPool.end(); pgPool = null }
  if (mongoClient) { await mongoClient.close(); mongoClient = null; mongoDb = null }
}
