import { randomUUID } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";

import {
  CONFIG_VERSION,
  EVENT_SCHEMA_VERSION,
  POLICY_VERSION,
  RUN_SCHEMA_VERSION,
  approvalAtRepositoryState,
  canonicalJson,
  createApprovalRecord,
  createEvidenceItem,
  createFinalEvidenceBundle,
  createRunId,
  revokeApprovalRecord,
  sha256Digest,
  type ApprovalRecord,
  type CommandAttestationPayload,
  type CompletionHazard,
  type CreateEvidenceItemInput,
  type EvidenceItem,
  type FinalEvidenceBundle,
  type RequiredCommand
} from "./evidence.js";

export type RunEventType =
  | "run_created"
  | "task_captured"
  | "task_amended"
  | "baseline_captured"
  | "plan_submitted"
  | "plan_validation_completed"
  | "plan_validation_rejected"
  | "finding_created"
  | "finding_updated"
  | "finding_resolved"
  | "finding_overridden"
  | "command_started"
  | "command_completed"
  | "approval_recorded"
  | "approval_invalidated"
  | "approval_revoked"
  | "repository_state_changed"
  | "finalization_started"
  | "final_evidence_bundle_created"
  | "artifact_became_stale"
  | "run_completed"
  | "evidence_recorded"
  | "legacy_artifact_imported";

export interface RunEvent {
  schemaVersion: typeof EVENT_SCHEMA_VERSION;
  id: string;
  runId: string;
  sequence: number;
  type: RunEventType;
  createdAt: string;
  repositoryFingerprint: string;
  taskRevision: number;
  payload: Record<string, unknown>;
  previousEventDigest: string | null;
  integrityDigest: string;
}

export interface RunMetadata {
  schemaVersion: typeof RUN_SCHEMA_VERSION;
  artifactVersion: 1;
  runId: string;
  generation: number;
  createdAt: string;
  updatedAt: string;
  taskRevision: number;
  policyVersion: string;
  configVersion: string;
  repositoryFingerprint: string;
  status: "active" | "completed" | "incomplete";
}

export interface ReplayState {
  run: RunMetadata;
  events: RunEvent[];
  evidence: EvidenceItem[];
  approvals: ApprovalRecord[];
  findings: Map<string, Record<string, unknown>>;
  latestRepositoryFingerprint: string;
  latestFinalBundleId?: string;
  completed: boolean;
  compatibilityWarnings: string[];
}

export interface RunLockOptions {
  timeoutMs?: number;
  staleMs?: number;
}

export interface LegacyArtifactInfo {
  path: string;
  digest: string;
  bytes: number;
  kind:
    | "canonical_task"
    | "session"
    | "baseline"
    | "scope_budget"
    | "status"
    | "report"
    | "check_cache";
}

interface ApprovalIndex {
  schemaVersion: "1.0.0";
  artifactVersion: 1;
  generation: number;
  approvals: ApprovalRecord[];
}

const EMPTY_APPROVAL_INDEX: ApprovalIndex = {
  schemaVersion: "1.0.0",
  artifactVersion: 1,
  generation: 0,
  approvals: []
};

export class RunLockTimeoutError extends Error {
  constructor(path: string) {
    super(`Timed out waiting for Gleipnir run lock: ${path}`);
    this.name = "RunLockTimeoutError";
  }
}

export class GenerationConflictError extends Error {
  constructor(path: string, expected: number, actual: number | undefined) {
    super(`Generation conflict for ${path}: expected ${expected}, found ${actual ?? "none"}.`);
    this.name = "GenerationConflictError";
  }
}

export class LedgerIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerIntegrityError";
  }
}

export function runDirectory(cwd: string, runId: string): string {
  return join(cwd, ".gleip", "runs", runId);
}

