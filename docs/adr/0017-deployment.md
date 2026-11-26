# ADR-0017: Deployment

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

The core targets Fly.io (compute) + Neon (Postgres) as its deployment stack. Three concerns need explicit decisions: when database migrations run relative to the deployment, how to run per-PR preview environments, and what the rollback strategy is when a migration causes problems in production.

## Options considered

**Migration timing:**
1. **Fly `release_command`** — Fly runs the migration before swapping traffic to the new instance. If the migration fails, Fly aborts the deploy and the previous instance keeps serving. Code and schema always match.
2. **CI step (pre-deploy)** — migration runs in GitHub Actions before `fly deploy`. Risk: if the migration succeeds but `fly deploy` then fails, the schema is migrated but the old code is still running — a potential mismatch.
3. **Manual** — migrations run by hand. Prone to human error; ruled out.

**Preview environments:**
1. **Neon branch per PR** — Neon supports instant copy-on-write branching. Each PR gets an isolated Neon branch and a Fly preview app. Deleted automatically on PR close.
2. **Shared staging** — one staging environment for all PRs. PRs can interfere with each other.
3. **None** — local tests only. Zero infrastructure, but no live preview before merging.

**Migration rollback:**
1. **Forward-only** — if a migration causes problems, write a new corrective migration. Each migration must be backward-compatible with the previous version of the app code.
2. **Down migrations** — maintain a rollback script per migration. Risk: data written between up and down migration can be lost or corrupt on rollback.
3. **Neon point-in-time restore** — Neon supports restoring to any timestamp. Valid as a last-resort disaster recovery tool, not as a routine rollback process.

## Decision

**Migration timing:** Fly `release_command`.

```toml
# fly.toml
[deploy]
  release_command = "npx prisma migrate deploy"
```

Fly executes this command in a one-off VM before routing any traffic to the new release. If it exits non-zero, Fly aborts the deployment and the previous version continues serving. Schema and code are always in sync.

**Health check endpoint:** The core ships a `/api/health` route:

```ts
// layers/core/server/routes/health.get.ts
export default defineEventHandler(() => ({ status: 'ok' }))
```

Fly uses this for HTTP health checks before promoting a new release to live traffic. The endpoint returns HTTP 200 with `{ status: 'ok' }`. It performs no database query and contains no business logic — it signals only that the Nuxt server started and the env validation passed (ADR-0016). Apps that want a deeper check add their own route.

```toml
# fly.toml
[[http_service.checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  path = "/api/health"
  timeout = "5s"
```

**Preview environments:** Neon branch per PR + Fly preview app.

The Neon GitHub integration creates a branch from the production branch when a PR is opened and deletes it when the PR is closed or merged. The GitHub Actions workflow deploys a Fly preview app pointed at that Neon branch URL for the duration of the PR.

Workflow templates live in `apps/starter/.github/workflows/`. New projects copy them. The core layer itself is not deployed directly — it has no `fly.toml`.

**Migration rollback:** Forward-only. No down migrations. If a migration causes a production incident, the fix is a new corrective migration. Neon point-in-time restore is the last-resort tool for data-loss disasters.

**Backward-compatibility requirement:** Because the previous version of the code may still be running during the `release_command` window, every migration must be backward-compatible with the code at `HEAD~1`. Concretely:

- **Safe:** adding a nullable column, adding a table, adding an index.
- **Unsafe in a single migration:** renaming a column, dropping a column, changing a column type, adding a NOT NULL column without a default.
- **Multi-step pattern for breaking changes:** (1) add the new column/table, (2) deploy code that writes to both old and new, (3) backfill, (4) deploy code that reads only the new, (5) drop the old in a final migration.

## Consequences

- Schema and code never mismatch in production — `release_command` ties them atomically.
- Each PR has a full isolated environment (DB + app) for review before merging.
- The forward-only constraint makes production deployments safer but requires discipline when doing breaking schema changes.
- Neon point-in-time restore is available as an emergency fallback and does not need to be built into the normal workflow.
- The `/api/health` endpoint gives Fly a reliable signal for traffic routing decisions.

## Rules for agents

- Migrations always run via `release_command`, never as a separate CI step before `fly deploy`.
- Every migration must be backward-compatible with the previous commit's code. Use the multi-step pattern for breaking schema changes.
- If a production migration causes problems, write a new corrective migration. Never roll back a migration that has been applied to a non-local database.
- The `/api/health` endpoint returns `{ status: 'ok' }` only. Never add database queries or business logic to it. Apps add their own extended health check if needed.
- Do not run destructive commands (`prisma migrate reset`, `prisma db push`, `DROP TABLE`) against any non-local database without explicit human approval (AGENTS.md).
