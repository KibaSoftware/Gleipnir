# Migration Plan

## Principles

- Existing artifacts are read-only migration sources.
- Migration writes only to a new `.gleip/runs/<run-id>/` directory unless explicitly requested otherwise.
- A source backup/digest manifest is created before materialization.
- Unknown or corrupt fields produce explicit compatibility warnings, never invented evidence.
- Legacy status/report text is always `agent_claim` or `legacy_unclassified`; it is never upgraded to a command attestation.

## Sources

Representative readers cover:

- 0.8.x `session.json`, `baseline.json`, `scope-budget.json`, `status.md`, `check-cache.json`, and reports.
- 0.8.4+ `canonical-task.json` and requirement ledger fields.
- 0.9.x compression objects/index and report schema 1.3.0.

## Process

1. `gleip migrate --dry-run` inventories source artifacts, hashes exact bytes, selects compatibility readers, and reports warnings.
2. `gleip migrate` creates a new run ID and backup manifest, then emits `legacy_artifact_imported` events and typed evidence.
3. Canonical task content becomes observed task authority only when original bytes/provenance are complete. Derived briefs remain derived claims.
4. Git baseline and fingerprints remain historical observations, marked stale unless they match current state.
5. Plan validation becomes policy-inference evidence.
6. Status/report prose becomes agent-claim evidence.
7. Existing report scores remain legacy policy inferences and are not shown as current final status.
8. Replay validates the new run; source artifacts remain untouched.

## Failure behavior

If an artifact cannot be upgraded, migration records its path, byte digest, reader error, and `unmigrated` status. Other independent artifacts may still migrate. No partial new run is reported complete; interrupted materialization is recoverable through atomic metadata and append replay.

## Compatibility boundary

Legacy `status`, `check`, and `report` commands continue to read old active-session layouts through existing fallbacks. New `finalize`, approval, attestation, and replay features require or create a 1.0 run.
