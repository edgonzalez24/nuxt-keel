# ADR-0015: Observability

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

Services (ADR-0003) already carry a `logger: Logger` in `ServiceContext`. This ADR decides what that logger is, how it is configured, and what standard instrumentation ships with the core.

Constraints:
- Never log tokens, cookies, passwords, or the contents of uploaded files (AGENTS.md).
- Fly.io deployment: logs are forwarded to a log drain; structured JSON is required for machine parsing.
- Multiple instances: request IDs must be generated per-request, not per-process.

## Options considered

**Logger implementation:**
1. **pino** — the standard for structured logging in Node.js. JSON output, low overhead, `child()` for bound fields, wide ecosystem support.
2. **winston** — more configuration options. Heavier, less idiomatic in modern Node.js.
3. **console** — zero dependency. Not structured, not filterable, not JSON.

**OpenTelemetry:**
1. **From day one** — traces, metrics, context propagation built in. Significant setup cost and new dependencies.
2. **Deferred** — structured logs with request IDs cover the common debugging cases. OTel added as a `packages/` package when a concrete use case arises.

**Request ID:**
1. **`crypto.randomUUID()`** — no dependency, UUID v4, 36 chars, available in all Node.js ≥ 14.17.
2. **`nanoid()`** — shorter and URL-safe, but adds an external dependency.

## Decision

**Logger:** `pino`. The core installs and configures pino. The `Logger` type in `ServiceContext` is typed to match pino's API surface (`info`, `warn`, `error`, `debug`, `child`), so apps that inject a custom logger can satisfy the interface with any pino-compatible implementation.

**Log format:**
- `NODE_ENV === 'production'` → JSON output (ingestable by Fly.io log drains and any structured log aggregator).
- Any other `NODE_ENV` → pretty-print via `pino-pretty` (human-readable, colorized, development only).

Format is selected automatically. No manual configuration required.

**Log level:** Controlled by the `LOG_LEVEL` environment variable. Default: `'info'`. Documented in `.env.example`:

```
LOG_LEVEL=info
```

**OpenTelemetry:** Not included in the core pre-1.0. Structured logs with request IDs cover the common cases. OTel can be added as an optional package in `packages/` once a concrete use case justifies it.

**Request ID:** Generated with `crypto.randomUUID()` per request in a Nuxt server middleware. Propagated two ways:
1. Injected into a child logger: `logger.child({ requestId })`. Every subsequent `logger.info()` call in that request's context includes the ID automatically.
2. Returned to the client as `X-Request-Id: <uuid>` in the response header, so the client can include it in bug reports.

The `ServiceContext` receives the child logger — services never see the root logger.

**What is logged per request:**

```
INFO [a1b2c3d4] POST /api/graphql 200 45ms
```

Fields: `requestId`, HTTP method, path, status code, duration. No request body, no response body, no cookies, no auth tokens.

## Consequences

- Every log line from a request is traceable by its `requestId` in Fly.io's log view.
- Services log via `ctx.logger` — no imports, no global state.
- Development logs are readable without tooling. Production logs are JSON parseable.
- `pino` is a core runtime dependency. `pino-pretty` is a devDependency (never bundled for production).
- `LOG_LEVEL=debug` in a local `.env` enables verbose output without code changes.
- OTel is explicitly deferred. Any package in `packages/` can add it without touching the core layer.

## Rules for agents

- Never log tokens, cookies, passwords, or the contents of uploaded files.
- Services log through `ctx.logger` only. Never use `console.log` in service or resolver code.
- The root pino instance is created once at server startup. Each request middleware creates a child: `rootLogger.child({ requestId })`. That child is what goes into `ServiceContext`.
- The `X-Request-Id` response header is set for all requests — including errors.
- `LOG_LEVEL` is documented in `.env.example`. Changing the default requires updating `.env.example`.
- Do not add OpenTelemetry, metrics, or tracing to `layers/core/` without an ADR amendment.
- `pino-pretty` is a devDependency. Never import it in production code paths.
