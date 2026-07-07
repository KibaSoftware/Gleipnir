import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

export const packageName = "@gleip/core";

export type { FindingCode, FindingSeverity } from "../findings.js";

export interface CollectWorkingTreeDiffOptions {
  cwd: string;
  base?: string;
}

export interface GitFileStat {
  path: string;
  added: number;
  deleted: number;
  isDeleted?: boolean;
  isUntracked?: boolean;
  diffFingerprint?: string;
}

export interface GitDiffContext {
  changedFiles: string[];
  fileStats: GitFileStat[];
  rawDiff: string;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  isGitRepo: boolean;
  hasChanges: boolean;
  head?: string;
  stagedFingerprint?: string;
  unstagedFingerprint?: string;
  trackedLocalArtifacts?: string[];
  error?: string;
}

export interface SessionBaseline {
  createdAt: string;
  changedFiles: string[];
  fileStats: GitFileStat[];
  totalLinesAdded: number;
  totalLinesDeleted: number;
  diffFingerprint: string;
  note?: string;
}

export interface BaselineContext {
  hasBaseline: boolean;
  preExistingFilesIgnored: number;
  sessionFilesChanged: number;
  baselineCreatedAt?: string;
  includeBaseline: boolean;
  possiblyPreExistingFiles: string[];
}

export interface BaselineFilteredDiff {
  diff: GitDiffContext;
  baseline: BaselineContext;
}

export const EPHEMERAL_GLEIP_ARTIFACTS = [
  ".gleip/state.json",
  ".gleip/session.json",
  ".gleip/baseline.json",
  ".gleip/canonical-task.json",
  ".gleip/brief.md",
  ".gleip/scope-budget.json",
  ".gleip/status.md",
  ".gleip/report.md",
  ".gleip/report.json",
  ".gleip/check-cache.json",
  ".gleip/context/index.json",
  ".gleip/context/stats.json"
] as const;

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function collectWorkingTreeDiff(options: CollectWorkingTreeDiffOptions): GitDiffContext {
  const repoCheck = runGit(options.cwd, ["rev-parse", "--is-inside-work-tree"]);

  if (!repoCheck.ok || repoCheck.stdout.trim() !== "true") {
    return emptyDiff(false, "Current directory is not a git repository.");
  }

  const headResult = runGit(options.cwd, ["rev-parse", "--verify", "HEAD"]);
  const hasHead = headResult.ok;
  const head = hasHead ? headResult.stdout.trim() : undefined;
  const diffContexts =
    options.base !== undefined
      ? [collectDiffForBase(options.cwd, options.base)]
      : hasHead
        ? [collectDiffForBase(options.cwd, "HEAD")]
        : [collectDiff(options.cwd, ["--cached", "--", "."]), collectDiff(options.cwd, ["--", "."])];

  const changedFiles = new Set<string>();
  const deletedFiles = new Set<string>();
  const statsByPath = new Map<string, { added: number; deleted: number }>();
  const rawDiffParts: string[] = [];

  for (const diffContext of diffContexts) {
    if (!diffContext.ok) {
      return emptyDiff(true, diffContext.error);
    }

    for (const path of diffContext.changedFiles) {
      changedFiles.add(path);
    }

    for (const path of diffContext.deletedFiles) {
      deletedFiles.add(path);
    }

    for (const stat of diffContext.fileStats) {
      const current = statsByPath.get(stat.path) ?? { added: 0, deleted: 0 };
      statsByPath.set(stat.path, {
        added: current.added + stat.added,
        deleted: current.deleted + stat.deleted
      });
    }

    if (diffContext.rawDiff.length > 0) {
      rawDiffParts.push(diffContext.rawDiff);
    }
  }

  for (const untrackedFile of listUntrackedFiles(options.cwd)) {
    changedFiles.add(untrackedFile);

    if (!statsByPath.has(untrackedFile)) {
      statsByPath.set(untrackedFile, { added: countTextFileLines(options.cwd, untrackedFile), deleted: 0 });
    }
  }

  const sortedChangedFiles = Array.from(changedFiles)
    .filter((path) => !isEphemeralGleipArtifactPath(path))
    .sort();
  const rawDiff = rawDiffParts.join("\n");
  const fingerprintByPath = fingerprintRawDiffSections(rawDiff);
  const untrackedFiles = new Set(listUntrackedFiles(options.cwd));
  const fileStats = sortedChangedFiles.map((path) => {
    const stat = statsByPath.get(path) ?? { added: 0, deleted: 0 };
    const baseStat = {
      path,
      added: stat.added,
      deleted: stat.deleted,
      diffFingerprint: fingerprintByPath.get(path) ?? fingerprintUntrackedFile(options.cwd, path)
    };

    if (deletedFiles.has(path)) {
      return { ...baseStat, isDeleted: true };
    }

    if (untrackedFiles.has(path)) {
      return { ...baseStat, isUntracked: true };
    }

    return baseStat;
  });
  const totalLinesAdded = fileStats.reduce((total, stat) => total + stat.added, 0);
  const totalLinesDeleted = fileStats.reduce((total, stat) => total + stat.deleted, 0);
  const filteredRawDiff = filterRawDiffSections(rawDiff, sortedChangedFiles);
  const trackedLocalArtifacts = listTrackedLocalArtifacts(options.cwd);
  const stagedDiff = runGit(options.cwd, ["diff", "--no-ext-diff", "--cached", "--", "."]);
  const unstagedDiff = runGit(options.cwd, ["diff", "--no-ext-diff", "--", "."]);

  return {
    changedFiles: sortedChangedFiles,
    fileStats,
    rawDiff: filteredRawDiff,
    totalLinesAdded,
    totalLinesDeleted,
    isGitRepo: true,
    hasChanges: sortedChangedFiles.length > 0,
    ...(head === undefined ? {} : { head }),
    ...(stagedDiff.ok
      ? { stagedFingerprint: hashText(stagedDiff.stdout.replace(/\r\n/gu, "\n")) }
      : {}),
    ...(unstagedDiff.ok
      ? { unstagedFingerprint: hashText(unstagedDiff.stdout.replace(/\r\n/gu, "\n")) }
      : {}),
    trackedLocalArtifacts
  };
}

export function fingerprintRepositoryState(diff: GitDiffContext): string {
  return hashText(
    JSON.stringify({
      head: diff.head ?? null,
      stagedFingerprint: diff.stagedFingerprint ?? null,
      unstagedFingerprint: diff.unstagedFingerprint ?? null,
      isGitRepo: diff.isGitRepo,
      changedFiles: diff.changedFiles.map(normalizePath).sort(),
      fileStats: diff.fileStats
        .map((stat) => ({
          path: normalizePath(stat.path),
          added: stat.added,
          deleted: stat.deleted,
          isDeleted: stat.isDeleted === true,
          isUntracked: stat.isUntracked === true,
          diffFingerprint: stat.diffFingerprint ?? null
        }))
        .sort((left, right) => left.path.localeCompare(right.path)),
      rawDiffFingerprint: hashText(diff.rawDiff.replace(/\r\n/gu, "\n")),
      trackedLocalArtifacts: (diff.trackedLocalArtifacts ?? []).map(normalizePath).sort(),
      error: diff.error ?? null
    })
  );
}

export function createSessionBaseline(diff: GitDiffContext, createdAt: string): SessionBaseline {
  const base = {
    createdAt,
    changedFiles: [...diff.changedFiles].sort(),
    fileStats: diff.fileStats.map((stat) => ({ ...stat })),
    totalLinesAdded: diff.totalLinesAdded,
    totalLinesDeleted: diff.totalLinesDeleted,
    diffFingerprint: fingerprintDiff(diff)
  };

  if (diff.changedFiles.length === 0) {
    return base;
  }

  return {
    ...base,
    note:
      "Pre-existing working-tree changes were detected before this Gleip session. npx --no-install gleip status will focus on changes introduced after preflight."
  };
}

