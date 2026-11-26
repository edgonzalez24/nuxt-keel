# Architecture Decision Records (ADRs)
 
These are the decisions you make yourself before an agent writes code.
Each one lists options and trade-offs; the decision is left blank on purpose.
 
**How to use this:** for each ADR, run `grill-me` on the question, decide, and copy `0000-template.md` to `NNNN-title.md`. Then set its status to "Accepted" in the table.
 
Items marked ⚠ are expensive to reverse: decide them first.
 
## Block A — before writing any code
 
| ADR | Question | Status |
| --- | --- | --- |
| 0001 ⚠ | How is the core distributed? | Accepted |
| 0002 | How is the monorepo organized? | Accepted |
| 0003 ⚠ | Where does the service layer end? | Accepted |
| 0018 ⚠ | What stays out of the core? | Accepted |
 
**0001 — Distribution.**
- *Copy-once template:* simple, but every copy diverges and never receives security fixes.
- *Nuxt layer (`extends`):* your apps receive core improvements; forces you to decide what is configurable.
- *Separate npm packages:* maximum decoupling, much more maintenance.
- Key question: when you fix a security bug in the core, how does the fix reach projects already using it?
**0002 — Monorepo.**
- pnpm workspaces alone, or with Turborepo for task caching.
- Does the example app live in the same repo and run in CI as an integration test?
**0003 — Service layer.**
- Shape of the context every service receives (user, db, logger, tenant).
- Who opens transactions: the service or its caller?
- Can a service call another service?
**0018 — Scope.** An explicit list of what does NOT go in: payments, i18n, admin panel, the Run → Step → Evidence model, job queues. Without this list, the core grows into a framework.
 
## Block B — before the first slice (auth + one resource)
 
| ADR | Question | Status |
| --- | --- | --- |
| 0004 ⚠ | How is the GraphQL schema built? | Accepted |
| 0005 | Where and how is input validated? | Accepted |
| 0006 ⚠ | What is the error model? | Accepted |
| 0007 | How are auth and sessions configured? | Accepted |
| 0008 | Where does authorization live? | Accepted |
| 0009 ⚠ | Is there multi-tenancy, and how? | Accepted |
 
**0004 — GraphQL.**
- *Pothos Prisma plugin:* very fast to write, but couples the public API to the shape of your tables.
- *Types mapped by hand from services:* more code; the API evolves independently of the database.
- Pagination: Relay connections or offset. Subscriptions: Yoga's SSE in the core or not.
**0005 — Validation.** Zod with the Pothos validation plugin, validation inside services, or both (shape at the edge, business rules in the service).
 
**0006 — Errors.**
- *Errors as schema unions* (`CreateInvoiceResult = Invoice | ValidationError`): typed for the client, more verbose schema.
- *Thrown errors with `extensions.code`:* simpler, the client loses types.
- What gets logged, what the user sees, and what never leaves the server.
**0007 — Auth.** Session lifetime and renewal, cookie attributes, email verification through Resend, which OAuth providers ship by default, and whether to use Better Auth's organizations plugin.
 
**0008 — Authorization.** Checks in services, GraphQL directives/auth plugin, or both. Simple RBAC (roles) or per-resource permissions.
 
**0009 — Multi-tenancy.** None, a `tenantId` column filtered in services, or Postgres Row Level Security. This matters for DocProof and the approval inbox: adding it later means migrating every table and every query.
 
## Block C — before the first public release
 
| ADR | Question | Status |
| --- | --- | --- |
| 0010 | What is the HTTP security policy? | Pending |
| 0011 ⚠ | How does rate limiting work? | Pending |
| 0012 | What does the storage interface look like? | Pending |
| 0013 | Does the core include background jobs? | Pending |
| 0014 | How are tests run against the database? | Pending |
| 0015 | What observability ships by default? | Pending |
| 0016 | How is configuration validated? | Pending |
| 0017 | How is it deployed and migrated? | Pending |
| 0019 | License and versioning? | Pending |
| 0020 | What is the repo's contract with agents? | Pending |
 
**0010 — HTTP security.** CSP with nonces or hashes (and how it coexists with Nuxt SSR and hydration). Origin validation for mutations only or for everything. Default header list.
 
**0011 — Rate limiting.** In-memory breaks as soon as Fly.io runs more than one machine. Options: a Postgres table, Redis/Upstash, or Fly's proxy. Algorithm (fixed window, sliding window, token bucket) and keys (IP, user, route).
 
**0012 — Storage.** Direct upload to R2 with a signed URL, or through the server. Sharp synchronously in the request or deferred. What the interface exposes (`put`, `get`, `signedUrl`, `delete`).
 
**0013 — Background jobs.** Nothing in the core; an interface only; or a Postgres-backed queue (pg-boss, Graphile Worker). The approval inbox will need durable execution: does the core provide it, or the project?
 
**0014 — Database tests.** Postgres in local Docker, a Neon branch per PR, or in-memory doubles. How long the suite takes and what runs in CI.
 
**0015 — Observability.** Structured logs always. OpenTelemetry from day one or as an optional package. A request ID propagated down to services.
 
**0016 — Configuration.** Validate environment variables at startup and fail fast. What is required and what has a default.
 
**0017 — Deployment.** Migrations in Fly's `release_command` or in a CI step. Preview environments with Neon branching. Rolling back a failed migration.
 
**0019 — License and versioning.** License (MIT is the norm for boilerplates). Semver for the layer, a changelog, and a policy for breaking changes.
 
**0020 — Agent contract.** Which skills the repo ships, which commands define "done", and which actions require human approval. Already sketched in `AGENTS.md`; this ADR makes it official.
 
