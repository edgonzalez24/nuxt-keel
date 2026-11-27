import { describe, it, expect } from 'vitest'
import { requireAuth, requireRole } from './guards'
import { UnauthorizedError, ForbiddenError } from '../errors'
import type { ServiceContext } from '../types/context'

function makeCtx(user: ServiceContext['user'] = null): ServiceContext {
  return {
    user,
    db: {} as ServiceContext['db'],
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      child: () => ({} as ServiceContext['logger']),
    },
  }
}

describe('requireAuth', () => {
  it('throws UnauthorizedError when user is null', () => {
    expect(() => requireAuth(makeCtx(null))).toThrow(UnauthorizedError)
  })

  it('does not throw when user is present', () => {
    expect(() => requireAuth(makeCtx({ id: '1', role: 'user' }))).not.toThrow()
  })

  it('narrows ctx.user to non-null after the call', () => {
    const ctx = makeCtx({ id: '1', role: 'user' })
    requireAuth(ctx)
    // TypeScript asserts ctx.user is non-null here — runtime smoke test
    expect(ctx.user?.id).toBe('1')
  })
})

describe('requireRole', () => {
  it('throws UnauthorizedError when user is null', () => {
    expect(() => requireRole(makeCtx(null), 'admin')).toThrow(UnauthorizedError)
  })

  it('throws ForbiddenError when role does not match', () => {
    expect(() => requireRole(makeCtx({ id: '1', role: 'user' }), 'admin')).toThrow(ForbiddenError)
  })

  it('does not throw when role matches', () => {
    expect(() => requireRole(makeCtx({ id: '1', role: 'admin' }), 'admin')).not.toThrow()
  })
})