export function filterDiffSinceBaseline(
  currentDiff: GitDiffContext,
  baseline: SessionBaseline | undefined,
  options: { includeBaseline?: boolean } = {}
): BaselineFilteredDiff {
  if (baseline === undefined || options.includeBaseline === true) {
    return {
      diff: currentDiff,
      baseline: {
        hasBaseline: baseline !== undefined,
        preExistingFilesIgnored: 0,
        sessionFilesChanged: currentDiff.changedFiles.length,
        ...(baseline === undefined ? {} : { baselineCreatedAt: baseline.createdAt }),
        includeBaseline: options.includeBaseline === true,
        possiblyPreExistingFiles: []
      }
    };
  }

  const baselineStats = new Map(baseline.fileStats.map((stat) => [stat.path, stat]));
  const sessionStats: GitFileStat[] = [];
  const ignoredFiles: string[] = [];
  const possiblyPreExistingFiles: string[] = [];

  for (const stat of currentDiff.fileStats) {
    const baselineStat = baselineStats.get(stat.path);

    if (baselineStat === undefined) {
      sessionStats.push(stat);
      continue;
    }

    if (hasFileChangedSinceBaseline(stat, baselineStat)) {
      sessionStats.push(stat);
      possiblyPreExistingFiles.push(stat.path);
    } else {
      ignoredFiles.push(stat.path);
    }
  }

  const changedFiles = sessionStats.map((stat) => stat.path).sort();

  return {
    diff: {
      ...currentDiff,
      changedFiles,
      fileStats: sessionStats,
      rawDiff: filterRawDiffSections(currentDiff.rawDiff, changedFiles),
      totalLinesAdded: sessionStats.reduce((total, stat) => total + stat.added, 0),
      totalLinesDeleted: sessionStats.reduce((total, stat) => total + stat.deleted, 0),
      hasChanges: changedFiles.length > 0
    },
    baseline: {
      hasBaseline: true,
      preExistingFilesIgnored: ignoredFiles.length,
      sessionFilesChanged: changedFiles.length,
      baselineCreatedAt: baseline.createdAt,
      includeBaseline: false,
      possiblyPreExistingFiles
    }
  };
}

function hasFileChangedSinceBaseline(current: GitFileStat, baseline: GitFileStat): boolean {
  return (
    current.added !== baseline.added ||
    current.deleted !== baseline.deleted ||
    current.isDeleted !== baseline.isDeleted ||
    current.isUntracked !== baseline.isUntracked ||
    current.diffFingerprint !== baseline.diffFingerprint
  );
}

function fingerprintDiff(diff: GitDiffContext): string {
  return hashText(
    JSON.stringify({
      changedFiles: diff.changedFiles,
      fileStats: diff.fileStats.map((stat) => ({
        path: stat.path,
        added: stat.added,
        deleted: stat.deleted,
        isDeleted: stat.isDeleted === true,
        isUntracked: stat.isUntracked === true,
        diffFingerprint: stat.diffFingerprint
      }))
    })
  );
}

function collectDiffForBase(cwd: string, base: string): InternalDiffContext {
  return collectDiff(cwd, ["--no-ext-diff", base, "--", "."]);
}

interface InternalDiffContext {
  ok: boolean;
  changedFiles: string[];
  deletedFiles: Set<string>;
  fileStats: GitFileStat[];
  rawDiff: string;
  error?: string;
}

function collectDiff(cwd: string, diffCommand: string[]): InternalDiffContext {
  const nameOnly = runGit(cwd, ["diff", "--name-only", ...diffCommand]);
  const numstat = runGit(cwd, ["diff", "--numstat", ...diffCommand]);
  const nameStatus = runGit(cwd, ["diff", "--name-status", ...diffCommand]);
  const rawDiff = runGit(cwd, ["diff", ...diffCommand]);

  if (!nameOnly.ok || !numstat.ok || !nameStatus.ok || !rawDiff.ok) {
    return {
      ok: false,
      changedFiles: [],
      deletedFiles: new Set(),
      fileStats: [],
      rawDiff: "",
      error: nameOnly.stderr || numstat.stderr || nameStatus.stderr || rawDiff.stderr || "Git diff failed."
    };
  }

  return {
    ok: true,
    changedFiles: parseLines(nameOnly.stdout),
    deletedFiles: parseDeletedFiles(nameStatus.stdout),
    fileStats: parseNumstat(numstat.stdout),
    rawDiff: rawDiff.stdout
  };
}

function runGit(cwd: string, args: string[]): GitResult {
  try {
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      shell: false
    });

    return {
      ok: result.status === 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    };
  } catch (error) {
    return {
      ok: false,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => normalizePath(line.trim()))
    .filter((line) => line.length > 0);
}

function parseDeletedFiles(value: string): Set<string> {
  const deleted = new Set<string>();

  for (const line of value.split(/\r?\n/)) {
    const [status, ...pathParts] = line.split(/\t/);

    if (status === "D" && pathParts.length > 0) {
      deleted.add(normalizePath(pathParts.join("\t")));
    }
  }

  return deleted;
}

function parseNumstat(value: string): GitFileStat[] {
  const stats: GitFileStat[] = [];

  for (const line of value.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }

    const [addedRaw, deletedRaw, ...pathParts] = line.split(/\t/);
    const path = normalizePath(pathParts.join("\t"));

    if (path.length === 0) {
      continue;
    }

    stats.push({
      path,
      added: parseGitLineCount(addedRaw),
      deleted: parseGitLineCount(deletedRaw)
    });
  }

  return stats;
}

function parseGitLineCount(value: string | undefined): number {
  if (value === undefined || value === "-") {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function listUntrackedFiles(cwd: string): string[] {
  const result = runGit(cwd, ["ls-files", "--others", "--exclude-standard"]);

  if (!result.ok) {
    return [];
  }

  return parseLines(result.stdout).filter((path) => !isEphemeralGleipArtifactPath(path));
}

function listTrackedLocalArtifacts(cwd: string): string[] {
  const result = runGit(cwd, ["ls-files", "--", ".gleip"]);

  return result.ok
    ? parseLines(result.stdout).filter(
        (path) => isEphemeralGleipArtifactPath(path) && existsSync(join(cwd, path))
      )
    : [];
}

function countTextFileLines(cwd: string, relativePath: string): number {
  const absolutePath = join(cwd, relativePath);

  try {
    if (!existsSync(absolutePath) || statSync(absolutePath).size > 200_000) {
      return 0;
    }

    return readFileSync(absolutePath, "utf8").split(/\r?\n/).filter((line) => line.length > 0).length;
  } catch {
    return 0;
  }
}

function fingerprintRawDiffSections(rawDiff: string): Map<string, string> {
  const sections = rawDiffSections(rawDiff);
  const fingerprints = new Map<string, string>();

  for (const section of sections) {
    fingerprints.set(section.path, hashText(canonicalRawDiffSection(section.content)));
  }

  return fingerprints;
}

function canonicalRawDiffSection(content: string): string {
  return content.replace(/\n+$/u, "");
}

function filterRawDiffSections(rawDiff: string, includedPaths: string[]): string {
  const included = new Set(includedPaths);

  return rawDiffSections(rawDiff)
    .filter((section) => included.has(section.path))
    .map((section) => section.content)
    .join("\n");
}

function rawDiffSections(rawDiff: string): Array<{ path: string; content: string }> {
  const sections: Array<{ path: string; content: string }> = [];
  const lines = rawDiff.split(/\r?\n/);
  let currentPath: string | undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (currentPath !== undefined) {
        sections.push({ path: currentPath, content: currentLines.join("\n") });
      }

      currentPath = parseDiffGitPath(line);
      currentLines = [line];
      continue;
    }

    if (currentPath !== undefined) {
      currentLines.push(line);
    }
  }

  if (currentPath !== undefined) {
    sections.push({ path: currentPath, content: currentLines.join("\n") });
  }

  return sections;
}

function parseDiffGitPath(line: string): string {
  const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);

  if (match?.[2] !== undefined) {
    return normalizePath(match[2]);
  }

  return normalizePath(line.replace("diff --git ", ""));
}

