import type { PrismaClient, Prisma } from '@prisma/client'

export interface Logger {
  info(msg: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
  child(bindings: Record<string, unknown>): Logger
}

export interface ServiceContext {
  user: { id: string; role: string } | null
  db: PrismaClient | Prisma.TransactionClient
  logger: Logger
}

export type AuthenticatedContext = ServiceContext & { user: { id: string; role: string } }
