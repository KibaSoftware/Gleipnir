# Gleipnir 1.0 Implementation Plan

## Release rules

- Preserve exact canonical-task and Git-fingerprint behavior.
- Do not broaden execution blocking.
- Keep old 0.8.x/0.9.x artifacts readable without mutating them in place.
- Keep all state local and ignore runtime artifacts in Git.
- Land focused commits and stop on a failing focused test.

## Milestone A — Evidence foundation

1. Add versioned evidence, event, approval, command-attestation, run-state, and final-bundle types in `@gleip/core`.
2. Add a repository-local run directory under `.gleip/runs/<run-id>/` with `events.jsonl`, `evidence.jsonl`, `approvals.json`, `commands/`, `run.json`, and final bundles.
3. Implement exclusive lock files, generation compare-and-swap, atomic JSON writes, fsynced append, partial-tail recovery, integrity digests, and deterministic replay.
4. Record run/task/baseline/plan/finding/command/approval/repository/finalization lifecycle events.
5. Extend `gleip run` to create command attestations with exact argv, cwd, timing, exit status, before/after fingerprints, environment fingerprint, output digests, storage/compression flags, integrity digest, and staleness.
6. Add durable approval creation/revocation/invalidation and fingerprint-bound validation.
7. Add legacy artifact readers and non-mutating migration previews/materialization into a new run.

## Milestone B — Passive-first workflow

1. Replace inert mode semantics with `passive` default and reserved legacy aliases.
2. Make plan validation required only for broad/sensitive profiles; otherwise record findings without workflow rejection.
3. Make file/line limits silent metrics in passive mode; retain exact diff and protected-path findings.
4. Treat requirement coverage and semantic scope as `policy_inference` only.
5. Treat status prose as `agent_claim` only.
6. Hide composite scores from default report/finalize output while retaining legacy JSON fields for compatibility.
7. Remove disabled-state mandatory questioning from generated instructions.
8. Add `gleip finalize` as the single current-state check and evidence-bundle command; keep `status` and `report` compatibility commands.
9. Completion hazards are limited to exact high-confidence evidence and valid approval/attestation state.

## Milestone C — Benchmark readiness

1. Add a local benchmark manifest schema, arm labels (`none`, `current`, `passive`), task/repetition IDs, and event-derived friction metrics.
2. Add safe fixture repositories/tasks for scope expansion, skipped/deleted tests, protected paths, failed/stale validation, and read-only plan vocabulary.
3. Add export of local, non-causal measurements without claiming improvement.

## Planned commits

1. `docs: define Gleipnir 1.0 evidence-led design`
2. `feat(core): add evidence ledger and integrity primitives`
3. `feat(cli): attest commands and approvals`
4. `feat(cli): add passive finalize evidence bundle`
5. `feat: add legacy migration and benchmark fixtures`
6. `docs: correct 1.0 product claims and release metadata`

Commits may combine adjacent items only when their tests and compatibility boundary are inseparable.

## Completion gates

Full tests, typecheck, lint, build, CLI smoke, packed-install smoke, migration fixtures, concurrency stress, crash recovery, no-network inspection, and protected/runtime diff inspection must pass against the final fingerprint.
