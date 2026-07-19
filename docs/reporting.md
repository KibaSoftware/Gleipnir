# Evidence Finalization and Compatibility Reporting

`npx --no-install gleip finalize` is the primary 1.0 completion workflow. It creates `.gleip/runs/<run-id>/final/latest.json` for the exact current repository fingerprint.

The final bundle separates:

- canonical task authority and revision;
- repository identity and exact changed paths;
- observed facts;
- command attestations;
- agent claims;
- policy inferences;
- human and external attestations;
- unresolved completion hazards;
- stale or missing evidence;
- final completion status.

Only a successful, current `command_attestation` can satisfy a configured required command. Status prose such as “tests passed” remains an `agent_claim`. Repository or task changes make bound attestations and approvals stale or invalid.

## Completion Status

- `complete`: canonical authority and all configured required command attestations are current, with no unresolved blocking hazard.
- `incomplete`: required authority or evidence is missing, failed, or stale.
- `blocked_completion`: a high-confidence completion hazard lacks its required explicit approval or resolution.

Gleipnir does not block ordinary implementation for natural-language plan vocabulary, numeric budgets, inferred scope expansion, composite scores, or inferred requirement incompleteness.

## Legacy Report

`gleip report` still writes `.gleip/report.json` and `.gleip/report.md` as score-oriented compatibility diagnostics. Its scope, requirement, efficiency, and readiness fields are policy inferences, not semantic proof or merge authority. Composite scores are not the primary interface.

The legacy JSON schema remains `1.3.0`. User-facing output calls the causal-looking token metric “estimated removable text.” Its internal compatibility field may retain the older property name; neither form represents provider usage, billing, or measured product benefit.

## Threat Model

All evidence stays local. Hash chains, digests, atomic writes, generation checks, and locks detect accidental corruption, incomplete writes, and ordinary concurrent-writer conflicts. They do not resist a malicious user or process with equivalent filesystem permissions. External trust requires an external attestation or signature that Gleipnir does not invent.

No report or final bundle authorizes a merge, verifies a deployment, proves correctness, or replaces tests, security review, and human judgment.
