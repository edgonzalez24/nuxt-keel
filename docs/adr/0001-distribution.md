# ADR-0001: Distribute the core as a Nuxt layer published to npm

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

The core needs to reach multiple production projects that extend it. The central question is: when a security bug is fixed in the core, how does that fix reach projects already using it?

Relevant constraints:
- Nuxt 4 stack, which has native support for layers (`extends`).
- Single maintainer in a pre-1.0 phase.
- Consuming projects live in separate repositories.
- The code is already open source (MIT license) in a public repository.

## Options considered

1. **Copy-once template.** The consuming project copies `layers/core/` once and owns it.
   - Pro: no external dependencies, zero initial friction.
   - Con: every copy diverges; security fixes do not propagate automatically. Ruled out.

2. **Nuxt layer published to npm.** The core lives in this repo and is published as a package. Projects declare `extends: ['@edgonzalez24/nuxt-keel']`.
   - Pro: consumers receive fixes with `pnpm update`; explicit contract through `defineNuxtModule`; Nuxt handles composition at build time.
   - Con: requires a publish step and version management.

3. **Separate npm packages per module.** One package per functional area (auth, storage, graphql…).
   - Pro: maximum decoupling.
   - Con: overhead of publishing N packages per change; complex cross-dependencies. Overkill pre-1.0.

## Decision

We distribute the core as a **Nuxt layer published to public npm** under the name `@edgonzalez24/nuxt-keel`.

The configuration surface is split into two layers:
- **Module options** (`defineNuxtModule`): behavioural decisions that are the same across all environments of a given project — storage adapter selection, feature flags, rate limiting options.
- **`runtimeConfig`**: values that change per environment and never belong in source code — `DATABASE_URL`, `AUTH_SECRET`, third-party API keys.

Versioning: `0.x` (pre-1.0) until the API ADRs (0003, 0004, 0006) are closed. Any version may have breaking changes; no stability guarantees are made before `1.0.0`.

Publishing: a GitHub Actions workflow publishes to npm automatically when a `v*` tag is pushed. Publishing from a local machine is not allowed.

Update communication: GitHub Releases with changelogs; opt-in Dependabot for consuming apps; GitHub Security Advisories for CVEs. The public repo means CI minutes and Dependabot are free, and Security Advisories are available without any special plan.

## Consequences

- Production projects install with `pnpm add @edgonzalez24/nuxt-keel` and declare `extends: ['@edgonzalez24/nuxt-keel']` in `nuxt.config`.
- `apps/starter/` references the layer via `"@edgonzalez24/nuxt-keel": "workspace:*"` in `package.json` during development. pnpm resolves this to the local `layers/core/` without publishing.
- `layers/core/package.json` is the publishable artefact; its `name` field is `@edgonzalez24/nuxt-keel`.
- A security fix reaches consumers when they run `pnpm update @edgonzalez24/nuxt-keel`.
- Adding a new field to module options is always backwards-compatible (pre-1.0 or not). Removing or renaming one is a breaking change requiring a minor bump while in `0.x`.
- Out of scope here: internal monorepo structure (ADR-0002), service layer boundaries (ADR-0003), what stays out of the core (ADR-0018).

## Rules for agents

- The layer is published as `@edgonzalez24/nuxt-keel` on npm. Do not create or reference any other package name for the core.
- Pre-1.0: do not promise or document API stability. Any version may have breaking changes.
- Releases via git tag → CI only. Never run `npm publish` from a local machine.
- Behavioural configuration (adapters, feature flags) goes in module options (`defineNuxtModule`). Credentials, URLs, and secrets go in `runtimeConfig` and are documented in `.env.example`.
- If a module option needs a different value per environment, that is a signal it belongs in `runtimeConfig`, not the module.
