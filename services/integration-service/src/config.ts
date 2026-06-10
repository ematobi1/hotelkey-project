import { parseEnv, baseEnvSchema, z } from '@hotel-key/config'

const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3015),
  DATABASE_URL: z.string().url(),
  KAFKA_BROKERS: z.string().default('localhost:9094'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  LIGHTSPEED_API_KEY: z.string().optional(),
  ORACLE_SIMPHONY_API_KEY: z.string().optional(),
  SQUARE_API_KEY: z.string().optional(),
  DORMAKABA_API_KEY: z.string().optional(),
  SALTO_API_KEY: z.string().optional(),
  CLOUDBEDS_API_KEY: z.string().optional(),
  RATEGAIN_API_KEY: z.string().optional(),
  GUESTLINE_API_KEY: z.string().optional(),
  HIJIFFY_API_KEY: z.string().optional(),
  WHISTLE_API_KEY: z.string().optional(),
  OAKY_API_KEY: z.string().optional(),
  ROOMDEX_API_KEY: z.string().optional(),
  IDEAS_API_KEY: z.string().optional(),
  DUETTO_API_KEY: z.string().optional(),
  LODGISTICS_API_KEY: z.string().optional(),
  M3_API_KEY: z.string().optional(),
  ECOSMART_API_KEY: z.string().optional(),
  WINNOW_API_KEY: z.string().optional(),
})

export const config = parseEnv(schema)
export type Config = typeof config
