# ADR-0010: HTTP security policy

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

Every response from the server carries HTTP headers that define how the browser treats its content. Without a deliberate policy, apps built on this core ship without clickjacking protection, MIME-sniffing defenses, or cross-origin request guards. This ADR establishes the default security posture.

Constraints:
- Nuxt 4 SSR generates inline scripts for hydration — CSP must accommodate this without breaking the app.
- Better Auth session cookies use `SameSite=lax` (ADR-0007), which provides partial CSRF protection, but explicit origin validation adds a second layer.
- Development environments use HMR (hot module replacement), which requires WebSocket connections and dynamic scripts incompatible with a strict CSP.
- Security headers are a human-approval area — never loosen them to make something work (AGENTS.md).

## Options considered

**CSP strategy:**
1. **Nonces.** The server generates a random nonce per request. Nuxt adds `nonce="<random>"` to every script tag it generates. CSP allows only scripts with that nonce. The only approach that works correctly with Nuxt SSR, where hydration script content changes per request.
2. **Hashes.** Hash each inline script at build time. Breaks with SSR — the hash is static but the hydration payload changes per request.

**Origin validation scope:**
1. **All POST requests.** GraphQL uses POST for both queries and mutations. One rule, no discrimination by operation type.
2. **Mutations only.** Read-only operations are more permissive. Requires parsing the request body to detect operation type before the route handler — complex and fragile.

**Allowed origins:**
1. **`runtimeConfig.public.siteUrl`.** One canonical URL per environment, set via `NUXT_PUBLIC_SITE_URL`. Simple; preview environments override the value.
2. **Configurable list.** `allowedOrigins: [...]` in module options. More flexible but requires coordination across environments.

## Decision

**CSP strategy:** Nonces via Nuxt 4's `useNonce()`. Each request receives a fresh random nonce injected into every script tag.

**Default CSP (production only):**
```
default-src 'self';
script-src 'nonce-{nonce}' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
font-src 'self';
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

Notes:
- `style-src 'unsafe-inline'` — Nuxt injects inline styles for SSR critical CSS.
- `img-src https:` — allows R2 and CDN assets without hardcoding the bucket URL.
- `frame-ancestors 'none'` — supersedes `X-Frame-Options: DENY` with broader browser support.

**Security headers (always, including development):**
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

**Production-only headers:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: <policy above>
```

CSP and HSTS are disabled when `NODE_ENV !== 'production'` to allow HMR and local HTTP development. All other headers apply in every environment.

**Origin validation:** Applied to all POST requests. The middleware compares the `Origin` header against `runtimeConfig.public.siteUrl`. Rules:
- If `Origin` is present and does not match `siteUrl` → reject with 403.
- If `Origin` is absent → allow (server-to-server calls do not send `Origin`).

**Allowed origins:** `runtimeConfig.public.siteUrl`, set via `NUXT_PUBLIC_SITE_URL` environment variable. Documented in `.env.example`.

## Consequences

- Every app built on this core ships with clickjacking, MIME-sniffing, and CSRF protections by default.
- CSP uses nonces; `'unsafe-eval'` and `'unsafe-inline'` for scripts are never needed.
- Apps that call external APIs must add their domain to `connect-src` via module options.
- Apps that embed content in iframes from their own domain override `frame-ancestors` via module options with human approval.
- CSP violations in production are not reported by default — reporting is an observability concern (ADR-0015).
- HMR works in development without CSP interference.

## Rules for agents

- Never loosen CSP, origin validation, or any security header to make a feature work. If a legitimate feature is blocked, stop and ask for human approval (AGENTS.md).
- `NUXT_PUBLIC_SITE_URL` must be documented in `.env.example` with a placeholder value.
- Origin validation rejects requests where `Origin` is present and does not match `siteUrl`. It permits requests where `Origin` is absent.
- CSP and HSTS apply only when `NODE_ENV === 'production'`. The other headers apply always.
- Apps override specific CSP directives via module options. No direct edits to the security middleware.
- Do not add `'unsafe-eval'` or `'unsafe-inline'` for scripts to the CSP under any circumstances.
