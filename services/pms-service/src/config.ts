import { parseEnv, baseEnvSchema, z } from '@hotel-key/config'

const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3008),
  DATABASE_URL: z.string().url(),
})

export const config = parseEnv(schema)
export type Config = typeof config
