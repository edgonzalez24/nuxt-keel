# ADR-0009: Multi-tenancy

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

Some apps built on this core will need to scope all business data to a tenant (organization, workspace, company). Adding tenancy after the fact requires migrating every table and every query — an expensive, error-prone operation. We need to decide now whether the core supports tenancy, what strategy to use, and how it integrates with the rest of the system.

Constraints:
- Tenancy is not universal (ADR-0018: not every app needs it). It must be opt-in, not mandatory.
- The core does not define what a "tenant" is as a business concept — that is app domain.
- Services receive an explicit context (ADR-0003); any tenancy data must come through that context.

## Options considered

**Whether to include in the core:**
1. **Out of core entirely.** Apps implement their own tenancy layer. Fails the "expensive to add later" test — it touches every table and every query.
2. **Opt-in.** `enableMultiTenancy: true` in module options. The column and context field exist only when activated. Single-tenant apps pay zero cost.
3. **Always on.** Mandatory for all apps. Fails the universal criterion and forces unnecessary complexity on simple apps.

**Implementation strategy:**
1. **`tenantId` column filtered in services.** Each service filters by `ctx.tenant.id`. Simple, Prisma-friendly. Risk: forgetting a filter. Mitigated by `requireTenant(ctx)` guard and conventions.
2. **Postgres Row Level Security (RLS).** DB-level isolation — impossible to forget a filter. Requires Prisma session variable middleware before each query. Powerful but non-trivial for a pre-1.0 opt-in feature.

**Tenant concept in the core:**
1. **Bare `tenantId: String`** — the core scopes data by an opaque ID. The app defines the concept (`Organization`, `Workspace`, `Company`) and its own table.
2. **Core `Tenant` table.** The core manages tenant creation, memberships, invitations. Overlaps with the Better Auth organizations plugin (ADR-0007); imposes terminology on apps.

## Decision

**In the core as opt-in.** Activated with `enableMultiTenancy: true` in module options.

**Strategy:** `tenantId: String?` column on business tables, filtered in services. Postgres RLS is deferred — it can be added as a future enhancement without changing the service API.

**Tenant concept:** Bare `tenantId: String?` — opaque to the core. The app defines its own tenant entity and passes its ID through the hook below.

**`tenantId` in Prisma:** Nullable (`String?`) on every business table. Single-tenant apps leave it null. Apps that activate multi-tenancy backfill existing records when migrating.

**Tenant resolution:** A configurable hook in module options:

```ts
// nuxt.config
defineNuxtConfig({
  nuxtKeel: {
    enableMultiTenancy: true,
    resolveTenant: (event: H3Event) => string | null
  }
})
```

The core calls `resolveTenant(event)` during context assembly and sets `ctx.tenant`. The hook encapsulates how the app determines the tenant (subdomain, session, header, URL parameter — the core does not prescribe it).

**`ServiceContext` extension when multi-tenancy is active:**

```ts
interface ServiceContext {
  user: { id: string; role: UserRole } | null
  db: PrismaClient | Prisma.TransactionClient
  logger: Logger
  tenant?: { id: string } | null  // present only when enableMultiTenancy: true
}
```

**Guard helper** (in `server/auth/guards.ts`):

```ts
export function requireTenant(ctx: ServiceContext): asserts ctx is TenantContext
```

Throws `ForbiddenError` if `ctx.tenant` is null or absent. After the call, TypeScript knows `ctx.tenant.id` is available without null checks. Services that scope data to a tenant call this at the top of the function, after `requireAuth`.

## Consequences

- Single-tenant apps never see `ctx.tenant` in their types and never touch `tenantId` columns.
- Migrating from single to multi-tenant requires: activating the option, adding `tenantId String?` to business tables in a new migration, backfilling records, and adding `requireTenant` calls to relevant services.
- The app owns tenant creation, listing, invitations, and member management. The core owns none of that.
- Cross-tenant data leaks are prevented by convention: every service that accesses scoped data must call `requireTenant(ctx)` before any query.
- Postgres RLS can be layered on top in the future as an additional safety net without changing the service API.
- The core does not validate that the user belongs to the resolved tenant — that is a business rule the service must enforce.

## Rules for agents

- `tenantId` on business tables is always `String?` (nullable). Never non-nullable.
- When `enableMultiTenancy: true`, every service function that accesses tenant-scoped data must call `requireTenant(ctx)` before any database query.
- Do not add tenant creation, listing, invitation, or membership logic to the core. That is app domain.
- The `resolveTenant` hook is the app's responsibility. The core executes it and sets `ctx.tenant`; it does not validate the result.
- Do not reference `tenantId` or `ctx.tenant` in any core code path that runs when `enableMultiTenancy` is off.
- The service is responsible for validating that the authenticated user belongs to `ctx.tenant.id`. This check is a business rule, not a core concern.
