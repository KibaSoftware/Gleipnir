# Gleipnir 1.0 Architecture

## Components

- **CLI:** captures tasks, runs commands, records approvals, finalizes evidence, renders concise output, and preserves compatibility commands.
- **Core evidence service:** owns schemas, canonical serialization/digests, atomic persistence, locks/CAS, append-only events/evidence, command attestations, approvals, replay, migration, and final bundles.
- **Planner:** produces task classification, plan parsing, requirement traceability, and semantic scope inferences. It does not create verified facts.
- **Controller:** produces policy inferences and exact diff hazards. Composite legacy scores remain compatibility data, not the primary interface.
- **Config:** selects passive behavior and exact protected/required-command policy. Legacy `strict`/`enterprise` values are reserved aliases, not hidden enforcement modes.

## Runtime flow

```text
preflight
  -> stable run ID
  -> canonical task authority
  -> run_created/task_captured/baseline_captured events
  -> observed_fact evidence for task/repository baseline

validate-plan
  -> plan_submitted/plan_validation_completed events
  -> policy_inference evidence
  -> rejection only for broad/sensitive exact hazards

run -- command
  -> command_started event
  -> process execution
  -> command_attestation evidence + command_completed event
  -> stale if final repository fingerprint differs from its post-state

approve/revoke
  -> human_approval evidence + approval event
  -> invalid when repository fingerprint or task revision changes

finalize
  -> current Git observation and findings
  -> stale evidence/approval evaluation
  -> one final bundle tied to exact fingerprint
  -> finalization/bundle/run-completed events
```

## Storage

```text
.gleip/
  canonical-task.json             legacy-compatible authority
  session.json                    legacy-compatible current session
  runs/<run-id>/
    run.json                      generation-controlled metadata
    events.jsonl                  append-only ordered events
    evidence.jsonl                append-only typed evidence
    approvals.json                atomic current approval index
    commands/<attestation-id>.json
    final/<bundle-id>.json
```

Every new artifact has a schema version, artifact version, run ID, generation where mutable, creation timestamp, and integrity digest where applicable.

## Integrity model

- Exclusive repository-local lock serializes writes for a run.
- Mutable JSON uses temp file, fsync, atomic rename, and optional expected generation.
- JSONL appends one canonical event per line, flushes/fsyncs before lock release, and ignores/quarantines only an incomplete trailing record during recovery.
- Event sequence is monotonic and derived under the write lock.
- Replay verifies sequence, previous-event digest, event digest, run ID, and schema before reconstructing state.
- This detects crashes and accidental/concurrent corruption; it is not secure against a malicious same-user writer.

## Authority

Canonical task bytes and Git observations are facts. Command exit status is attested only when executed through Gleipnir. Status prose is an agent claim. Scope/requirement/readiness conclusions are policy inferences. Approvals are explicit records, never inferred from recommendation text.