export function createEvidenceRun(input: {
  cwd: string;
  createdAt: string;
  repositoryFingerprint: string;
  taskRevision?: number;
  runId?: string;
  policyVersion?: string;
  configVersion?: string;
}): RunMetadata {
  const runId = input.runId ?? createRunId(input.createdAt);
  const directory = runDirectory(input.cwd, runId);
  mkdirSync(join(directory, "commands"), { recursive: true });
  mkdirSync(join(directory, "final"), { recursive: true });
  const metadata: RunMetadata = {
    schemaVersion: RUN_SCHEMA_VERSION,
    artifactVersion: 1,
    runId,
    generation: 1,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    taskRevision: input.taskRevision ?? 1,
    policyVersion: input.policyVersion ?? POLICY_VERSION,
    configVersion: input.configVersion ?? CONFIG_VERSION,
    repositoryFingerprint: input.repositoryFingerprint,
    status: "active"
  };

  withRunLock(input.cwd, runId, () => {
    const metadataPath = join(directory, "run.json");

    if (existsSync(metadataPath)) {
      throw new Error(`Gleipnir run already exists: ${runId}`);
    }

    writeAtomicJson(metadataPath, metadata);
    appendEventUnlocked(directory, {
      runId,
      type: "run_created",
      createdAt: input.createdAt,
      repositoryFingerprint: input.repositoryFingerprint,
      taskRevision: metadata.taskRevision,
      payload: {
        policyVersion: metadata.policyVersion,
        configVersion: metadata.configVersion
      }
    });
  });

  return metadata;
}

export function readRunMetadata(cwd: string, runId: string): RunMetadata {
  return JSON.parse(
    readFileSync(join(runDirectory(cwd, runId), "run.json"), "utf8")
  ) as RunMetadata;
}

export function appendRunEvent(
  cwd: string,
  runId: string,
  input: Omit<
    RunEvent,
    "schemaVersion" | "id" | "runId" | "sequence" | "previousEventDigest" | "integrityDigest"
  >
): RunEvent {
  return withRunLock(cwd, runId, () =>
    appendEventUnlocked(runDirectory(cwd, runId), { ...input, runId })
  );
}

export function recordRunEvidence(
  cwd: string,
  runId: string,
  input: Omit<CreateEvidenceItemInput, "runId" | "eventSequence">,
  eventType: RunEventType = "evidence_recorded"
): EvidenceItem {
  return withRunLock(cwd, runId, () =>
    recordEvidenceUnlocked(runDirectory(cwd, runId), runId, input, eventType)
  );
}

export function recordCommandAttestation(input: {
  cwd: string;
  runId: string;
  createdAt: string;
  repositoryFingerprint: string;
  taskRevision: number;
  payload: CommandAttestationPayload;
  stdout?: string;
  stderr?: string;
}): EvidenceItem {
  return withRunLock(input.cwd, input.runId, () => {
    const directory = runDirectory(input.cwd, input.runId);
    const item = recordEvidenceUnlocked(
      directory,
      input.runId,
      {
        evidenceClass: "command_attestation",
        source: { kind: "local_process", name: input.payload.executable },
        createdAt: input.createdAt,
        repositoryFingerprint: input.repositoryFingerprint,
        taskRevision: input.taskRevision,
        policyVersion: POLICY_VERSION,
        configVersion: CONFIG_VERSION,
        payload: { ...input.payload }
      },
      "command_completed"
    );
    const commandPath = join(directory, "commands", `${item.id}.json`);
    writeAtomicJson(commandPath, item);

    if (input.payload.fullOutputStored) {
      writeAtomicText(join(directory, "commands", `${item.id}.stdout`), input.stdout ?? "");
      writeAtomicText(join(directory, "commands", `${item.id}.stderr`), input.stderr ?? "");
    }

    return item;
  });
}

export function recordApproval(input: {
  cwd: string;
  runId: string;
  actor: string;
  source: string;
  reason: string;
  scope: string;
  affectedPaths?: string[];
  findingIds?: string[];
  repositoryFingerprint: string;
  taskRevision: number;
  createdAt: string;
  expiresAt?: string;
}): ApprovalRecord {
  return withRunLock(input.cwd, input.runId, () => {
    const directory = runDirectory(input.cwd, input.runId);
    const approval = createApprovalRecord(input);
    const index = readApprovalIndex(directory);
    const ledgerApprovals = approvalsFromEvents(readAndVerifyEvents(join(directory, "events.jsonl")));
    recordEvidenceUnlocked(
      directory,
      input.runId,
      {
        evidenceClass: "human_approval",
        source: { kind: input.source, name: input.actor },
        createdAt: input.createdAt,
        repositoryFingerprint: input.repositoryFingerprint,
        taskRevision: input.taskRevision,
        policyVersion: POLICY_VERSION,
        configVersion: CONFIG_VERSION,
        payload: { approval }
      },
      "approval_recorded"
    );
    writeAtomicJson(
      join(directory, "approvals.json"),
      {
        ...index,
        generation: index.generation + 1,
        approvals: [...ledgerApprovals, approval]
      },
      { expectedGeneration: index.generation }
    );

    return approval;
  });
}

