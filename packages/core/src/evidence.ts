import { createHash, randomUUID } from "node:crypto";

export const EVIDENCE_SCHEMA_VERSION = "1.0.0";
export const EVENT_SCHEMA_VERSION = "1.0.0";
export const RUN_SCHEMA_VERSION = "1.0.0";
export const FINAL_BUNDLE_SCHEMA_VERSION = "1.0.0";
export const POLICY_VERSION = "1.0.0";
export const CONFIG_VERSION = "1.0.0";

export type EvidenceClass =
  | "observed_fact"
  | "agent_claim"
  | "command_attestation"
  | "policy_inference"
  | "human_approval"
  | "external_attestation";

export type StalenessState = "current" | "stale" | "unknown";

export interface EvidenceSource {
  kind: string;
  name: string;
  reference?: string;
}

export interface EvidenceStaleness {
  state: StalenessState;
  checkedAt?: string;
  reason?: string;
}

export interface EvidenceItem {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  artifactVersion: 1;
  id: string;
  runId: string;
  eventSequence: number;
  evidenceClass: EvidenceClass;
  source: EvidenceSource;
  createdAt: string;
  repositoryFingerprint: string;
  taskRevision: number;
  policyVersion?: string;
  configVersion?: string;
  payload: Record<string, unknown>;
  staleness: EvidenceStaleness;
  integrityDigest: string;
}

export interface CreateEvidenceItemInput {
  runId: string;
  eventSequence: number;
  evidenceClass: EvidenceClass;
  source: EvidenceSource;
  createdAt: string;
  repositoryFingerprint: string;
  taskRevision: number;
  policyVersion?: string;
  configVersion?: string;
  payload: Record<string, unknown>;
  staleness?: EvidenceStaleness;
}

export interface CommandAttestationPayload {
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

export interface ApprovalRecord {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  artifactVersion: 1;
  id: string;
  runId: string;
  actor: string;
  source: string;
  reason: string;
  scope: string;
  affectedPaths: string[];
  findingIds: string[];
  repositoryFingerprint: string;
  taskRevision: number;
  createdAt: string;
  expiresAt?: string;
  state: "active" | "revoked" | "invalid";
  revokedAt?: string;
  invalidatedAt?: string;
  invalidationReason?: string;
  integrityDigest: string;
}

export interface CompletionHazard {
  id: string;
  code: string;
  message: string;
  blocking: boolean;
  evidenceIds: string[];
  approvalRequired: boolean;
  approvedBy?: string;
}

export interface RequiredCommand {
  id: string;
  executable?: string;
  argumentIncludes?: string[];
  description: string;
}

export interface FinalEvidenceBundle {
  schemaVersion: typeof FINAL_BUNDLE_SCHEMA_VERSION;
  artifactVersion: 1;
  id: string;
  runId: string;
  createdAt: string;
  taskAuthority: {
    present: boolean;
    revision: number;
    digest?: string;
  };
  repository: {
    fingerprint: string;
    head?: string;
    dirty: boolean;
    changedPaths: string[];
  };
  evidence: Record<EvidenceClass, string[]>;
  approvals: string[];
  unresolvedHazards: CompletionHazard[];
  staleEvidence: string[];
  missingEvidence: string[];
  requiredCommands: Array<{
    id: string;
    description: string;
    satisfiedBy?: string;
    state: "satisfied" | "missing" | "failed" | "stale";
  }>;
  completionStatus: "complete" | "incomplete" | "blocked_completion";
  integrityDigest: string;
}

export interface CreateFinalEvidenceBundleInput {
  runId: string;
  createdAt: string;
  taskAuthority: FinalEvidenceBundle["taskAuthority"];
  repository: FinalEvidenceBundle["repository"];
  evidenceItems: EvidenceItem[];
  approvals: ApprovalRecord[];
  hazards: CompletionHazard[];
  requiredCommands: RequiredCommand[];
}

export function createRunId(createdAt = new Date().toISOString()): string {
  const timestamp = createdAt.replace(/[-:.TZ]/gu, "").slice(0, 17);
  return `run-${timestamp}-${randomUUID()}`;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeForCanonicalJson(value));
}

