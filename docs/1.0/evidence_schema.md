# Evidence Schema

Schema version: `1.0.0`.

## Evidence classes

- `observed_fact`
- `agent_claim`
- `command_attestation`
- `policy_inference`
- `human_approval`
- `external_attestation`

## Evidence item

```ts
interface EvidenceItem {
  schemaVersion: "1.0.0";
  artifactVersion: number;
  id: string;
  runId: string;
  eventSequence: number;
  evidenceClass: EvidenceClass;
  source: { kind: string; name: string; reference?: string };
  createdAt: string;
  repositoryFingerprint: string;
  taskRevision: number;
  policyVersion?: string;
  configVersion?: string;
  payload: Record<string, unknown>;
  integrityDigest: `sha256:${string}`;
  staleness: {
    state: "current" | "stale" | "unknown";
    checkedAt?: string;
    reason?: string;
  };
}
```

IDs are stable SHA-256-derived identifiers over run ID, class, sequence, source, and canonical payload. The integrity digest covers every field except itself.

## Command attestation payload

```ts
interface CommandAttestationPayload {
  executable: string;
  arguments: string[];
  workingDirectory: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number;
  repositoryFingerprintBefore: string;
  repositoryFingerprintAfter: string;
  environmentFingerprint: string;
  stdoutDigest: string;
  stderrDigest: string;
  fullOutputStored: boolean;
  outputCompressed: boolean;
  stdoutReference?: string;
  stderrReference?: string;
}
```

## Evidence promotion rule

Evidence classes are immutable. Rendering, migration, scoring, and replay may reference or invalidate an item but cannot change `agent_claim` to `command_attestation`, `policy_inference` to `observed_fact`, or any local item to `external_attestation`.

## Staleness

Command attestations and approvals are current only when their bound repository fingerprint and task revision match the evaluated final state. An attestation may additionally declare a path relevance set; 1.0 conservatively uses the full repository fingerprint.

## Final evidence bundle

The bundle groups item references by evidence class and contains task authority, repository identity, observed changes, command attestations, agent claims, policy inferences, approvals, unresolved hazards, stale/missing evidence, and a final status of `complete`, `incomplete`, or `blocked_completion`.
