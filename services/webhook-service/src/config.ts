import { parseEnv, baseEnvSchema, z } from '@hotel-key/config'

const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3014),
  DATABASE_URL: z.string().url(),
  KAFKA_BROKERS: z.string().default('localhost:9094'),
  DELIVERY_MAX_RETRIES: z.coerce.number().default(5),
  DELIVERY_TIMEOUT_MS: z.coerce.number().default(10000),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
})

export const config = parseEnv(schema)
export type Config = typeof config
