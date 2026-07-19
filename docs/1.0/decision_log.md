# Gleipnir 1.0 Decision Log

## D-001 — Passive is the default

Accepted. Ordinary/local work records plan and scope inferences without requiring plan rewrites. Broad and sensitive profiles retain plan-validation escalation.

## D-002 — Evidence classes are immutable

Accepted. Status prose is `agent_claim`; Git observations are `observed_fact`; Gleip-run process results are `command_attestation`; scope/requirement/readiness outputs are `policy_inference`; approvals must be explicit.

## D-003 — One finalization workflow

Accepted. Add `gleip finalize` as the preferred completion command. Preserve `check`, `status`, and `report` for compatibility.

## D-004 — No new broad execution blocks

Accepted. 1.0 completion hazards use exact task corruption, test skip/delete, secrets, protected/dependency/CI approval state, and required command attestations. Numeric budgets, vocabulary, semantic scope, composite scores, and inferred requirement incompleteness stay non-blocking.

## D-005 — Full repository fingerprint staleness

Accepted for 1.0. Command attestations and approvals become stale when the final full repository fingerprint or task revision differs. Path-relevance refinement is deferred because it could incorrectly preserve evidence.

## D-006 — Local integrity, not adversarial security

Accepted. Use atomic writes, fsync, locks/CAS, hash chains, and replay validation. Do not claim tamper resistance against an equivalent-permission writer.

## D-007 — Preserve placeholder packages for compatibility

Accepted provisionally. Keep package names/public surfaces, document them as placeholders, and remove capability claims. Deletion is deferred until downstream package usage is measured.

## D-008 — Composite scores remain legacy-only

Accepted. Keep schema/read compatibility but hide scores from the default final bundle and do not use them as proof.

## D-009 — Compression remains experimental

Accepted. Preserve exact local retrieval and authority separation. No token/productivity claim until the controlled benchmark is executed.

## D-010 — Benchmark infrastructure is not benchmark evidence

Accepted. 1.0 may add fixtures, arms, event-derived metrics, and export. It must report no causal result without valid repetitions and blinded outcome review.
