import { parseEnv, baseEnvSchema, z } from '@hotel-key/config'

const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3016),
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  ML_SERVICE_URL: z.string().url().default('http://localhost:8001'),
  RESERVATION_SERVICE_URL: z.string().url().default('http://localhost:3003'),
  ROOM_SERVICE_URL: z.string().url().default('http://localhost:3004'),
  BILLING_SERVICE_URL: z.string().url().default('http://localhost:3005'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
})

export const config = parseEnv(schema)
export type Config = typeof config