export function revokeApproval(input: {
  cwd: string;
  runId: string;
  approvalId: string;
  revokedAt: string;
  repositoryFingerprint: string;
  taskRevision: number;
}): ApprovalRecord {
  return withRunLock(input.cwd, input.runId, () => {
    const directory = runDirectory(input.cwd, input.runId);
    const index = readApprovalIndex(directory);
    const ledgerApprovals = approvalsFromEvents(readAndVerifyEvents(join(directory, "events.jsonl")));
    const existing = ledgerApprovals.find((approval) => approval.id === input.approvalId);

    if (existing === undefined) {
      throw new Error(`Approval not found: ${input.approvalId}`);
    }

    const revoked = revokeApprovalRecord(existing, input.revokedAt);
    appendEventUnlocked(directory, {
      runId: input.runId,
      type: "approval_revoked",
      createdAt: input.revokedAt,
      repositoryFingerprint: input.repositoryFingerprint,
      taskRevision: input.taskRevision,
      payload: { approvalId: revoked.id, approval: revoked }
    });
    writeAtomicJson(
      join(directory, "approvals.json"),
      {
        ...index,
        generation: index.generation + 1,
        approvals: ledgerApprovals.map((approval) =>
          approval.id === revoked.id ? revoked : approval
        )
      },
      { expectedGeneration: index.generation }
    );

    return revoked;
  });
}

export function replayRun(cwd: string, runId: string): ReplayState {
  const directory = runDirectory(cwd, runId);
  const run = readRunMetadata(cwd, runId);
  const events = readAndVerifyEvents(join(directory, "events.jsonl"));
  const evidence: EvidenceItem[] = [];
  const findings = new Map<string, Record<string, unknown>>();
  const warnings: string[] = [];
  let latestRepositoryFingerprint = run.repositoryFingerprint;
  let latestFinalBundleId: string | undefined;
  let completed = false;

  for (const event of events) {
    latestRepositoryFingerprint = event.repositoryFingerprint;
    const item = event.payload.evidence;

    if (isEvidenceItem(item)) {
      evidence.push(item);
    }

    applyFindingEvent(findings, event);

    if (event.type === "final_evidence_bundle_created") {
      latestFinalBundleId = stringValue(event.payload.bundleId);
    }

    if (event.type === "run_completed") {
      completed = true;
    }

    if (event.type === "legacy_artifact_imported") {
      warnings.push(`Legacy artifact imported: ${stringValue(event.payload.path) ?? "unknown"}`);
    }
  }

  const projectedApprovals = readApprovalIndex(directory).approvals;
  const approvals = approvalsFromEvents(events);

  if (canonicalJson(projectedApprovals) !== canonicalJson(approvals)) {
    warnings.push("Approval projection differs from the authoritative event ledger.");
  }

  return {
    run,
    events,
    evidence,
    approvals,
    findings,
    latestRepositoryFingerprint,
    ...(latestFinalBundleId === undefined ? {} : { latestFinalBundleId }),
    completed,
    compatibilityWarnings: warnings
  };
}

export function recoverRunLedger(
  cwd: string,
  runId: string,
  recoveredAt: string
): {
  recovered: boolean;
  recoveryPath?: string;
} {
  return withRunLock(cwd, runId, () => {
    const eventPath = join(runDirectory(cwd, runId), "events.jsonl");

    if (!existsSync(eventPath)) {
      return { recovered: false };
    }

    const content = readFileSync(eventPath, "utf8");
    const parsed = parseEventContent(content);

    if (parsed.invalidTail === undefined) {
      return { recovered: false };
    }

    const recoveryPath = join(
      runDirectory(cwd, runId),
      `events-recovery-${recoveredAt.replace(/[:.]/gu, "-")}.txt`
    );
    writeAtomicText(recoveryPath, parsed.invalidTail);
    writeAtomicText(
      eventPath,
      parsed.validLines.length === 0 ? "" : `${parsed.validLines.join("\n")}\n`
    );

    return { recovered: true, recoveryPath };
  });
}

