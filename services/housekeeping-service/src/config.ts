import { parseEnv, baseEnvSchema, z } from '@hotel-key/config'

const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3006),
  DATABASE_URL: z.string().url(),
  KAFKA_BROKERS: z.string().default('localhost:9094'),
  JWT_PUBLIC_KEY_BASE64: z.string().min(1),
  ML_SERVICE_URL: z.string().url().default('http://localhost:8001'),
})

export const config = parseEnv(schema)
export type Config = typeof config
