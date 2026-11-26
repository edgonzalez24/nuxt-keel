# ADR-0014: Database tests

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

Service tests (ADR-0003) need a database. The choice of test backend determines what bugs the test suite can catch — an in-memory mock catches logic bugs but misses constraint violations, transaction behavior, and Prisma query quirks that only appear against a real Postgres engine.

Constraints:
- AGENTS.md: "Service tests use real Postgres or test doubles. Do not mock Prisma ad hoc."
- Tests must be runnable locally without internet access.
- CI runs on GitHub Actions.

## Options considered

**Database backend:**
1. **Postgres in local Docker / GitHub Actions service container.** Same engine as Neon (production). Catches real DB issues. Works offline. GitHub Actions provides `services:` to start Postgres as a sidecar without Docker Compose in CI.
2. **Neon branch per PR.** Each PR gets an ephemeral Neon branch. No Docker required. Adds network latency to every test run; has compute cost per branch; fails without connectivity.
3. **In-memory doubles.** Fast. Does not catch constraint violations, transaction semantics, or Prisma behavior. Contradicts the "do not mock Prisma ad hoc" rule.

**Test isolation:**
1. **Transaction rollback.** Wrap each test in a Prisma interactive transaction and roll it back. Fast, no disk writes. Breaks when the service under test opens its own nested transaction (Postgres does not support true nested transactions).
2. **Truncate before each test.** Delete all rows in the correct foreign-key order before each test. Slightly slower but works with all query types, including tests that exercise cross-service transactions (ADR-0003).

## Decision

**Database backend:** Postgres in Docker locally; GitHub Actions service container in CI. Image: `postgres:17-alpine` (matches Neon's major version).

**Local setup:** A `docker-compose.yml` at the monorepo root provides a one-command Postgres instance for development and testing:

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: nuxt_keel_dev
    ports:
      - "5432:5432"
```

**Test database URL:** An explicit `TEST_DATABASE_URL` environment variable, separate from `DATABASE_URL`. This prevents accidentally running tests against the development or production database. Documented in `.env.example`:

```
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nuxt_keel_test
```

If `TEST_DATABASE_URL` is not set when the test suite starts, Vitest fails fast with a clear error.

**Test isolation:** Truncate before each test using a shared helper.

**`clearDatabase()` helper** (exported from `layers/core/test/helpers.ts`):

```ts
export async function clearDatabase(db: PrismaClient): Promise<void> {
  // Truncate child tables before parent tables to respect foreign keys
  await db.$executeRaw`TRUNCATE TABLE "Session", "User" ... RESTART IDENTITY CASCADE`
}
```

Usage in every service test file:

```ts
import { clearDatabase } from '@edgonzalez24/nuxt-keel/test'

beforeEach(async () => clearDatabase(db))
```

Apps that add their own tables extend the helper or write their own, calling the core helper first.

## Consequences

- Service tests catch real constraint violations, transaction behavior, and Prisma query semantics.
- `pnpm test` requires a running Postgres instance. `docker compose up -d` is the local prerequisite — documented in the README.
- In CI, the GitHub Actions `services:` block starts Postgres as a sidecar. No Docker Compose in the CI pipeline.
- Each test run is fully isolated — no shared state between test files or test cases.
- The `clearDatabase()` helper is the single source of truth for table order. When a new table is added to `schema.prisma`, its name is added to the helper.

## Rules for agents

- Never mock Prisma ad hoc. Service tests run against a real Prisma client connected to `TEST_DATABASE_URL`.
- Every service test file calls `clearDatabase(db)` in `beforeEach`. No test may rely on state left by a previous test.
- `clearDatabase()` must truncate tables in foreign-key order: child tables before parent tables. Use `RESTART IDENTITY CASCADE` to reset sequences.
- When a new table is added to `schema.prisma`, add it to `clearDatabase()` in the correct order.
- If `TEST_DATABASE_URL` is absent at test startup, throw a clear error rather than falling back to `DATABASE_URL`.
