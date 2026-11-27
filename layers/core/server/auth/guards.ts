import type { ServiceContext, AuthenticatedContext } from '../types/context'
import type { UserRole } from './types'
import { UnauthorizedError, ForbiddenError } from '../errors'

export function requireAuth(ctx: ServiceContext): asserts ctx is AuthenticatedContext {
  if (!ctx.user) {
    throw new UnauthorizedError()
  }
}

export function requireRole(ctx: ServiceContext, role: UserRole): asserts ctx is AuthenticatedContext {
  requireAuth(ctx)
  if (ctx.user.role !== role) {
    throw new ForbiddenError()
  }
}