export function sha256Digest(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function createEvidenceItem(input: CreateEvidenceItemInput): EvidenceItem {
  const base = {
    schemaVersion: "1.0.0" as const,
    artifactVersion: 1 as const,
    runId: input.runId,
    eventSequence: input.eventSequence,
    evidenceClass: input.evidenceClass,
    source: input.source,
    createdAt: input.createdAt,
    repositoryFingerprint: input.repositoryFingerprint,
    taskRevision: input.taskRevision,
    ...(input.policyVersion === undefined ? {} : { policyVersion: input.policyVersion }),
    ...(input.configVersion === undefined ? {} : { configVersion: input.configVersion }),
    payload: input.payload,
    staleness: input.staleness ?? { state: "current" as const }
  };
  const id = `evidence-${sha256Digest(canonicalJson(base)).slice(7, 31)}`;
  const withoutDigest = { ...base, id };

  return {
    ...withoutDigest,
    integrityDigest: sha256Digest(canonicalJson(withoutDigest))
  };
}

export function verifyEvidenceItem(item: EvidenceItem): boolean {
  const { integrityDigest, ...withoutDigest } = item;
  return integrityDigest === sha256Digest(canonicalJson(withoutDigest));
}

export function evidenceAtRepositoryState(
  item: EvidenceItem,
  repositoryFingerprint: string,
  taskRevision: number,
  checkedAt: string
): EvidenceItem {
  const reasons: string[] = [];

  if (item.repositoryFingerprint !== repositoryFingerprint) {
    reasons.push("Repository fingerprint changed.");
  }

  if (item.taskRevision !== taskRevision) {
    reasons.push("Task revision changed.");
  }

  const withoutDigest = withoutKeys(item, ["integrityDigest"]);
  const nextWithoutDigest = {
    ...withoutDigest,
    staleness:
      reasons.length === 0
        ? { state: "current" as const, checkedAt }
        : { state: "stale" as const, checkedAt, reason: reasons.join(" ") }
  };

  return {
    ...nextWithoutDigest,
    integrityDigest: sha256Digest(canonicalJson(nextWithoutDigest))
  };
}

export function createApprovalRecord(input: {
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
  const base = {
    schemaVersion: "1.0.0" as const,
    artifactVersion: 1 as const,
    runId: input.runId,
    actor: input.actor,
    source: input.source,
    reason: input.reason,
    scope: input.scope,
    affectedPaths: [...new Set(input.affectedPaths ?? [])].sort(),
    findingIds: [...new Set(input.findingIds ?? [])].sort(),
    repositoryFingerprint: input.repositoryFingerprint,
    taskRevision: input.taskRevision,
    createdAt: input.createdAt,
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    state: "active" as const
  };
  const id = `approval-${sha256Digest(canonicalJson(base)).slice(7, 31)}`;
  const withoutDigest = { ...base, id };

  return {
    ...withoutDigest,
    integrityDigest: sha256Digest(canonicalJson(withoutDigest))
  };
}

export function approvalAtRepositoryState(
  approval: ApprovalRecord,
  repositoryFingerprint: string,
  taskRevision: number,
  checkedAt: string
): ApprovalRecord {
  if (approval.state !== "active") {
    return approval;
  }

  const reasons: string[] = [];

  if (approval.repositoryFingerprint !== repositoryFingerprint) {
    reasons.push("Repository fingerprint changed.");
  }

  if (approval.taskRevision !== taskRevision) {
    reasons.push("Task revision changed.");
  }

  if (approval.expiresAt !== undefined && approval.expiresAt <= checkedAt) {
    reasons.push("Approval expired.");
  }

  if (reasons.length === 0) {
    return approval;
  }

  const withoutDigest = withoutKeys(approval, ["integrityDigest"]);
  const nextWithoutDigest = {
    ...withoutDigest,
    state: "invalid" as const,
    invalidatedAt: checkedAt,
    invalidationReason: reasons.join(" ")
  };

  return {
    ...nextWithoutDigest,
    integrityDigest: sha256Digest(canonicalJson(nextWithoutDigest))
  };
}

export function revokeApprovalRecord(approval: ApprovalRecord, revokedAt: string): ApprovalRecord {
  const base = withoutKeys(approval, ["integrityDigest", "invalidatedAt", "invalidationReason"]);
  const withoutDigest = {
    ...base,
    state: "revoked" as const,
    revokedAt
  };

  return {
    ...withoutDigest,
    integrityDigest: sha256Digest(canonicalJson(withoutDigest))
  };
}

export interface VerificationEvidenceSummary {
  /**
   * `satisfied` only when a verification command ran to success against the exact repository state
   * being reported on. `failed` and `stale` are distinct because the actions they call for differ:
   * fix the failure, or re-run against the current state.
   */
  state: "satisfied" | "failed" | "stale" | "missing";
  evidenceIds: string[];
  commands: string[];
}

/**
 * Classify recorded command attestations as verification evidence for one repository state.
 *
 * `gleip run -- pnpm test` records an exact-state attestation with an exit code and the repository
 * fingerprint before and after the run, but the completion gate asked a different question --
 * whether `.gleip/status.md` prose mentioned tests. A real, passing, attested test run therefore
 * left `finalize` reporting "Required verification evidence is missing", while narration alone
 * satisfied it. This reads the attestations instead, so the strongest evidence class Gleip records
 * is the one the gate consults.
 */
export function summarizeVerificationEvidence(
  evidenceItems: EvidenceItem[],
  repositoryFingerprint: string,
  taskRevision: number,
  checkedAt: string
): VerificationEvidenceSummary {
  const attestations = evidenceItems
    .map((item) => evidenceAtRepositoryState(item, repositoryFingerprint, taskRevision, checkedAt))
    .filter(
      (item): item is EvidenceItem & { payload: CommandAttestationPayload } =>
        item.evidenceClass === "command_attestation"
    )
    .filter((item) => isVerificationCommand(item.payload));

  const summarize = (
    state: VerificationEvidenceSummary["state"],
    items: Array<EvidenceItem & { payload: CommandAttestationPayload }>
  ): VerificationEvidenceSummary => ({
    state,
    evidenceIds: items.map((item) => item.id),
    commands: items.map((item) => describeCommand(item.payload))
  });

  const current = attestations.filter((item) => item.staleness.state !== "stale");
  // A failing run followed by a passing one is the ordinary fix-then-re-run loop, so any current
  // success satisfies the requirement rather than the most recent attestation deciding alone.
  const passed = current.filter((item) => item.payload.exitCode === 0);

  if (passed.length > 0) {
    return summarize("satisfied", passed);
  }

  if (current.length > 0) {
    return summarize("failed", current);
  }

  return attestations.length > 0
    ? summarize("stale", attestations)
    : { state: "missing", evidenceIds: [], commands: [] };
}

/**
 * Whether an attested command verifies the repository.
 *
 * Deliberately a closed vocabulary of runners and script names: `gleip run` wraps any command, and
 * treating every wrapped command as verification would let `gleip run -- ls` clear the gate.
 */
export function isVerificationCommand(payload: CommandAttestationPayload): boolean {
  const executable = normalizeExecutableName(payload.executable);
  const argumentText = payload.arguments.join(" ").toLowerCase();

  // Runners that verify by virtue of being invoked at all.
  if (
    /^(?:vitest|jest|mocha|ava|pytest|tox|nox|rspec|phpunit|eslint|ruff|tsc|mypy|flake8|pylint|golangci-lint|clippy-driver)$/u.test(
      executable
    )
  ) {
    return true;
  }

  // Toolchains where a subcommand decides.
  if (/^(?:go|cargo|dotnet|mvn|gradle|swift|bun|deno|make|just|task)$/u.test(executable)) {
    return /\b(?:test|check|vet|lint|build|verify|clippy|typecheck)\b/u.test(argumentText);
  }

  // Package managers and script runners: the script name decides.
  if (/^(?:npm|pnpm|yarn|npx|pnpx|bunx)$/u.test(executable)) {
    return /\b(?:test|tests|lint|typecheck|type-check|tsc|build|check|checks|verify|smoke|coverage|e2e|ci)\b/u.test(
      argumentText
    );
  }

  if (executable === "python" || executable === "python3") {
    return /\b(?:pytest|unittest|-m\s+tox)\b/u.test(argumentText);
  }

  return false;
}

/** Strip a directory prefix, a Windows `.cmd`/`.exe` shim suffix, and case. */
function normalizeExecutableName(executable: string): string {
  const base = executable.replace(/\\/gu, "/").split("/").pop() ?? executable;

  return base.toLowerCase().replace(/\.(?:cmd|bat|exe|ps1)$/u, "");
}

function describeCommand(payload: CommandAttestationPayload): string {
  return [normalizeExecutableName(payload.executable), ...payload.arguments].join(" ").trim();
}

export function createFinalEvidenceBundle(
  input: CreateFinalEvidenceBundleInput
): FinalEvidenceBundle {
  const currentEvidence = input.evidenceItems.map((item) =>
    evidenceAtRepositoryState(
      item,
      input.repository.fingerprint,
      input.taskAuthority.revision,
      input.createdAt
    )
  );
  const approvals = input.approvals.map((approval) =>
    approvalAtRepositoryState(
      approval,
      input.repository.fingerprint,
      input.taskAuthority.revision,
      input.createdAt
    )
  );
  const grouped = emptyEvidenceGroups();

  for (const item of currentEvidence) {
    grouped[item.evidenceClass].push(item.id);
  }

  const commandEvidence = currentEvidence.filter(
    (item): item is EvidenceItem & { payload: CommandAttestationPayload } =>
      item.evidenceClass === "command_attestation"
  );
  const requiredCommands = input.requiredCommands.map((required) => {
    const matching = [...commandEvidence]
      .reverse()
      .find((item) => commandMatches(item.payload, required));

    if (matching === undefined) {
      return {
        id: required.id,
        description: required.description,
        state: "missing" as const
      };
    }

    if (matching.staleness.state === "stale") {
      return {
        id: required.id,
        description: required.description,
        satisfiedBy: matching.id,
        state: "stale" as const
      };
    }

    if (matching.payload.exitCode !== 0) {
      return {
        id: required.id,
        description: required.description,
        satisfiedBy: matching.id,
        state: "failed" as const
      };
    }

    return {
      id: required.id,
      description: required.description,
      satisfiedBy: matching.id,
      state: "satisfied" as const
    };
  });
  const activeApprovals = approvals.filter((approval) => approval.state === "active");
  const hazards = input.hazards.map((hazard) => {
    if (!hazard.approvalRequired || hazard.approvedBy !== undefined) {
      return hazard;
    }

    const matching = activeApprovals.find(
      (approval) => approval.findingIds.includes(hazard.id) || approval.scope === hazard.code
    );

    return matching === undefined ? hazard : { ...hazard, approvedBy: matching.id };
  });
  const unresolvedHazards = hazards.filter(
    (hazard) => hazard.blocking && (!hazard.approvalRequired || hazard.approvedBy === undefined)
  );
  const staleEvidence = currentEvidence
    .filter((item) => item.staleness.state === "stale")
    .map((item) => item.id);
  const missingEvidence: string[] = [];

  if (!input.taskAuthority.present) {
    missingEvidence.push("canonical_task_authority");
  }

  for (const required of requiredCommands) {
    if (required.state !== "satisfied") {
      missingEvidence.push(`required_command:${required.id}:${required.state}`);
    }
  }

  const completionStatus: FinalEvidenceBundle["completionStatus"] =
    unresolvedHazards.length > 0
      ? "blocked_completion"
      : missingEvidence.length > 0
        ? "incomplete"
        : "complete";
  const base = {
    schemaVersion: "1.0.0" as const,
    artifactVersion: 1 as const,
    runId: input.runId,
    createdAt: input.createdAt,
    taskAuthority: input.taskAuthority,
    repository: input.repository,
    evidence: grouped,
    approvals: activeApprovals.map((approval) => approval.id),
    unresolvedHazards,
    staleEvidence,
    missingEvidence,
    requiredCommands,
    completionStatus
  };
  const id = `bundle-${sha256Digest(canonicalJson(base)).slice(7, 31)}`;
  const withoutDigest = { ...base, id };

  return {
    ...withoutDigest,
    integrityDigest: sha256Digest(canonicalJson(withoutDigest))
  };
}

export function environmentFingerprint(environment: NodeJS.ProcessEnv = process.env): string {
  return sha256Digest(
    canonicalJson({
      node: process.versions.node,
      platform: process.platform,
      architecture: process.arch,
      environmentKeys: Object.keys(environment).sort()
    })
  );
}

function emptyEvidenceGroups(): Record<EvidenceClass, string[]> {
  return {
    observed_fact: [],
    agent_claim: [],
    command_attestation: [],
    policy_inference: [],
    human_approval: [],
    external_attestation: []
  };
}

function commandMatches(payload: CommandAttestationPayload, required: RequiredCommand): boolean {
  if (required.executable !== undefined && payload.executable !== required.executable) {
    return false;
  }

  return (required.argumentIncludes ?? []).every((argument) =>
    payload.arguments.includes(argument)
  );
}

function normalizeForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForCanonicalJson(entry));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeForCanonicalJson(entry)])
    );
  }

  return value;
}

function withoutKeys<T extends object, K extends keyof T>(value: T, keys: K[]): Omit<T, K> {
  const excluded = new Set<PropertyKey>(keys);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.has(key))) as Omit<
    T,
    K
  >;
}
