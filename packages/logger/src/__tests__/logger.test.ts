import { describe, it, expect } from 'vitest'
import { createLogger } from '../index'

describe('createLogger', () => {
  it('returns a logger with expected methods', () => {
    const logger = createLogger({ service: 'test', pretty: false })
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.fatal).toBe('function')
  })

  it('respects the level option', () => {
    const logger = createLogger({ service: 'test', level: 'warn', pretty: false })
    expect(logger.level).toBe('warn')
  })

  it('defaults level to info', () => {
    const logger = createLogger({ service: 'test', pretty: false })
    expect(logger.level).toBe('info')
  })
})
