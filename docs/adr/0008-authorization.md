# ADR-0008: Authorization

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

Every service that handles protected resources must enforce access control. We need to decide where authorization checks live, what model the core ships, how checks are expressed in code, and how the first administrator is bootstrapped.

Constraints:
- Authorization must be enforced server-side regardless of the caller (resolver, background job, test) — AGENTS.md rule.
- Services receive `ctx.user: { id, role } | null` (ADR-0003).
- Per-resource permissions are domain-specific and do not pass the ADR-0018 admission test.

## Options considered

**Where authorization checks live:**
1. **Services only.** The service is the only barrier; all callers go through the same check.
2. **GraphQL directives/plugin + services.** Convenience guards at the resolver level alongside service checks. Creates two parallel systems; if they diverge, the service wins — the directive was false confidence.

**Authorization model:**
1. **Simple RBAC.** A `role` field on the user record. Services check `ctx.user.role`.
2. **Per-resource permissions.** A `permissions(userId, resourceType, resourceId, action)` table. Domain-specific; fails ADR-0018's universal criterion.

**Roles in Prisma:**
1. **Enum (`enum UserRole { user admin }`)** — type-safe, but apps cannot add roles without modifying the core schema.
2. **`String` field + TypeScript union type** — `type UserRole = 'user' | 'admin'`. Apps extend the TypeScript type without a Prisma migration.

**Admin bootstrap:**
1. **Seed script / direct DB update** — no API surface, requires DB access in production.
2. **`promoteToAdmin` mutation** — requires an existing admin; does not solve the initial bootstrap.
3. **`INITIAL_ADMIN_EMAIL` env var** — at startup, the core checks whether a user with that email exists and has no admin role, and upgrades them. Secure, no DB access required.

## Decision

**Authorization location:** Services only. No GraphQL directives or auth plugins. The service is the single enforcement point regardless of the entry path.

**Model:** Simple RBAC. The user record has a `role: String` field in Prisma. The core exports a TypeScript union type:

```ts
// server/auth/roles.ts
export type UserRole = 'user' | 'admin'
```

Apps extend it with:
```ts
type AppUserRole = UserRole | 'editor' | 'viewer'
```

No enum in `schema.prisma` — additional roles do not require a migration.

**Default role:** `'user'` assigned at registration.

**Authorization helpers** (in `server/auth/guards.ts`):

```ts
export function requireAuth(ctx: ServiceContext): asserts ctx is AuthenticatedContext
export function requireRole(ctx: ServiceContext, role: UserRole): void
```

`requireAuth` uses TypeScript's `asserts` keyword — after the call, `ctx.user` is narrowed to non-null for the rest of the function. Both helpers throw the appropriate domain error on failure (`UnauthorizedError` or `ForbiddenError`).

**Admin bootstrap:** `INITIAL_ADMIN_EMAIL` environment variable. At application startup, the core checks whether a user with that email exists and their role is not `'admin'`, and updates it to `'admin'`. The check is idempotent and runs only at startup. The variable is documented in `.env.example`.

## Consequences

- After `requireAuth(ctx)`, TypeScript knows `ctx.user` is non-null — no `!` or null checks for the rest of the service function.
- Authorization cannot be bypassed by calling a service from a non-resolver entry point.
- Apps add roles by extending the TypeScript type, with no Prisma schema change required.
- Advanced role management (promote, demote) is implemented by apps with their own protected mutations. The core does not ship a `promoteToAdmin` mutation.
- `INITIAL_ADMIN_EMAIL` is the only mechanism for the first admin — no open promotion endpoint exists in the core.
- Per-resource permissions (can user X edit document Y?) belong to the app domain. The core does not provide a permissions table or permission-checking helpers beyond `requireRole`.

## Rules for agents

- Call `requireAuth(ctx)` or `requireRole(ctx, role)` at the start of every service function that requires authentication or a specific role. Never use inline `if (!ctx.user)` checks.
- Do not add GraphQL directives or plugins for authorization. All authorization goes in services.
- `role` is `String` in `schema.prisma`. Do not create a `UserRole` enum in the Prisma schema.
- `INITIAL_ADMIN_EMAIL` must be documented in `.env.example` with a placeholder value. The startup check must be idempotent.
- Per-resource permissions are out of core scope. Do not add a permissions table or ABAC helpers without an ADR amendment.
- Apps that need additional roles extend `UserRole` in their own TypeScript types. The core types are not modified.
