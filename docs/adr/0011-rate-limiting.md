# ADR-0011: Rate limiting

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

Without rate limiting, any endpoint is vulnerable to brute-force attacks, credential stuffing, and abuse. Fly.io can run multiple instances of the same app — in-memory counters would not be shared across instances, making them useless in a multi-machine deployment.

Constraints:
- Fly.io multi-instance deployment (established by the stack).
- Rate limiting is a human-approval area — never loosen it to make something work (AGENTS.md).
- Every new mutation and server route must go through rate limiting (AGENTS.md).

## Options considered

**Storage backend:**
1. **In-memory.** Zero setup. Breaks immediately when Fly.io runs more than one machine — each instance has its own counter. Ruled out.
2. **Postgres table.** No new dependency; Neon is already the database. `rate_limits(key, count, window_start, expires_at)`. Latency ~5–10ms per check — acceptable for most traffic levels.
3. **Redis / Upstash.** Purpose-built, ~1ms latency. Upstash is serverless (pay per request). Adds a paid dependency and new infrastructure.
4. **Fly proxy.** Built-in rate limiting at the proxy level. Zero application code. Limited to IP-based limits; no user-based limits; configured in `fly.toml`, not in the codebase.

**Algorithm:**
1. **Fixed window.** Count requests in a fixed time bucket. Simple. Burst problem: a client can exhaust the limit at the end of one window and immediately at the start of the next, doubling effective throughput.
2. **Sliding window.** Count requests in the last N seconds from now. More accurate — no burst problem. Each request is stored with a timestamp; counting within the window is a range query.
3. **Token bucket.** Allows bursts up to a bucket size; refills at a constant rate. Most flexible, most complex to implement correctly.

## Decision

**Storage:** Postgres. A `rate_limits` table stores one row per request with a key and expiry timestamp. No new dependencies. If Postgres becomes a bottleneck for rate limiting, Redis/Upstash is added as an alternative adapter following the same interface (ADR-0012 pattern).

**Algorithm:** Sliding window. For each request, count rows with `key = ? AND created_at > NOW() - interval`. Rows older than the window do not affect correctness and are cleaned up periodically.

**Rate limit keys:** Route type + (`userId` if authenticated, `remoteIp` if not).

| Route type | Key | Default limit |
|---|---|---|
| Auth routes (`/api/auth/**`) | `remoteIp` | 10 requests / 15 minutes |
| GraphQL mutations | `userId` or `remoteIp` | 100 requests / minute |
| GraphQL queries | `userId` or `remoteIp` | 500 requests / minute |

Auth routes use IP regardless of authentication state — they are the highest-risk endpoints.

**IP extraction:** `X-Forwarded-For` header, trusted from the Fly.io proxy. Never `request.socket.remoteAddress`.

**Configuration:** Defaults above, overrideable via module options:
```ts
nuxtKeel: {
  rateLimits: {
    auth:     { maxRequests: 10,  windowSeconds: 900 },
    mutation: { maxRequests: 100, windowSeconds: 60  },
    query:    { maxRequests: 500, windowSeconds: 60  },
  }
}
```

**Cleanup:** A background interval started in the Nuxt server plugin runs `DELETE FROM rate_limits WHERE expires_at < NOW()` every 5 minutes. This keeps the table from growing unboundedly without adding per-request overhead.

**Response when limited:** HTTP 429 with a `Retry-After: <seconds>` header indicating when the window resets. Rate limit errors do not go through the GraphQL error pipeline — they are rejected at the middleware layer before reaching the route handler.

## Consequences

- Rate limiting works correctly on multi-machine Fly.io deployments.
- Auth routes are the most protected — their limits are set conservatively and should not be raised without a documented reason.
- User-based limits on mutations prevent one misbehaving user from impacting others sharing the same NAT IP.
- If Postgres latency becomes a concern, adding Redis/Upstash as an adapter does not change the rate limiting API or behavior.
- The 5-minute cleanup keeps the `rate_limits` table small without blocking request processing.

## Rules for agents

- Never relax rate limits to make a feature work. Relaxing them requires human approval (AGENTS.md).
- Every new GraphQL mutation and every new server route must go through rate limiting. No exceptions without a documented reason.
- IP is always extracted from `X-Forwarded-For`. Never use `request.socket.remoteAddress`.
- Auth route limits are the most conservative. Do not raise them without explicit justification and human approval.
- Rate limit responses are HTTP 429 with `Retry-After`. They are not GraphQL errors and do not appear in the `errors[]` array.
- Do not add in-memory rate limiting under any circumstances — it breaks on multi-instance deployments.
