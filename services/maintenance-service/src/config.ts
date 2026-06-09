import { parseEnv, baseEnvSchema, z } from '@hotel-key/config'

const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3009),
  DATABASE_URL: z.string().url(),
  KAFKA_BROKERS: z.string().default('localhost:9094'),
  ML_SERVICE_URL: z.string().url().default('http://localhost:8001'),
  FAILURE_PREDICTION_THRESHOLD: z.coerce.number().default(0.35),
})

export const config = parseEnv(schema)
export type Config = typeof config
