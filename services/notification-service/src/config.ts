import { parseEnv, baseEnvSchema, z } from '@hotel-key/config'

const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3007),
  DATABASE_URL: z.string().url(),
  MONGODB_URL: z.string().url(),
  KAFKA_BROKERS: z.string().default('localhost:9094'),
  JWT_PUBLIC_KEY_BASE64: z.string().min(1),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SES_FROM_ADDRESS: z.string().email(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
})

export const config = parseEnv(schema)
export type Config = typeof config
