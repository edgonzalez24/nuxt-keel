# ADR-0013: Background jobs

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

Some apps built on this core will need to execute work outside of the HTTP request cycle — sending emails in bulk, processing uploaded documents, running scheduled tasks. The question is whether the core provides any infrastructure for this.

## Decision

**Nothing.** The core does not include background job support — no interface, no type definitions, no integration with `ServiceContext`, no adapter pattern.

This follows directly from ADR-0018's admission criterion: job queues are not universal. Infrastructure choices vary significantly across apps and deployment targets:

| Library | Backend | Best fit |
|---|---|---|
| pg-boss / Graphile Worker | Postgres | Apps already on Postgres, durable execution |
| BullMQ | Redis | High-throughput, low-latency jobs |
| Inngest | Managed | Event-driven workflows, fan-out |
| Cloudflare Queues | Cloudflare | Apps deployed to Cloudflare Workers |

The core cannot choose among these without imposing the wrong infrastructure on a large fraction of apps that use it.

## Consequences

- Apps integrate background jobs directly with the library that fits their infrastructure.
- If a worker process needs to call core services (e.g., to send a verification email from a job), it constructs a `ServiceContext` manually — the same `{ user, db, logger }` shape (ADR-0003) — and calls the service directly. No special integration is required.
- The core will never have a concept of "enqueue" or "process" in its API surface.

## Rules for agents

- Do not add any job queue type, interface, or implementation to `layers/core/` without an ADR amendment.
- If a service function appears to need to enqueue a job, that is a signal the enqueuing belongs in the app layer, not the core service. The service should return enough data for the caller to decide.
- Workers that call core services construct `ServiceContext` directly — there is no special worker-context factory in the core.
