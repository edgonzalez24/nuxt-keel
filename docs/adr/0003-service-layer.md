# ADR-0003: Service layer boundaries

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

The core needs a consistent pattern for where business logic lives, how it accesses the database, and how it coordinates across multiple operations. Without a clear boundary, Prisma calls spread into resolvers, authorization checks get duplicated, and testing becomes hard.

Constraints:
- Prisma is the only ORM; direct access must be contained.
- GraphQL resolvers must stay thin and testable.
- Authorization must be enforced server-side regardless of the caller (resolver, REST route, background job).
- Services must be testable in isolation without mounting a full Nuxt app.

## Options considered

**Context shape — `user` field:**
1. Full `User` record from Prisma. Convenient, but propagates stale data if the caller cached the object.
2. Minimal `{ id: string; role: string } | null`. The service fetches more fields only when needed. Forces freshness.

**Context shape — `db` field:**
1. `PrismaClient` only. Simple, but cross-service transactions require the outer caller to coordinate without a clean mechanism.
2. `PrismaClient | Prisma.TransactionClient`. Services are unaware of whether they run inside a transaction; the outer service controls atomicity by passing `tx` as `db`.

**Transaction ownership:**
1. Each service opens its own transactions internally. Cross-service atomicity is impossible without coupling.
2. The outer service opens a `$transaction` and passes `tx` as `db` in the context to inner services. Inner services see no difference.
3. The resolver opens transactions. Breaks the rule that resolvers never import Prisma.

**Service-to-service calls:**
1. Forbidden. Shared logic goes in utility functions. Avoids coupling but forces duplication for shared queries.
2. Allowed with a strict acyclic hierarchy. If A calls B, B cannot call A — directly or transitively. Same context is passed through.

## Decision

**Context shape:** Every service receives a `ServiceContext`:

```ts
interface ServiceContext {
  user: { id: string; role: string } | null
  db: PrismaClient | Prisma.TransactionClient
  logger: Logger
}
```

`tenant` is not included until ADR-0009 is resolved. It will slot in as an additional field without breaking existing services.

**Transaction ownership:** The outer service opens the transaction. Inner services receive `tx` as `db` in the context and are unaware they are inside a transaction:

```ts
await ctx.db.$transaction(tx =>
  innerService.method({ ...ctx, db: tx })
)
```

Resolvers never open transactions and never import `PrismaClient`.

**Service-to-service calls:** Allowed, subject to a strict acyclic dependency rule. If service A calls service B, service B cannot call service A — directly or transitively. The dependency direction must be documented when a new service is created. The called service receives the same context.

## Consequences

- Resolvers are thin: validate input, assemble context, call one service, return result. Zero Prisma imports.
- Cross-service transactions are possible without inner services knowing about them.
- The `ServiceContext` type is defined and exported from the layer. Extending apps use the same type.
- Authorization logic lives in services and cannot be bypassed by calling a service from a background job or a different route.
- Circular service dependencies are a code-review error. No automated enforcement pre-1.0.
- If a service needs more than `{ id, role }` from the user, it fetches the full record from `ctx.db` itself — this is intentional to avoid stale data.
- Tenant support will extend `ServiceContext` once ADR-0009 is settled, with no changes required to existing services.

## Rules for agents

- Every service function receives `ServiceContext` as its first argument. Services never call `useRuntimeConfig()`, access `H3Event`, or import `PrismaClient` directly.
- `ctx.user` is `{ id: string; role: string } | null`. Do not widen this type or pass a full `User` record as `user`.
- To run a cross-service transaction, the outer service calls `ctx.db.$transaction(tx => other.method({ ...ctx, db: tx }))`.
- No circular service dependencies. When creating a new service that calls another, document the dependency direction in a comment at the top of the file.
- Resolvers never import `PrismaClient`, `Prisma`, or any transaction type. If a resolver needs to coordinate a transaction, it is a sign that logic belongs in a service.
- Authorization checks go inside the service, not in the resolver. A service must be safe to call from any entry point.