export function synchronizeEvidenceRun(input: {
  cwd: string;
  runId: string;
  checkedAt: string;
  repositoryFingerprint: string;
  taskRevision: number;
}): RunMetadata {
  return withRunLock(input.cwd, input.runId, () => {
    const directory = runDirectory(input.cwd, input.runId);
    const state = replayRunUnlocked(directory);
    const metadata = state.run;
    const repositoryChanged = metadata.repositoryFingerprint !== input.repositoryFingerprint;
    const taskChanged = metadata.taskRevision !== input.taskRevision;

    if (repositoryChanged || taskChanged) {
      appendEventUnlocked(directory, {
        runId: input.runId,
        type: "repository_state_changed",
        createdAt: input.checkedAt,
        repositoryFingerprint: input.repositoryFingerprint,
        taskRevision: input.taskRevision,
        payload: {
          previousRepositoryFingerprint: metadata.repositoryFingerprint,
          previousTaskRevision: metadata.taskRevision,
          repositoryChanged,
          taskChanged
        }
      });
      const staleEvidenceIds = state.evidence
        .filter(
          (item) =>
            item.repositoryFingerprint !== input.repositoryFingerprint ||
            item.taskRevision !== input.taskRevision
        )
        .map((item) => item.id);

      if (staleEvidenceIds.length > 0) {
        appendEventUnlocked(directory, {
          runId: input.runId,
          type: "artifact_became_stale",
          createdAt: input.checkedAt,
          repositoryFingerprint: input.repositoryFingerprint,
          taskRevision: input.taskRevision,
          payload: { evidenceIds: staleEvidenceIds }
        });
      }
    }

    invalidateApprovalsUnlocked(
      directory,
      state.approvals,
      input.repositoryFingerprint,
      input.taskRevision,
      input.checkedAt,
      input.runId
    );

    if (!repositoryChanged && !taskChanged) {
      return metadata;
    }

    const updated = {
      ...metadata,
      generation: metadata.generation + 1,
      updatedAt: input.checkedAt,
      repositoryFingerprint: input.repositoryFingerprint,
      taskRevision: input.taskRevision,
      status: metadata.status === "completed" ? ("incomplete" as const) : metadata.status
    };
    writeAtomicJson(join(directory, "run.json"), updated, {
      expectedGeneration: metadata.generation
    });
    return updated;
  });
}

export function finalizeEvidenceRun(input: {
  cwd: string;
  runId: string;
  createdAt: string;
  taskAuthority: FinalEvidenceBundle["taskAuthority"];
  repository: FinalEvidenceBundle["repository"];
  hazards: CompletionHazard[];
  requiredCommands: RequiredCommand[];
}): FinalEvidenceBundle {
  return withRunLock(input.cwd, input.runId, () => {
    const directory = runDirectory(input.cwd, input.runId);
    appendEventUnlocked(directory, {
      runId: input.runId,
      type: "finalization_started",
      createdAt: input.createdAt,
      repositoryFingerprint: input.repository.fingerprint,
      taskRevision: input.taskAuthority.revision,
      payload: {}
    });
    const state = replayRunUnlocked(directory);
    const approvalIndex = invalidateApprovalsUnlocked(
      directory,
      state.approvals,
      input.repository.fingerprint,
      input.taskAuthority.revision,
      input.createdAt,
      input.runId
    );
    const bundle = createFinalEvidenceBundle({
      runId: input.runId,
      createdAt: input.createdAt,
      taskAuthority: input.taskAuthority,
      repository: input.repository,
      evidenceItems: state.evidence,
      approvals: approvalIndex.approvals,
      hazards: input.hazards,
      requiredCommands: input.requiredCommands
    });
    writeAtomicJson(join(directory, "final", `${bundle.id}.json`), bundle);
    writeAtomicJson(join(directory, "final", "latest.json"), bundle);
    appendEventUnlocked(directory, {
      runId: input.runId,
      type: "final_evidence_bundle_created",
      createdAt: input.createdAt,
      repositoryFingerprint: input.repository.fingerprint,
      taskRevision: input.taskAuthority.revision,
      payload: { bundleId: bundle.id, completionStatus: bundle.completionStatus }
    });
    appendEventUnlocked(directory, {
      runId: input.runId,
      type: "run_completed",
      createdAt: input.createdAt,
      repositoryFingerprint: input.repository.fingerprint,
      taskRevision: input.taskAuthority.revision,
      payload: { bundleId: bundle.id, completionStatus: bundle.completionStatus }
    });
    const metadata = JSON.parse(readFileSync(join(directory, "run.json"), "utf8")) as RunMetadata;
    writeAtomicJson(
      join(directory, "run.json"),
      {
        ...metadata,
        generation: metadata.generation + 1,
        updatedAt: input.createdAt,
        repositoryFingerprint: input.repository.fingerprint,
        taskRevision: input.taskAuthority.revision,
        status: bundle.completionStatus === "complete" ? "completed" : "incomplete"
      },
      { expectedGeneration: metadata.generation }
    );

    return bundle;
  });
}

