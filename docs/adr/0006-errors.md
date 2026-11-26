# ADR-0006: Error model

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

Every service can fail in two distinct ways: a predictable business failure (a resource does not exist, the caller lacks permission) and an unexpected technical failure (database crash, bug, network error). These two categories have different information needs: the client needs to handle business failures explicitly and gracefully; it must never see internal details of technical failures.

We also need to decide how errors appear in the GraphQL schema and how domain errors are structured in TypeScript, since both decisions affect every mutation and every service.

Constraints:
- GraphQL Yoga is the server (established by the stack).
- Services throw domain errors, not generic `Error` (AGENTS.md).
- Stack traces, SQL queries, and internal state must never reach the client (AGENTS.md security rules).

## Options considered

**GraphQL error surface:**
1. **Schema union types.** Each mutation with known failures returns a union: `CreateUserResult = User | ConflictError`. Fully typed for the client. Verbose — requires a result type per mutation.
2. **Thrown errors with `extensions.code`.** All errors go through GraphQL's `errors[]` array with a machine-readable code. Simpler schema, but the client loses types.
3. **Hybrid.** Predictable business failures → union types. Unexpected errors → standard GraphQL `errors[]` with a generic message. Clients get types for what they must handle; unexpected failures are opaque.

**Domain error shape in TypeScript:**
1. **Class hierarchy.** `class NotFoundError extends DomainError`. Integrates with `throw`/`catch`. The error mapper uses `instanceof` to discriminate.
2. **Discriminated union.** `type DomainError = { type: 'NOT_FOUND' } | ...`. More functional, but doesn't integrate naturally with `throw`.

## Decision

**GraphQL surface:** Hybrid model.
- Mutations with predictable business failures return a union type. The success branch is the domain object; the error branches are specific error types.
- Unexpected errors (bugs, infrastructure failures) go through GraphQL's standard `errors[]` array. The client receives a generic message and a correlation ID. No internal details.

**Domain error types in TypeScript:** Class hierarchy extending a base `DomainError` class. The error mapper in Yoga uses `instanceof DomainError` to detect business errors and maps them to the appropriate GraphQL union branch.

**Base error types shipped by the core** (in `server/errors/`):

| Class | When to throw | HTTP analogue |
|---|---|---|
| `NotFoundError(entity, id)` | The requested resource does not exist | 404 |
| `UnauthorizedError()` | The caller is not authenticated | 401 |
| `ForbiddenError(message?)` | Authenticated but lacks permission | 403 |
| `ConflictError(field, message)` | The operation violates a uniqueness constraint | 409 |
| `ValidationError(field, message)` | A business rule fails (distinct from shape validation) | 422 |

Apps add their own domain errors by extending `DomainError`. They never redefine or override the five base types.

**Information disclosure policy:**
- Business errors (`instanceof DomainError`): sent to the client with a human-readable message and the specific error type. Logged at `info`/`warn` level.
- Unexpected errors: the client receives `"An unexpected error occurred"` and a correlation ID. The server logs the full stack trace, original message, and request context. Nothing else leaves the server.
- What never leaves the server: stack traces, SQL queries, file paths, internal variable values, environment variable contents.

## Consequences

- The client knows statically what can fail in each mutation — no runtime inspection of error codes required.
- `UnauthorizedError` and `ForbiddenError` are distinct types: the client can redirect to login (401) or show "access denied" (403) without string matching.
- `ValidationError` as a domain error covers business rules Zod cannot detect (e.g. "cannot change email more than once per week") — no overlap with ADR-0005 shape validation.
- The error mapper is the single place that decides what reaches the client. Services just throw; they do not format error responses.
- Apps extend the error vocabulary without touching core types.
- Mutations with no predictable business failures return the domain object directly (no union needed). If a failure mode is added later, the return type changes — that is a breaking change and requires a schema version bump.

## Rules for agents

- Every mutation with a predictable business failure must return a union type. Never put business failures in `errors[]`.
- Services throw `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, or `ValidationError` for expected failures. Never throw `new Error('...')` for a business case.
- The Yoga error formatter detects `instanceof DomainError` and routes to the union branch. Everything else is an unexpected error.
- Unexpected errors: the client receives only a generic message and a correlation ID. Stack trace, SQL, internal state — never to the client.
- Apps extend `DomainError` for their own errors. The five core types are not modified.
- `ValidationError` is for business rule failures only. Shape validation is Zod's responsibility (ADR-0005); do not throw `ValidationError` for input that Zod already rejects.