function fingerprintUntrackedFile(cwd: string, relativePath: string): string {
  const absolutePath = join(cwd, relativePath);

  try {
    if (!existsSync(absolutePath) || statSync(absolutePath).size > 200_000) {
      return hashText(relativePath);
    }

    return hashText(readFileSync(absolutePath, "utf8"));
  } catch {
    return hashText(relativePath);
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function isEphemeralGleipArtifactPath(path: string): boolean {
  const normalized = normalizePath(path);

  return (
    EPHEMERAL_GLEIP_ARTIFACTS.includes(
      normalized as (typeof EPHEMERAL_GLEIP_ARTIFACTS)[number]
    ) ||
    /^\.gleip\/session-[^/]+\.json$/u.test(normalized) ||
    /^\.gleip\/context(?:\/|$)/u.test(normalized)
  );
}

function emptyDiff(isGitRepo: boolean, error?: string): GitDiffContext {
  const base = {
    changedFiles: [],
    fileStats: [],
    rawDiff: "",
    totalLinesAdded: 0,
    totalLinesDeleted: 0,
    isGitRepo,
    hasChanges: false,
    trackedLocalArtifacts: []
  };

  return error === undefined ? base : { ...base, error };
}

export const COMPRESSION_SCHEMA_VERSION = "1.0.0";
export const COMPRESSION_COMPRESSOR_VERSION = "0.9.0";

export type CompressionAuthority = "canonical" | "derived" | "evidence" | "historical";
export type CompressionLifecycle = "active" | "superseded" | "stale" | "archived";
export type CompressionConfidence = "low" | "medium" | "high";
export type CompressionScopeClassification =
  | "direct"
  | "derived"
  | "adjacent"
  | "unexplained"
  | "output"
  | "protected";
export type CompressionContentClass =
  | "test_output"
  | "build_output"
  | "log_output"
  | "structured_json"
  | "search_results"
  | "file_listing"
  | "command_output"
  | "git_diff"
  | "prose"
  | "source_code"
  | "configuration"
  | "policy_or_instruction"
  | "canonical_task"
  | "task_amendment"
  | "requirement_ledger"
  | "active_brief"
  | "accepted_plan"
  | "scope_state"
  | "approval_state"
  | "completion_state"
  | "sensitive"
  | "unknown";

export type CompressionPassthroughReason =
  | "compression_disabled"
  | "audit_only"
  | "protected_authority_passthrough"
  | "protected_scope_passthrough"
  | "protected_content_class"
  | "sensitive_content"
  | "unsupported_content_class"
  | "below_minimum_size"
  | "below_minimum_savings"
  | "low_classification_confidence"
  | "already_compressed"
  | "storage_failed"
  | "validation_failed"
  | "compression_failed";

export interface CompressionInput {
  rawContent: string;
  contentType?: CompressionContentClass;
  artifactType?: string;
  authority?: CompressionAuthority;
  lifecycle?: CompressionLifecycle;
  sourceCommand?: string;
  semanticSubtype?: string;
  sessionId?: string;
  repositoryFingerprint?: string;
  filePath?: string;
  scopeClassification?: CompressionScopeClassification;
  classificationConfidence?: CompressionConfidence;
  sensitivityFlags?: string[];
  protectedAuthority?: boolean;
  createdAt?: string;
}

export interface CompressionPolicy {
  enabled: boolean;
  auditOnly: boolean;
  minInputBytes: number;
  minEstimatedTokensSaved: number;
  minConfidence: CompressionConfidence;
  allowedClasses: CompressionContentClass[];
  envelopeFormat: "human" | "json";
}

export interface CompressionClassification {
  contentClass: CompressionContentClass;
  confidence: CompressionConfidence;
  reasonCodes: string[];
  authority: CompressionAuthority;
  lifecycle: CompressionLifecycle;
  protectedAuthority: boolean;
  sensitive: boolean;
  alreadyCompressed: boolean;
}

export interface CompressionEnvelope {
  schemaVersion: typeof COMPRESSION_SCHEMA_VERSION;
  kind: "gleip.context.compressed";
  compressorVersion: typeof COMPRESSION_COMPRESSOR_VERSION;
  reference: string;
  contentClass: CompressionContentClass;
  authority: CompressionAuthority;
  lifecycle: CompressionLifecycle;
  originalBytes: number;
  originalLines: number;
  estimatedOriginalTokens: number;
  compressedBytes: number;
  estimatedCompressedTokens: number;
  summary: string[];
  preservedEvidence: string[];
  retrieveCommand: string;
}

export interface CompressionResult {
  compressed: boolean;
  auditOnly: boolean;
  output: string;
  originalContent: string;
  classification: CompressionClassification;
  passthroughReasons: CompressionPassthroughReason[];
  reference?: string;
  envelope?: CompressionEnvelope;
  metrics: {
    originalBytes: number;
    compressedBytes: number;
    estimatedOriginalTokens: number;
    estimatedCompressedTokens: number;
    grossEstimatedTokensRemoved: number;
    compressionMetadataTokens: number;
    netEstimatedTokensSaved: number;
    storageDedupHit: boolean;
    latencyMs: number;
  };
}

export interface RetrieveOriginalResult {
  ok: boolean;
  reference: string;
  content?: string;
  byteCount?: number;
  error?: string;
}

export interface CompressionStats {
  schemaVersion: typeof COMPRESSION_SCHEMA_VERSION;
  compressorVersion: typeof COMPRESSION_COMPRESSOR_VERSION;
  objectCount: number;
  compressionAttempts: number;
  compressionApplied: number;
  passthroughCount: number;
  retrievalCalls: number;
  retrievalBytes: number;
  retrievalEstimatedTokens: number;
  storageDedupHits: number;
  compressorFailures: number;
  validationFailures: number;
  classificationByType: Partial<Record<CompressionContentClass, number>>;
  originalBytes: number;
  compressedBytes: number;
  estimatedOriginalTokens: number;
  estimatedCompressedTokens: number;
  grossEstimatedTokensRemoved: number;
  compressionMetadataTokens: number;
  repeatedContentSuppressed: number;
  netEstimatedTokensSaved: number;
}

interface CompressionStoreIndex {
  schemaVersion: typeof COMPRESSION_SCHEMA_VERSION;
  compressorVersion: typeof COMPRESSION_COMPRESSOR_VERSION;
  objects: Record<string, CompressionObjectRecord>;
  totals: {
    compressionAttempts: number;
    compressionApplied: number;
    passthroughCount: number;
    storageDedupHits: number;
    compressorFailures: number;
    validationFailures: number;
    repeatedContentSuppressed: number;
  };
}

interface CompressionObjectRecord {
  hash: string;
  reference: string;
  createdAt: string;
  lastAccessedAt: string;
  contentClass: CompressionContentClass;
  authority: CompressionAuthority;
  lifecycle: CompressionLifecycle;
  artifactType?: string;
  sourceCommand?: string;
  sessionId?: string;
  repositoryFingerprint?: string;
  originalBytes: number;
  originalLines: number;
  estimatedOriginalTokens: number;
  compressedBytes: number;
  estimatedCompressedTokens: number;
  compressionCount: number;
  retrievalCalls: number;
  retrievalBytes: number;
  retrievalEstimatedTokens: number;
  storageDedupHits: number;
}

interface CompressorOutput {
  summary: string[];
  preservedEvidence: string[];
}

const supportedCompressionClasses = new Set<CompressionContentClass>([
  "test_output",
  "build_output",
  "log_output",
  "structured_json",
  "search_results",
  "file_listing",
  "command_output",
  "git_diff"
]);

const protectedCompressionClasses = new Set<CompressionContentClass>([
  "source_code",
  "configuration",
  "policy_or_instruction",
  "canonical_task",
  "task_amendment",
  "requirement_ledger",
  "active_brief",
  "accepted_plan",
  "scope_state",
  "approval_state",
  "completion_state",
  "sensitive"
]);

const protectedArtifactTypes = new Set([
  "canonical_task",
  "original_user_task_revision",
  "task_revision",
  "task_amendment",
  "effective_task",
  "requirement_ledger",
  "requirement_source_excerpt",
  "active_brief",
  "brief_coverage",
  "accepted_plan",
  "scope_state",
  "scope_budget",
  "approval_state",
  "policy_or_instruction",
  "safety_constraint",
  "completion_state",
  "unresolved_findings",
  "verification_status",
  "migration_obligation"
]);

export function defaultCompressionPolicy(
  overrides: Partial<CompressionPolicy> = {}
): CompressionPolicy {
  return {
    enabled: true,
    auditOnly: false,
    minInputBytes: 900,
    minEstimatedTokensSaved: 80,
    minConfidence: "medium",
    allowedClasses: [...supportedCompressionClasses],
    envelopeFormat: "human",
    ...overrides
  };
}

export function classifyCompressionInput(input: CompressionInput): CompressionClassification {
  const reasonCodes: string[] = [];
  const artifactType = normalizeArtifactType(input.artifactType);
  const authority = input.authority ?? (artifactType === undefined ? "evidence" : authorityForArtifact(artifactType));
  const lifecycle = input.lifecycle ?? "active";
  const alreadyCompressed = isCompressedContextEnvelope(input.rawContent);
  const sensitivityFlags = [
    ...(input.sensitivityFlags ?? []),
    ...detectSensitivityFlags(input.rawContent)
  ];
  const structuralClass = classForArtifactType(artifactType);
  const protectedAuthority =
    input.protectedAuthority === true ||
    authority === "canonical" ||
    (structuralClass !== undefined &&
      protectedCompressionClasses.has(structuralClass) &&
      lifecycle === "active");

  if (structuralClass !== undefined) {
    reasonCodes.push(`artifact_type:${structuralClass}`);
    return {
      contentClass: sensitivityFlags.length > 0 ? "sensitive" : structuralClass,
      confidence: "high",
      reasonCodes: [
        ...reasonCodes,
        ...(protectedAuthority ? ["structural_authority_protected"] : [])
      ],
      authority,
      lifecycle,
      protectedAuthority,
      sensitive: sensitivityFlags.length > 0,
      alreadyCompressed
    };
  }

  if (input.contentType !== undefined) {
    reasonCodes.push(`caller_hint:${input.contentType}`);
    return {
      contentClass: sensitivityFlags.length > 0 ? "sensitive" : input.contentType,
      confidence: input.classificationConfidence ?? "high",
      reasonCodes,
      authority,
      lifecycle,
      protectedAuthority,
      sensitive: sensitivityFlags.length > 0,
      alreadyCompressed
    };
  }

  const command = input.sourceCommand?.toLowerCase() ?? "";
  const path = normalizePath(input.filePath ?? "").toLowerCase();
  const content = input.rawContent;
  const trimmed = content.trimStart();

  if (isPolicyOrInstructionPath(path) || isPolicyLikeContent(content)) {
    reasonCodes.push("policy_or_instruction_signature");
    return classified("policy_or_instruction", "high");
  }

  if (isConfigurationPath(path)) {
    reasonCodes.push("configuration_path");
    return classified("configuration", "high");
  }

  if (isSourcePath(path) || looksLikeSourceCode(content)) {
    reasonCodes.push(path.length > 0 ? "source_path" : "source_signature");
    return classified("source_code", path.length > 0 ? "high" : "medium");
  }

  if (trimmed.startsWith("diff --git ") || /^@@\s+-\d+/mu.test(content)) {
    reasonCodes.push("git_diff_signature");
    return classified("git_diff", "high");
  }

  if (isJsonContent(content)) {
    reasonCodes.push("json_parse_success");
    return classified("structured_json", "high");
  }

  if (/\b(vitest|jest|pytest|cargo test|go test|dotnet test|npm test|pnpm test|yarn test)\b/iu.test(command)) {
    reasonCodes.push("test_command");
    return classified("test_output", "high");
  }

  if (/\b(fail(?:ed|ing)?|test suite|tests?\s+(?:passed|failed)|assertion|expected|received)\b/iu.test(content)) {
    reasonCodes.push("test_output_signature");
    return classified("test_output", "medium");
  }

  if (/\b(tsc|eslint|build|compile|webpack|vite|rollup|tsup)\b/iu.test(command)) {
    reasonCodes.push("build_command");
    return classified("build_output", "high");
  }

  if (/\b(error|warning|warn)\b/iu.test(content) && content.split(/\r?\n/u).length > 8) {
    reasonCodes.push("log_warning_signature");
    return classified(command.includes("build") ? "build_output" : "log_output", "medium");
  }

  if (/\b(rg|grep|findstr|select-string)\b/iu.test(command) || looksLikeSearchResults(content)) {
    reasonCodes.push(command.length > 0 ? "search_command" : "search_result_signature");
    return classified("search_results", command.length > 0 ? "high" : "medium");
  }

  if (/\b(ls|dir|get-childitem|find)\b/iu.test(command) || looksLikeFileListing(content)) {
    reasonCodes.push(command.length > 0 ? "listing_command" : "file_listing_signature");
    return classified("file_listing", command.length > 0 ? "high" : "medium");
  }

  if (command.length > 0) {
    reasonCodes.push("command_origin");
    return classified("command_output", "medium");
  }

  if (content.length > 0 && content.split(/\r?\n/u).length > 4) {
    reasonCodes.push("prose_fallback");
    return classified("prose", "low");
  }

  reasonCodes.push("unknown_content");
  return classified("unknown", "low");

  function classified(
    contentClass: CompressionContentClass,
    confidence: CompressionConfidence
  ): CompressionClassification {
    return {
      contentClass: sensitivityFlags.length > 0 ? "sensitive" : contentClass,
      confidence,
      reasonCodes,
      authority,
      lifecycle,
      protectedAuthority,
      sensitive: sensitivityFlags.length > 0,
      alreadyCompressed
    };
  }
}

export function compressContext(
  input: CompressionInput,
  options: {
    cwd: string;
    now?: () => Date;
    policy?: Partial<CompressionPolicy>;
    auditOnly?: boolean;
  }
): CompressionResult {
  const startedAt = Date.now();
  const now = options.now ?? (() => new Date());
  const createdAt = input.createdAt ?? now().toISOString();
  const policy = defaultCompressionPolicy({
    ...options.policy,
    auditOnly: options.auditOnly === true || options.policy?.auditOnly === true
  });
  const classification = classifyCompressionInput(input);
  const originalBytes = byteCount(input.rawContent);
  const originalLines = lineCount(input.rawContent);
  const estimatedOriginalTokens = estimateCompressionTokens(input.rawContent);
  const baseMetrics = {
    originalBytes,
    compressedBytes: originalBytes,
    estimatedOriginalTokens,
    estimatedCompressedTokens: estimatedOriginalTokens,
    grossEstimatedTokensRemoved: 0,
    compressionMetadataTokens: 0,
    netEstimatedTokensSaved: 0,
    storageDedupHit: false,
    latencyMs: 0
  };
  const passthrough = eligiblePassthroughReasons(input, classification, policy, originalBytes);

  if (policy.auditOnly) {
    passthrough.push("audit_only");
  }

  if (passthrough.length > 0) {
    incrementCompressionStats(options.cwd, {
      attemptedClass: classification.contentClass,
      passthrough: true
    });

    return {
      compressed: false,
      auditOnly: policy.auditOnly,
      output: input.rawContent,
      originalContent: input.rawContent,
      classification,
      passthroughReasons: passthrough,
      metrics: { ...baseMetrics, latencyMs: Date.now() - startedAt }
    };
  }

  let compressedBody: CompressorOutput;

  try {
    compressedBody = compressByClass(input.rawContent, classification.contentClass);
  } catch {
    incrementCompressionStats(options.cwd, {
      attemptedClass: classification.contentClass,
      compressorFailure: true,
      passthrough: true
    });

    return {
      compressed: false,
      auditOnly: false,
      output: input.rawContent,
      originalContent: input.rawContent,
      classification,
      passthroughReasons: ["compression_failed"],
      metrics: { ...baseMetrics, latencyMs: Date.now() - startedAt }
    };
  }

  const summaryOnlyEnvelope = createEnvelope({
    reference: "sha256:pending",
    classification,
    originalBytes,
    originalLines,
    estimatedOriginalTokens,
    compressedBody
  });
  const metadataTokens = estimateCompressionTokens(renderEnvelope(summaryOnlyEnvelope, policy));
  const candidateBytes = byteCount(renderEnvelope(summaryOnlyEnvelope, policy));
  const estimatedCandidateTokens = estimateCompressionTokens(renderEnvelope(summaryOnlyEnvelope, policy));
  const grossEstimatedTokensRemoved = Math.max(0, estimatedOriginalTokens - estimatedCandidateTokens);

  if (grossEstimatedTokensRemoved - metadataTokens < policy.minEstimatedTokensSaved) {
    incrementCompressionStats(options.cwd, {
      attemptedClass: classification.contentClass,
      passthrough: true
    });

    return {
      compressed: false,
      auditOnly: false,
      output: input.rawContent,
      originalContent: input.rawContent,
      classification,
      passthroughReasons: ["below_minimum_savings"],
      metrics: {
        ...baseMetrics,
        compressedBytes: candidateBytes,
        estimatedCompressedTokens: estimatedCandidateTokens,
        grossEstimatedTokensRemoved,
        compressionMetadataTokens: metadataTokens,
        netEstimatedTokensSaved: Math.max(0, grossEstimatedTokensRemoved - metadataTokens),
        latencyMs: Date.now() - startedAt
      }
    };
  }

  const stored = storeCompressionOriginal(options.cwd, input.rawContent, {
    classification,
    ...(input.artifactType === undefined ? {} : { artifactType: input.artifactType }),
    ...(input.sourceCommand === undefined ? {} : { sourceCommand: input.sourceCommand }),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    ...(input.repositoryFingerprint === undefined
      ? {}
      : { repositoryFingerprint: input.repositoryFingerprint }),
    createdAt,
    compressedBytes: candidateBytes,
    estimatedCompressedTokens: estimatedCandidateTokens
  });

  if (!stored.ok) {
    incrementCompressionStats(options.cwd, {
      attemptedClass: classification.contentClass,
      passthrough: true
    });

    return {
      compressed: false,
      auditOnly: false,
      output: input.rawContent,
      originalContent: input.rawContent,
      classification,
      passthroughReasons: ["storage_failed"],
      metrics: { ...baseMetrics, latencyMs: Date.now() - startedAt }
    };
  }

  const envelope = createEnvelope({
    reference: stored.reference,
    classification,
    originalBytes,
    originalLines,
    estimatedOriginalTokens,
    compressedBody
  });
  const output = renderEnvelope(envelope, policy);
  const validation = validateCompressionEnvelope(options.cwd, envelope, input.rawContent, output);

  if (!validation) {
    incrementCompressionStats(options.cwd, {
      attemptedClass: classification.contentClass,
      validationFailure: true,
      passthrough: true
    });

    return {
      compressed: false,
      auditOnly: false,
      output: input.rawContent,
      originalContent: input.rawContent,
      classification,
      passthroughReasons: ["validation_failed"],
      metrics: { ...baseMetrics, latencyMs: Date.now() - startedAt }
    };
  }

  const compressedBytes = byteCount(output);
  const estimatedCompressedTokens = estimateCompressionTokens(output);
  const finalGrossTokensRemoved = Math.max(0, estimatedOriginalTokens - estimatedCompressedTokens);
  const finalMetadataTokens = estimateCompressionTokens(JSON.stringify(envelope));
  const netEstimatedTokensSaved = Math.max(0, finalGrossTokensRemoved - finalMetadataTokens);

  updateStoredCompressionMetrics(options.cwd, stored.hash, {
    compressedBytes,
    estimatedCompressedTokens,
    dedupHit: stored.dedupHit
  });

  return {
    compressed: true,
    auditOnly: false,
    output,
    originalContent: input.rawContent,
    classification,
    passthroughReasons: [],
    reference: stored.reference,
    envelope,
    metrics: {
      originalBytes,
      compressedBytes,
      estimatedOriginalTokens,
      estimatedCompressedTokens,
      grossEstimatedTokensRemoved: finalGrossTokensRemoved,
      compressionMetadataTokens: finalMetadataTokens,
      netEstimatedTokensSaved,
      storageDedupHit: stored.dedupHit,
      latencyMs: Date.now() - startedAt
    }
  };
}

export function retrieveContextOriginal(options: {
  cwd: string;
  reference: string;
  now?: () => Date;
}): RetrieveOriginalResult {
  const index = readCompressionIndex(options.cwd);
  const resolvedReference = resolveCompressionReference(index, options.reference);

  if (resolvedReference.error !== undefined) {
    return {
      ok: false,
      reference: options.reference,
      error: resolvedReference.error
    };
  }

  const hash = resolvedReference.hash;
  const record = index.objects[hash];

  if (record === undefined) {
    return {
      ok: false,
      reference: `sha256:${hash}`,
      error: "Compression object is not indexed."
    };
  }

  const objectPath = compressionObjectPath(options.cwd, hash);

  try {
    if (!isSafeStorePath(options.cwd, objectPath) || lstatSync(objectPath).isSymbolicLink()) {
      return {
        ok: false,
        reference: `sha256:${hash}`,
        error: "Compression object path is unsafe."
      };
    }

    const content = readFileSync(objectPath, "utf8");
    const actualHash = hashText(content);

    if (actualHash !== hash) {
      return {
        ok: false,
        reference: `sha256:${hash}`,
        error: "Compression object hash does not match its reference."
      };
    }

    record.lastAccessedAt = (options.now ?? (() => new Date()))().toISOString();
    record.retrievalCalls += 1;
    record.retrievalBytes += byteCount(content);
    record.retrievalEstimatedTokens += estimateCompressionTokens(content);
    writeCompressionIndex(options.cwd, index);

    return {
      ok: true,
      reference: `sha256:${hash}`,
      content,
      byteCount: byteCount(content)
    };
  } catch (error) {
    return {
      ok: false,
      reference: `sha256:${hash}`,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function readCompressionStats(cwd: string): CompressionStats {
  const index = readCompressionIndex(cwd);
  const records = Object.values(index.objects);
  const classificationByType: Partial<Record<CompressionContentClass, number>> = {};

  for (const record of records) {
    classificationByType[record.contentClass] =
      (classificationByType[record.contentClass] ?? 0) + record.compressionCount;
  }

  const originalBytes = records.reduce((total, record) => total + record.originalBytes, 0);
  const compressedBytes = records.reduce((total, record) => total + record.compressedBytes, 0);
  const estimatedOriginalTokens = records.reduce(
    (total, record) => total + record.estimatedOriginalTokens,
    0
  );
  const estimatedCompressedTokens = records.reduce(
    (total, record) => total + record.estimatedCompressedTokens,
    0
  );
  const retrievalCalls = records.reduce((total, record) => total + record.retrievalCalls, 0);
  const retrievalBytes = records.reduce((total, record) => total + record.retrievalBytes, 0);
  const retrievalEstimatedTokens = records.reduce(
    (total, record) => total + record.retrievalEstimatedTokens,
    0
  );
  const compressionMetadataTokens = estimateCompressionTokens(JSON.stringify(index));
  const grossEstimatedTokensRemoved = Math.max(0, estimatedOriginalTokens - estimatedCompressedTokens);

  return {
    schemaVersion: COMPRESSION_SCHEMA_VERSION,
    compressorVersion: COMPRESSION_COMPRESSOR_VERSION,
    objectCount: records.length,
    compressionAttempts: index.totals.compressionAttempts,
    compressionApplied: index.totals.compressionApplied,
    passthroughCount: index.totals.passthroughCount,
    retrievalCalls,
    retrievalBytes,
    retrievalEstimatedTokens,
    storageDedupHits: index.totals.storageDedupHits,
    compressorFailures: index.totals.compressorFailures,
    validationFailures: index.totals.validationFailures,
    classificationByType,
    originalBytes,
    compressedBytes,
    estimatedOriginalTokens,
    estimatedCompressedTokens,
    grossEstimatedTokensRemoved,
    compressionMetadataTokens,
    repeatedContentSuppressed: index.totals.repeatedContentSuppressed,
    netEstimatedTokensSaved: Math.max(
      0,
      grossEstimatedTokensRemoved - compressionMetadataTokens - retrievalEstimatedTokens
    )
  };
}

export function cleanupCompressionStore(cwd: string): { removedObjects: number; preservedAuthorityState: boolean } {
  const contextDir = compressionStorePath(cwd);
  let removedObjects = 0;

  try {
    const objectsDir = join(contextDir, "objects");

    if (existsSync(objectsDir) && isSafeStorePath(cwd, objectsDir)) {
      for (const fileName of readdirSync(objectsDir)) {
        const objectPath = join(objectsDir, fileName);

        if (/^[0-9a-f]{64}$/u.test(fileName) && isSafeStorePath(cwd, objectPath)) {
          rmSync(objectPath, { force: true });
          removedObjects += 1;
        }
      }
    }

    if (existsSync(join(contextDir, "index.json"))) {
      writeCompressionIndex(cwd, emptyCompressionIndex());
    }
  } catch {
    return { removedObjects, preservedAuthorityState: authorityStateExists(cwd) };
  }

  return { removedObjects, preservedAuthorityState: authorityStateExists(cwd) };
}

function eligiblePassthroughReasons(
  input: CompressionInput,
  classification: CompressionClassification,
  policy: CompressionPolicy,
  originalBytes: number
): CompressionPassthroughReason[] {
  const reasons: CompressionPassthroughReason[] = [];

  if (!policy.enabled) {
    reasons.push("compression_disabled");
  }

  if (classification.protectedAuthority) {
    reasons.push("protected_authority_passthrough");
  }

  if (
    input.scopeClassification === "protected" ||
    input.scopeClassification === "unexplained"
  ) {
    reasons.push("protected_scope_passthrough");
  }

  if (classification.sensitive || classification.contentClass === "sensitive") {
    reasons.push("sensitive_content");
  }

  if (protectedCompressionClasses.has(classification.contentClass)) {
    reasons.push("protected_content_class");
  }

  if (!supportedCompressionClasses.has(classification.contentClass)) {
    reasons.push("unsupported_content_class");
  }

  if (!policy.allowedClasses.includes(classification.contentClass)) {
    reasons.push("unsupported_content_class");
  }

  if (originalBytes < policy.minInputBytes) {
    reasons.push("below_minimum_size");
  }

  if (confidenceRank(classification.confidence) < confidenceRank(policy.minConfidence)) {
    reasons.push("low_classification_confidence");
  }

  if (classification.alreadyCompressed) {
    reasons.push("already_compressed");
  }

  return [...new Set(reasons)];
}

function compressByClass(content: string, contentClass: CompressionContentClass): CompressorOutput {
  switch (contentClass) {
    case "test_output":
      return compressDiagnosticOutput(content, {
        label: "test output",
        importantPattern:
          /\b(fail(?:ed|ing)?|error|assert|expected|received|diff|stack|at\s+\S+|tests?\s+failed|test suite failed)\b/iu
      });
    case "build_output":
      return compressDiagnosticOutput(content, {
        label: "build output",
        importantPattern: /\b(error|warning|warn|failed|exception|diagnostic)\b/iu
      });
    case "log_output":
      return compressDiagnosticOutput(content, {
        label: "log output",
        importantPattern: /\b(error|warning|warn|failed|exception|critical)\b/iu
      });
    case "structured_json":
      return compressStructuredJson(content);
    case "search_results":
      return compressSearchResults(content);
    case "file_listing":
      return compressFileListing(content);
    case "git_diff":
      return compressGitDiff(content);
    case "command_output":
      return compressRepeatedLines(content, "command output");
    default:
      return {
        summary: ["Unsupported content class; exact original is available by reference."],
        preservedEvidence: []
      };
  }
}

function compressDiagnosticOutput(
  content: string,
  options: { label: string; importantPattern: RegExp }
): CompressorOutput {
  const lines = splitLines(content);
  const importantIndexes = new Set<number>();
  const repeated = countRepeatedLines(lines);

  lines.forEach((line, index) => {
    if (options.importantPattern.test(line) || /^\s*(FAIL|ERROR|WARN|FAILED)\b/u.test(line)) {
      for (let nearby = Math.max(0, index - 2); nearby <= Math.min(lines.length - 1, index + 3); nearby += 1) {
        importantIndexes.add(nearby);
      }
    }
  });

  const preserved =
    importantIndexes.size === 0
      ? [...lines.slice(0, 8), ...(lines.length > 12 ? ["..."] : []), ...lines.slice(-4)]
      : [...importantIndexes].sort((left, right) => left - right).map((index) => lines[index] ?? "");
  const failureCount = lines.filter((line) => /\b(fail(?:ed|ing)?|error|assertion)\b/iu.test(line)).length;
  const warningCount = lines.filter((line) => /\bwarn(?:ing)?\b/iu.test(line)).length;

  return {
    summary: [
      `Compressed ${options.label}: ${lines.length} line(s).`,
      `Preserved ${preserved.length} diagnostic/context line(s).`,
      `Detected ${failureCount} failure/error signal(s) and ${warningCount} warning signal(s).`,
      repeated === 0 ? "No repeated lines suppressed." : `Suppressed ${repeated} repeated line occurrence(s).`
    ],
    preservedEvidence: dedupePreservingOrder(preserved).slice(0, 80)
  };
}

function compressStructuredJson(content: string): CompressorOutput {
  const parsed = JSON.parse(content) as unknown;

  if (Array.isArray(parsed)) {
    const objectItems = parsed.filter(isRecord);
    const keyFrequency = new Map<string, number>();

    for (const item of objectItems) {
      for (const key of Object.keys(item)) {
        keyFrequency.set(key, (keyFrequency.get(key) ?? 0) + 1);
      }
    }

    const keys = [...keyFrequency.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, count]) => `${key} (${count})`);
    const outlierIndexes = objectItems
      .map((item, index) => ({ index, keyCount: Object.keys(item).length }))
      .filter((entry) => entry.keyCount !== (objectItems[0] === undefined ? 0 : Object.keys(objectItems[0]).length))
      .slice(0, 10)
      .map((entry) => String(entry.index));

    return {
      summary: [
        `Compressed JSON array: ${parsed.length} item(s).`,
        objectItems.length === parsed.length
          ? "All items are objects."
          : `${parsed.length - objectItems.length} non-object item(s) preserved only by retrieval.`,
        keys.length === 0 ? "No common object keys detected." : `Object key frequencies: ${keys.slice(0, 20).join(", ")}.`,
        outlierIndexes.length === 0 ? "No structural outliers detected." : `Structural outlier indexes: ${outlierIndexes.join(", ")}.`
      ],
      preservedEvidence: []
    };
  }

  if (isRecord(parsed)) {
    return {
      summary: [
        `Compressed JSON object with ${Object.keys(parsed).length} top-level key(s).`,
        `Top-level keys: ${Object.keys(parsed).sort().slice(0, 40).join(", ") || "none"}.`
      ],
      preservedEvidence: []
    };
  }

  return {
    summary: [`Compressed JSON ${typeof parsed} value.`],
    preservedEvidence: []
  };
}

function compressSearchResults(content: string): CompressorOutput {
  const lines = splitLines(content).filter((line) => line.trim().length > 0);
  const byPath = new Map<string, string[]>();

  for (const line of lines) {
    const path = normalizePath(line.split(/:(?=\d+:|[^\\])/u)[0] ?? "unknown");
    const group = byPath.get(path) ?? [];
    group.push(line);
    byPath.set(path, group);
  }

  const preserved = [...byPath.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([path, matches]) => [
      `${path}: ${matches.length} match(es)`,
      ...matches.slice(0, 3)
    ])
    .slice(0, 80);

  return {
    summary: [
      `Compressed search results: ${lines.length} line(s) across ${byPath.size} path group(s).`,
      `Preserved first matches for each path group; exact output is retrievable.`
    ],
    preservedEvidence: preserved
  };
}

function compressFileListing(content: string): CompressorOutput {
  const lines = splitLines(content).filter((line) => line.trim().length > 0);
  const byDirectory = new Map<string, number>();

  for (const line of lines) {
    const normalized = normalizePath(line.trim());
    const directory = normalized.includes("/") ? normalized.slice(0, normalized.indexOf("/")) : ".";
    byDirectory.set(directory, (byDirectory.get(directory) ?? 0) + 1);
  }

  return {
    summary: [
      `Compressed file listing: ${lines.length} item(s).`,
      `Directory groups: ${[...byDirectory.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, 30)
        .map(([directory, count]) => `${directory} (${count})`)
        .join(", ") || "none"}.`
    ],
    preservedEvidence: lines.slice(0, 60)
  };
}

function compressGitDiff(content: string): CompressorOutput {
  const lines = splitLines(content);
  const preserved: string[] = [];
  let omittedContext = 0;

  for (const line of lines) {
    const mustPreserve =
      line.startsWith("diff --git ") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("@@") ||
      (line.startsWith("+") && !line.startsWith("+++")) ||
      (line.startsWith("-") && !line.startsWith("---"));

    if (mustPreserve) {
      if (omittedContext > 0) {
        preserved.push(`... ${omittedContext} unchanged context line(s) omitted ...`);
        omittedContext = 0;
      }

      preserved.push(line);
    } else {
      omittedContext += 1;
    }
  }

  if (omittedContext > 0) {
    preserved.push(`... ${omittedContext} unchanged context line(s) omitted ...`);
  }

  const added = lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const deleted = lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;

  return {
    summary: [
      `Compressed git diff: ${lines.length} line(s).`,
      `Preserved ${added} added line(s), ${deleted} deleted line(s), file headers, and hunk headers.`,
      "Only unchanged context lines were collapsed; exact diff is retrievable."
    ],
    preservedEvidence: preserved.slice(0, 180)
  };
}

function compressRepeatedLines(content: string, label: string): CompressorOutput {
  const lines = splitLines(content);
  const counts = new Map<string, number>();
  const preserved: string[] = [];

  for (const line of lines) {
    const count = counts.get(line) ?? 0;
    counts.set(line, count + 1);

    if (count === 0) {
      preserved.push(line);
    }
  }

  return {
    summary: [
      `Compressed ${label}: ${lines.length} line(s).`,
      `Suppressed ${Math.max(0, lines.length - preserved.length)} repeated line occurrence(s).`
    ],
    preservedEvidence: preserved.slice(0, 100)
  };
}

function createEnvelope(input: {
  reference: string;
  classification: CompressionClassification;
  originalBytes: number;
  originalLines: number;
  estimatedOriginalTokens: number;
  compressedBody: CompressorOutput;
}): CompressionEnvelope {
  const provisional: CompressionEnvelope = {
    schemaVersion: COMPRESSION_SCHEMA_VERSION,
    kind: "gleip.context.compressed",
    compressorVersion: COMPRESSION_COMPRESSOR_VERSION,
    reference: input.reference,
    contentClass: input.classification.contentClass,
    authority: input.classification.authority,
    lifecycle: input.classification.lifecycle,
    originalBytes: input.originalBytes,
    originalLines: input.originalLines,
    estimatedOriginalTokens: input.estimatedOriginalTokens,
    compressedBytes: 0,
    estimatedCompressedTokens: 0,
    summary: input.compressedBody.summary,
    preservedEvidence: input.compressedBody.preservedEvidence,
    retrieveCommand: `npx --no-install gleip retrieve ${input.reference}`
  };
  const rendered = renderHumanEnvelope(provisional);

  return {
    ...provisional,
    compressedBytes: byteCount(rendered),
    estimatedCompressedTokens: estimateCompressionTokens(rendered)
  };
}

function renderEnvelope(envelope: CompressionEnvelope, policy: CompressionPolicy): string {
  if (policy.envelopeFormat === "json") {
    return `${JSON.stringify(envelope, null, 2)}\n`;
  }

  return renderHumanEnvelope(envelope);
}

function renderHumanEnvelope(envelope: CompressionEnvelope): string {
  const evidence =
    envelope.preservedEvidence.length === 0
      ? ["- No diagnostic lines preserved in the compact display."]
      : envelope.preservedEvidence.map((line) => `  ${line}`);

  return [
    `[Gleip compressed ${envelope.contentClass} ${envelope.reference}]`,
    `Original bytes: ${envelope.originalBytes}`,
    `Original lines: ${envelope.originalLines}`,
    `Estimated original tokens: ${envelope.estimatedOriginalTokens}`,
    `Retrieve: ${envelope.retrieveCommand}`,
    "Summary:",
    ...envelope.summary.map((line) => `- ${line}`),
    "Preserved evidence:",
    ...evidence,
    "[/Gleip compressed]"
  ].join("\n");
}

function validateCompressionEnvelope(
  cwd: string,
  envelope: CompressionEnvelope,
  original: string,
  output: string
): boolean {
  if (!isCompressedContextEnvelope(output)) {
    return false;
  }

  const hash = envelope.reference.replace(/^sha256:/u, "");

  if (!/^[0-9a-f]{64}$/u.test(hash)) {
    return false;
  }

  try {
    const stored = readFileSync(compressionObjectPath(cwd, hash), "utf8");

    if (stored !== original || hashText(stored) !== hash) {
      return false;
    }
  } catch {
    return false;
  }

  if (envelope.contentClass === "git_diff") {
    const addedAndDeletedOriginal = splitLines(original).filter(
      (line) =>
        (line.startsWith("+") && !line.startsWith("+++")) ||
        (line.startsWith("-") && !line.startsWith("---"))
    );

    return addedAndDeletedOriginal.every((line) => output.includes(line));
  }

  return true;
}

function storeCompressionOriginal(
  cwd: string,
  content: string,
  metadata: {
    classification: CompressionClassification;
    artifactType?: string;
    sourceCommand?: string;
    sessionId?: string;
    repositoryFingerprint?: string;
    createdAt: string;
    compressedBytes: number;
    estimatedCompressedTokens: number;
  }
): { ok: true; hash: string; reference: string; dedupHit: boolean } | { ok: false; error: string } {
  try {
    const hash = hashText(content);
    const reference = `sha256:${hash}`;
    const objectPath = compressionObjectPath(cwd, hash);
    const objectsDir = dirname(objectPath);

    ensureCompressionStore(cwd);

    if (!isSafeStorePath(cwd, objectPath)) {
      return { ok: false, error: "Unsafe compression object path." };
    }

    if (existsSync(objectPath) && lstatSync(objectPath).isSymbolicLink()) {
      return { ok: false, error: "Compression object path is a symlink." };
    }

    const dedupHit = existsSync(objectPath);

    if (!dedupHit) {
      const tempPath = join(objectsDir, `${hash}.${process.pid}.${Date.now()}.tmp`);
      writeFileSync(tempPath, content, "utf8");
      renameSync(tempPath, objectPath);
    }

    const stored = readFileSync(objectPath, "utf8");

    if (hashText(stored) !== hash) {
      return { ok: false, error: "Stored compression object failed hash validation." };
    }

    const index = readCompressionIndex(cwd);
    const existing = index.objects[hash];
    const baseRecord: CompressionObjectRecord =
      existing ??
      {
        hash,
        reference,
        createdAt: metadata.createdAt,
        lastAccessedAt: metadata.createdAt,
        contentClass: metadata.classification.contentClass,
        authority: metadata.classification.authority,
        lifecycle: metadata.classification.lifecycle,
        ...(metadata.artifactType === undefined ? {} : { artifactType: metadata.artifactType }),
        ...(metadata.sourceCommand === undefined ? {} : { sourceCommand: metadata.sourceCommand }),
        ...(metadata.sessionId === undefined ? {} : { sessionId: metadata.sessionId }),
        ...(metadata.repositoryFingerprint === undefined
          ? {}
          : { repositoryFingerprint: metadata.repositoryFingerprint }),
        originalBytes: byteCount(content),
        originalLines: lineCount(content),
        estimatedOriginalTokens: estimateCompressionTokens(content),
        compressedBytes: metadata.compressedBytes,
        estimatedCompressedTokens: metadata.estimatedCompressedTokens,
        compressionCount: 0,
        retrievalCalls: 0,
        retrievalBytes: 0,
        retrievalEstimatedTokens: 0,
        storageDedupHits: 0
      };

    index.totals.compressionAttempts += 1;
    index.totals.compressionApplied += 1;
    if (dedupHit) {
      index.totals.storageDedupHits += 1;
      index.totals.repeatedContentSuppressed += 1;
      baseRecord.storageDedupHits += 1;
    }

    baseRecord.compressionCount += 1;
    index.objects[hash] = baseRecord;
    writeCompressionIndex(cwd, index);

    return { ok: true, hash, reference, dedupHit };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function updateStoredCompressionMetrics(
  cwd: string,
  hash: string,
  metrics: { compressedBytes: number; estimatedCompressedTokens: number; dedupHit: boolean }
): void {
  const index = readCompressionIndex(cwd);
  const record = index.objects[hash];

  if (record === undefined) {
    return;
  }

  record.compressedBytes = metrics.compressedBytes;
  record.estimatedCompressedTokens = metrics.estimatedCompressedTokens;
  writeCompressionIndex(cwd, index);
}

function incrementCompressionStats(
  cwd: string,
  input: {
    attemptedClass: CompressionContentClass;
    passthrough?: boolean;
    compressorFailure?: boolean;
    validationFailure?: boolean;
  }
): void {
  const index = readCompressionIndex(cwd);

  index.totals.compressionAttempts += 1;

  if (input.passthrough === true) {
    index.totals.passthroughCount += 1;
  }

  if (input.compressorFailure === true) {
    index.totals.compressorFailures += 1;
  }

  if (input.validationFailure === true) {
    index.totals.validationFailures += 1;
  }

  writeCompressionIndex(cwd, index);
}

function readCompressionIndex(cwd: string): CompressionStoreIndex {
  const indexPath = compressionIndexPath(cwd);

  try {
    if (!existsSync(indexPath)) {
      return emptyCompressionIndex();
    }

    const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as CompressionStoreIndex;

    if (
      parsed.schemaVersion !== COMPRESSION_SCHEMA_VERSION ||
      parsed.compressorVersion !== COMPRESSION_COMPRESSOR_VERSION ||
      !isRecord(parsed.objects) ||
      !isRecord(parsed.totals)
    ) {
      return emptyCompressionIndex();
    }

    return parsed;
  } catch {
    return emptyCompressionIndex();
  }
}

function writeCompressionIndex(cwd: string, index: CompressionStoreIndex): void {
  ensureCompressionStore(cwd);
  const indexPath = compressionIndexPath(cwd);
  const tempPath = `${indexPath}.${process.pid}.${Date.now()}.tmp`;

  writeFileSync(tempPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  renameSync(tempPath, indexPath);
}

function emptyCompressionIndex(): CompressionStoreIndex {
  return {
    schemaVersion: COMPRESSION_SCHEMA_VERSION,
    compressorVersion: COMPRESSION_COMPRESSOR_VERSION,
    objects: {},
    totals: {
      compressionAttempts: 0,
      compressionApplied: 0,
      passthroughCount: 0,
      storageDedupHits: 0,
      compressorFailures: 0,
      validationFailures: 0,
      repeatedContentSuppressed: 0
    }
  };
}

function ensureCompressionStore(cwd: string): void {
  const contextDir = compressionStorePath(cwd);
  const objectsDir = join(contextDir, "objects");

  if (!isSafeStorePath(cwd, contextDir) || !isSafeStorePath(cwd, objectsDir)) {
    throw new Error("Compression store path is outside .gleip/context.");
  }

  mkdirSync(objectsDir, { recursive: true });
}

function compressionStorePath(cwd: string): string {
  return join(cwd, ".gleip", "context");
}

function compressionIndexPath(cwd: string): string {
  return join(compressionStorePath(cwd), "index.json");
}

function compressionObjectPath(cwd: string, hash: string): string {
  if (!/^[0-9a-f]{64}$/u.test(hash)) {
    throw new Error("Invalid compression object hash.");
  }

  return join(compressionStorePath(cwd), "objects", hash);
}

function resolveCompressionReference(
  index: CompressionStoreIndex,
  reference: string
): { hash: string; error?: undefined } | { hash?: undefined; error: string } {
  const normalized = reference.trim().replace(/^gleip:\/\//u, "").replace(/^sha256:/u, "");

  if (!/^[0-9a-f]{8,64}$/u.test(normalized)) {
    return { error: "Invalid compression reference." };
  }

  if (normalized.length === 64) {
    return { hash: normalized };
  }

  const matches = Object.keys(index.objects).filter((hash) => hash.startsWith(normalized));

  if (matches.length === 0) {
    return { error: "Compression reference was not found." };
  }

  if (matches.length > 1) {
    return { error: "Compression reference is ambiguous; use the full sha256 reference." };
  }

  return { hash: matches[0] as string };
}

function isSafeStorePath(cwd: string, path: string): boolean {
  const storeRoot = resolve(compressionStorePath(cwd));
  const resolved = resolve(path);
  const relativePath = relative(storeRoot, resolved);

  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function authorityForArtifact(artifactType: string): CompressionAuthority {
  if (
    artifactType === "canonical_task" ||
    artifactType === "original_user_task_revision" ||
    artifactType === "task_revision" ||
    artifactType === "task_amendment" ||
    artifactType === "effective_task"
  ) {
    return "canonical";
  }

  if (
    artifactType === "active_brief" ||
    artifactType === "requirement_ledger" ||
    artifactType === "accepted_plan" ||
    artifactType === "scope_state" ||
    artifactType === "completion_state"
  ) {
    return "derived";
  }

  return "evidence";
}

function classForArtifactType(artifactType: string | undefined): CompressionContentClass | undefined {
  if (artifactType === undefined) {
    return undefined;
  }

  if (protectedArtifactTypes.has(artifactType)) {
    if (
      artifactType === "canonical_task" ||
      artifactType === "original_user_task_revision" ||
      artifactType === "task_revision" ||
      artifactType === "effective_task"
    ) {
      return "canonical_task";
    }

    if (artifactType === "task_amendment") {
      return "task_amendment";
    }

    if (artifactType === "requirement_ledger" || artifactType === "requirement_source_excerpt") {
      return "requirement_ledger";
    }

    if (artifactType === "active_brief" || artifactType === "brief_coverage") {
      return "active_brief";
    }

    if (artifactType === "accepted_plan") {
      return "accepted_plan";
    }

    if (artifactType === "scope_state" || artifactType === "scope_budget") {
      return "scope_state";
    }

    if (artifactType === "approval_state") {
      return "approval_state";
    }

    if (artifactType === "completion_state" || artifactType === "verification_status") {
      return "completion_state";
    }

    return "policy_or_instruction";
  }

  return undefined;
}

function normalizeArtifactType(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase().replace(/[-\s]+/gu, "_");
}

function isCompressedContextEnvelope(content: string): boolean {
  const trimmed = content.trimStart();

  return (
    trimmed.startsWith("[Gleip compressed ") ||
    (trimmed.startsWith("{") &&
      trimmed.includes('"kind"') &&
      trimmed.includes('"gleip.context.compressed"'))
  );
}

function detectSensitivityFlags(content: string): string[] {
  const flags: string[] = [];

  if (/\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|private[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/iu.test(content)) {
    flags.push("secret_like_assignment");
  }

  if (/-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/u.test(content)) {
    flags.push("private_key");
  }

  return flags;
}

function isPolicyOrInstructionPath(path: string): boolean {
  const fileName = path.split("/").at(-1) ?? "";

  return [
    "agents.md",
    "claude.md",
    "gemini.md",
    "security.md",
    "code_of_conduct.md",
    "contributing.md",
    "gleip.md"
  ].includes(fileName);
}

function isPolicyLikeContent(content: string): boolean {
  return /\b(system instructions|agent instructions|canonical task|requirement ledger|approval required|security policy)\b/iu.test(
    content.slice(0, 4000)
  );
}

function isConfigurationPath(path: string): boolean {
  const fileName = path.split("/").at(-1) ?? "";

  return (
    [
      "package.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "bun.lockb",
      "tsconfig.json",
      "eslint.config.js",
      "eslint.config.mjs",
      ".gitlab-ci.yml",
      "dockerfile"
    ].includes(fileName) ||
    path.startsWith(".github/workflows/") ||
    /\.(?:ya?ml|toml|ini|env)$/iu.test(fileName)
  );
}

function isSourcePath(path: string): boolean {
  return /\.(?:c|cc|cpp|cs|go|java|js|jsx|kt|mjs|php|py|rb|rs|swift|ts|tsx|vue|svelte)$/iu.test(
    path
  );
}

function looksLikeSourceCode(content: string): boolean {
  const sample = content.slice(0, 4000);

  return (
    /\b(?:export|import|function|class|interface|type|const|let|var)\b[\s\S]{0,120}[{=;]/u.test(
      sample
    ) || /^\s*(?:def|class)\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/mu.test(sample)
  );
}

function isJsonContent(content: string): boolean {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

function looksLikeSearchResults(content: string): boolean {
  const lines = splitLines(content).filter((line) => line.trim().length > 0);

  return (
    lines.length >= 4 &&
    lines.filter((line) => /^[^:\n]+:\d+(?::\d+)?:/u.test(line)).length >= Math.ceil(lines.length / 2)
  );
}

function looksLikeFileListing(content: string): boolean {
  const lines = splitLines(content).filter((line) => line.trim().length > 0);

  return (
    lines.length >= 10 &&
    lines.filter((line) => /(?:^|[\\/])[\w.-]+\.[a-z0-9]{1,8}$/iu.test(line.trim())).length >=
      Math.ceil(lines.length * 0.7)
  );
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n/gu, "\n").split("\n");
}

function lineCount(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  return splitLines(content).length;
}

function byteCount(content: string): number {
  return Buffer.byteLength(content, "utf8");
}

function estimateCompressionTokens(content: string): number {
  return Math.ceil(Math.max(0, content.length) / 4);
}

function confidenceRank(confidence: CompressionConfidence): number {
  if (confidence === "high") {
    return 3;
  }

  if (confidence === "medium") {
    return 2;
  }

  return 1;
}

function countRepeatedLines(lines: string[]): number {
  const counts = new Map<string, number>();
  let repeated = 0;

  for (const line of lines) {
    const normalized = line.trim();

    if (normalized.length === 0) {
      continue;
    }

    const count = counts.get(normalized) ?? 0;
    counts.set(normalized, count + 1);

    if (count > 0) {
      repeated += 1;
    }
  }

  return repeated;
}

function dedupePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function authorityStateExists(cwd: string): boolean {
  return [
    ".gleip/canonical-task.json",
    ".gleip/brief.md",
    ".gleip/scope-budget.json",
    ".gleip/session.json"
  ].some((path) => existsSync(join(cwd, path)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