export function inspectLegacyArtifacts(cwd: string): LegacyArtifactInfo[] {
  const candidates: Array<{ path: string; kind: LegacyArtifactInfo["kind"] }> = [
    { path: ".gleip/canonical-task.json", kind: "canonical_task" },
    { path: ".gleip/session.json", kind: "session" },
    { path: ".gleip/baseline.json", kind: "baseline" },
    { path: ".gleip/scope-budget.json", kind: "scope_budget" },
    { path: ".gleip/status.md", kind: "status" },
    { path: ".gleip/report.json", kind: "report" },
    { path: ".gleip/check-cache.json", kind: "check_cache" }
  ];

  return candidates.flatMap((candidate) => {
    const absolutePath = join(cwd, candidate.path);

    if (!existsSync(absolutePath)) {
      return [];
    }

    const content = readFileSync(absolutePath);
    return [
      {
        path: candidate.path,
        kind: candidate.kind,
        bytes: content.byteLength,
        digest: sha256Digest(content)
      }
    ];
  });
}

export function migrateLegacyArtifacts(input: {
  cwd: string;
  createdAt: string;
  repositoryFingerprint: string;
  dryRun?: boolean;
}): { artifacts: LegacyArtifactInfo[]; run?: RunMetadata; warnings: string[] } {
  const artifacts = inspectLegacyArtifacts(input.cwd);

  if (input.dryRun === true) {
    return { artifacts, warnings: [] };
  }

  const canonical = artifacts.find((artifact) => artifact.kind === "canonical_task");
  const session = artifacts.find((artifact) => artifact.kind === "session");
  const taskRevision = legacyTaskRevision(
    canonical === undefined ? undefined : join(input.cwd, canonical.path)
  );
  const run = createEvidenceRun({
    cwd: input.cwd,
    createdAt: input.createdAt,
    repositoryFingerprint: input.repositoryFingerprint,
    taskRevision
  });
  const backupDirectory = join(runDirectory(input.cwd, run.runId), "legacy-backup");
  mkdirSync(backupDirectory, { recursive: true });
  const warnings: string[] = [];

  for (const artifact of artifacts) {
    const sourcePath = join(input.cwd, artifact.path);
    const backupPath = join(backupDirectory, basename(artifact.path));
    copyFileSync(sourcePath, backupPath);
    const evidenceClass =
      artifact.kind === "canonical_task" || artifact.kind === "baseline"
        ? "observed_fact"
        : artifact.kind === "status"
          ? "agent_claim"
          : "policy_inference";
    const payload: Record<string, unknown> = {
      path: artifact.path,
      digest: artifact.digest,
      bytes: artifact.bytes,
      backupPath: relative(input.cwd, backupPath).replaceAll("\\", "/")
    };

    if (artifact.kind === "status") {
      payload.content = readFileSync(sourcePath, "utf8");
    }

    recordRunEvidence(
      input.cwd,
      run.runId,
      {
        evidenceClass,
        source: { kind: "legacy_artifact", name: artifact.kind, reference: artifact.path },
        createdAt: input.createdAt,
        repositoryFingerprint: input.repositoryFingerprint,
        taskRevision,
        policyVersion: POLICY_VERSION,
        configVersion: CONFIG_VERSION,
        payload,
        staleness: { state: "unknown", reason: "Legacy evidence was not current-state attested." }
      },
      "legacy_artifact_imported"
    );
  }

  if (canonical === undefined && session === undefined) {
    warnings.push("No canonical task or legacy session task was available.");
  }

  writeAtomicJson(join(runDirectory(input.cwd, run.runId), "legacy-manifest.json"), {
    schemaVersion: "1.0.0",
    createdAt: input.createdAt,
    artifacts,
    warnings
  });

  return { artifacts, run, warnings };
}

