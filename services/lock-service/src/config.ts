import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3010),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string(),
  KAFKA_BROKERS: z.string(),
  ASSA_ABLOY_API_BASE_URL: z.string().url(),
  ASSA_ABLOY_API_KEY: z.string(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318/v1/traces'),
})

export const config = schema.parse(process.env)
export type Config = typeof config
