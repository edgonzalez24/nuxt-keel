# ADR-0005: Input validation

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

User input arrives at two distinct layers: the GraphQL resolver (edge) and the service. Each layer has different information and different responsibilities. We need to decide what gets validated where, with what tooling, and how the two layers interact.

Constraints:
- Services must be safe to call from any entry point (resolver, background job, test), not only GraphQL (ADR-0003).
- Validation errors must be distinguishable from business rule failures (ADR-0006).
- The stack already includes Pothos for GraphQL schema building.

## Options considered

**Where validation lives:**
1. **Edge only.** Pothos validates all input before the resolver runs. Services trust the input. Breaks when services are called from non-GraphQL entry points.
2. **Service only.** All validation, including shape, happens in the service. Simple, but sends malformed input to the database unnecessarily.
3. **Split: shape at the edge, business rules in the service.** The resolver validates that input is well-formed (valid email, string length, required fields). The service validates business rules that require domain knowledge or database access (uniqueness, existence, permissions).

**Validation library:**
1. **Zod.** De facto standard in the TypeScript ecosystem. `@pothos/plugin-zod` integrates Zod schemas directly into Pothos input types. Excellent type inference.
2. **Valibot.** Smaller bundle, similar API. Less mature Pothos integration.
3. **Manual checks.** No dependency, but no type inference and inconsistent error messages.

**Zod integration with Pothos:**
1. **`@pothos/plugin-zod`.** Zod schema declared alongside the input type; validation runs automatically before the resolver. Consistent error format across the entire API.
2. **Manual `schema.parse()` in resolvers.** Same outcome, more boilerplate, error format varies by resolver.

## Decision

**Validation layers:** Split. Shape validation lives at the GraphQL edge; business rule validation lives in the service.

- *Edge (GraphQL layer):* `@pothos/plugin-zod` validates that input is well-formed before the resolver runs. Rejects malformed requests without touching the database.
- *Service layer:* explicit `if` checks throw domain errors (ADR-0006) for business rule violations. No Zod in services.

**Library:** Zod, integrated via `@pothos/plugin-zod`.

**Schema location:** Zod schemas are defined in the same file as the Pothos input type (`server/graphql/*.ts`). No separate `server/validation/` directory. If a schema is later needed outside GraphQL, it is moved at that point.

## Consequences

- Malformed input is rejected before reaching the service — no unnecessary database round-trips.
- Services receive type-correct input guaranteed by TypeScript and Pothos. They only need to enforce business rules.
- One file per GraphQL module contains the input type, the Zod schema, and the resolvers — no directory jumping.
- Shape errors (from Zod) and business rule errors (domain errors) are distinct surfaces with different formats; ADR-0006 defines the business error surface.
- Services are safe to call from non-GraphQL entry points: TypeScript enforces the shape at compile time; the service enforces business rules at runtime.
- If a non-GraphQL entry point (a background job, a REST route) needs the same schema, it is moved to a shared location at that time, not preemptively.

## Rules for agents

- All shape validation goes in the GraphQL layer using `@pothos/plugin-zod`. Never in the service.
- Services do not import Zod. They validate business rules with explicit `if` statements and throw domain errors.
- Zod schemas are defined in the same file as the Pothos input type (`server/graphql/`). Do not create a `server/validation/` directory preemptively.
- If a validation check requires a database query, it is a business rule — it belongs in the service, not in the Zod schema.
- Validation errors (shape) and domain errors (business rules) must remain distinct. Do not throw domain errors from a Zod schema, and do not use Zod to enforce business rules.
