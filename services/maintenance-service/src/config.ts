import { parseEnv, baseEnvSchema, z } from '@hotel-key/config'

const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3009),
  DATABASE_URL: z.string().url(),
  KAFKA_BROKERS: z.string().default('localhost:9094'),
})

export const config = parseEnv(schema)
export type Config = typeof config
