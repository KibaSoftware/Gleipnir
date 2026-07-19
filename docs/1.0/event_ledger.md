# Event Ledger

Schema version: `1.0.0`.

## Event envelope

```ts
interface RunEvent {
  schemaVersion: "1.0.0";
  id: string;
  runId: string;
  sequence: number;
  type: RunEventType;
  createdAt: string;
  repositoryFingerprint: string;
  taskRevision: number;
  payload: Record<string, unknown>;
  previousEventDigest: string | null;
  integrityDigest: `sha256:${string}`;
}
```

Required event types include run/task/baseline creation, task amendment, plan submission/result/rejection, finding create/update/resolve/override, command start/completion, approval record/invalidation, repository-state change, finalization start, final bundle creation, artifact stale, and run completion.

## Ordering and append contract

- Sequence starts at 1 and increments by exactly 1 per run.
- The run lock is acquired before reading the tail and held through fsynced append.
- Each event links the preceding event digest; replay rejects gaps, duplicates, reordering, or digest mismatch.
- Existing lines are never rewritten during normal operation.
- A crash-created incomplete trailing line is copied to a recovery artifact and omitted from replay; complete prior lines remain authoritative.
- Unknown future event types are retained but ignored by older state reconstruction with an explicit compatibility warning.

## Replay state

Replay deterministically reconstructs:

- Active task revision and run lifecycle.
- Submitted/latest/accepted plan attempts.
- Current finding lifecycle.
- Command-attestation references and staleness.
- Active/revoked/invalid approvals.
- Latest repository fingerprint.
- Latest final bundle and completion status.

Replay does not infer events from report prose or Git history. Legacy migration emits explicit `legacy_artifact_imported` events and preserves source classification.

## Concurrency and recovery

The lock is an exclusive `wx` file containing owner PID, creation time, and nonce. A timed-out caller fails explicitly. Stale lock removal requires both an age threshold and a failed owner-process liveness check where supported. Tests cover concurrent appenders, lock timeout, generation conflicts, partial-tail recovery, and interruption before/after rename.
