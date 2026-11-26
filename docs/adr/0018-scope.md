# ADR-0018: What stays out of the core

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

Without an explicit scope boundary, the core grows into a framework. Every feature that "could be useful" becomes a candidate for inclusion, and the maintenance surface expands faster than the value delivered. This ADR draws the line.

The core's purpose is to provide the infrastructure layer that every app extending it needs: auth, database access, GraphQL scaffolding, HTTP security, file storage, and testing utilities. Anything that is product-specific, optional, or carries maintenance cost proportional to the number of apps using it stays out.

## Decision

### Admission criterion

Something enters the core if and only if it meets **all three conditions**:

1. **Universal** — every app that uses the core needs it, without exception.
2. **Domain-free** — it contains no product-specific logic, terminology, or data model.
3. **Maintainable** — the ongoing maintenance cost does not grow with the number of apps using the core.

This criterion takes precedence over the exclusion list below. When evaluating a new candidate, apply the criterion first. If it fails any condition, it stays out regardless of how useful it seems.

### What is in scope

- Authentication and session management (Better Auth)
- GraphQL API layer (Yoga + Pothos scaffolding)
- Database access (Prisma setup and `ServiceContext`)
- HTTP security (CSP, origin validation, rate limiting)
- File storage interface and adapters (R2, local)
- Email transport (Resend client) and base templates for auth-triggered emails (account verification, password reset)
- Testing utilities shared across the layer

### Explicit exclusion list

The following items fail the admission criterion and will not be added to the core:

| Item | Reason excluded |
|---|---|
| Payments (Stripe, etc.) | Not universal — not every app charges money |
| i18n | Domain — content and locale are product concerns |
| Admin panel / back-office UI | Not universal, domain-specific, not maintainable at scale |
| Job queues / background jobs | Not universal — infrastructure choice varies per app and deployment |
| Audit logging | Not universal — only apps with compliance requirements need it |
| Outbound webhooks | Not universal |
| Notifications (push, SMS) | Not universal |
| Full-text or vector search | Not universal |
| Advanced RBAC (per-resource permissions, ABAC) | Domain — the permission model is product-specific |
| Business email templates (invoices, product notifications) | Domain — content belongs to the product |
| Product-specific domain models (e.g. Run → Step → Evidence) | Domain — belongs in the app that owns the concept |

### Deferred items

**Multi-tenancy** is not classified here. It may enter the core as a first-class concern (ADR-0009) or be left to each app. No code should assume its presence or absence until ADR-0009 is resolved.

## Consequences

- Agents and contributors have a criterion to evaluate new proposals without escalating every decision.
- The exclusion list is not exhaustive — it names the most likely candidates. The criterion handles everything else.
- Apps that need any excluded item implement it themselves, extending the layer by convention (additional services, Nuxt modules, packages under `packages/`).
- Moving code from an app into the core is a scope change that requires a new ADR (see ADR-0001: moving code between `layers/core` and an app changes the core's scope).

## Rules for agents

- Before adding any new feature to `layers/core/`, verify it meets all three admission conditions: universal, domain-free, maintainable. If it fails any one, do not add it — not even as an optional module.
- If a PR adds something from the exclusion list, reject it and reference this ADR.
- Multi-tenancy is neither in nor out until ADR-0009 is accepted. Do not write code that assumes it exists or that it will never exist.
- "It would be useful for most apps" does not satisfy the universal condition. Universal means every app, without exception.
