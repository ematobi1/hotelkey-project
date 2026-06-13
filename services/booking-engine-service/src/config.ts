import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(3017),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  REDIS_URL: z.string().url(),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  RESERVATION_SERVICE_URL: z.string().url(),
  ROOM_SERVICE_URL: z.string().url(),
  BILLING_SERVICE_URL: z.string().url(),
  GUEST_SERVICE_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  CART_TTL_SECONDS: z.coerce.number().default(900),
  PENDING_PAYMENT_TTL_SECONDS: z.coerce.number().default(1800),
  RATE_LIMIT_MAX: z.coerce.number().default(30),
})

export const config = schema.parse(process.env)