export function writeAtomicJson(
  path: string,
  value: unknown,
  options: {
    expectedGeneration?: number;
    failBeforeRename?: boolean;
    failAfterRename?: boolean;
  } = {}
): void {
  if (options.expectedGeneration !== undefined) {
    const actual = readGeneration(path);

    if ((actual ?? 0) !== options.expectedGeneration) {
      throw new GenerationConflictError(path, options.expectedGeneration, actual);
    }
  }

  writeAtomicText(path, `${JSON.stringify(value, null, 2)}\n`, options);
}

export function writeAtomicText(
  path: string,
  content: string,
  options: { failBeforeRename?: boolean; failAfterRename?: boolean } = {}
): void {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  const descriptor = openSync(tempPath, "wx");

  try {
    writeFileSync(descriptor, content, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }

  if (options.failBeforeRename === true) {
    unlinkSync(tempPath);
    throw new Error("Injected failure before atomic rename.");
  }

  renameSync(tempPath, path);
  fsyncParentDirectory(dirname(path));

  if (options.failAfterRename === true) {
    throw new Error("Injected failure after atomic rename.");
  }
}

export function withRunLock<T>(
  cwd: string,
  runId: string,
  action: () => T,
  options: RunLockOptions = {}
): T {
  const directory = runDirectory(cwd, runId);
  mkdirSync(directory, { recursive: true });
  const lockPath = join(directory, ".write.lock");
  const timeoutMs = options.timeoutMs ?? 5_000;
  const staleMs = options.staleMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;
  const nonce = randomUUID();
  let acquired = false;

  while (!acquired) {
    try {
      const descriptor = openSync(lockPath, "wx");
      writeFileSync(
        descriptor,
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), nonce })}\n`,
        "utf8"
      );
      fsyncSync(descriptor);
      closeSync(descriptor);
      acquired = true;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      removeStaleLock(lockPath, staleMs);

      if (Date.now() >= deadline) {
        throw new RunLockTimeoutError(lockPath);
      }

      synchronousPause(10);
    }
  }

  try {
    return action();
  } finally {
    try {
      const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { nonce?: string };

      if (lock.nonce === nonce) {
        unlinkSync(lockPath);
      }
    } catch {
      // The lock is already absent or corrupt; do not remove an unknown replacement.
    }
  }
}

function appendEventUnlocked(
  directory: string,
  input: Omit<
    RunEvent,
    "schemaVersion" | "id" | "sequence" | "previousEventDigest" | "integrityDigest"
  >
): RunEvent {
  const eventPath = join(directory, "events.jsonl");
  const events = existsSync(eventPath) ? readAndVerifyEvents(eventPath) : [];
  const sequence = events.length + 1;
  const previousEventDigest = events.at(-1)?.integrityDigest ?? null;
  const base = {
    schemaVersion: "1.0.0" as const,
    runId: input.runId,
    sequence,
    type: input.type,
    createdAt: input.createdAt,
    repositoryFingerprint: input.repositoryFingerprint,
    taskRevision: input.taskRevision,
    payload: input.payload,
    previousEventDigest
  };
  const id = `event-${sequence}-${sha256Digest(canonicalJson(base)).slice(7, 23)}`;
  const withoutDigest = { ...base, id };
  const event: RunEvent = {
    ...withoutDigest,
    integrityDigest: sha256Digest(canonicalJson(withoutDigest))
  };
  appendFsyncedLine(eventPath, canonicalJson(event));
  return event;
}

function recordEvidenceUnlocked(
  directory: string,
  runId: string,
  input: Omit<CreateEvidenceItemInput, "runId" | "eventSequence">,
  eventType: RunEventType
): EvidenceItem {
  const eventPath = join(directory, "events.jsonl");
  const events = existsSync(eventPath) ? readAndVerifyEvents(eventPath) : [];
  const item = createEvidenceItem({
    ...input,
    runId,
    eventSequence: events.length + 1
  });
  appendEventUnlocked(directory, {
    runId,
    type: eventType,
    createdAt: input.createdAt,
    repositoryFingerprint: input.repositoryFingerprint,
    taskRevision: input.taskRevision,
    payload: { evidence: item }
  });
  appendFsyncedLine(join(directory, "evidence.jsonl"), canonicalJson(item));
  return item;
}

function readAndVerifyEvents(path: string): RunEvent[] {
  if (!existsSync(path)) {
    return [];
  }

  const parsed = parseEventContent(readFileSync(path, "utf8"));

  if (parsed.invalidTail !== undefined) {
    throw new LedgerIntegrityError(`Incomplete or invalid event ledger tail: ${path}`);
  }

  const events = parsed.validLines.map((line) => JSON.parse(line) as RunEvent);
  let previousDigest: string | null = null;

  for (const [index, event] of events.entries()) {
    const expectedSequence = index + 1;

    if (event.sequence !== expectedSequence) {
      throw new LedgerIntegrityError(
        `Event sequence mismatch in ${path}: expected ${expectedSequence}, found ${event.sequence}.`
      );
    }

    if (event.previousEventDigest !== previousDigest) {
      throw new LedgerIntegrityError(`Event digest chain mismatch at sequence ${event.sequence}.`);
    }

    const { integrityDigest, ...withoutDigest } = event;

    if (integrityDigest !== sha256Digest(canonicalJson(withoutDigest))) {
      throw new LedgerIntegrityError(
        `Event integrity digest mismatch at sequence ${event.sequence}.`
      );
    }

    previousDigest = event.integrityDigest;
  }

  return events;
}

function parseEventContent(content: string): { validLines: string[]; invalidTail?: string } {
  const rawLines = content.split("\n");
  const validLines: string[] = [];

  for (const [index, rawLine] of rawLines.entries()) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    try {
      JSON.parse(line);
      validLines.push(line);
    } catch {
      const remaining = rawLines.slice(index).join("\n");
      return { validLines, invalidTail: remaining };
    }
  }

  return { validLines };
}

function replayRunUnlocked(directory: string): ReplayState {
  const run = JSON.parse(readFileSync(join(directory, "run.json"), "utf8")) as RunMetadata;
  const events = readAndVerifyEvents(join(directory, "events.jsonl"));
  const evidence = events.flatMap((event) =>
    isEvidenceItem(event.payload.evidence) ? [event.payload.evidence] : []
  );

  return {
    run,
    events,
    evidence,
    approvals: approvalsFromEvents(events),
    findings: new Map(),
    latestRepositoryFingerprint: events.at(-1)?.repositoryFingerprint ?? run.repositoryFingerprint,
    completed: events.some((event) => event.type === "run_completed"),
    compatibilityWarnings: []
  };
}

function invalidateApprovalsUnlocked(
  directory: string,
  approvals: ApprovalRecord[],
  repositoryFingerprint: string,
  taskRevision: number,
  checkedAt: string,
  runId: string
): ApprovalIndex {
  const index = readApprovalIndex(directory);
  const nextApprovals = approvals.map((approval) =>
    approvalAtRepositoryState(approval, repositoryFingerprint, taskRevision, checkedAt)
  );
  const invalidated = nextApprovals.filter(
    (approval, position) => approval.state === "invalid" && approvals[position]?.state === "active"
  );

  for (const approval of invalidated) {
    appendEventUnlocked(directory, {
      runId,
      type: "approval_invalidated",
      createdAt: checkedAt,
      repositoryFingerprint,
      taskRevision,
      payload: {
        approvalId: approval.id,
        reason: approval.invalidationReason ?? "State changed.",
        approval
      }
    });
  }

  if (
    invalidated.length === 0 &&
    canonicalJson(index.approvals) === canonicalJson(nextApprovals)
  ) {
    return index;
  }

  const nextIndex = {
    ...index,
    generation: index.generation + 1,
    approvals: nextApprovals
  };
  writeAtomicJson(join(directory, "approvals.json"), nextIndex, {
    expectedGeneration: index.generation
  });

  return nextIndex;
}

function approvalsFromEvents(events: RunEvent[]): ApprovalRecord[] {
  const approvals = new Map<string, ApprovalRecord>();

  for (const event of events) {
    const directApproval = isApprovalRecord(event.payload.approval)
      ? event.payload.approval
      : undefined;
    const evidence = isEvidenceItem(event.payload.evidence) ? event.payload.evidence : undefined;
    const evidenceApproval = isApprovalRecord(evidence?.payload.approval)
      ? evidence.payload.approval
      : undefined;
    const approval = directApproval ?? evidenceApproval;

    if (approval !== undefined) {
      approvals.set(approval.id, approval);
    }
  }

  return [...approvals.values()];
}

function readApprovalIndex(directory: string): ApprovalIndex {
  const path = join(directory, "approvals.json");
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as ApprovalIndex)
    : { ...EMPTY_APPROVAL_INDEX, approvals: [] };
}

function appendFsyncedLine(path: string, line: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, "a");

  try {
    writeSync(descriptor, `${line}\n`, undefined, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function fsyncParentDirectory(directory: string): void {
  try {
    const descriptor = openSync(directory, "r");

    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  } catch {
    // Some platforms, notably Windows, do not allow opening directories for fsync.
  }
}

function applyFindingEvent(findings: Map<string, Record<string, unknown>>, event: RunEvent): void {
  const findingId = stringValue(event.payload.findingId);

  if (findingId === undefined) {
    return;
  }

  if (event.type === "finding_created" || event.type === "finding_updated") {
    findings.set(findingId, event.payload);
  }

  if (event.type === "finding_resolved") {
    findings.delete(findingId);
  }

  if (event.type === "finding_overridden") {
    findings.set(findingId, { ...event.payload, overridden: true });
  }
}

function removeStaleLock(path: string, staleMs: number): void {
  try {
    const age = Date.now() - statSync(path).mtimeMs;

    if (age < staleMs) {
      return;
    }

    const lock = JSON.parse(readFileSync(path, "utf8")) as { pid?: number };

    if (typeof lock.pid === "number" && processIsAlive(lock.pid)) {
      return;
    }

    unlinkSync(path);
  } catch {
    // Another writer may have released or replaced the lock.
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNodeError(error) && error.code === "EPERM";
  }
}

function synchronousPause(milliseconds: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function readGeneration(path: string): number | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as { generation?: unknown };
    return typeof value.generation === "number" ? value.generation : undefined;
  } catch {
    return undefined;
  }
}

function legacyTaskRevision(canonicalPath: string | undefined): number {
  if (canonicalPath === undefined || !existsSync(canonicalPath)) {
    return 1;
  }

  try {
    const value = JSON.parse(readFileSync(canonicalPath, "utf8")) as {
      currentRevision?: unknown;
      revisions?: unknown[];
    };

    if (typeof value.currentRevision === "number") {
      return value.currentRevision;
    }

    return Math.max(1, value.revisions?.length ?? 1);
  } catch {
    return 1;
  }
}

function isEvidenceItem(value: unknown): value is EvidenceItem {
  return (
    value !== null &&
    typeof value === "object" &&
    "evidenceClass" in value &&
    "integrityDigest" in value &&
    "runId" in value
  );
}

function isApprovalRecord(value: unknown): value is ApprovalRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    "runId" in value &&
    "actor" in value &&
    "state" in value &&
    "integrityDigest" in value
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isAlreadyExistsError(error: unknown): boolean {
  return isNodeError(error) && error.code === "EEXIST";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
