# ADR-0020: Agent contract

- **Status:** Accepted
- **Date:** 2026-11-26

## Context

`AGENTS.md` already exists and has guided the entire ADR process. This ADR formalizes the decisions behind it: what authority the file has, how it is updated, what the initial skill set is, and how apps that extend the layer inherit its rules.

Without a formal policy, `AGENTS.md` could drift, be silently weakened by an agent, or diverge from the ADRs it is supposed to reflect.

## Decision

**Single source of truth:** `AGENTS.md` at the repo root is the sole file that defines how agents operate in this repository. `CLAUDE.md` imports it and nothing else. Per-directory agent instruction files are not used — all rules are centralized.

**Supporting files** (linked from `AGENTS.md`, not duplicates):
- `docs/agents/issue-tracker.md` — issue lifecycle and labels
- `docs/agents/triage-labels.md` — the five-label triage vocabulary
- `docs/agents/domain.md` — `GLOSSARY.md` and `docs/adr/` as the domain context

**Skill set (`layers/core/.agents/skills/`):**

The initial four skills to be written, each after its first manual implementation:

| Skill | Purpose |
|---|---|
| `add-service` | Create a service with its context, errors and tests |
| `add-graphql-type` | Expose a service in GraphQL (type, inputs, resolvers) |
| `add-migration` | Change the database schema safely |
| `add-storage-adapter` | Add a storage backend adapter |

New skills are added to `.agents/skills/` and to the `AGENTS.md` index when a new workflow has been implemented by hand at least once. Skills are never written speculatively.

**Update policy for `AGENTS.md`:**

| Change type | Requires human approval |
|---|---|
| Additive: clarify wording, add examples, fix typos, add an ADR cross-reference | No |
| Structural: add or remove sections, change the "ask for human approval" lists, add or remove skills from the index, change the definition of done | Yes |

**ADRs and `AGENTS.md` travel together:** When an ADR introduces or changes a rule that agents must follow, the corresponding `AGENTS.md` update is included in the same commit or PR. The PR description notes explicitly whether `AGENTS.md` was updated.

**Inheritance for apps:** Apps that extend the layer may have their own `AGENTS.md`. They may add stricter rules, domain-specific workflows, or additional approval gates. They may not remove, weaken, or override the core's security rules (the "Security: non-negotiable" section of the core's `AGENTS.md`). An agent working inside an app applies both the core's rules and the app's rules; where they conflict on security, the stricter rule wins.

## Consequences

- The agent contract has a clear update path that protects security-critical rules from silent degradation.
- Skills are written just-in-time, after a workflow is understood from practice — not speculatively.
- ADRs and agent instructions stay in sync because they ship in the same PR.
- Apps built on the core inherit its security baseline without having to re-state it.

## Rules for agents

- `AGENTS.md` is the authority. If a task requires violating a rule there, stop and ask — do not reinterpret the rule to allow the action.
- Additive changes to `AGENTS.md` (examples, clarifications, typos) can be made without approval. Structural changes require it.
- When writing or modifying an ADR that changes expected agent behavior, update `AGENTS.md` in the same PR.
- Do not write a skill speculatively. Write it only after the workflow it covers has been implemented by hand at least once in this repo.
- An app-level `AGENTS.md` cannot loosen the core's security rules. When in doubt, apply the stricter constraint.
