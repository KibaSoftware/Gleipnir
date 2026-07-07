# Architecture

Gleip is organized as a TypeScript monorepo with small packages and explicit boundaries.

## Packages

- `gleip` owns command-line parsing and user-facing command wiring.
- `@gleip/core` owns shared domain types and orchestration primitives.
- `@gleip/config` owns `.gleip.yml` loading, validation, and defaults.
- `@gleip/planner` owns scope, budget, and task planning concepts.
- `@gleip/controller` owns policy application across agent workflows, deterministic report scoring, and report rendering.
- `@gleip/adapters` owns integrations with coding agents and external tools.
- `@gleip/github-action` owns CI entry points for GitHub Actions.

The CLI should stay thin. Reusable behavior belongs in package code that can be tested without invoking a shell.

## Canonical Task Authority

Preflight writes `.gleip/canonical-task.json` as the repository-local authority for
the exact received task. The CLI owns local artifact storage, ordered amendments,
hashing, byte/character counts, atomic writes, and compatibility recovery from
older 0.8.x session data. The planner owns deterministic requirement extraction,
brief coverage, scope derivation, and plan-to-requirement validation. The
controller owns final requirement-completion reporting and scoring invariants.

The derived brief, scope budget, plan validation, status, and report are aids. They
must reference or evaluate the canonical task, but they do not replace it. No
production path sends task text, repository content, telemetry, or usage data
outside the local environment.

## Context Compression

`@gleip/core` owns context compression classification, policy, local object
storage, exact retrieval, validation, and statistics. The CLI exposes that through
`compress`, `run`, `retrieve`, and `stats`.

Compression state is separate from task authority state:

```text
.gleip/canonical-task.json
.gleip/brief.md
.gleip/scope-budget.json
.gleip/session.json

.gleip/context/objects/<sha256>
.gleip/context/index.json
```

The task-contract graph is durable session authority and is never compressed,
replaced by references, or deleted by compression cleanup. The compression store is
optimization state for exact originals of non-authoritative execution evidence.
Compressed displays are not used for scope classification, plan validation,
approval decisions, scoring, requirement completion, or review readiness.
