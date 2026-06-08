import { describe, it, expect } from 'vitest'
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ValidationError,
  BadRequestError,
  ServiceUnavailableError,
} from '../errors'

describe('AppError', () => {
  it('sets code, message, statusCode and name', () => {
    const err = new AppError('CUSTOM', 'something went wrong', 418)
    expect(err.code).toBe('CUSTOM')
    expect(err.message).toBe('something went wrong')
    expect(err.statusCode).toBe(418)
    expect(err.name).toBe('AppError')
    expect(err instanceof Error).toBe(true)
  })

  it('defaults statusCode to 500', () => {
    const err = new AppError('ERR', 'msg')
    expect(err.statusCode).toBe(500)
  })

  it('stores optional details', () => {
    const err = new AppError('ERR', 'msg', 400, { foo: 'bar' })
    expect(err.details).toEqual({ foo: 'bar' })
  })
})

describe('NotFoundError', () => {
  it('formats message and returns 404', () => {
    const err = new NotFoundError('Guest', 'abc-123')
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toContain('abc-123')
  })
})

describe('UnauthorizedError', () => {
  it('returns 401 with default message', () => {
    const err = new UnauthorizedError()
    expect(err.statusCode).toBe(401)
    expect(err.code).toBe('UNAUTHORIZED')
    expect(err.message).toBe('Unauthorized')
  })

  it('accepts custom message', () => {
    const err = new UnauthorizedError('Bad token')
    expect(err.message).toBe('Bad token')
  })
})

describe('ForbiddenError', () => {
  it('returns 403', () => {
    const err = new ForbiddenError()
    expect(err.statusCode).toBe(403)
  })
})

describe('ConflictError', () => {
  it('returns 409', () => {
    const err = new ConflictError('Already exists')
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe('CONFLICT')
  })
})

describe('ValidationError', () => {
  it('returns 422 with field errors', () => {
    const err = new ValidationError('Invalid', { email: 'Bad format' })
    expect(err.statusCode).toBe(422)
    expect(err.details).toEqual({ fields: { email: 'Bad format' } })
  })
})

describe('BadRequestError', () => {
  it('returns 400', () => {
    const err = new BadRequestError('Bad input')
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe('BAD_REQUEST')
  })
})

describe('ServiceUnavailableError', () => {
  it('returns 503 and names the service', () => {
    const err = new ServiceUnavailableError('Stripe')
    expect(err.statusCode).toBe(503)
    expect(err.message).toContain('Stripe')
  })
})
