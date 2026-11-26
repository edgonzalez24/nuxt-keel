# AGENTS.md
 
Instructions for coding agents (Claude Code, Codex, Cursor, Copilot, etc.) working in this repository.
This is the single source of truth: `CLAUDE.md` only imports this file.
 
> Draft v0. Lines marked `[ADR-XXXX]` depend on a pending decision in `docs/adr/`.
> If a decision is still "Pending", do not make it yourself: ask.
 
## What this repo is
 
A reusable core for full-stack Nuxt apps. It provides auth, a GraphQL API, the database layer, HTTP security, file storage and testing.
It contains no product domain logic. Anything specific to one product belongs in the app that extends the core, not here.
 
Stack: Nuxt 4, Vue, Nuxt UI 4, Tailwind CSS 4, GraphQL Yoga + Pothos, PostgreSQL + Prisma 7, Better Auth (database-backed sessions), Cloudflare R2 + Sharp, Vitest. Deployed on Fly.io, Neon and Resend.
 
## Commands
 
Use these commands to verify your work. Do not report a task as done without running them.
 
| Command | What it does |
| --- | --- |
| `pnpm install` | Install monorepo dependencies |
| `pnpm dev` | Run the example app (`apps/starter`) |
| `pnpm check` | Lint + typecheck + tests. **Must pass before every commit** |
| `pnpm test` | Tests only (Vitest) |
| `pnpm test -- <path>` | Tests for one file or folder |
| `pnpm typecheck` | TypeScript only |
| `pnpm db:migrate:dev --name <name>` | Create and apply a new migration |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm db:reset` | Reset the local database. Development only |
| `pnpm graphql:schema` | Export the GraphQL schema to `schema.graphql` |
 
## Layout
 
```
layers/core/            # Nuxt layer holding the whole core  [ADR-0001]
  app/                  # client components, composables and plugins
  server/
    graphql/            # Pothos builder and types, one file per module
    services/           # business logic; the only place that uses Prisma
    auth/               # Better Auth configuration
    security/           # CSP, origin validation, rate limiting
    storage/            # storage interface and adapters (r2, local)
    errors/             # domain errors and their GraphQL/HTTP mapping
  prisma/               # schema and migrations
apps/starter/           # minimal app extending the layer; example and integration test
packages/               # optional packages outside the core
.agents/skills/         # this repo's skills (Agent Skills format)
docs/adr/               # architecture decisions
```
 
## Architecture rules
 
1. **Thin resolvers.** A resolver validates input, calls a service and returns the result. It holds no business logic and never imports Prisma.
2. **Prisma only in `server/services/`.** No other directory imports the database client. [ADR-0003]
3. **Services receive an explicit context** (user, db, logger). They never read the request or global state. [ADR-0003]
4. **Authorization lives in services**, not only in the UI or the resolver. [ADR-0008]
5. **Expected failures are domain errors** from `server/errors/`. Do not throw a generic `Error` for business cases. [ADR-0006]
6. **Validate input at the edge** using the mechanism in [ADR-0005]. Never trust user or tenant IDs sent by the client.
7. **Storage goes through the `server/storage/` interface.** Never call the R2 SDK directly from a service. [ADR-0012]
8. **No new dependencies without a reason.** If you add one, explain in the PR why the existing ones are not enough.
## Security: non-negotiable
 
- Never loosen CSP, origin validation or rate limiting to make something "work". If they block something legitimate, stop and ask.
- Every new mutation (GraphQL or server route) goes through origin validation and rate limiting. [ADR-0010] [ADR-0011]
- Never log tokens, cookies, passwords or the contents of uploaded files.
- Never commit `.env`. Every new variable is documented in `.env.example` with a fake example value.
- Session cookies are managed by Better Auth. Do not create your own session cookies.
## Database
 
- Never edit a migration that has already been applied; create a new one.
- Every `schema.prisma` change ships with its migration in the same commit.
- Operations that modify several tables run in a transaction inside the service.
- Multi-tenant data: follow [ADR-0009]. Do not create business tables before their scope is decided.
## Tests
 
- Every new or changed service has Vitest tests next to the file (`*.test.ts`).
- Write the failing test first, then the code (TDD), except for trivial changes.
- Service tests use [ADR-0014: real Postgres or test doubles]. Do not mock Prisma ad hoc.
- Every fixed bug gets a test that reproduces it.
## Definition of done
 
A task is done when:
 
1. `pnpm check` passes.
2. API changes are reflected in `schema.graphql` (`pnpm graphql:schema`).
3. New environment variables are in `.env.example`.
4. If you changed an architecture decision, there is a new or updated ADR.
5. The PR states what changed, why, and how it was tested.
## Ask for human approval before
 
- Changing auth, session, CSP, origin validation or rate limiting configuration.
- Deleting or rewriting migrations, or running destructive commands against any non-local database.
- Adding a paid service, or a dependency with a license other than MIT/Apache/BSD/ISC.
- Moving code between `layers/core` and an app or package (this changes the core's scope). [ADR-0018]
- Making any decision marked "Pending" in `docs/adr/`.
## Repo skills
 
In `.agents/skills/`. Use them instead of improvising the structure:
 
| Skill | When |
| --- | --- |
| `add-service` | Create a service with its context, errors and tests |
| `add-graphql-type` | Expose a service in GraphQL (type, inputs, resolvers) |
| `add-migration` | Change the database schema safely |
| `add-storage-adapter` | Add a storage backend |
 
> Status: not written yet. Each one is written after the first case has been implemented by hand.
 
<!-- /setup-matt-pocock-skills will add its "## Agent skills" block here. -->
 
