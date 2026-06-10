import { parseEnv, baseEnvSchema, z } from '@hotel-key/config'

const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3013),
  DATABASE_URL: z.string().url(),
  FABRIC_GATEWAY_ENDPOINT: z.string().default('localhost:7051'),
  FABRIC_MSP_ID: z.string().default('HotelKeyMSP'),
  FABRIC_CERT_PATH: z.string(),
  FABRIC_KEY_PATH: z.string(),
  FABRIC_TLS_CERT_PATH: z.string(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
})

export const config = parseEnv(schema)
export type Config = typeof config
