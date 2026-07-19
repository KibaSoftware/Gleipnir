# Gleipnir 1.0 Design

Gleipnir 1.0 is a passive-first, repository-local evidence ledger and precision risk observer. It captures exact task and repository provenance, records typed evidence and ordered events, attests commands against repository state, and produces one concise final evidence bundle.

It is not an autonomous planner, general agent optimizer, independent merge authority, deployment verifier, telemetry service, or cloud control plane.

## Milestones

- **A — Evidence foundation:** stable runs, typed evidence, append-only events, command attestations, approvals, repository binding, atomic/concurrent persistence, replay, migration, and stale-evidence detection.
- **B — Passive-first workflow:** passive plan validation by default, silent numeric budgets, advisory semantic inferences, agent-claim separation, hidden composite scores, no disabled-state interruption, and one `finalize` workflow.
- **C — Benchmark readiness:** local fixtures and instrumentation for no-Gleip/current/passive comparisons. Milestone C creates measurement infrastructure; it does not claim benchmark results.

## Trust boundary

Gleipnir distinguishes observed local facts, agent claims, command attestations, policy inferences, human approvals, and external attestations. Rendering never promotes a claim or inference into an observed or attested fact. Local digests detect inconsistency; they do not resist a malicious process with the same filesystem permissions.

## Governing documents

The audit under `docs/audit/` and `AUDIT_RESULTS.md` is the product-evidence basis. The detailed 1.0 design is split across architecture, evidence schema, event ledger, migration, compatibility, testing, claim changes, implementation plan, and decision log in this directory.
