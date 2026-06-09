import { parseEnv, baseEnvSchema, z } from '@hotel-key/config'

const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3012),
  DATABASE_URL: z.string().url(),
  VAULT_ADDR: z.string().url().default('http://localhost:8200'),
  VAULT_TOKEN: z.string().optional(),
  VAULT_ROLE: z.string().default('vault-service'),
  ENCRYPTION_KEY: z
    .string()
    .length(64, 'Must be 32-byte hex (64 chars)')
    .optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z
    .string()
    .url()
    .default('http://localhost:4318/v1/traces'),
})

export const config = parseEnv(schema)
export type Config = typeof config
