import { parseEnv, baseEnvSchema, z } from '@hotel-key/config'

const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().min(1024).max(65535).default(3001),
  DATABASE_URL: z.string().url(),
  JWT_PRIVATE_KEY_BASE64: z.string().min(1),
  JWT_PUBLIC_KEY_BASE64: z.string().min(1),
  JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  JWT_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  MFA_ENCRYPTION_KEY: z.string().length(64, 'Must be 32-byte hex (64 chars)'),
  KAFKA_BROKERS: z.string().default('localhost:9094'),
})

export const config = parseEnv(schema)
export type Config = typeof config
