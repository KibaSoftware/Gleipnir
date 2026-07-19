# Gleipnir 1.0 Test Strategy

## Focused suites

- **Evidence:** class immutability, canonical digest/ID, repository/task binding, staleness, and no cross-class promotion.
- **Ledger:** monotonic sequence, hash chain, replay, unknown future event, concurrent append, lock timeout, partial-tail recovery, and crash windows.
- **Attestation:** success/failure, argv/cwd, duration, environment fingerprint, stream digests/storage/compression, repository change during execution, stale final state, and child exit propagation.
- **Approvals:** creation, scope/finding/path binding, expiry, revoke, repository/task invalidation, and no inferred approval.
- **Final bundle:** exact final fingerprint, grouped evidence classes, unresolved hazards, required-command state, hidden scores, deterministic render, and stale/missing evidence.
- **Migration:** representative 0.8.1, 0.8.4, and 0.9.0 fixtures; corrupt/unknown artifact; source non-mutation; no claim promotion.
- **Workflow:** passive defaults, broad/sensitive escalation, silent numeric budgets, advisory semantic scope/requirements, disabled-state no-question instruction, and single finalize workflow.
- **Claims/invariants:** docs/schema/version consistency, no production network client, placeholder packages explicitly labeled, canonical task and Git fingerprint regressions.

## Stress and crash testing

- Spawn multiple Node processes appending events/approvals to one run and verify unique contiguous sequences and replay.
- Inject failures before temp write, after fsync, before rename, and after rename; verify old or new complete artifact, never partial JSON.
- Append a truncated JSONL tail and verify recovery preserves the valid prefix and records a recovery warning.
- Force generation conflicts and lock timeouts; verify explicit non-zero failure with no overwrite.

## Release validation

1. Focused Vitest suites after each implementation commit.
2. `pnpm.cmd test`
3. `pnpm.cmd typecheck`
4. `pnpm.cmd lint`
5. `pnpm.cmd build`
6. `pnpm.cmd smoke:cli`
7. `pnpm.cmd pack:cli`
8. `pnpm.cmd smoke:packed`
9. Migration fixtures and concurrency/crash test commands.
10. Source search for network clients and corrected claims.
11. Git diff inspection confirming no `.gleip/` runtime/protected input changes.

Validation is current only when tied to the final repository fingerprint. A later source change invalidates the release attestation and requires rerunning affected checks.
