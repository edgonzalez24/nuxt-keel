# ADR-0004: GraphQL schema design

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

The core exposes a GraphQL API built with GraphQL Yoga and Pothos. Before writing any types or resolvers, we need to settle how types are built, how lists are paginated, and what the mutation surface looks like. These decisions shape every future feature slice.

Constraints:
- Pothos is the schema builder (established by the stack).
- The API must be stable independently of the database schema (ADR-0003: service layer boundary).
- The core is a reusable layer — schema conventions must be consistent and teachable.

## Options considered

**Type builder strategy:**
1. **Pothos Prisma plugin** (`prismaObject`, `prismaField`). Fast to write; Pothos reads the Prisma schema and generates resolvers automatically. Couples the public API to the shape of the database tables — a column rename or table restructure leaks into the client.
2. **Hand-mapped types** (`builder.objectType`, explicit field resolvers). More code per type, but the GraphQL API evolves independently of the database. Renaming a Prisma field does not change what the client sees.

**Pagination:**
1. **Relay connections** (`{ edges { node cursor } pageInfo { hasNextPage endCursor } }`). The GraphQL standard. Compatible with Apollo Client, Relay, URQL out of the box. `@pothos/plugin-relay` generates connections automatically.
2. **Offset/limit** (`{ items: [...] total: Int }`). Simpler to implement and consume, but non-standard. Requires migration if a project later integrates a standard GraphQL client.

**Subscriptions:**
1. **In the core** — Yoga supports SSE natively. Adds stateful connection management and pub/sub infrastructure requirements (in-memory breaks on multi-instance deployments).
2. **Out of core** — apps implement subscriptions on top of the layer when needed.

**IDs:**
1. **Relay global IDs** (`base64("Type:uuid")`). Globally unique across types. Enables `node(id: ID!)` and client-side cache normalization.
2. **Plain UUIDs** from Postgres. Simpler to debug in logs; not globally unique across types.

## Decision

**Type builder:** Hand-mapped types using `builder.objectType()` and explicit field resolvers. The Pothos Prisma plugin (`@pothos/plugin-prisma`) is not used in the core. One pattern for all types and resolvers.

**Pagination:** Relay connections via `@pothos/plugin-relay`. All list fields return a Relay connection — no exceptions. Consistency is more valuable than avoiding boilerplate for small lists; a list that starts small can grow, and migrating from `[T!]!` to `TConnection` is a breaking change.

**Global IDs:** All types exposed in GraphQL use Relay global IDs. The `@pothos/plugin-relay` plugin generates them automatically when types implement the `Node` interface.

**`node(id: ID!)` query:** Implemented. All exposed types implement the `Node` interface. This completes the Relay support and enables Apollo Client and Relay to normalize their cache without additional configuration.

**Subscriptions:** Out of scope for the core. Apps implement them on top of the layer when needed.

**Mutation naming:** Flat convention — verb + resource in camelCase (`createUser`, `updateUser`, `deleteUser`, `uploadFile`). No namespaced mutations.

## Consequences

- The GraphQL API and the Prisma schema are independent surfaces. A database refactor does not force a client-facing breaking change.
- Apollo Client and Relay work with normalized caching out of the box.
- A single resolver pattern across the entire codebase — no mixture of `prismaObject` and `objectType`.
- Lists never migrate from array to connection: they are connections from day one.
- Subscriptions are not a core concern; each app decides its own real-time strategy.
- Global IDs are opaque to the client. Logs and debugging require base64 decoding to recover the underlying UUID. This is an accepted tradeoff.

## Rules for agents

- Never import `@pothos/plugin-prisma` or use `prismaObject` / `prismaField` in `layers/core/`.
- Every type exposed in the GraphQL API must implement the `Node` interface and use a Relay global ID.
- Every list field must return a Relay connection type. Never use `[T!]!` for a list in the public schema.
- Mutations follow the flat naming convention: `createX`, `updateX`, `deleteX`. No namespacing under a resource object.
- The Prisma type and the GraphQL type for the same concept are separate. A change to one does not automatically propagate to the other.
- Subscriptions are out of scope. Do not add subscription support to the core without an ADR amendment.
