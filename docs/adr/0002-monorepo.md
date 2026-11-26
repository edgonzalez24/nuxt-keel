# ADR-0002: Monorepo organization with pnpm workspaces

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

The repository contains a Nuxt layer (`layers/core/`), a minimal example app (`apps/starter/`), and a reserved slot for future packages (`packages/`). Before writing code, we need to settle how these workspaces are wired together, what the local development loop looks like, and what CI verifies.

Constraints:
- pnpm is the package manager (established by the stack).
- The layer is published as `@edgonzalez24/nuxt-keel` on npm (ADR-0001). The local reference must match the production reference so `nuxt.config` is identical in both contexts.
- Single maintainer, pre-1.0. Tooling overhead should be minimal.

## Options considered

**Task runner:**
1. **pnpm workspaces alone.** Scripts are defined at the root `package.json` and delegated with `pnpm --filter` or `pnpm -r`. No extra tooling.
2. **pnpm + Turborepo.** Adds task graph caching: only reruns what changed. Real value at 3+ packages with slow builds; pure overhead here.

**Starter app in CI:**
1. **Run as integration test.** `nuxt build` + `nuxt typecheck` on `apps/starter/` in CI. Catches layer composition errors that Vitest cannot see.
2. **Example only.** CI covers only the layer. Composition errors go undetected until a project uses the layer.

**Local layer reference:**
1. **`workspace:*` + package name in `extends`.** `apps/starter/package.json` declares `"@edgonzalez24/nuxt-keel": "workspace:*"`; `nuxt.config` uses `extends: ['@edgonzalez24/nuxt-keel']`. pnpm resolves the symlink locally; the same config works in production.
2. **Relative path in `extends`.** `extends: ['../../layers/core']` locally, different value in production. Config diverges between environments.

## Decision

**Task runner:** pnpm workspaces alone. Turborepo is a future option if the monorepo grows to 3+ packages with slow builds, requiring an ADR amendment.

**Starter in CI:** `apps/starter/` runs `nuxt build` + `nuxt typecheck` in CI as a lightweight integration test. E2e tests (Playwright) are deferred until there are stable features to cover.

**Local layer reference:** `workspace:*` protocol in `apps/starter/package.json`. `nuxt.config` uses the package name (`@edgonzalez24/nuxt-keel`) in both development and production — no relative paths.

**`packages/` directory:** Reserved empty. Nothing is created there pre-1.0 without a concrete, pre-approved reason.

**`pnpm check` scope:** Covers `layers/core/` only — lint, typecheck, and Vitest. Fast local loop. The starter build is a CI-only gate; it does not block local commits.

## Consequences

- `pnpm check` is fast. Developers run it on every commit without friction.
- Composition errors between the layer and a real Nuxt app are caught in CI, not in production.
- `apps/starter/nuxt.config` is identical to what a consuming project would write — it doubles as living documentation.
- `packages/` exists as a convention but carries no code until needed.
- Adding Turborepo later is non-breaking: it wraps existing scripts without changing their semantics.

## Rules for agents

- `apps/starter/` must reference the layer with `"@edgonzalez24/nuxt-keel": "workspace:*"` in its `package.json`. Never use a relative path in `nuxt.config extends`.
- `pnpm check` covers `layers/core/` only. Do not add the starter build to this command.
- The starter build (`nuxt build` + `nuxt typecheck`) runs in CI. Any CI workflow touching the layer must also run this step.
- Do not create a package under `packages/` without a concrete, pre-approved reason documented in an ADR or issue.
- Do not add Turborepo without an amendment to this ADR.
