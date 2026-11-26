# ADR-0012: Storage interface

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

Apps need to store and retrieve files (user uploads, generated documents, processed images). The core must abstract the storage backend so services are not coupled to Cloudflare R2, allowing different adapters in development, testing, and production.

Constraints:
- Services never call storage SDKs directly (AGENTS.md rule).
- The stack includes Cloudflare R2 and Sharp.
- Background jobs are out of core scope (ADR-0018), ruling out deferred image processing unless the app provides its own job infrastructure.

## Options considered

**Upload path:**
1. **Through the server.** The browser sends the file to a Nuxt server route; the server validates, optionally processes with Sharp, and writes to the adapter. Simpler, enables synchronous Sharp processing.
2. **Direct upload to R2 via signed URL.** The server generates a signed upload URL; the browser uploads directly to R2. Better scalability for large files, but requires a completion handshake and makes synchronous Sharp processing impossible without a background job.

**Sharp integration:**
1. **Automatic in `put`.** The adapter or a wrapper applies Sharp on every put. Breaks for non-image files.
2. **Explicit utility function.** The core exports `processImage(buffer, options)`. Services call it before `put` when the file is an image. No magic, no silent processing.

**Storage adapters:**
1. **R2 only.** Requires credentials in development.
2. **R2 + local filesystem.** Local adapter stores files on disk and serves them via a Nuxt route. No credentials needed for development or testing.

## Decision

**Upload path:** Through the server. The server receives the file bytes, enabling synchronous Sharp processing without background job infrastructure.

**Storage interface** (`server/storage/adapter.ts`):

```ts
interface StorageAdapter {
  put(key: string, body: Buffer | Readable, options?: PutOptions): Promise<void>
  get(key: string): Promise<Buffer | null>
  delete(key: string): Promise<void>
  signedDownloadUrl(key: string, expiresIn?: number): Promise<string>
  exists(key: string): Promise<boolean>
}

interface PutOptions {
  contentType?: string
  metadata?: Record<string, string>
}
```

Methods explicitly out of the base interface: `list`, `move`, `copy`. Apps that need them access the underlying adapter directly for those operations.

**Sharp integration:** The core exports a `processImage(buffer: Buffer, options: ProcessImageOptions): Promise<Buffer>` utility. Services call it explicitly before `put` when the file requires image processing. `put` never calls Sharp automatically.

**Adapters shipped by the core:**
- **R2 adapter** (`storageAdapter: 'r2'`): uses the R2 SDK. Credentials via `runtimeConfig`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`.
- **Local filesystem adapter** (`storageAdapter: 'local'`): stores files under `.data/storage/` in the project. `signedDownloadUrl` returns a URL to a Nuxt server route (`/api/storage/:key`) that serves the file. No credentials needed.

**Default adapter:** `'local'`. Production apps switch to `'r2'` via module options and provide credentials in `runtimeConfig`.

**Adapter selection** in module options:
```ts
nuxtKeel: {
  storageAdapter: 'r2' | 'local' // default: 'local'
}
```

Apps can implement custom adapters by satisfying the `StorageAdapter` interface and passing the instance via module options.

## Consequences

- Services are decoupled from R2. Switching to a different provider (S3, GCS) means writing a new adapter, not changing any service.
- Image processing is explicit in service code — readable, testable, and skippable for non-image files.
- Development and CI work without R2 credentials or internet access.
- `signedDownloadUrl` in local mode returns a Nuxt route URL, keeping the same API contract across adapters.
- Apps that need `list`, `move`, or `copy` access the adapter directly for those operations outside the core interface.

## Rules for agents

- Services never import `@aws-sdk`, the Cloudflare R2 SDK, or any other storage SDK. Always use the `StorageAdapter` interface.
- `processImage()` is called explicitly before `put()` when Sharp processing is needed. Never add automatic Sharp processing inside `put`.
- R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`) go in `runtimeConfig` and are documented in `.env.example`. Never hardcode them.
- Do not add `list`, `move`, or `copy` to the `StorageAdapter` interface without an ADR amendment.
- The local adapter stores files under `.data/storage/`. This directory must be in `.gitignore`.
