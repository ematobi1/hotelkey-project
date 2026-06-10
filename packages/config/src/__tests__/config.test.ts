import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { baseEnvSchema, parseEnv } from '../index'

describe('parseEnv', () => {
  it('parses valid env with defaults', () => {
    const result = parseEnv(baseEnvSchema, {})
    expect(result.NODE_ENV).toBe('development')
    expect(result.LOG_LEVEL).toBe('info')
    expect(result.HOST).toBe('0.0.0.0')
  })

  it('accepts provided values', () => {
    const result = parseEnv(baseEnvSchema, {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      HOST: '127.0.0.1',
    })
    expect(result.NODE_ENV).toBe('production')
    expect(result.LOG_LEVEL).toBe('warn')
    expect(result.HOST).toBe('127.0.0.1')
  })

  it('throws on invalid enum value', () => {
    expect(() =>
      parseEnv(baseEnvSchema, { NODE_ENV: 'staging' }),
    ).toThrow('Invalid environment variables')
  })

  it('works with extended schema', () => {
    const schema = baseEnvSchema.extend({
      PORT: z.coerce.number().default(3000),
    })
    const result = parseEnv(schema, { PORT: '8080' })
    expect(result.PORT).toBe(8080)
  })

  it('throws with all invalid fields listed', () => {
    const schema = z.object({ REQUIRED: z.string().min(1) })
    expect(() => parseEnv(schema, {})).toThrow('REQUIRED')
  })
})
