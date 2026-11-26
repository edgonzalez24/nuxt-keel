# ADR-0016: Configuration validation

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

Environment variables arrive as untyped strings. Without validation at startup, a missing or malformed variable fails silently — producing a cryptic error at runtime, often deep inside a service call, rather than a clear message at boot. The core must fail fast with a useful error before accepting any traffic.

Constraints:
- Zod is already in the stack (ADR-0005) — no new dependencies.
- Secrets are injected by Fly.io at deploy time, not at build time, so build-time validation is not viable for secrets.
- Some variables are only required for specific adapters (e.g., R2 credentials when `storageAdapter: 'r2'`).

## Decision

**Library:** Zod, using the same instance already in the stack. No new dependency.

**Module:** `layers/core/server/env.ts` defines the core's environment schema and exports two values:

```ts
import { z } from 'zod'

export const coreEnvSchema = z.object({
  DATABASE_URL:           z.string().url(),
  NUXT_PUBLIC_SITE_URL:   z.string().url(),
  BETTER_AUTH_SECRET:     z.string().min(32),
  LOG_LEVEL:              z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  INITIAL_ADMIN_EMAIL:    z.string().email().optional(),
})

export const env = coreEnvSchema.parse(process.env)
export type Env = z.infer<typeof coreEnvSchema>
```

Both `coreEnvSchema` and `env` are exported. Apps extend the schema for their own variables:

```ts
// apps/starter/server/env.ts
import { coreEnvSchema } from '@edgonzalez24/nuxt-keel'
import { z } from 'zod'

export const env = coreEnvSchema.extend({
  STRIPE_SECRET_KEY: z.string(),
  RESEND_API_KEY:    z.string(),
}).parse(process.env)
```

**When validation runs:** A Nitro server plugin (`layers/core/server/plugins/env.ts`) runs the parse at server startup. If validation fails, the server throws immediately with a Zod error that names every missing or invalid variable — before the first request is accepted.

**Adapter-specific variables:** Variables that are only required for a specific adapter are validated lazily by that adapter when it is instantiated, not in the global schema. If `storageAdapter: 'r2'` is selected and R2 credentials are missing, the error surfaces at startup when the R2 adapter initialises — still fast, still before traffic, but without polluting the global schema with conditional logic.

**Core environment variables:**

| Variable | Required | Default | Source |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Neon connection string |
| `NUXT_PUBLIC_SITE_URL` | Yes | — | Used for CSP and origin validation (ADR-0010) |
| `BETTER_AUTH_SECRET` | Yes | — | Random string ≥ 32 chars; used to sign session tokens |
| `LOG_LEVEL` | No | `'info'` | Controls pino log level (ADR-0015) |
| `INITIAL_ADMIN_EMAIL` | No | — | Bootstraps the first admin user (ADR-0008) |
| `R2_ACCOUNT_ID` | With `storageAdapter: 'r2'` | — | Cloudflare R2 (ADR-0012) |
| `R2_ACCESS_KEY` | With `storageAdapter: 'r2'` | — | Cloudflare R2 (ADR-0012) |
| `R2_SECRET_KEY` | With `storageAdapter: 'r2'` | — | Cloudflare R2 (ADR-0012) |
| `R2_BUCKET` | With `storageAdapter: 'r2'` | — | Cloudflare R2 (ADR-0012) |
| `TEST_DATABASE_URL` | In test environment | — | Separate DB for Vitest (ADR-0014) |

## Consequences

- Deployment failures caused by missing configuration are caught immediately, not minutes into a production incident.
- The object `env` is the single typed interface for environment variables in the core — `process.env.FOO` is never read directly in service or middleware code.
- Apps extend `coreEnvSchema` to get a single typed `env` object that covers both core and app-specific variables. No duplication.
- Zod validation errors name every failing field at once, so a developer does not fix one variable and then find another missing.

## Rules for agents

- Never read `process.env.FOO` directly in services, resolvers, or middlewares. Always import and use the `env` object.
- Every new environment variable added to the core must be added to `coreEnvSchema` in `server/env.ts` and documented in `.env.example` with a fake example value.
- Adapter-specific variables (R2, any future adapters) are validated inside the adapter, not in `coreEnvSchema`.
- `BETTER_AUTH_SECRET` must be validated with `.min(32)` — shorter secrets are not acceptable.
- Do not set `NODE_ENV` explicitly in `.env.example` — it is set by the runtime environment and framework.
