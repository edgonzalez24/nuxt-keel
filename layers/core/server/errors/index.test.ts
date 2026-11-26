import { describe, it, expect } from 'vitest'
import {
  DomainError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from './index'

describe('DomainError hierarchy', () => {
  describe('NotFoundError', () => {
    it('is instanceof DomainError', () => {
      expect(new NotFoundError('User', '123')).toBeInstanceOf(DomainError)
    })
    it('is instanceof Error', () => {
      expect(new NotFoundError('User', '123')).toBeInstanceOf(Error)
    })
    it('includes entity and id in message', () => {
      const e = new NotFoundError('User', '123')
      expect(e.message).toContain('User')
      expect(e.message).toContain('123')
    })
  })

  describe('UnauthorizedError', () => {
    it('is instanceof DomainError', () => {
      expect(new UnauthorizedError()).toBeInstanceOf(DomainError)
    })
  })

  describe('ForbiddenError', () => {
    it('is instanceof DomainError', () => {
      expect(new ForbiddenError()).toBeInstanceOf(DomainError)
    })
    it('accepts an optional message', () => {
      const e = new ForbiddenError('admin only')
      expect(e.message).toContain('admin only')
    })
  })

  describe('ConflictError', () => {
    it('is instanceof DomainError', () => {
      expect(new ConflictError('email', 'already in use')).toBeInstanceOf(DomainError)
    })
    it('includes field and message', () => {
      const e = new ConflictError('email', 'already in use')
      expect(e.message).toContain('email')
      expect(e.message).toContain('already in use')
    })
  })

  describe('ValidationError', () => {
    it('is instanceof DomainError', () => {
      expect(new ValidationError('name', 'too short')).toBeInstanceOf(DomainError)
    })
    it('includes field and message', () => {
      const e = new ValidationError('name', 'too short')
      expect(e.message).toContain('name')
      expect(e.message).toContain('too short')
    })
  })
})
