#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { loadConfig as loadBundledConfig } from "../../config/src/index.js";
import {
  deriveNextAction as deriveBundledNextAction,
  detectScopeDrift as detectBundledScopeDrift,
  generateSessionReport as generateBundledSessionReport,
  renderSessionReportMarkdown as renderBundledSessionReportMarkdown
} from "../../controller/src/index.js";
import {
  appendRunEvent,
  collectWorkingTreeDiff as collectBundledWorkingTreeDiff,
  compressContext,
  createEvidenceRun,
  createSessionBaseline as createBundledSessionBaseline,
  defaultCompressionPolicy,
  environmentFingerprint,
  filterDiffSinceBaseline as filterBundledDiffSinceBaseline,
  finalizeEvidenceRun,
  fingerprintRepositoryState,
  isEphemeralGleipArtifactPath,
  migrateLegacyArtifacts,
  readCompressionStats,
  recordApproval,
  recordCommandAttestation,
  recordRunEvidence,
  recoverRunLedger,
  replayRun,
  revokeApproval,
  retrieveContextOriginal,
  sha256Digest,
  summarizeVerificationEvidence,
  synchronizeEvidenceRun,
  writeAtomicJson,
  writeAtomicText,
  type CompletionHazard,
  type CompressionAuthority,
  type CompressionContentClass,
  type CompressionLifecycle,
  type CompressionPolicy,
  type RequiredCommand,
  type VerificationEvidenceSummary
} from "../../core/src/index.js";
import {
  classifyTask as classifyBundledTask,
  createScopeBudget as createBundledScopeBudget,
  discoverRepoContext as discoverBundledRepoContext,
  extractRequirementLedger,
  generateImplementationBrief as generateBundledImplementationBrief,
  validateAgentPlan as validateBundledAgentPlan
} from "../../planner/src/index.js";

const GLEIP_SECTION_START = "<!-- GLEIP:START -->";
const GLEIP_SECTION_END = "<!-- GLEIP:END -->";
const GLEIP_GITIGNORE_START = "# Gleip local artifacts";
const GLEIP_GITIGNORE_END = "# End Gleip local artifacts";
const GLEIP_GITIGNORE_ENTRIES = [".gleip/"] as const;
const LEGACY_ARGUS_SECTION_START = "<!-- ARGUS:START -->";
const LEGACY_ARGUS_SECTION_END = "<!-- ARGUS:END -->";
const LEGACY_ARGUS_WORKFLOW_SECTION_START = "<!-- ARGUS:AGENT-WORKFLOW:START -->";
const LEGACY_ARGUS_WORKFLOW_SECTION_END = "<!-- ARGUS:AGENT-WORKFLOW:END -->";
const SUPPORTED_AGENT_TARGETS = ["auto", "generic", "codex", "claude", "gemini"] as const;
const AGENT_INSTRUCTION_TARGETS = ["generic", "claude", "gemini"] as const;
const GLEIP_VERSION = readPackageVersion();
const REPORT_SCHEMA_VERSION = "1.3.0";
const CHECK_CACHE_SCHEMA_VERSION = 2;
const CI_BLOCKING_FINDING_CODES = new Set([
  "TEST_SKIPPED",
  "TEST_DELETED",
  "LOCAL_ARTIFACT_INCLUDED",
  "NO_ACTIVE_SESSION"
]);

type AgentTarget = (typeof SUPPORTED_AGENT_TARGETS)[number];
type AgentInstructionTarget = (typeof AGENT_INSTRUCTION_TARGETS)[number];

type LoadConfig = (cwd: string) => Promise<unknown> | unknown;

type ClassifyTask = (task: string) => Promise<TaskClassification> | TaskClassification;

type DiscoverRepoContext = (
  options: DiscoverRepoContextOptions
) => Promise<RepoContext> | RepoContext;

type CreateScopeBudget = (input: CreateScopeBudgetInput) => Promise<ScopeBudget> | ScopeBudget;

type GenerateImplementationBrief = (
  input: GenerateImplementationBriefInput
) => Promise<string> | string;

type ValidateAgentPlan = (
  input: ValidateAgentPlanInput
) => Promise<PlanValidationResult> | PlanValidationResult;

type CollectWorkingTreeDiff = (
  options: CollectWorkingTreeDiffOptions
) => Promise<GitDiffContext> | GitDiffContext;

type DetectScopeDrift = (input: DetectScopeDriftInput) => Promise<DriftResult> | DriftResult;

type GenerateSessionReport = (
  input: GenerateSessionReportInput
) => Promise<SessionReport> | SessionReport;

type RenderSessionReportMarkdown = (report: SessionReport) => Promise<string> | string;

type CreateSessionBaseline = (
  diff: GitDiffContext,
  createdAt: string
) => Promise<SessionBaseline> | SessionBaseline;

type FilterDiffSinceBaseline = (
  currentDiff: GitDiffContext,
  baseline: SessionBaseline | undefined,
  options?: { includeBaseline?: boolean }
) => Promise<BaselineFilteredDiff> | BaselineFilteredDiff;

type OutputWriter = (message: string) => void;

interface CreateGleipCommandOptions {
  classifyTask?: ClassifyTask;
  collectWorkingTreeDiff?: CollectWorkingTreeDiff;
  createScopeBudget?: CreateScopeBudget;
  createSessionBaseline?: CreateSessionBaseline;
  cwd?: string;
  detectScopeDrift?: DetectScopeDrift;
  discoverRepoContext?: DiscoverRepoContext;
  filterDiffSinceBaseline?: FilterDiffSinceBaseline;
  generateImplementationBrief?: GenerateImplementationBrief;
  loadConfig?: LoadConfig;
  nodeVersion?: string;
  now?: () => Date;
  readStdin?: () => string;
  rawStdout?: OutputWriter;
  stderr?: OutputWriter;
  stdout?: OutputWriter;
  generateSessionReport?: GenerateSessionReport;
  renderSessionReportMarkdown?: RenderSessionReportMarkdown;
  setExitCode?: (code: number) => void;
  validateAgentPlan?: ValidateAgentPlan;
}

interface CommandRuntime {
  classifyTask: ClassifyTask;
  collectWorkingTreeDiff: CollectWorkingTreeDiff;
  createScopeBudget: CreateScopeBudget;
  createSessionBaseline: CreateSessionBaseline;
  cwd: string;
  detectScopeDrift: DetectScopeDrift;
  discoverRepoContext: DiscoverRepoContext;
  filterDiffSinceBaseline: FilterDiffSinceBaseline;
  generateImplementationBrief: GenerateImplementationBrief;
  loadConfig: LoadConfig;
  nodeVersion: string;
  now: () => Date;
  readStdin: () => string;
  rawStdout: OutputWriter;
  stderr: OutputWriter;
  stdout: OutputWriter;
  generateSessionReport: GenerateSessionReport;
  renderSessionReportMarkdown: RenderSessionReportMarkdown;
  setExitCode: (code: number) => void;
  validateAgentPlan: ValidateAgentPlan;
}

interface InitOptions {
  agent?: string;
  agentTarget?: string;
  allAgents?: boolean;
  force?: boolean;
}

interface DoctorOptions {
  agents?: boolean;
  fix?: boolean;
}

interface RepairAgentsOptions {
  all?: boolean;
}

interface StopOptions {
  clean?: boolean;
}

interface UninstallOptions {
  dryRun?: boolean;
  force?: boolean;
  keepAgentFiles?: boolean;
}

interface StateChangeOptions {
  reason?: string;
}

interface StatusCommandOptions {
  ci?: boolean;
  compact?: boolean;
  force?: boolean;
  includeBaseline?: boolean;
  incremental?: boolean;
  json?: boolean;
  planMode?: boolean;
}

interface ValidatePlanOptions {
  file?: string;
  json?: boolean;
  planMode?: boolean;
  task?: string;
  taskFile?: string;
}

interface PreflightOptions {
  amend?: boolean;
  file?: string;
  json?: boolean;
  planMode?: boolean;
}

interface ReportOptions {
  json?: boolean;
}

interface EvidenceJsonOptions {
  json?: boolean;
}

interface ApprovalOptions extends EvidenceJsonOptions {
  actor: string;
  reason: string;
  scope: string;
  path?: string[];
  finding?: string[];
  source?: string;
  expires?: string;
}

interface MigrationOptions extends EvidenceJsonOptions {
  dryRun?: boolean;
}

interface CompressionCommandOptions {
  artifactType?: string;
  audit?: boolean;
  authority?: string;
  json?: boolean;
  lifecycle?: string;
  sourceCommand?: string;
  type?: string;
}

interface RetrieveOptions {
  json?: boolean;
}

interface StatsOptions {
  json?: boolean;
}

interface GleipState {
  enabled: boolean;
  updatedAt: string;
  updatedBy: "local-cli";
  reason: string | null;
}

interface GleipConfigLike {
  allowed_paths?: string[];
  approval_required_for?: string[];
  checks?: {
    skipped_tests?: boolean;
    deleted_tests?: boolean;
    dependency_bloat?: boolean;
    ci_weakening?: boolean;
    risky_files?: boolean;
    secrets?: boolean;
  };
  compression?: {
    allowed_classes?: string[];
    audit_only?: boolean;
    enabled?: boolean;
    envelope_format?: string;
    min_confidence?: string;
    min_input_bytes?: number;
    min_estimated_tokens_saved?: number;
  };
  limits?: {
    max_files_changed_warning?: number;
    max_lines_added_warning?: number;
    max_lines_deleted_warning?: number;
  };
  mode?: string;
  protected_paths?: string[];
  required_commands?: Array<{
    id: string;
    description: string;
    executable?: string;
    argument_includes?: string[];
  }>;
  risky_files?: string[];
}

interface TaskClassification {
  taskType: string;
  confidence: string;
  riskLevel: string;
  reasons: string[];
  likelyRequiresTests: boolean;
  likelyAllowsNewDependencies: boolean;
  workflowProfile?: WorkflowProfile;
}

type WorkflowProfile =
  | "documentation_only"
  | "local_behavior_change"
  | "broad_change"
  | "sensitive_change";

interface DiscoverRepoContextOptions {
  classification: TaskClassification;
  config: GleipConfigLike;
  contextFiles?: string[];
  cwd: string;
  task: string;
}

interface CreateScopeBudgetInput {
  classification: TaskClassification;
  config: GleipConfigLike;
  repoContext: RepoContext;
  task: string;
}

interface GenerateImplementationBriefInput extends CreateScopeBudgetInput {
  scopeBudget: ScopeBudget;
  canonicalTask?: CanonicalTaskReference;
  requirementLedger?: RequirementLedger;
}

interface ValidateAgentPlanInput {
  planText: string;
  scopeBudget: ScopeBudget;
  config?: GleipConfigLike;
  cwd?: string;
  taskText?: string;
  contextFiles?: string[];
  requirementLedger?: RequirementLedger;
}

interface CollectWorkingTreeDiffOptions {
  cwd: string;
  base?: string;
}

interface DetectScopeDriftInput {
  scopeBudget: ScopeBudget;
  gitDiffContext: GitDiffContext;
  config: GleipConfigLike;
  requirementLedger?: RequirementLedger;
}

interface GitDiffContext {
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

interface GitFileStat {
  path: string;
  added: number;
  deleted: number;
  isDeleted?: boolean;
  isUntracked?: boolean;
  diffFingerprint?: string;
}

interface SessionBaseline {
  createdAt: string;
  changedFiles: string[];
  fileStats: GitFileStat[];
  totalLinesAdded: number;
  totalLinesDeleted: number;
  diffFingerprint: string;
  note?: string;
}

interface BaselineContext {
  hasBaseline: boolean;
  preExistingFilesIgnored: number;
  sessionFilesChanged: number;
  baselineCreatedAt?: string;
  includeBaseline: boolean;
  possiblyPreExistingFiles: string[];
}

interface BaselineFilteredDiff {
  diff: GitDiffContext;
  baseline: BaselineContext;
}

interface DriftResult {
  status: DriftStatus;
  findings: DriftFinding[];
  metrics: {
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
  };
  summary: string;
}

type DriftStatus =
  | "clean"
  | "advisory"
  | "needs_attention"
  | "needs_cleanup"
  | "needs_approval"
  | "within_scope"
  | "warning"
  | "approval_required"
  | "blocked";

interface DriftFinding {
  code?: string;
  severity:
    | "info"
    | "warn"
    | "fail"
    | "blocking"
    | "action_required"
    | "cleanup_required"
    | "warning"
    | "approval_required"
    | "blocked";
  title: string;
  message: string;
  file?: string;
  count?: number;
  examples?: string[];
  targetClassifications?: ScopeTargetClassification[];
  recommendation?: string;
  category: string;
}

interface RepoContext {
  taskTerms: string[];
  likelyRelevantFiles: RepoFileMatch[];
  likelyTestFiles: RepoFileMatch[];
  existingPatternMatches: RepoPatternMatch[];
  contextFiles?: string[];
  dependencyFiles: string[];
  ciFiles: string[];
  riskyMatchedPaths: string[];
  scannedFileCount: number;
  skippedDirectoryCount: number;
}

interface RepoFileMatch {
  path: string;
  score: number;
  reasons: string[];
}

interface RepoPatternMatch {
  pattern: string;
  path: string;
  score: number;
  reasons: string[];
}

interface ScopeBudget {
  taskType: string;
  confidence: string;
  riskLevel: string;
  workflowProfile?: WorkflowProfile;
  planRequired?: boolean;
  taskBreadth?: "local" | "feature" | "subsystem" | "cross_cutting" | "repository_wide";
  expectedFilesChanged: NumberRange;
  expectedLinesAdded: NumberRange;
  expectedLinesDeleted: NumberRange;
  softLimits: {
    maxFilesChanged: number;
    maxLinesAdded: number;
    maxLinesDeleted: number;
  };
  hardGates: {
    newDependenciesAllowed: boolean;
    dependencyMetadataChangesAllowed?: boolean;
    ciChangesAllowed: boolean;
    skippedTestsAllowed: boolean;
    deletedTestsAllowed: boolean;
    secretsAllowed: boolean;
  };
  protectedChecks?: ScopeBudget["hardGates"];
  allowedPaths: string[];
  expectedPaths?: string[];
  explicitScope?: string[];
  derivedScope?: string[];
  suspiciousPaths: string[];
  approvalRequiredFor: string[];
  blockedWithoutApproval: string[];
  approvalRequiredChanges?: string[];
  requiredTests: boolean;
  verificationExpected?: boolean;
  testGuidance: string[];
  stopConditions: string[];
  pauseAndClarifyConditions?: string[];
  contextDocsTouchAllowed?: boolean;
  readOnlyContextPaths?: string[];
  reasons: string[];
}

type PlanValidationStatus =
  | "aligned"
  | "advisory"
  | "needs_clarification"
  | "needs_approval"
  | "needs_cleanup"
  | "approved"
  | "needs_revision"
  | "requires_approval";

interface PlanValidationFinding {
  code?: string;
  severity:
    | "info"
    | "warn"
    | "fail"
    | "blocking"
    | "action_required"
    | "cleanup_required"
    | "warning"
    | "approval_required";
  title: string;
  message: string;
  recommendation?: string;
  evidence?: string[];
}

interface ScopeTargetClassification {
  target: string;
  classification: "direct" | "derived" | "adjacent" | "unexplained";
  reason: string;
  evidence: string;
  nextAction?: string;
}

interface AgentPlan {
  rawText: string;
  proposedFiles: string[];
  contextFiles?: string[];
  outputFiles?: string[];
  fileMentions?: Array<{
    path: string;
    role: "edit" | "context" | "output";
    markedNew: boolean;
  }>;
  proposedDependencies: string[];
  proposedTests: string[];
  mentionedRiskyAreas: string[];
  mentionsCiChanges: boolean;
  mentionsNewDependencies: boolean;
  mentionsTestWeakening: boolean;
  mentionsBroadRefactor: boolean;
}

interface PlanValidationResult {
  status: PlanValidationStatus;
  findings: PlanValidationFinding[];
  summary: string;
  nextAction: string;
  parsedPlan: AgentPlan;
  targetClassifications?: ScopeTargetClassification[];
  requirementCoverage?: PlanRequirementCoverage;
}

type PlanValidationRecord = PlanValidationResult & { validatedAt?: string };

interface GenerateSessionReportInput {
  version: string;
  schemaVersion: string;
  sessionId?: string | null;
  generatedAt: string;
  phase?: "preflight" | "implementation" | "verification" | "final";
  repositoryFingerprint?: string;
  scopeBudget?: ScopeBudget;
  diff: GitDiffContext;
  driftResult: DriftResult;
  baseline?: {
    possiblyPreExistingFiles: string[];
  };
  planValidation?: PlanValidationResult;
  acceptedPlanValidation?: PlanValidationResult;
  statusContent?: string;
  verificationEvidence?: VerificationEvidenceSummary;
  missingArtifacts?: string[];
  requirementLedger?: RequirementLedger;
}

interface SessionReport {
  version: string;
  schemaVersion: string;
  sessionId: string | null;
  generatedAt: string;
  artifact?: ArtifactMetadata;
  scores: {
    scopeAdherence: number;
    planAlignment: number;
    outputDiscipline: number;
    reviewReadiness: number;
  };
  risk: {
    drift: "none" | "low" | "medium" | "high";
    repositoryHygiene: "none" | "low" | "medium" | "high";
    testIntegrity: "unknown" | "pass" | "warning" | "fail";
    overEdit: "none" | "low" | "medium" | "high";
  };
  efficiency: {
    estimatedTokenWasteAvoided: number;
    confidence: "low" | "medium" | "high";
    breakdown: {
      scopeWasteAvoided: number;
      contextWasteAvoided: number;
      outputWasteAvoided: number;
    };
    basis: Array<{
      source:
        | "avoided_diff"
        | "avoided_file_context"
        | "rejected_plan_item"
        | "scope_budget_reduction"
        | "output_discipline";
      description: string;
      estimatedTokens: number;
      confidence: "low" | "medium" | "high";
    }>;
  };
  requirements: {
    summary: {
      total: number;
      mandatory: number;
      mandatorySatisfied: number;
      mandatoryUnresolved: number;
      prohibited: number;
      prohibitedSatisfied: number;
      prohibitedViolated: number;
      advisory: number;
    };
    items: Array<{
      id: string;
      sourceText: string;
      obligation: "required" | "prohibited" | "optional" | "suggestion" | "informational";
      category: string;
      status: "satisfied" | "unresolved" | "violated" | "advisory" | "not_applicable";
      evidence: string[];
      relatedPaths: string[];
    }>;
  };
  finalResponse: {
    markdown: string;
    unresolvedWarnings: number;
  };
  warnings: Array<{
    id: string;
    type:
      | "scope"
      | "plan"
      | "requirement"
      | "drift"
      | "test_integrity"
      | "output"
      | "review_readiness"
      | "efficiency";
    severity: "info" | "low" | "medium" | "high";
    message: string;
    reason: string;
    evidence: string[];
    files: string[];
    suggestedAction: string | null;
  }>;
  summary: {
    changedFilesMentioned: boolean;
    filesChanged: number;
    unplannedFiles: number;
    testsMentioned: boolean;
    risksMentioned: boolean;
  };
}

interface ArtifactMetadata {
  generatedAt: string;
  repositoryFingerprint?: string;
  sessionId?: string | null;
  phase: "preflight" | "implementation" | "verification" | "final";
  sequence: number;
  superseded: boolean;
  currentArtifact: string;
}

interface GleipSession {
  sessionId?: string;
  evidenceRunId?: string;
  taskRevision?: number;
  canonicalTask?: CanonicalTaskSessionReference;
  requirementLedgerSummary?: RequirementLedgerSummary;
  classification?: TaskClassification;
  latestValidationAttempt?: PlanValidationRecord;
  latestSuccessfulValidation?: PlanValidationRecord;
  latestPlanValidation?: PlanValidationRecord;
  latestSuccessfulPlanValidation?: PlanValidationRecord;
  latestStatus?: unknown;
  repoContext?: RepoContext;
  baseline?: BaselineSummary;
  scopeBudgetSummary?: ScopeBudgetSummary;
  task?: string;
  taskFile?: string;
  [key: string]: unknown;
}

interface CanonicalTaskReference {
  authority: "canonical";
  taskId: string;
  activeRevisionId: string;
  contentHash: string;
  artifactPath: string;
}

interface CanonicalTaskSessionReference extends CanonicalTaskReference {
  byteCount: number;
  characterCount: number;
  revisionCount: number;
  source: "inline" | "file" | "amendment" | "compatibility_session_task" | "compatibility_brief";
}

interface CanonicalTaskArtifact {
  schemaVersion: "1.0.0";
  authority: "canonical";
  immutable: true;
  sessionId: string;
  taskId: string;
  activeRevisionId: string;
  effectiveContent: string;
  contentHash: string;
  byteCount: number;
  characterCount: number;
  createdAt: string;
  updatedAt: string;
  revisions: CanonicalTaskRevision[];
  requirementLedger: RequirementLedger;
  provenance: {
    complete: boolean;
    source: CanonicalTaskSessionReference["source"];
    note?: string;
  };
}

interface CanonicalTaskRevision {
  schemaVersion: "1.0.0";
  authority: "canonical";
  immutable: true;
  sessionId: string;
  taskId: string;
  revisionId: string;
  revisionNumber: number;
  source: CanonicalTaskSessionReference["source"];
  content: string;
  contentHash: string;
  byteCount: number;
  characterCount: number;
  createdAt: string;
  previousRevisionId?: string;
  status: "active" | "superseded";
}

interface RequirementLedger {
  schemaVersion: "1.0.0";
  authority: "derived";
  canonicalTaskHash?: string;
  offsetEncoding: "utf16";
  requirements: RequirementLedgerItem[];
  conflicts: Array<{
    id: string;
    requirementIds: string[];
    reason: string;
    severity: "advisory" | "blocking";
  }>;
  generatedAt?: string;
}

interface RequirementLedgerItem {
  id: string;
  sourceText: string;
  canonicalRevisionId: string;
  sourceStart: number;
  sourceEnd: number;
  offsetEncoding: "utf16";
  category: string;
  obligation: "required" | "prohibited" | "optional" | "suggestion" | "informational";
  status: "active" | "superseded" | "ambiguous";
  confidence: string;
  explicit: boolean;
  relatedPaths: string[];
  relatedVerification?: string;
  supersededBy?: string;
}

interface RequirementLedgerSummary {
  schemaVersion: "1.0.0";
  authority: "derived";
  requirementCount: number;
  mandatoryCount: number;
  prohibitedCount: number;
  optionalCount: number;
  conflictCount: number;
}

interface PlanRequirementCoverage {
  requirements: Array<{
    requirementId: string;
    status:
      | "addressed"
      | "partially_addressed"
      | "explicitly_deferred"
      | "not_applicable"
      | "missing"
      | "conflicting"
      | "ambiguous";
    reason: string;
    evidence?: string[];
  }>;
  missingRequired: string[];
  conflictingRequirements: string[];
  deferredRequirements: string[];
}

interface FindingDelta {
  added: DriftFinding[];
  updated: DriftFinding[];
  resolved: DriftFinding[];
  unchanged: number;
}

interface CachedCheckResult {
  driftResult: DriftResult;
  nextAction: string;
  baseline: BaselineContext;
}

interface IncrementalCheckCache {
  schemaVersion: number;
  gleipVersion: string;
  fingerprint: string;
  repositoryFingerprint: string;
  result: CachedCheckResult;
  metadata: {
    createdAt: string;
  };
}

interface ScopeBudgetSummary {
  expectedFilesChanged: NumberRange;
  workflowProfile?: WorkflowProfile;
  planRequired?: boolean;
  softLimits: ScopeBudget["softLimits"];
  hardGates: ScopeBudget["hardGates"];
  approvalRequiredCount: number;
  blockedWithoutApprovalCount: number;
  requiredTests: boolean;
  stopConditionsCount: number;
}

interface BaselineSummary {
  createdAt: string;
  changedFilesCount: number;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  note?: string;
}

interface NumberRange {
  min: number;
  max: number;
}

export function createGleipCommand(options: CreateGleipCommandOptions = {}): Command {
  const runtime: CommandRuntime = {
    classifyTask: options.classifyTask ?? classifyTaskFromPackage,
    collectWorkingTreeDiff: options.collectWorkingTreeDiff ?? collectWorkingTreeDiffFromPackage,
    createScopeBudget: options.createScopeBudget ?? createScopeBudgetFromPackage,
    createSessionBaseline: options.createSessionBaseline ?? createSessionBaselineFromPackage,
    cwd: resolve(options.cwd ?? process.cwd()),
    detectScopeDrift: options.detectScopeDrift ?? detectScopeDriftFromPackage,
    discoverRepoContext: options.discoverRepoContext ?? discoverRepoContextFromPackage,
    filterDiffSinceBaseline: options.filterDiffSinceBaseline ?? filterDiffSinceBaselineFromPackage,
    generateImplementationBrief:
      options.generateImplementationBrief ?? generateImplementationBriefFromPackage,
    loadConfig: options.loadConfig ?? loadConfigFromPackage,
    nodeVersion: options.nodeVersion ?? process.versions.node,
    now: options.now ?? (() => new Date()),
    readStdin: options.readStdin ?? (() => readFileSync(0, "utf8")),
    rawStdout:
      options.rawStdout ??
      options.stdout ??
      ((message) => {
        process.stdout.write(message);
      }),
    stderr: options.stderr ?? ((message) => console.error(message)),
    stdout: options.stdout ?? ((message) => console.log(message)),
    generateSessionReport: options.generateSessionReport ?? generateSessionReportFromPackage,
    renderSessionReportMarkdown:
      options.renderSessionReportMarkdown ?? renderSessionReportMarkdownFromPackage,
    setExitCode:
      options.setExitCode ??
      ((code) => {
        process.exitCode = code;
      }),
    validateAgentPlan: options.validateAgentPlan ?? validateAgentPlanFromPackage
  };
  const program = new Command();

  program
    .name("gleip")
    .description(
      "Run local-only preflight, scope guidance, and status checks for coding-agent work."
    )
    .version(GLEIP_VERSION)
    .option("--cwd <path>", "Run Gleip against a target repository.", options.cwd)
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        '  $ gleip preflight "Fix the checkout discount calculation bug without changing payment provider integration or checkout routing"',
        '  $ gleip validate-plan "Update the discount calculation and its focused checkout tests"',
        "  $ gleip status",
        "  $ gleip report"
      ].join("\n")
    );

  program.hook("preAction", (command) => {
    const globalOptions = command.optsWithGlobals<{ cwd?: string }>();
    runtime.cwd = resolve(globalOptions.cwd ?? options.cwd ?? process.cwd());
  });

  program
    .command("init")
    .description("Create local-only Gleip config, policy docs, and agent workflow files.")
    .argument("[agentTarget]", "Agent target: auto, generic, codex, claude, or gemini.")
    .option("--agent <name>", "Create instructions for auto, generic, codex, claude, or gemini.")
    .option(
      "--all-agents",
      "Deprecated; init creates one target. Use repair-agents --all to repair all targets."
    )
    .option("--force", "Overwrite generated Gleip files.")
    .addHelpText("after", "\nExamples:\n  $ gleip init\n  $ gleip init claude")
    .action((agentTarget: string | undefined, commandOptions: InitOptions) => {
      initRepository(
        runtime,
        agentTarget === undefined ? commandOptions : { ...commandOptions, agentTarget }
      );
    });

  program
    .command("preflight")
    .description("Create a local-only brief, scope budget, and status baseline for a task.")
    .argument("[task...]", "Task the coding agent is about to implement.")
    .option("--file <path>", "Read the full task text from a file.")
    .option("--amend", "Append this task text as an ordered amendment to the active session.")
    .option(
      "--plan-mode",
      "Print the brief and scope budget without writing any file. For agents that cannot write yet."
    )
    .option("--json", "Print the preflight result as JSON.")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        '  $ gleip preflight "Fix the checkout discount calculation bug without changing payment provider integration or checkout routing"',
        "  $ gleip preflight --file task.md",
        '  $ gleip preflight --plan-mode "<task>"'
      ].join("\n")
    )
    .action(async (task: string[] | undefined, commandOptions: PreflightOptions) => {
      await runPreflightCommand(runtime, task ?? [], commandOptions);
    });

  program
    .command("start")
    .description("Alias for gleip preflight.")
    .argument("[task...]", "Task the coding agent is about to implement.")
    .option("--file <path>", "Read the full task text from a file.")
    .option("--amend", "Append this task text as an ordered amendment to the active session.")
    .action(async (task: string[] | undefined, commandOptions: PreflightOptions) => {
      await runPreflightCommand(runtime, task ?? [], commandOptions);
    });

  program
    .command("brief")
    .description("Print the active gleip preflight brief.")
    .action(() => {
      printBrief(runtime);
    });

  program
    .command("validate-plan")
    .description("Validate an implementation plan against the active scope budget.")
    .argument("[planText...]", "Plan text to validate; omit to read from stdin.")
    .option("--file <path>", "Read the plan text from a file.")
    .option("--json", "Print validation result as JSON.")
    .option(
      "--plan-mode",
      "Validate without writing any file. Works without an active session when --task is given."
    )
    .option("--task <text>", "Task text to validate against; --plan-mode only.")
    .option("--task-file <path>", "Read the task text from a file; --plan-mode only.")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        '  $ gleip validate-plan "Update the discount calculation and its focused checkout tests"',
        "  $ gleip validate-plan --file plan.md",
        "  $ Get-Content plan.md | gleip validate-plan",
        '  $ gleip validate-plan --plan-mode --task "<task>" "<plan>"'
      ].join("\n")
    )
    .action(async (planText: string[] | undefined, commandOptions: ValidatePlanOptions) => {
      await validatePlan(runtime, planText ?? [], commandOptions);
    });

  program
    .command("enable")
    .description("Enable local-only Gleip guidance for this repository.")
    .option("--reason <reason>", "Reason for enabling Gleip.")
    .action((commandOptions: StateChangeOptions) => {
      setGleipEnabled(runtime.cwd, true, commandOptions.reason, runtime.now().toISOString());
      runtime.stdout("Gleip enabled.");
    });

  program
    .command("disable")
    .description("Disable local-only Gleip guidance for this repository.")
    .option("--reason <reason>", "Reason for disabling Gleip.")
    .action((commandOptions: StateChangeOptions) => {
      setGleipEnabled(runtime.cwd, false, commandOptions.reason, runtime.now().toISOString());
      runtime.stdout(
        "Gleip disabled. Passive guidance will remain inactive until explicitly enabled."
      );
    });

  program
    .command("state")
    .description("Print the repo-local Gleip enabled/disabled status.")
    .action(() => {
      printGleipState(runtime);
    });

  program
    .command("status")
    .description("Print and update the active Gleip session status.")
    .option("--compact", "Print only iterative task, change, finding-count, and next-action state.")
    .option(
      "--include-baseline",
      "Analyze the full working tree, including preflight baseline changes."
    )
    .option("--json", "Print status as JSON.")
    .action(async (commandOptions: StatusCommandOptions) => {
      await printStatus(runtime, {
        commandName: "status",
        compact: commandOptions.compact === true,
        disabledSuffix: "Status can still be checked manually.",
        includeBaseline: commandOptions.includeBaseline === true,
        json: commandOptions.json === true
      });
    });

  program
    .command("check")
    .description("Check current repository changes against the local-only scope budget.")
    .option("--incremental", "Reuse a complete result when deterministic check inputs match.")
    .option("--force", "Recompute even when the incremental cache matches.")
    .option(
      "--include-baseline",
      "Analyze the full working tree, including preflight baseline changes."
    )
    .option("--ci", "Exit non-zero only for documented high-confidence action findings.")
    .option("--json", "Print check result as JSON.")
    .option("--plan-mode", "Check without writing the incremental cache or any evidence.")
    .action(async (commandOptions: StatusCommandOptions) => {
      await printStatus(runtime, {
        allowMissingSession: true,
        ci: commandOptions.ci === true,
        commandName: "check",
        disabledSuffix: "Check can still be run manually.",
        includeBaseline: commandOptions.includeBaseline === true,
        incremental: commandOptions.incremental === true,
        force: commandOptions.force === true,
        json: commandOptions.json === true,
        planMode: commandOptions.planMode === true,
        writeStatusFile: false,
        updateSession: false
      });
    });

  program
    .command("report")
    .description("Generate the legacy-compatible local-only Gleip session report.")
    .option("--json", "Print the stable report JSON.")
    .action(async (commandOptions: ReportOptions) => {
      await printReport(runtime, commandOptions);
    });

  program
    .command("approve")
    .description("Record an explicit, state-bound human approval for the active evidence run.")
    .requiredOption("--actor <actor>", "Person or authority granting approval.")
    .requiredOption("--reason <reason>", "Reason for the approval.")
    .requiredOption("--scope <scope>", "Approval scope or completion-hazard code.")
    .option("--path <path...>", "Affected repository paths.")
    .option("--finding <id...>", "Finding identifiers covered by the approval.")
    .option("--source <source>", "Approval source.", "local_cli")
    .option("--expires <iso-date>", "Optional ISO-8601 expiry time.")
    .option("--json", "Print the approval as JSON.")
    .action(async (commandOptions: ApprovalOptions) => {
      await approveEvidence(runtime, commandOptions);
    });

  program
    .command("revoke-approval")
    .description("Revoke a durable approval in the active evidence run.")
    .argument("<approvalId>", "Approval identifier to revoke.")
    .option("--json", "Print the revoked approval as JSON.")
    .action(async (approvalId: string, commandOptions: EvidenceJsonOptions) => {
      await revokeEvidenceApproval(runtime, approvalId, commandOptions);
    });

  program
    .command("replay")
    .description("Replay and verify an evidence run from its append-only event ledger.")
    .argument("[runId]", "Run identifier; defaults to the active run.")
    .option("--json", "Print replay state as JSON.")
    .action(async (runId: string | undefined, commandOptions: EvidenceJsonOptions) => {
      await replayEvidence(runtime, runId, commandOptions);
    });

  program
    .command("recover")
    .description("Recover an evidence ledger with an incomplete final record.")
    .argument("[runId]", "Run identifier; defaults to the active run.")
    .option("--json", "Print recovery metadata as JSON.")
    .action(async (runId: string | undefined, commandOptions: EvidenceJsonOptions) => {
      await recoverEvidence(runtime, runId, commandOptions);
    });

  program
    .command("migrate")
    .description("Import legacy 0.8/0.9 artifacts into a new immutable 1.0 evidence run.")
    .option("--dry-run", "Inspect legacy artifacts without writing a run.")
    .option("--json", "Print migration metadata as JSON.")
    .action(async (commandOptions: MigrationOptions) => {
      await migrateEvidence(runtime, commandOptions);
    });

  program
    .command("finalize")
    .description("Create the final evidence bundle for the exact current repository state.")
    .option("--json", "Print the final evidence bundle as JSON.")
    .action(async (commandOptions: EvidenceJsonOptions) => {
      await finalizeEvidence(runtime, commandOptions);
    });

  program
    .command("compress")
    .description("Classify and compress eligible local execution evidence from text or stdin.")
    .argument("[content...]", "Content to classify; omit to read from stdin.")
    .option("--type <class>", "Caller content hint, such as test_output or structured_json.")
    .option("--artifact-type <type>", "Structural artifact type for authority-aware passthrough.")
    .option("--authority <authority>", "canonical, derived, evidence, or historical.")
    .option("--lifecycle <lifecycle>", "active, superseded, stale, or archived.")
    .option("--source-command <command>", "Command that produced the content.")
    .option("--audit", "Classify and report policy decisions without replacing content.")
    .option("--json", "Print machine-readable compression output.")
    .action(async (content: string[] | undefined, commandOptions: CompressionCommandOptions) => {
      await compressCliContent(runtime, content ?? [], commandOptions);
    });

  program
    .command("run")
    .description("Run a local command and compress eligible stdout or stderr evidence.")
    .argument("[commandAndArgs...]", "Command to run. Use `--` before commands with flags.")
    .option("--type <class>", "Caller content hint for command output.")
    .option("--audit", "Classify command output without replacing it.")
    .option("--json", "Print machine-readable wrapper metadata.")
    .allowUnknownOption(true)
    .action(
      async (commandAndArgs: string[] | undefined, commandOptions: CompressionCommandOptions) => {
        await runWrappedLocalCommand(runtime, commandAndArgs ?? [], commandOptions);
      }
    );

  program
    .command("retrieve")
    .description("Retrieve exact original local content from a Gleip compression reference.")
    .argument("<reference>", "Full sha256 reference or unambiguous prefix.")
    .option("--json", "Print retrieval metadata and content as JSON.")
    .action((reference: string, commandOptions: RetrieveOptions) => {
      retrieveCompressedContent(runtime, reference, commandOptions);
    });

  program
    .command("stats")
    .description("Print local context-compression statistics and net-savings estimates.")
    .option("--json", "Print stable compression statistics JSON.")
    .action((commandOptions: StatsOptions) => {
      printCompressionStats(runtime, commandOptions);
    });

  program
    .command("doctor")
    .description("Verify this repository can run local-only Gleip commands.")
    .option("--agents", "Check supported coding-agent instruction files.")
    .option(
      "--fix",
      "Repair Gleip .gitignore protection and untrack recognized local runtime files."
    )
    .action(async (commandOptions: DoctorOptions) => {
      await doctor(runtime, commandOptions);
    });

  program
    .command("repair-agents")
    .description("Repair Gleip-managed sections in coding-agent instruction files.")
    .option("--all", "Create or repair all supported agent instruction files.")
    .action((commandOptions: RepairAgentsOptions) => {
      repairAgents(runtime, commandOptions);
    });

  program
    .command("stop")
    .description("Stop the active gleip preflight session.")
    .option("--clean", "Also remove generated brief, scope budget, and status files.")
    .action((commandOptions: StopOptions) => {
      stop(runtime, commandOptions);
    });

  program
    .command("uninstall")
    .description("Remove Gleip-generated files and managed agent sections.")
    .option("--dry-run", "Print planned cleanup actions without changing files.")
    .option("--keep-agent-files", "Keep AGENTS.md, CLAUDE.md, and GEMINI.md unchanged.")
    .option("--force", "Skip confirmation prompts; does not remove unrelated files.")
    .addHelpText(
      "after",
      [
        "",
        "Removes .gleip/, .gleip.yml, GLEIP.md, Gleip-managed sections in agent files,",
        "and empty Gleip-generated agent instruction files. Package dependencies are not changed.",
        "",
        "Next: run `npm uninstall gleip` to remove the package dependency."
      ].join("\n")
    )
    .action((commandOptions: UninstallOptions) => {
      uninstallRepository(runtime, commandOptions);
    });

  return program;
}

async function loadConfigFromPackage(cwd: string): Promise<unknown> {
  return loadBundledConfig(cwd);
}

async function classifyTaskFromPackage(task: string): Promise<TaskClassification> {
  return classifyBundledTask(task);
}

async function discoverRepoContextFromPackage(
  options: DiscoverRepoContextOptions
): Promise<RepoContext> {
  return (discoverBundledRepoContext as unknown as DiscoverRepoContext)(options);
}

async function createScopeBudgetFromPackage(input: CreateScopeBudgetInput): Promise<ScopeBudget> {
  return (createBundledScopeBudget as unknown as CreateScopeBudget)(input);
}

async function generateImplementationBriefFromPackage(
  input: GenerateImplementationBriefInput
): Promise<string> {
  return (generateBundledImplementationBrief as unknown as GenerateImplementationBrief)(input);
}

async function validateAgentPlanFromPackage(
  input: ValidateAgentPlanInput
): Promise<PlanValidationResult> {
  return (validateBundledAgentPlan as unknown as ValidateAgentPlan)(input);
}

async function collectWorkingTreeDiffFromPackage(
  options: CollectWorkingTreeDiffOptions
): Promise<GitDiffContext> {
  return collectBundledWorkingTreeDiff(options);
}

async function createSessionBaselineFromPackage(
  diff: GitDiffContext,
  createdAt: string
): Promise<SessionBaseline> {
  return createBundledSessionBaseline(diff, createdAt);
}

async function filterDiffSinceBaselineFromPackage(
  currentDiff: GitDiffContext,
  baseline: SessionBaseline | undefined,
  options?: { includeBaseline?: boolean }
): Promise<BaselineFilteredDiff> {
  return filterBundledDiffSinceBaseline(currentDiff, baseline, options);
}

async function detectScopeDriftFromPackage(input: DetectScopeDriftInput): Promise<DriftResult> {
  return detectBundledScopeDrift(input);
}

/**
 * The canonical requirement ledger for drift detection, when a canonical task exists.
 */
function requirementLedgerInput(
  cwd: string
): Pick<DetectScopeDriftInput, "requirementLedger"> | Record<string, never> {
  const canonical = readCanonicalTaskArtifact(cwd);

  return canonical === undefined ? {} : { requirementLedger: canonical.requirementLedger };
}

async function generateSessionReportFromPackage(
  input: GenerateSessionReportInput
): Promise<SessionReport> {
  return generateBundledSessionReport(input);
}

async function renderSessionReportMarkdownFromPackage(report: SessionReport): Promise<string> {
  return renderBundledSessionReportMarkdown(report);
}

interface ActiveEvidenceContext {
  runId: string;
  taskRevision: number;
  repositoryFingerprint: string;
  diff: GitDiffContext;
}

async function activeEvidenceContext(
  runtime: CommandRuntime,
  options: { create?: boolean } = {}
): Promise<ActiveEvidenceContext | undefined> {
  const diff = await runtime.collectWorkingTreeDiff({ cwd: runtime.cwd });

  if (!diff.isGitRepo) {
    return undefined;
  }

  const repositoryFingerprint = fingerprintRepositoryState(diff);
  const session = readJsonFile<GleipSession>(join(runtime.cwd, ".gleip", "session.json")).value;
  const activeRun = readJsonFile<{ runId?: string }>(
    join(runtime.cwd, ".gleip", "active-run.json")
  ).value;
  const canonical = readCanonicalTaskArtifact(runtime.cwd);
  const taskRevision =
    canonical?.revisions.length ??
    session?.taskRevision ??
    session?.canonicalTask?.revisionCount ??
    1;
  let runId = session?.evidenceRunId ?? activeRun?.runId;

  if (runId === undefined && options.create === true) {
    const createdAt = runtime.now().toISOString();
    runId = createEvidenceRun({
      cwd: runtime.cwd,
      createdAt,
      repositoryFingerprint,
      taskRevision
    }).runId;
    writeAtomicJson(join(runtime.cwd, ".gleip", "active-run.json"), { runId, createdAt });
  }

  if (runId !== undefined) {
    synchronizeEvidenceRun({
      cwd: runtime.cwd,
      runId,
      checkedAt: runtime.now().toISOString(),
      repositoryFingerprint,
      taskRevision
    });
  }

  return runId === undefined ? undefined : { runId, taskRevision, repositoryFingerprint, diff };
}

async function approveEvidence(runtime: CommandRuntime, options: ApprovalOptions): Promise<void> {
  const context = await activeEvidenceContext(runtime);

  if (context === undefined) {
    runtime.stderr("No active evidence run. Run `gleip preflight` or `gleip migrate` first.");
    runtime.setExitCode(1);
    return;
  }

  const approval = recordApproval({
    cwd: runtime.cwd,
    runId: context.runId,
    actor: options.actor,
    source: options.source ?? "local_cli",
    reason: options.reason,
    scope: options.scope,
    affectedPaths: options.path ?? [],
    findingIds: options.finding ?? [],
    repositoryFingerprint: context.repositoryFingerprint,
    taskRevision: context.taskRevision,
    createdAt: runtime.now().toISOString(),
    ...(options.expires === undefined ? {} : { expiresAt: options.expires })
  });
  runtime.stdout(
    options.json === true
      ? JSON.stringify(approval, null, 2)
      : `Approval recorded: ${approval.id} (${approval.scope})`
  );
}

async function revokeEvidenceApproval(
  runtime: CommandRuntime,
  approvalId: string,
  options: EvidenceJsonOptions
): Promise<void> {
  const context = await activeEvidenceContext(runtime);

  if (context === undefined) {
    runtime.stderr("No active evidence run.");
    runtime.setExitCode(1);
    return;
  }

  const approval = revokeApproval({
    cwd: runtime.cwd,
    runId: context.runId,
    approvalId,
    revokedAt: runtime.now().toISOString(),
    repositoryFingerprint: context.repositoryFingerprint,
    taskRevision: context.taskRevision
  });
  runtime.stdout(
    options.json === true ? JSON.stringify(approval, null, 2) : `Approval revoked: ${approval.id}`
  );
}

async function replayEvidence(
  runtime: CommandRuntime,
  requestedRunId: string | undefined,
  options: EvidenceJsonOptions
): Promise<void> {
  const context = requestedRunId === undefined ? await activeEvidenceContext(runtime) : undefined;
  const runId = requestedRunId ?? context?.runId;

  if (runId === undefined) {
    runtime.stderr("No evidence run selected.");
    runtime.setExitCode(1);
    return;
  }

  const state = replayRun(runtime.cwd, runId);
  const serializable = { ...state, findings: Object.fromEntries(state.findings) };
  runtime.stdout(
    options.json === true
      ? JSON.stringify(serializable, null, 2)
      : `Evidence run ${runId}: ${state.events.length} event(s), ${state.evidence.length} evidence item(s), ${state.approvals.length} approval(s); ledger verified.`
  );
}

async function recoverEvidence(
  runtime: CommandRuntime,
  requestedRunId: string | undefined,
  options: EvidenceJsonOptions
): Promise<void> {
  const context = requestedRunId === undefined ? await activeEvidenceContext(runtime) : undefined;
  const runId = requestedRunId ?? context?.runId;

  if (runId === undefined) {
    runtime.stderr("No evidence run selected.");
    runtime.setExitCode(1);
    return;
  }

  const result = recoverRunLedger(runtime.cwd, runId, runtime.now().toISOString());
  runtime.stdout(
    options.json === true
      ? JSON.stringify({ runId, ...result }, null, 2)
      : result.recovered
        ? `Recovered incomplete ledger tail for ${runId}. Preserved at ${result.recoveryPath}.`
        : `Evidence ledger ${runId} did not require recovery.`
  );
}

async function migrateEvidence(runtime: CommandRuntime, options: MigrationOptions): Promise<void> {
  const diff = await runtime.collectWorkingTreeDiff({ cwd: runtime.cwd });

  if (!diff.isGitRepo) {
    runtime.stderr(notGitRepositoryMessage());
    runtime.setExitCode(1);
    return;
  }

  const result = migrateLegacyArtifacts({
    cwd: runtime.cwd,
    createdAt: runtime.now().toISOString(),
    repositoryFingerprint: fingerprintRepositoryState(diff),
    dryRun: options.dryRun === true
  });

  if (result.run !== undefined) {
    writeAtomicJson(join(runtime.cwd, ".gleip", "active-run.json"), {
      runId: result.run.runId,
      createdAt: result.run.createdAt,
      migrated: true
    });
  }

  const output = {
    dryRun: options.dryRun === true,
    artifacts: result.artifacts,
    runId: result.run?.runId,
    warnings: result.warnings
  };
  runtime.stdout(
    options.json === true
      ? JSON.stringify(output, null, 2)
      : `${options.dryRun === true ? "Migration inspection" : "Migration"}: ${result.artifacts.length} legacy artifact(s)${result.run === undefined ? "." : ` imported into ${result.run.runId}.`}`
  );
}

async function finalizeEvidence(
  runtime: CommandRuntime,
  options: EvidenceJsonOptions
): Promise<void> {
  const context = await activeEvidenceContext(runtime);

  if (context === undefined) {
    runtime.stderr("No active evidence run. Run `gleip preflight` or `gleip migrate` first.");
    runtime.setExitCode(1);
    return;
  }

  const config = (await runtime.loadConfig(runtime.cwd)) as GleipConfigLike;
  const session = readJsonFile<GleipSession>(join(runtime.cwd, ".gleip", "session.json")).value;
  const canonical = readCanonicalTaskArtifact(runtime.cwd);
  const scopeBudget = readScopeBudget(runtime.cwd);
  const baseline = readBaseline(runtime.cwd);
  const filtered = await runtime.filterDiffSinceBaseline(context.diff, baseline);
  const driftResult =
    scopeBudget === undefined
      ? emptyDriftResult()
      : await runtime.detectScopeDrift({
          scopeBudget,
          gitDiffContext: filtered.diff,
          config,
          ...(canonical === undefined
            ? {}
            : { requirementLedger: canonical.requirementLedger })
        });
  // `finalize` is the designated completion authority, so it must see everything `report` sees.
  // It previously derived hazards from a fixed list of drift codes alone and never consulted the
  // requirement ledger, verification evidence, or plan validation -- so it could report
  // "complete, 0 hazards, exit 0" on the same state where `report` found a HIGH prohibited
  // violation and 25/100 readiness. Both surfaces now read one computation rather than two.
  const completionAttempt = latestValidationAttempt(session);
  const completionAccepted = latestSuccessfulPlanValidation(session);
  // `finalize` never passed the status artifact, so the verification gate read an empty string and
  // could not pass for any profile that expects verification. Read the attested commands as the
  // primary signal and the status artifact as the fallback, matching what `report` does.
  const completionVerification = verificationEvidenceForRun(runtime, context);
  const completionStatusContent = currentStatusContent(runtime, context.repositoryFingerprint);
  const completionReport =
    scopeBudget === undefined
      ? undefined
      : await runtime.generateSessionReport({
          version: GLEIP_VERSION,
          schemaVersion: REPORT_SCHEMA_VERSION,
          sessionId: session?.sessionId ?? null,
          generatedAt: runtime.now().toISOString(),
          phase: "final",
          repositoryFingerprint: context.repositoryFingerprint,
          scopeBudget,
          diff: filtered.diff,
          driftResult,
          baseline: filtered.baseline,
          ...(completionAttempt === undefined ? {} : { planValidation: completionAttempt }),
          ...(completionAccepted === undefined
            ? {}
            : { acceptedPlanValidation: completionAccepted }),
          ...(canonical === undefined
            ? {}
            : { requirementLedger: canonical.requirementLedger }),
          ...(completionStatusContent === undefined
            ? {}
            : { statusContent: completionStatusContent }),
          ...(completionVerification === undefined
            ? {}
            : { verificationEvidence: completionVerification }),
          missingArtifacts: []
        });
  const hazards = [
    ...completionHazards(driftResult.findings),
    ...requirementCompletionHazards(completionReport)
  ];
  const requiredCommands: RequiredCommand[] = (config.required_commands ?? []).map((command) => ({
    id: command.id,
    description: command.description,
    ...(command.executable === undefined ? {} : { executable: command.executable }),
    ...(command.argument_includes === undefined
      ? {}
      : { argumentIncludes: command.argument_includes })
  }));
  const bundle = finalizeEvidenceRun({
    cwd: runtime.cwd,
    runId: context.runId,
    createdAt: runtime.now().toISOString(),
    taskAuthority: {
      present: canonical !== undefined,
      revision: context.taskRevision,
      ...(canonical === undefined ? {} : { digest: canonical.contentHash })
    },
    repository: {
      fingerprint: context.repositoryFingerprint,
      ...(context.diff.head === undefined ? {} : { head: context.diff.head }),
      dirty: context.diff.hasChanges,
      changedPaths: context.diff.changedFiles
    },
    hazards,
    requiredCommands
  });
  const payload = {
    bundle,
    evidenceWarnings:
      session?.latestStatus === undefined ? ["No current status artifact was attached."] : []
  };
  runtime.stdout(
    options.json === true
      ? JSON.stringify(payload, null, 2)
      : [
          `Final evidence bundle: ${bundle.id}`,
          `Repository fingerprint: ${bundle.repository.fingerprint}`,
          `Completion status: ${bundle.completionStatus}`,
          `Unresolved completion hazards: ${bundle.unresolvedHazards.length}`,
          `Missing evidence: ${bundle.missingEvidence.length}`
        ].join("\n")
  );

  if (bundle.completionStatus !== "complete") {
    runtime.setExitCode(1);
  }
}

function completionHazards(findings: DriftFinding[]): CompletionHazard[] {
  const blockingCodes = new Set([
    "TEST_SKIPPED",
    "TEST_DELETED",
    "LOCAL_ARTIFACT_INCLUDED",
    "SECRET_FILE_CHANGED",
    "BLOCKED_PATH_CHANGED",
    "APPROVAL_REQUIRED_PATH_CHANGED",
    "DEPENDENCY_FILE_CHANGED",
    "LOCKFILE_CHANGED",
    "CI_FILE_CHANGED",
    "CANONICAL_PROHIBITION_CONFLICT"
  ]);
  const approvalCodes = new Set([
    "APPROVAL_REQUIRED_PATH_CHANGED",
    "DEPENDENCY_FILE_CHANGED",
    "LOCKFILE_CHANGED",
    "CI_FILE_CHANGED"
  ]);

  return findings
    .filter(
      (finding): finding is DriftFinding & { code: string } =>
        finding.code !== undefined && blockingCodes.has(finding.code)
    )
    .map((finding, index) => ({
      id: `hazard-${index + 1}-${finding.code.toLowerCase()}`,
      code: finding.code,
      message: finding.message,
      blocking: true,
      evidenceIds: [],
      approvalRequired: approvalCodes.has(finding.code)
    }));
}

/**
 * Completion hazards drawn from the shared session report: unresolved mandatory requirements,
 * violated prohibitions, and missing verification evidence. These are the obligations the
 * requirement ledger exists to track, and the completion surface has to see them.
 */
function requirementCompletionHazards(report: SessionReport | undefined): CompletionHazard[] {
  if (report === undefined) {
    return [];
  }

  const hazards: CompletionHazard[] = [];
  const { summary } = report.requirements;

  if (summary.prohibitedViolated > 0) {
    hazards.push({
      id: "hazard-requirements-prohibited",
      code: "CANONICAL_PROHIBITION_CONFLICT",
      message: `${summary.prohibitedViolated} prohibited canonical requirement(s) appear violated.`,
      blocking: true,
      evidenceIds: [],
      approvalRequired: true
    });
  }

  if (summary.mandatoryUnresolved > 0) {
    hazards.push({
      id: "hazard-requirements-unresolved",
      code: "CANONICAL_REQUIREMENT_MISSING",
      message: `${summary.mandatoryUnresolved} mandatory canonical requirement(s) are unresolved.`,
      blocking: true,
      evidenceIds: [],
      approvalRequired: false
    });
  }

  for (const warning of report.warnings) {
    if (
      warning.id === "review.verification-evidence-missing" ||
      warning.id === "output.tests-missing"
    ) {
      hazards.push({
        id: `hazard-${warning.id}`,
        code: "MISSING_TEST_STRATEGY",
        message: warning.message,
        blocking: true,
        evidenceIds: [],
        approvalRequired: false
      });
    }
  }

  return hazards;
}

function recordStatusEvidence(
  runtime: CommandRuntime,
  runId: string,
  input: {
    createdAt: string;
    repositoryFingerprint: string;
    taskRevision: number;
    status: string;
    driftResult: DriftResult;
  }
): void {
  const state = replayRun(runtime.cwd, runId);
  const currentFindings = new Map(
    input.driftResult.findings.map((finding) => {
      const findingId = `finding-${shortHash(
        `${finding.code ?? "UNKNOWN"}:${finding.file ?? ""}:${finding.title}`
      )}`;
      return [findingId, finding] as const;
    })
  );

  for (const [findingId, finding] of currentFindings) {
    const previous = state.findings.get(findingId);
    appendRunEvent(runtime.cwd, runId, {
      type: previous === undefined ? "finding_created" : "finding_updated",
      createdAt: input.createdAt,
      repositoryFingerprint: input.repositoryFingerprint,
      taskRevision: input.taskRevision,
      payload: { findingId, finding }
    });
  }

  for (const findingId of state.findings.keys()) {
    if (!currentFindings.has(findingId)) {
      appendRunEvent(runtime.cwd, runId, {
        type: "finding_resolved",
        createdAt: input.createdAt,
        repositoryFingerprint: input.repositoryFingerprint,
        taskRevision: input.taskRevision,
        payload: { findingId }
      });
    }
  }

  recordRunEvidence(runtime.cwd, runId, {
    evidenceClass: "policy_inference",
    source: { kind: "local_policy", name: "scope_drift" },
    createdAt: input.createdAt,
    repositoryFingerprint: input.repositoryFingerprint,
    taskRevision: input.taskRevision,
    payload: {
      status: input.driftResult.status,
      metrics: input.driftResult.metrics,
      findingCount: input.driftResult.findings.length
    }
  });
  recordRunEvidence(runtime.cwd, runId, {
    evidenceClass: "agent_claim",
    source: { kind: "generated_status", name: ".gleip/status.md" },
    createdAt: input.createdAt,
    repositoryFingerprint: input.repositoryFingerprint,
    taskRevision: input.taskRevision,
    payload: { content: input.status }
  });
}

async function compressCliContent(
  runtime: CommandRuntime,
  contentParts: string[],
  options: CompressionCommandOptions
): Promise<void> {
  const rawContent = contentParts.length > 0 ? contentParts.join(" ") : runtime.readStdin();
  const input = compressionInputFromOptions(runtime, rawContent, options);

  if (input === undefined) {
    return;
  }

  const result = compressContext(input, {
    cwd: runtime.cwd,
    now: runtime.now,
    auditOnly: options.audit === true,
    policy: await compressionPolicyForRuntime(runtime)
  });

  if (options.json === true) {
    runtime.stdout(JSON.stringify(compressionResultJson(result), null, 2));
    return;
  }

  if (options.audit === true) {
    runtime.stdout(formatCompressionAudit("input", result));
    return;
  }

  runtime.rawStdout(result.output);
}

/**
 * Resolve an executable name to a concrete path, honouring Windows PATHEXT.
 *
 * On Windows every npm-installed tool (`npm`, `npx`, `pnpm`, `tsc`, `eslint`, `vitest`, ...) is
 * a `.cmd` shim that a bare `spawnSync(name, ...)` cannot find, so the command fails with ENOENT.
 *
 * Returns the original name when nothing resolves, so spawn reports its usual ENOENT.
 */
function resolveExecutable(commandName: string, cwd: string): string {
  if (commandName.includes("/") || commandName.includes("\\")) {
    const direct = isAbsolute(commandName) ? commandName : resolve(cwd, commandName);
    return existsSync(direct) ? direct : commandName;
  }

  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .map((extension) => extension.trim())
          .filter((extension) => extension.length > 0)
      : [];
  // Windows never executes an extensionless file. `C:\Program Files\nodejs\npm` exists as a
  // POSIX sh shim next to `npm.cmd`, so matching the bare name first would resolve to a file
  // that cannot be spawned. Mirror cmd.exe: only try the bare name when it already carries a
  // PATHEXT extension, otherwise append each extension in PATHEXT order.
  const alreadyExecutable =
    extensions.length === 0 ||
    extensions.some((extension) => commandName.toLowerCase().endsWith(extension.toLowerCase()));
  const candidateNames = alreadyExecutable
    ? [commandName]
    : extensions.map((extension) => `${commandName}${extension}`);
  const searchDirectories = (process.env.PATH ?? "")
    .split(delimiter)
    .map((entry) => entry.trim().replace(/^"|"$/gu, ""))
    .filter((entry) => entry.length > 0);

  for (const directory of searchDirectories) {
    for (const candidateName of candidateNames) {
      const candidate = join(directory, candidateName);

      try {
        if (statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // Unreadable or missing PATH entry: keep searching.
      }
    }
  }

  return commandName;
}

/**
 * Escaping for a `cmd.exe /c` command line built with `windowsVerbatimArguments`.
 *
 * Node refuses to spawn `.cmd`/`.bat` files with `shell: false` (the CVE-2024-27980 mitigation),
 * so batch shims must go through `cmd.exe`. We do not use `shell: true`: that hands a raw string
 * to the shell and mangles arguments containing spaces or quotes. Instead we build the command
 * line with the escaping rules cmd.exe actually implements, which keeps argument boundaries
 * exact and metacharacters inert.
 *
 * The executable and its arguments need different treatment. The executable cannot be wrapped in
 * quotes (cmd strips the outer pair of the whole line under `/s`), so every metacharacter —
 * including the space in `C:\Program Files\nodejs\npm.CMD` — is caret-escaped instead.
 */
function escapeWindowsShimCommand(value: string): string {
  return value.replace(/[()[\]%!^"`<>&|;, *?]/gu, "^$&");
}

function escapeWindowsShimArgument(value: string): string {
  return (
    `"${value.replace(/(\\*)"/gu, '$1$1\\"').replace(/(\\*)$/u, "$1$1")}"`
      // Neutralise cmd.exe metacharacters so they cannot start a new command.
      .replace(/[<>"^|&%!()]/gu, "^$&")
  );
}

function isWindowsBatchShim(executablePath: string): boolean {
  return process.platform === "win32" && /\.(?:cmd|bat)$/iu.test(executablePath);
}

/**
 * Build the spawn target for a resolved executable, routing batch shims through cmd.exe.
 */
function spawnTarget(
  executablePath: string,
  childArgs: string[]
): { command: string; args: string[]; verbatim: boolean } {
  if (!isWindowsBatchShim(executablePath)) {
    return { command: executablePath, args: childArgs, verbatim: false };
  }

  const commandLine = [
    escapeWindowsShimCommand(executablePath),
    ...childArgs.map(escapeWindowsShimArgument)
  ].join(" ");

  return {
    command: process.env.ComSpec ?? "cmd.exe",
    // /d skips AutoRun scripts, /s makes the outer quoting rule predictable, /c runs and exits.
    args: ["/d", "/s", "/c", `"${commandLine}"`],
    verbatim: true
  };
}

async function runWrappedLocalCommand(
  runtime: CommandRuntime,
  commandAndArgs: string[],
  options: CompressionCommandOptions
): Promise<void> {
  const args = commandAndArgs[0] === "--" ? commandAndArgs.slice(1) : commandAndArgs;
  const commandName = args[0];

  if (commandName === undefined) {
    runtime.stderr("Usage: gleip run -- <command> [args...]");
    runtime.setExitCode(1);
    return;
  }

  if (!validateCompressionOptions(runtime, options)) {
    return;
  }

  const childArgs = args.slice(1);
  const startedAt = runtime.now().toISOString();
  const startedMs = Date.now();
  const evidenceContext = await activeEvidenceContext(runtime, { create: true });

  if (evidenceContext !== undefined) {
    appendRunEvent(runtime.cwd, evidenceContext.runId, {
      type: "command_started",
      createdAt: startedAt,
      repositoryFingerprint: evidenceContext.repositoryFingerprint,
      taskRevision: evidenceContext.taskRevision,
      payload: { executable: commandName, arguments: childArgs }
    });
  }

  const target = spawnTarget(resolveExecutable(commandName, runtime.cwd), childArgs);
  const result = spawnSync(target.command, target.args, {
    cwd: runtime.cwd,
    encoding: "utf8",
    shell: false,
    ...(target.verbatim ? { windowsVerbatimArguments: true } : {})
  });

  const sourceCommand = args.join(" ");
  const policy = await compressionPolicyForRuntime(runtime);
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const stdoutCompression =
    stdout.length === 0
      ? undefined
      : compressContext(
          commandOutputInputFromOptions(runtime, stdout, sourceCommand, options, "stdout"),
          {
            cwd: runtime.cwd,
            now: runtime.now,
            auditOnly: options.audit === true,
            policy
          }
        );
  const stderrCompression =
    stderr.length === 0
      ? undefined
      : compressContext(
          commandOutputInputFromOptions(runtime, stderr, sourceCommand, options, "stderr"),
          {
            cwd: runtime.cwd,
            now: runtime.now,
            auditOnly: options.audit === true,
            policy
          }
        );

  if (evidenceContext !== undefined) {
    const finishedAt = runtime.now().toISOString();
    const afterDiff = await runtime.collectWorkingTreeDiff({ cwd: runtime.cwd });
    const repositoryFingerprintAfter = afterDiff.isGitRepo
      ? fingerprintRepositoryState(afterDiff)
      : evidenceContext.repositoryFingerprint;
    recordCommandAttestation({
      cwd: runtime.cwd,
      runId: evidenceContext.runId,
      createdAt: finishedAt,
      repositoryFingerprint: repositoryFingerprintAfter,
      taskRevision: evidenceContext.taskRevision,
      payload: {
        executable: commandName,
        arguments: childArgs,
        workingDirectory: runtime.cwd,
        startedAt,
        finishedAt,
        durationMs: Math.max(0, Date.now() - startedMs),
        exitCode: result.status ?? 1,
        repositoryFingerprintBefore: evidenceContext.repositoryFingerprint,
        repositoryFingerprintAfter,
        environmentFingerprint: environmentFingerprint(),
        stdoutDigest: sha256Digest(stdout),
        stderrDigest: sha256Digest(stderr),
        fullOutputStored: true,
        outputCompressed:
          stdoutCompression?.compressed === true || stderrCompression?.compressed === true,
        ...(stdoutCompression?.reference === undefined
          ? {}
          : { stdoutReference: stdoutCompression.reference }),
        ...(stderrCompression?.reference === undefined
          ? {}
          : { stderrReference: stderrCompression.reference })
      },
      stdout,
      stderr
    });
    synchronizeEvidenceRun({
      cwd: runtime.cwd,
      runId: evidenceContext.runId,
      checkedAt: finishedAt,
      repositoryFingerprint: repositoryFingerprintAfter,
      taskRevision: evidenceContext.taskRevision
    });
  }

  if (result.error !== undefined) {
    runtime.stderr(`Command failed: ${formatError(result.error)}`);
    runtime.setExitCode(1);
    return;
  }

  if (options.json === true) {
    runtime.stdout(
      JSON.stringify(
        {
          command: sourceCommand,
          exitCode: result.status ?? 1,
          stdout:
            stdoutCompression === undefined ? undefined : compressionResultJson(stdoutCompression),
          stderr:
            stderrCompression === undefined ? undefined : compressionResultJson(stderrCompression)
        },
        null,
        2
      )
    );
  } else if (options.audit === true) {
    if (stdoutCompression !== undefined) {
      runtime.stdout(formatCompressionAudit("stdout", stdoutCompression));
    }
    if (stderrCompression !== undefined) {
      runtime.stderr(formatCompressionAudit("stderr", stderrCompression));
    }
  } else {
    if (stdoutCompression !== undefined) {
      runtime.rawStdout(stdoutCompression.output);
    }
    if (stderrCompression !== undefined) {
      runtime.stderr(stderrCompression.output);
    }
  }

  runtime.setExitCode(result.status ?? 1);
}

function retrieveCompressedContent(
  runtime: CommandRuntime,
  reference: string,
  options: RetrieveOptions
): void {
  const result = retrieveContextOriginal({ cwd: runtime.cwd, reference, now: runtime.now });

  if (!result.ok || result.content === undefined) {
    runtime.stderr(`[RETRIEVE_FAILED] ${result.error ?? "Unable to retrieve compression object."}`);
    runtime.setExitCode(1);
    return;
  }

  if (options.json === true) {
    runtime.stdout(
      JSON.stringify(
        {
          reference: result.reference,
          byteCount: result.byteCount,
          content: result.content
        },
        null,
        2
      )
    );
    return;
  }

  runtime.rawStdout(result.content);
}

function printCompressionStats(runtime: CommandRuntime, options: StatsOptions): void {
  const stats = readCompressionStats(runtime.cwd);

  if (options.json === true) {
    runtime.stdout(JSON.stringify(stats, null, 2));
    return;
  }

  runtime.stdout(
    [
      "Gleip context compression stats",
      `Objects: ${stats.objectCount}`,
      `Attempts: ${stats.compressionAttempts}`,
      `Compressed: ${stats.compressionApplied}`,
      `Passthrough: ${stats.passthroughCount}`,
      `Original bytes: ${stats.originalBytes}`,
      `Compressed bytes: ${stats.compressedBytes}`,
      `Gross estimated tokens removed: ${stats.grossEstimatedTokensRemoved}`,
      `Compression metadata tokens: ${stats.compressionMetadataTokens}`,
      `Retrieval calls: ${stats.retrievalCalls}`,
      `Retrieval estimated tokens: ${stats.retrievalEstimatedTokens}`,
      `Net estimated tokens saved: ${stats.netEstimatedTokensSaved}`
    ].join("\n")
  );
}

async function compressionPolicyForRuntime(
  runtime: CommandRuntime
): Promise<Partial<CompressionPolicy>> {
  try {
    const config = (await runtime.loadConfig(runtime.cwd)) as GleipConfigLike;
    return compressionPolicyFromConfig(config);
  } catch {
    return {};
  }
}

function compressionPolicyFromConfig(
  config: GleipConfigLike | undefined
): Partial<CompressionPolicy> {
  const raw = config?.compression;

  if (raw === undefined) {
    return {};
  }

  const policy: Partial<CompressionPolicy> = {};
  const defaultPolicy = defaultCompressionPolicy();

  if (typeof raw.enabled === "boolean") {
    policy.enabled = raw.enabled;
  }
  if (typeof raw.audit_only === "boolean") {
    policy.auditOnly = raw.audit_only;
  }
  if (typeof raw.min_input_bytes === "number") {
    policy.minInputBytes = raw.min_input_bytes;
  }
  if (typeof raw.min_estimated_tokens_saved === "number") {
    policy.minEstimatedTokensSaved = raw.min_estimated_tokens_saved;
  }
  if (isCompressionConfidence(raw.min_confidence)) {
    policy.minConfidence = raw.min_confidence;
  }
  if (raw.envelope_format === "human" || raw.envelope_format === "json") {
    policy.envelopeFormat = raw.envelope_format;
  }
  if (Array.isArray(raw.allowed_classes)) {
    const allowed = raw.allowed_classes
      .map((value) => parseCompressionContentClass(value))
      .filter((value): value is CompressionContentClass => value !== undefined)
      .filter((value) => defaultPolicy.allowedClasses.includes(value));

    if (allowed.length > 0) {
      policy.allowedClasses = allowed;
    }
  }

  return policy;
}

function compressionInputFromOptions(
  runtime: CommandRuntime,
  rawContent: string,
  options: CompressionCommandOptions
) {
  const contentType = parseCompressionContentClass(options.type);
  const authority = parseCompressionAuthority(options.authority);
  const lifecycle = parseCompressionLifecycle(options.lifecycle);

  if (options.type !== undefined && contentType === undefined) {
    runtime.stderr(`Unsupported compression content class: ${options.type}`);
    runtime.setExitCode(1);
    return undefined;
  }
  if (options.authority !== undefined && authority === undefined) {
    runtime.stderr(`Unsupported compression authority: ${options.authority}`);
    runtime.setExitCode(1);
    return undefined;
  }
  if (options.lifecycle !== undefined && lifecycle === undefined) {
    runtime.stderr(`Unsupported compression lifecycle: ${options.lifecycle}`);
    runtime.setExitCode(1);
    return undefined;
  }

  return {
    rawContent,
    ...(contentType === undefined ? {} : { contentType }),
    ...(options.artifactType === undefined ? {} : { artifactType: options.artifactType }),
    ...(authority === undefined ? {} : { authority }),
    ...(lifecycle === undefined ? {} : { lifecycle }),
    ...(options.sourceCommand === undefined ? {} : { sourceCommand: options.sourceCommand })
  };
}

function validateCompressionOptions(
  runtime: CommandRuntime,
  options: CompressionCommandOptions
): boolean {
  if (options.type !== undefined && parseCompressionContentClass(options.type) === undefined) {
    runtime.stderr(`Unsupported compression content class: ${options.type}`);
    runtime.setExitCode(1);
    return false;
  }

  if (
    options.authority !== undefined &&
    parseCompressionAuthority(options.authority) === undefined
  ) {
    runtime.stderr(`Unsupported compression authority: ${options.authority}`);
    runtime.setExitCode(1);
    return false;
  }

  if (
    options.lifecycle !== undefined &&
    parseCompressionLifecycle(options.lifecycle) === undefined
  ) {
    runtime.stderr(`Unsupported compression lifecycle: ${options.lifecycle}`);
    runtime.setExitCode(1);
    return false;
  }

  return true;
}

function commandOutputInputFromOptions(
  runtime: CommandRuntime,
  rawContent: string,
  sourceCommand: string,
  options: CompressionCommandOptions,
  streamName: "stdout" | "stderr"
) {
  return {
    ...(compressionInputFromOptions(runtime, rawContent, {
      ...options,
      sourceCommand
    }) ?? { rawContent, sourceCommand }),
    semanticSubtype: streamName,
    authority: "evidence" as const
  };
}

function compressionResultJson(
  result: ReturnType<typeof compressContext>
): Record<string, unknown> {
  return {
    compressed: result.compressed,
    auditOnly: result.auditOnly,
    classification: result.classification,
    passthroughReasons: result.passthroughReasons,
    reference: result.reference,
    envelope: result.envelope,
    metrics: result.metrics,
    output: result.compressed ? result.output : undefined
  };
}

function formatCompressionAudit(label: string, result: ReturnType<typeof compressContext>): string {
  return [
    `Compression audit: ${label}`,
    `Class: ${result.classification.contentClass}`,
    `Confidence: ${result.classification.confidence}`,
    `Authority: ${result.classification.authority}`,
    `Lifecycle: ${result.classification.lifecycle}`,
    `Decision: ${
      result.passthroughReasons.filter((reason) => reason !== "audit_only").length === 0
        ? "eligible"
        : "passthrough"
    }`,
    `Reasons: ${result.passthroughReasons.length === 0 ? "none" : result.passthroughReasons.join(", ")}`,
    `Original bytes: ${result.metrics.originalBytes}`,
    `Estimated original tokens: ${result.metrics.estimatedOriginalTokens}`
  ].join("\n");
}

function parseCompressionContentClass(
  value: string | undefined
): CompressionContentClass | undefined {
  if (value === undefined) {
    return undefined;
  }

  return compressionContentClasses.has(value as CompressionContentClass)
    ? (value as CompressionContentClass)
    : undefined;
}

function parseCompressionAuthority(value: string | undefined): CompressionAuthority | undefined {
  if (value === undefined) {
    return undefined;
  }

  return ["canonical", "derived", "evidence", "historical"].includes(value)
    ? (value as CompressionAuthority)
    : undefined;
}

function parseCompressionLifecycle(value: string | undefined): CompressionLifecycle | undefined {
  if (value === undefined) {
    return undefined;
  }

  return ["active", "superseded", "stale", "archived"].includes(value)
    ? (value as CompressionLifecycle)
    : undefined;
}

function isCompressionConfidence(value: unknown): value is CompressionPolicy["minConfidence"] {
  return value === "low" || value === "medium" || value === "high";
}

const compressionContentClasses = new Set<CompressionContentClass>([
  "test_output",
  "build_output",
  "log_output",
  "structured_json",
  "search_results",
  "file_listing",
  "command_output",
  "git_diff",
  "prose",
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
  "sensitive",
  "unknown"
]);

function initRepository(runtime: CommandRuntime, options: InitOptions): void {
  const force = options.force === true;
  const selection = initAgentInstructionFiles(runtime.cwd, options);
  const agentInstructions = selection.files;
  const agentInstructionFiles = agentInstructions.map((file) => file.path);

  ensureGleipGitignore(runtime.cwd);
  ensureGleipDirectory(runtime.cwd);
  writeGleipStateIfMissing(runtime.cwd, getDefaultGleipState(runtime.now().toISOString()), force);
  writeGeneratedFile(join(runtime.cwd, ".gleip.yml"), defaultConfigContent(), force);
  writeGeneratedFile(join(runtime.cwd, "GLEIP.md"), defaultGleipReadmeContent(), force);
  for (const file of agentInstructions) {
    writeAgentInstructionFile(join(runtime.cwd, file.path), file.defaultContent, file.target);
  }

  const output = [
    "Gleip initialized.",
    ...(selection.detectedTarget === undefined
      ? []
      : [`Detected agent target: ${selection.detectedTarget}.`]),
    `Agent instructions created/updated: ${agentInstructionFiles.join(", ")}.`
  ];
  const trackedRuntimeFiles = trackedGleipRuntimeFiles(runtime.cwd);

  if (trackedRuntimeFiles.length > 0) {
    output.push(
      `Tracked Gleip runtime files detected: ${trackedRuntimeFiles.join(", ")}.`,
      "Run `npx gleip doctor --fix` to remove them from the Git index while preserving local copies."
    );
  }

  runtime.stdout(output.join("\n"));
}

async function runPreflightCommand(
  runtime: CommandRuntime,
  taskParts: string[],
  options: PreflightOptions
): Promise<void> {
  const inlineTask = taskParts.join(" ").trim();

  if (inlineTask.length > 0 && options.file !== undefined) {
    runtime.stdout("Provide either inline task text or --file, not both.");
    runtime.setExitCode(1);
    return;
  }

  // An amendment revises stored session state, which plan mode exists precisely to avoid.
  if (options.planMode === true && options.amend === true) {
    runtime.stdout("--amend records a canonical revision and cannot run with --plan-mode.");
    runtime.setExitCode(1);
    return;
  }

  if (options.file !== undefined) {
    const taskPath = resolve(runtime.cwd, options.file);

    if (!existsSync(taskPath)) {
      runtime.stdout(`Task file not found: ${options.file}.`);
      runtime.setExitCode(1);
      return;
    }

    if (!statSync(taskPath).isFile()) {
      runtime.stdout(`Task file is not a file: ${options.file}.`);
      runtime.setExitCode(1);
      return;
    }

    const task = readFileSync(taskPath, "utf8");

    if (task.trim().length === 0) {
      runtime.stdout(`Task file is empty: ${options.file}.`);
      runtime.setExitCode(1);
      return;
    }

    await preflight(runtime, task, normalizeRepoRelativePath(runtime.cwd, taskPath), {
      amend: options.amend === true,
      planMode: options.planMode === true,
      json: options.json === true
    });
    return;
  }

  if (inlineTask.length === 0) {
    runtime.stdout(
      'No task text provided. Pass `gleip preflight "<task>"` or use `--file <path>`.'
    );
    runtime.setExitCode(1);
    return;
  }

  await preflight(runtime, inlineTask, undefined, {
    amend: options.amend === true,
    planMode: options.planMode === true,
    json: options.json === true
  });
}

async function preflight(
  runtime: CommandRuntime,
  task: string,
  taskFile?: string,
  options: { amend?: boolean; planMode?: boolean; json?: boolean } = {}
): Promise<void> {
  const state = loadGleipState(runtime.cwd);
  const createdAt = runtime.now().toISOString();
  const sessionPath = join(runtime.cwd, ".gleip", "session.json");
  const existingSession =
    options.amend === true ? readJsonFile<GleipSession>(sessionPath).value : undefined;

  if (options.amend === true && existingSession === undefined) {
    runtime.stdout(
      '[NO_ACTIVE_SESSION] action_required: No active Gleip session found. Run `npx gleip preflight "<task>"` before using --amend.'
    );
    runtime.setExitCode(1);
    return;
  }

  const sessionId =
    options.amend === true
      ? (existingSession?.sessionId ?? createSessionId(createdAt))
      : createSessionId(createdAt);
  const compatibilityBrief =
    options.amend === true ? readTextFile(join(runtime.cwd, ".gleip", "brief.md")) : undefined;
  const existingCanonical =
    options.amend === true
      ? (readCanonicalTaskArtifact(runtime.cwd) ??
        canonicalTaskFromCompatibleSession(existingSession, createdAt, compatibilityBrief))
      : undefined;
  const canonicalTask =
    options.amend === true && existingCanonical !== undefined
      ? appendCanonicalTaskRevision(existingCanonical, {
          content: task,
          createdAt,
          source: "amendment"
        })
      : createCanonicalTaskArtifact({
          content: task,
          createdAt,
          sessionId,
          source: taskFile === undefined ? "inline" : "file"
        });
  const effectiveTask = canonicalTask.effectiveContent;
  const config = (await runtime.loadConfig(runtime.cwd)) as GleipConfigLike;
  const classification = await runtime.classifyTask(effectiveTask);
  const contextFiles = Array.from(
    new Set(
      [
        ...(existingSession?.taskFile === undefined ? [] : [existingSession.taskFile]),
        ...(taskFile === undefined ? [] : [taskFile])
      ].map(normalizePlanPath)
    )
  );
  const repoContext = await runtime.discoverRepoContext({
    cwd: runtime.cwd,
    task: effectiveTask,
    contextFiles,
    config,
    classification
  });
  const scopeBudget = await runtime.createScopeBudget({
    task: effectiveTask,
    classification,
    repoContext,
    config
  });
  const implementationBrief = await runtime.generateImplementationBrief({
    task: effectiveTask,
    classification,
    repoContext,
    scopeBudget,
    canonicalTask: canonicalTaskReference(canonicalTask),
    requirementLedger: canonicalTask.requirementLedger,
    config
  });
  const baselineDiff = await runtime.collectWorkingTreeDiff({ cwd: runtime.cwd });

  if (!baselineDiff.isGitRepo) {
    runtime.stdout(notGitRepositoryMessage());
    return;
  }

  const existingBaseline = options.amend === true ? readBaseline(runtime.cwd) : undefined;
  const baseline =
    existingBaseline ?? (await runtime.createSessionBaseline(baselineDiff, createdAt));
  const initialDriftResult = emptyDriftResult();
  const brief = addBaselineNote(implementationBrief, baseline);
  const repositoryFingerprint = fingerprintRepositoryState(baselineDiff);
  const taskRevision = canonicalTask.revisions.length;

  // Plan mode stops here, before the first write. Everything above is pure computation, so the
  // guidance an agent gets while it cannot write is the same guidance the persisting run records.
  if (options.planMode === true) {
    runtime.stdout(
      formatCommandOutput(
        options.json === true
          ? JSON.stringify(
              planModePreflightJson(canonicalTask, scopeBudget, brief, classification),
              null,
              2
            )
          : planModePreflightSummary(brief, scopeBudget),
        state,
        "Manual preflight still ran.",
        options.json === true
      )
    );
    return;
  }

  ensureGleipGitignore(runtime.cwd);
  ensureGleipDirectory(runtime.cwd);
  const evidenceRunId =
    existingSession?.evidenceRunId ??
    createEvidenceRun({
      cwd: runtime.cwd,
      createdAt,
      repositoryFingerprint,
      taskRevision
    }).runId;
  synchronizeEvidenceRun({
    cwd: runtime.cwd,
    runId: evidenceRunId,
    checkedAt: createdAt,
    repositoryFingerprint,
    taskRevision
  });
  writeAtomicJson(join(runtime.cwd, ".gleip", "active-run.json"), {
    runId: evidenceRunId,
    createdAt
  });
  appendRunEvent(runtime.cwd, evidenceRunId, {
    type: options.amend === true ? "task_amended" : "task_captured",
    createdAt,
    repositoryFingerprint,
    taskRevision,
    payload: {
      taskId: canonicalTask.taskId,
      revisionId: canonicalTask.activeRevisionId,
      contentHash: canonicalTask.contentHash,
      source: taskFile === undefined ? (options.amend === true ? "amendment" : "inline") : "file"
    }
  });
  recordRunEvidence(runtime.cwd, evidenceRunId, {
    evidenceClass: "observed_fact",
    source: {
      kind: "canonical_task",
      name: canonicalTask.taskId,
      reference: ".gleip/canonical-task.json"
    },
    createdAt,
    repositoryFingerprint,
    taskRevision,
    payload: {
      activeRevisionId: canonicalTask.activeRevisionId,
      contentHash: canonicalTask.contentHash,
      requirementCount: canonicalTask.requirementLedger.requirements.length
    }
  });
  if (existingBaseline === undefined) {
    appendRunEvent(runtime.cwd, evidenceRunId, {
      type: "baseline_captured",
      createdAt,
      repositoryFingerprint,
      taskRevision,
      payload: { diffFingerprint: baseline.diffFingerprint }
    });
    recordRunEvidence(runtime.cwd, evidenceRunId, {
      evidenceClass: "observed_fact",
      source: { kind: "git", name: "working_tree_baseline", reference: ".gleip/baseline.json" },
      createdAt,
      repositoryFingerprint,
      taskRevision,
      payload: { ...summarizeBaseline(baseline) }
    });
  }
  writeCanonicalTaskArtifact(runtime.cwd, canonicalTask);
  writeAtomicJson(sessionPath, {
    ...(existingSession ?? {}),
    version: 1,
    schemaVersion: "1.3.0",
    sessionId,
    evidenceRunId,
    taskRevision,
    task: effectiveTask,
    canonicalTask: canonicalTaskSessionReference(canonicalTask),
    requirementLedgerSummary: requirementLedgerSummary(canonicalTask.requirementLedger),
    ...(taskFile === undefined
      ? existingSession?.taskFile === undefined
        ? {}
        : { taskFile: existingSession.taskFile }
      : { taskFile }),
    classification,
    repoContext,
    baseline: summarizeBaseline(baseline),
    scopeBudgetSummary: summarizeScopeBudget(scopeBudget),
    status: "ready",
    approval: "not_required",
    created_at: createdAt,
    updated_at: createdAt
  });
  if (existingBaseline === undefined) {
    writeAtomicJson(join(runtime.cwd, ".gleip", "baseline.json"), baseline);
  }
  writeAtomicText(join(runtime.cwd, ".gleip", "brief.md"), brief);
  writeAtomicText(
    join(runtime.cwd, ".gleip", "scope-budget.json"),
    scopeBudgetContent(scopeBudget)
  );
  writeAtomicText(
    join(runtime.cwd, ".gleip", "status.md"),
    statusContent(
      initialDriftResult,
      nextActionForReport(initialDriftResult),
      baselineContextForPreflight(baseline),
      {
        phase: "preflight",
        generatedAt: createdAt,
        repositoryFingerprint,
        sessionId,
        currentArtifact: ".gleip/status.md"
      }
    )
  );

  const output = [
    options.amend === true
      ? "Gleip task amendment recorded · brief and scope budget refreshed"
      : "Gleip preflight complete · brief and scope budget ready",
    "Artifacts: .gleip/canonical-task.json, .gleip/brief.md, .gleip/scope-budget.json",
    scopeBudget.planRequired === false
      ? "Next: implement the scoped change, run verification, then run status"
      : "Next: validate plan before editing"
  ];

  const disabledNote = disabledStateNote(state, "Manual preflight still ran.");

  if (disabledNote !== undefined) {
    output.push("", disabledNote);
  }

  runtime.stdout(output.join("\n"));
}

function printBrief(runtime: CommandRuntime): void {
  const briefPath = join(runtime.cwd, ".gleip", "brief.md");

  if (!existsSync(briefPath)) {
    reportNoActiveSession(runtime);
    return;
  }

  runtime.stdout(readFileSync(briefPath, "utf8").trimEnd());
}

async function validatePlan(
  runtime: CommandRuntime,
  planTextParts: string[],
  options: ValidatePlanOptions
): Promise<void> {
  const sessionPath = join(runtime.cwd, ".gleip", "session.json");
  const state = loadGleipState(runtime.cwd);
  const planMode = options.planMode === true;

  if (!planMode && (options.task !== undefined || options.taskFile !== undefined)) {
    runtime.stdout("--task and --task-file require --plan-mode.");
    runtime.setExitCode(1);
    return;
  }

  if (options.task !== undefined && options.taskFile !== undefined) {
    runtime.stdout("Provide either --task or --task-file, not both.");
    runtime.setExitCode(1);
    return;
  }

  // A plan exists before the session that would normally hold it: in a read-only planning mode the
  // agent cannot run preflight first. Given --task, derive the same canonical task and scope budget
  // preflight would have written, in memory, so the verdict does not depend on prior persistence.
  const ephemeral = planMode
    ? await ephemeralPlanContext(runtime, options)
    : { ok: true as const, context: undefined };

  if (!ephemeral.ok) {
    return;
  }

  if (ephemeral.context === undefined && !existsSync(sessionPath)) {
    if (planMode) {
      runtime.stdout(
        'No active Gleip session. In plan mode, pass the task: `gleip validate-plan --plan-mode --task "<task>" "<plan>"`.'
      );
      runtime.setExitCode(1);
      return;
    }

    reportNoActiveSession(runtime);
    return;
  }

  const scopeBudget = ephemeral.context?.scopeBudget ?? readScopeBudget(runtime.cwd);

  if (scopeBudget === undefined) {
    runtime.stdout(
      'No scope budget found for this session. Re-run `npx --no-install gleip preflight "<task>"`.'
    );
    return;
  }

  const planInput = readPlanText(runtime, planTextParts, options);

  if (planInput === undefined) {
    return;
  }

  if (planInput.text.trim().length === 0) {
    runtime.stdout(
      'No plan text provided. Pass `npx --no-install gleip validate-plan "<plan>"`, use `--file <file>`, or pipe a plan on stdin.'
    );
    runtime.setExitCode(1);
    return;
  }

  const config = (await runtime.loadConfig(runtime.cwd)) as GleipConfigLike;
  const session = readJsonFile<GleipSession>(sessionPath);
  const compatibilityCanonical =
    ephemeral.context?.canonicalTask ??
    readCanonicalTaskArtifact(runtime.cwd) ??
    canonicalTaskFromCompatibleSession(
      session.value,
      runtime.now().toISOString(),
      readTextFile(join(runtime.cwd, ".gleip", "brief.md"))
    );

  if (
    !planMode &&
    compatibilityCanonical !== undefined &&
    readCanonicalTaskArtifact(runtime.cwd) === undefined
  ) {
    ensureGleipGitignore(runtime.cwd);
    writeCanonicalTaskArtifact(runtime.cwd, compatibilityCanonical);
  }

  // activeEvidenceContext synchronizes the run, which takes the write lock and can append events.
  const evidenceContext = planMode ? undefined : await activeEvidenceContext(runtime);

  if (evidenceContext !== undefined) {
    appendRunEvent(runtime.cwd, evidenceContext.runId, {
      type: "plan_submitted",
      createdAt: runtime.now().toISOString(),
      repositoryFingerprint: evidenceContext.repositoryFingerprint,
      taskRevision: evidenceContext.taskRevision,
      payload: { planDigest: sha256Digest(planInput.text), planFile: planInput.planFile ?? null }
    });
  }

  const rawResult = await runtime.validateAgentPlan({
    planText: planInput.text,
    scopeBudget,
    config,
    cwd: runtime.cwd,
    taskText: compatibilityCanonical?.effectiveContent ?? session.value?.task ?? "",
    ...(compatibilityCanonical === undefined
      ? {}
      : { requirementLedger: compatibilityCanonical.requirementLedger }),
    contextFiles: planInput.planFile === undefined ? [] : [planInput.planFile]
  });
  const result = passivePlanValidationResult(rawResult, scopeBudget);
  // Passive mode softens how a verdict is *presented*; it must not change what the verdict
  // grants. Gating scope promotion on the downgraded status let a plan that conflicted with a
  // user prohibition be recorded as the latest successful validation, and its targets then
  // replaced expectedPaths and were stripped out of readOnlyContextPaths -- so re-running
  // validate-plan quietly converted a rejected plan into accepted scope.
  const planAccepted = isSuccessfulPlanValidationStatus(rawResult.status);

  if (evidenceContext !== undefined) {
    recordRunEvidence(
      runtime.cwd,
      evidenceContext.runId,
      {
        evidenceClass: "policy_inference",
        source: { kind: "local_policy", name: "plan_validation" },
        createdAt: runtime.now().toISOString(),
        repositoryFingerprint: evidenceContext.repositoryFingerprint,
        taskRevision: evidenceContext.taskRevision,
        payload: {
          status: result.status,
          rawStatus: rawResult.status,
          planRequired: scopeBudget.planRequired === true,
          findings: result.findings
        }
      },
      planAccepted ? "plan_validation_completed" : "plan_validation_rejected"
    );
  }

  if (session.value !== undefined && !planMode) {
    const updatedAt = runtime.now().toISOString();
    const validationRecord = {
      ...result,
      validatedAt: updatedAt
    };
    const refinedScopeBudget = planAccepted
      ? scopeBudgetWithValidatedPlanScope(scopeBudget, validationRecord)
      : scopeBudget;
    const refinedClassification =
      session.value.classification === undefined
        ? session.value.classification
        : {
            ...session.value.classification,
            taskType: refinedScopeBudget.taskType,
            confidence: refinedScopeBudget.confidence,
            riskLevel: refinedScopeBudget.riskLevel,
            workflowProfile: refinedScopeBudget.workflowProfile
          };
    ensureGleipGitignore(runtime.cwd);
    if (planAccepted) {
      writeAtomicText(
        join(runtime.cwd, ".gleip", "scope-budget.json"),
        scopeBudgetContent(refinedScopeBudget)
      );
    }
    writeAtomicJson(sessionPath, {
      ...session.value,
      ...(compatibilityCanonical === undefined
        ? {}
        : {
            task: compatibilityCanonical.effectiveContent,
            canonicalTask: canonicalTaskSessionReference(compatibilityCanonical),
            requirementLedgerSummary: requirementLedgerSummary(
              compatibilityCanonical.requirementLedger
            )
          }),
      ...(refinedClassification === undefined ? {} : { classification: refinedClassification }),
      scopeBudgetSummary: summarizeScopeBudget(refinedScopeBudget),
      latestValidationAttempt: validationRecord,
      latestPlanValidation: validationRecord,
      ...(planAccepted
        ? {
            latestSuccessfulValidation: validationRecord,
            latestSuccessfulPlanValidation: validationRecord
          }
        : {}),
      updated_at: updatedAt
    });
  }
  const output =
    options.json === true
      ? JSON.stringify(
          planMode
            ? { ...planValidationJson(result), mode: "plan_mode", persisted: false }
            : planValidationJson(result),
          null,
          2
        )
      : planMode
        ? [
            planValidationInteractionSummary(result),
            "Gleip plan mode · nothing was written. Re-run without --plan-mode to record this validation."
          ].join("\n")
        : planValidationInteractionSummary(result);

  runtime.stdout(
    formatCommandOutput(
      output,
      state,
      "Plan validation can still be checked manually.",
      options.json === true
    )
  );
}

/**
 * Build the canonical task and scope budget a plan-mode validation needs when no session exists.
 *
 * This deliberately reuses the same runtime entry points `preflight` uses, so a plan-mode verdict
 * cannot drift from the verdict the persisting run would produce.
 */
async function ephemeralPlanContext(
  runtime: CommandRuntime,
  options: ValidatePlanOptions
): Promise<
  | { ok: true; context: { canonicalTask: CanonicalTaskArtifact; scopeBudget: ScopeBudget } }
  | { ok: true; context: undefined }
  | { ok: false }
> {
  let taskText = options.task;

  if (options.taskFile !== undefined) {
    const taskPath = resolve(runtime.cwd, options.taskFile);

    if (!existsSync(taskPath) || !statSync(taskPath).isFile()) {
      runtime.stdout(`Task file not found: ${options.taskFile}.`);
      runtime.setExitCode(1);
      return { ok: false };
    }

    taskText = readFileSync(taskPath, "utf8");
  }

  if (taskText === undefined || taskText.trim().length === 0) {
    if (options.task !== undefined || options.taskFile !== undefined) {
      runtime.stdout("Task text is empty.");
      runtime.setExitCode(1);
      return { ok: false };
    }

    return { ok: true, context: undefined };
  }

  const createdAt = runtime.now().toISOString();
  const canonicalTask = createCanonicalTaskArtifact({
    content: taskText,
    createdAt,
    sessionId: createSessionId(createdAt),
    source: options.taskFile === undefined ? "inline" : "file"
  });
  const effectiveTask = canonicalTask.effectiveContent;
  const config = (await runtime.loadConfig(runtime.cwd)) as GleipConfigLike;
  const classification = await runtime.classifyTask(effectiveTask);
  const repoContext = await runtime.discoverRepoContext({
    cwd: runtime.cwd,
    task: effectiveTask,
    contextFiles: options.taskFile === undefined ? [] : [normalizePlanPath(options.taskFile)],
    config,
    classification
  });
  const scopeBudget = await runtime.createScopeBudget({
    task: effectiveTask,
    classification,
    repoContext,
    config
  });

  return { ok: true, context: { canonicalTask, scopeBudget } };
}

function readPlanText(
  runtime: CommandRuntime,
  planTextParts: string[],
  options: ValidatePlanOptions
): { text: string; planFile?: string } | undefined {
  if (options.file !== undefined && planTextParts.length > 0) {
    runtime.stdout("Provide either inline plan text or --file, not both.");
    runtime.setExitCode(1);
    return undefined;
  }

  if (options.file !== undefined) {
    const planPath = resolve(runtime.cwd, options.file);

    if (!existsSync(planPath)) {
      runtime.stdout(`Plan file not found: ${options.file}.`);
      runtime.setExitCode(1);
      return undefined;
    }

    if (!statSync(planPath).isFile()) {
      runtime.stdout(`Plan file is not a file: ${options.file}.`);
      runtime.setExitCode(1);
      return undefined;
    }

    const text = readFileSync(planPath, "utf8");

    if (text.trim().length === 0) {
      runtime.stdout(`Plan file is empty: ${options.file}.`);
      runtime.setExitCode(1);
      return undefined;
    }

    return {
      text,
      planFile: normalizeRepoRelativePath(runtime.cwd, planPath)
    };
  }

  if (planTextParts.length > 0) {
    return { text: planTextParts.join(" ") };
  }

  if (!process.stdin.isTTY) {
    return { text: runtime.readStdin() };
  }

  return { text: "" };
}

function printGleipState(runtime: CommandRuntime): void {
  const state = loadGleipState(runtime.cwd);

  if (state === undefined) {
    runtime.stdout("No gleip state found. Run `npx gleip init` first.");
    return;
  }

  const lines = [
    "gleip state",
    `Status: ${state.enabled ? "enabled" : "disabled"}`,
    `Updated: ${state.updatedAt}`
  ];

  if (state.reason !== null) {
    lines.push(`Reason: ${state.reason}`);
  }

  runtime.stdout(lines.join("\n"));
}

interface PrintStatusOptions {
  allowMissingSession?: boolean;
  ci?: boolean;
  compact?: boolean;
  commandName?: "check" | "status";
  disabledSuffix?: string;
  includeBaseline?: boolean;
  incremental?: boolean;
  force?: boolean;
  json?: boolean;
  planMode?: boolean;
  writeStatusFile?: boolean;
  updateSession?: boolean;
}

async function printStatus(
  runtime: CommandRuntime,
  options: PrintStatusOptions = {}
): Promise<void> {
  const sessionPath = join(runtime.cwd, ".gleip", "session.json");
  const state = loadGleipState(runtime.cwd);

  if (!existsSync(sessionPath)) {
    if (options.allowMissingSession === true) {
      await printCheckWithoutSession(runtime, options);
      return;
    }

    reportNoActiveSession(runtime);
    return;
  }

  const session = JSON.parse(readFileSync(sessionPath, "utf8")) as GleipSession;
  const updatedAt = runtime.now().toISOString();
  const canonicalTask =
    readCanonicalTaskArtifact(runtime.cwd) ??
    canonicalTaskFromCompatibleSession(
      session,
      updatedAt,
      readTextFile(join(runtime.cwd, ".gleip", "brief.md"))
    );
  const task = canonicalTask?.effectiveContent ?? session.task ?? "Unknown task";
  const classification = session.classification ?? (await runtime.classifyTask(task));
  const repoContext = session.repoContext ?? emptyRepoContext();
  const scopePlanValidation = latestSuccessfulPlanValidation(session);
  const scopeBudget = scopeBudgetWithValidatedPlanScope(
    readScopeBudget(runtime.cwd) ??
      scopeBudgetFromSummary(session.scopeBudgetSummary, classification),
    scopePlanValidation
  );
  const config = (await runtime.loadConfig(runtime.cwd)) as GleipConfigLike;
  const gitDiffContext = await runtime.collectWorkingTreeDiff({ cwd: runtime.cwd });

  if (!gitDiffContext.isGitRepo) {
    runtime.stdout(notGitRepositoryMessage());
    return;
  }

  const baseline = readBaseline(runtime.cwd);
  const filtered = await runtime.filterDiffSinceBaseline(gitDiffContext, baseline, {
    includeBaseline: options.includeBaseline === true
  });
  const repositoryFingerprint = fingerprintRepositoryState(gitDiffContext);
  const fingerprint = createCheckStateFingerprint(runtime.cwd, {
    repositoryFingerprint,
    session,
    state,
    baseline,
    scopeBudget,
    config,
    includeBaseline: options.includeBaseline === true
  });
  const cached =
    options.incremental === true || options.compact === true
      ? readCompatibleCheckCache(runtime.cwd)
      : undefined;
  const reused =
    cached !== undefined && cached.fingerprint === fingerprint && options.force !== true;
  const driftResult = reused
    ? cached.result.driftResult
    : normalizedCheckResult(
        await runtime.detectScopeDrift({
          scopeBudget,
          gitDiffContext: filtered.diff,
          config,
          ...requirementLedgerInput(runtime.cwd)
        })
      );
  const nextAction = nextActionForReport(driftResult);
  const completeResult: CachedCheckResult = {
    driftResult,
    nextAction,
    baseline: filtered.baseline
  };

  if (
    printEfficiencyMode(runtime, options, state, {
      fingerprint,
      repositoryFingerprint,
      cached,
      reused,
      completeResult,
      createdAt: updatedAt,
      session,
      task
    })
  ) {
    return;
  }

  const status = statusContent(driftResult, nextAction, filtered.baseline, {
    phase: "verification",
    generatedAt: updatedAt,
    repositoryFingerprint,
    sessionId: session.sessionId ?? null,
    currentArtifact: ".gleip/status.md"
  });

  if (options.writeStatusFile !== false) {
    ensureGleipGitignore(runtime.cwd);
    writeAtomicText(join(runtime.cwd, ".gleip", "status.md"), status);
  }

  // Evidence recording sat outside both write guards, so `check` -- which passes
  // writeStatusFile:false and updateSession:false -- still appended to the run ledger. Plan mode
  // has to mean no write at all, so this is now guarded like every other write on this path.
  if (session.evidenceRunId !== undefined && options.planMode !== true) {
    recordStatusEvidence(runtime, session.evidenceRunId, {
      createdAt: updatedAt,
      repositoryFingerprint,
      taskRevision:
        canonicalTask?.revisions.length ??
        session.taskRevision ??
        session.canonicalTask?.revisionCount ??
        1,
      status,
      driftResult
    });
  }

  if (options.updateSession !== false) {
    ensureGleipGitignore(runtime.cwd);
    if (canonicalTask !== undefined && readCanonicalTaskArtifact(runtime.cwd) === undefined) {
      writeCanonicalTaskArtifact(runtime.cwd, canonicalTask);
    }
    writeAtomicJson(sessionPath, {
      ...session,
      ...(canonicalTask === undefined
        ? {}
        : {
            task: canonicalTask.effectiveContent,
            canonicalTask: canonicalTaskSessionReference(canonicalTask),
            requirementLedgerSummary: requirementLedgerSummary(canonicalTask.requirementLedger)
          }),
      classification,
      repoContext,
      scopeBudgetSummary: summarizeScopeBudget(scopeBudget),
      status: driftResult.status,
      approval: driftResult.status === "needs_approval" ? "required" : "not_required",
      latestStatus: {
        artifact: artifactMetadata({
          phase: "verification",
          generatedAt: updatedAt,
          repositoryFingerprint,
          sessionId: session.sessionId ?? null,
          currentArtifact: ".gleip/status.md"
        }),
        status: driftResult.status,
        summary: driftResult.summary,
        metrics: driftResult.metrics,
        baseline: filtered.baseline,
        nextAction,
        updated_at: updatedAt
      },
      updated_at: updatedAt
    });
  }

  runtime.stdout(
    formatCommandOutput(
      options.json === true
        ? JSON.stringify(
            statusJson(driftResult, nextAction, filtered.baseline, {
              phase: "verification",
              generatedAt: updatedAt,
              repositoryFingerprint,
              sessionId: session.sessionId ?? null,
              currentArtifact: ".gleip/status.md"
            }),
            null,
            2
          )
        : statusInteractionSummary(
            options.commandName ?? "status",
            driftResult,
            nextAction,
            filtered.baseline,
            config
          ),
      state,
      options.disabledSuffix ?? "Status can still be checked manually.",
      options.json === true
    )
  );

  applyCiExitCode(runtime, options, driftResult.findings);
}

async function printReport(runtime: CommandRuntime, options: ReportOptions): Promise<void> {
  const generatedAt = runtime.now().toISOString();
  const missingArtifacts: string[] = [];
  const sessionResult = readJsonFile<GleipSession>(join(runtime.cwd, ".gleip", "session.json"));
  const scopeBudgetResult = readJsonFile<ScopeBudget>(
    join(runtime.cwd, ".gleip", "scope-budget.json")
  );
  const baselineResult = readJsonFile<SessionBaseline>(
    join(runtime.cwd, ".gleip", "baseline.json")
  );
  const statusResult = readTextFile(join(runtime.cwd, ".gleip", "status.md"));
  const canonicalTask =
    readCanonicalTaskArtifact(runtime.cwd) ??
    canonicalTaskFromCompatibleSession(
      sessionResult.value,
      generatedAt,
      readTextFile(join(runtime.cwd, ".gleip", "brief.md"))
    );

  if (sessionResult.value === undefined) {
    missingArtifacts.push("session.json");
  }

  if (sessionResult.value !== undefined && canonicalTask === undefined) {
    missingArtifacts.push("canonical-task.json");
  }

  if (scopeBudgetResult.value === undefined) {
    missingArtifacts.push("scope-budget.json");
  }

  if (baselineResult.value === undefined) {
    missingArtifacts.push("baseline.json");
  }

  if (statusResult === undefined) {
    missingArtifacts.push("status.md");
  }

  const config = await loadConfigForReport(runtime);
  const scopeBudget =
    scopeBudgetResult.value === undefined
      ? config === undefined
        ? undefined
        : defaultScopeBudgetForCheck(config)
      : scopeBudgetWithValidatedPlanScope(
          scopeBudgetResult.value,
          latestSuccessfulPlanValidation(sessionResult.value)
        );
  const gitDiffContext = await runtime.collectWorkingTreeDiff({ cwd: runtime.cwd });
  const repositoryFingerprint = fingerprintRepositoryState(gitDiffContext);
  const filtered =
    baselineResult.value === undefined
      ? {
          diff: gitDiffContext,
          baseline: {
            hasBaseline: false,
            preExistingFilesIgnored: 0,
            sessionFilesChanged: gitDiffContext.changedFiles.length,
            includeBaseline: false,
            possiblyPreExistingFiles: []
          }
        }
      : await runtime.filterDiffSinceBaseline(gitDiffContext, baselineResult.value);
  const driftResult =
    scopeBudget === undefined
      ? driftResultWithoutBudget(filtered.diff)
      : normalizeDriftResult(
          await runtime.detectScopeDrift({
            scopeBudget,
            gitDiffContext: filtered.diff,
            config: config ?? {},
            ...requirementLedgerInput(runtime.cwd)
          })
        );
  const latestAttempt = latestValidationAttempt(sessionResult.value);
  const acceptedValidation = latestSuccessfulPlanValidation(sessionResult.value);
  const reportRunId = readJsonFile<{ runId: string }>(
    join(runtime.cwd, ".gleip", "active-run.json")
  ).value?.runId;
  const reportVerification =
    reportRunId === undefined
      ? undefined
      : verificationEvidenceForRun(runtime, {
          runId: reportRunId,
          repositoryFingerprint,
          taskRevision: canonicalTask?.revisions.length ?? 1
        });
  const report = await runtime.generateSessionReport({
    version: GLEIP_VERSION,
    schemaVersion: REPORT_SCHEMA_VERSION,
    sessionId: sessionResult.value?.sessionId ?? null,
    generatedAt,
    phase: "final",
    repositoryFingerprint,
    ...(scopeBudget === undefined ? {} : { scopeBudget }),
    diff: filtered.diff,
    driftResult,
    baseline: filtered.baseline,
    ...(latestAttempt === undefined ? {} : { planValidation: latestAttempt }),
    ...(acceptedValidation === undefined ? {} : { acceptedPlanValidation: acceptedValidation }),
    ...(canonicalTask === undefined ? {} : { requirementLedger: canonicalTask.requirementLedger }),
    ...(statusResult === undefined || !isCurrentStatusContent(statusResult, repositoryFingerprint)
      ? {}
      : { statusContent: statusResult }),
    // `report` and `finalize` must agree on what counts as verification, so both read attestations.
    ...(reportVerification === undefined ? {} : { verificationEvidence: reportVerification }),
    missingArtifacts
  });
  const markdown = await runtime.renderSessionReportMarkdown(report);

  ensureGleipGitignore(runtime.cwd);
  ensureGleipDirectory(runtime.cwd);
  if (canonicalTask !== undefined && readCanonicalTaskArtifact(runtime.cwd) === undefined) {
    writeCanonicalTaskArtifact(runtime.cwd, canonicalTask);
  }
  writeAtomicJson(join(runtime.cwd, ".gleip", "report.json"), report);
  writeAtomicText(join(runtime.cwd, ".gleip", "report.md"), markdown);

  if (options.json === true) {
    runtime.stdout(JSON.stringify(report, null, 2));
    return;
  }

  runtime.stdout(reportInteractionSummary(report));
}

async function printCheckWithoutSession(
  runtime: CommandRuntime,
  options: PrintStatusOptions
): Promise<void> {
  const state = loadGleipState(runtime.cwd);
  const config = (await runtime.loadConfig(runtime.cwd)) as GleipConfigLike;
  const gitDiffContext = await runtime.collectWorkingTreeDiff({ cwd: runtime.cwd });

  if (!gitDiffContext.isGitRepo) {
    runtime.stdout(notGitRepositoryMessage());
    return;
  }

  const baseline: BaselineContext = {
    hasBaseline: false,
    preExistingFilesIgnored: 0,
    sessionFilesChanged: gitDiffContext.changedFiles.length,
    includeBaseline: options.includeBaseline === true,
    possiblyPreExistingFiles: []
  };
  const scopeBudget = defaultScopeBudgetForCheck(config);
  const repositoryFingerprint = fingerprintRepositoryState(gitDiffContext);
  const fingerprint = createCheckStateFingerprint(runtime.cwd, {
    repositoryFingerprint,
    state,
    scopeBudget,
    config,
    includeBaseline: options.includeBaseline === true
  });
  const cached =
    options.incremental === true || options.compact === true
      ? readCompatibleCheckCache(runtime.cwd)
      : undefined;
  const reused =
    cached !== undefined && cached.fingerprint === fingerprint && options.force !== true;
  const driftResult = reused
    ? cached.result.driftResult
    : normalizedCheckResult(
        await runtime.detectScopeDrift({
          scopeBudget,
          gitDiffContext,
          config,
          ...requirementLedgerInput(runtime.cwd)
        })
      );
  const nextAction = nextActionForReport(driftResult);
  const completeResult = { driftResult, nextAction, baseline };

  if (
    printEfficiencyMode(runtime, options, state, {
      fingerprint,
      repositoryFingerprint,
      cached,
      reused,
      completeResult,
      createdAt: runtime.now().toISOString(),
      task: "No active task"
    })
  ) {
    return;
  }

  runtime.stdout(
    formatCommandOutput(
      options.json === true
        ? JSON.stringify(statusJson(driftResult, nextAction, baseline), null, 2)
        : statusInteractionSummary(
            options.commandName ?? "check",
            driftResult,
            nextAction,
            baseline,
            config
          ),
      state,
      options.disabledSuffix ?? "Check can still be run manually.",
      options.json === true
    )
  );

  applyCiExitCode(runtime, options, driftResult.findings);
}

async function doctor(runtime: CommandRuntime, options: DoctorOptions = {}): Promise<void> {
  if (options.agents === true) {
    doctorAgents(runtime);
    return;
  }

  if (options.fix === true) {
    doctorFix(runtime);
    return;
  }

  const checks = ["Setup:", ...setupDiagnosticLines(runtime.cwd), "", "Environment:"];
  let failed = false;

  if (isInsideGitRepository(runtime.cwd)) {
    checks.push("OK git repository detected.");
  } else {
    failed = true;
    checks.push(`FAIL ${notGitRepositoryMessage()}`);
  }

  try {
    await runtime.loadConfig(runtime.cwd);
    checks.push("OK .gleip.yml can be loaded.");
  } catch (error) {
    failed = true;
    checks.push(`FAIL .gleip.yml could not be loaded: ${formatError(error)}`);
  }

  if (isSupportedNodeVersion(runtime.nodeVersion)) {
    checks.push(`OK Node ${runtime.nodeVersion} is supported.`);
  } else {
    failed = true;
    checks.push(`FAIL Node ${runtime.nodeVersion} is not supported. Gleip requires Node >=20.`);
  }

  try {
    ensureGleipDirectory(runtime.cwd);
    checks.push("OK .gleip/ exists or can be created.");
  } catch (error) {
    failed = true;
    checks.push(`FAIL .gleip/ could not be created: ${formatError(error)}`);
  }

  for (const warning of legacyArgusWarnings(runtime.cwd)) {
    checks.push(`WARN ${warning}`);
  }

  const trackedRuntimeFiles = trackedGleipRuntimeFiles(runtime.cwd);

  if (trackedRuntimeFiles.length > 0) {
    checks.push(
      `WARN Tracked Gleip runtime files: ${trackedRuntimeFiles.join(", ")}.`,
      "     Run: npx gleip doctor --fix"
    );
  }

  runtime.stdout(["gleip doctor", ...checks].join("\n"));

  if (failed) {
    runtime.setExitCode(1);
  }
}

function setupDiagnosticLines(cwd: string): string[] {
  const initialized = isFilePath(join(cwd, ".gleip", "state.json"));
  const versionedSetupPresent =
    isFilePath(join(cwd, ".gleip.yml")) && isFilePath(join(cwd, "GLEIP.md"));
  const agentInstructionsPresent = AGENT_INSTRUCTION_TARGETS.some((target) => {
    const filePath = join(cwd, agentInstructionFile(target).path);
    return isFilePath(filePath) && hasGleipWorkflow(readFileSync(filePath, "utf8"));
  });
  const localArtifactsIgnored = hasGleipGitignoreProtection(cwd);
  const lines = [
    setupDiagnosticLine(initialized, "Gleip init state present", "Missing .gleip/state.json"),
    setupDiagnosticLine(
      versionedSetupPresent,
      "Versioned config and policy files present",
      "Missing .gleip.yml or GLEIP.md"
    ),
    setupDiagnosticLine(
      agentInstructionsPresent,
      "Agent instructions present",
      "Missing Gleip-managed agent instructions"
    ),
    setupDiagnosticLine(
      localArtifactsIgnored,
      "Local artifacts ignored",
      "Missing, incomplete, or overridden Gleip .gitignore block"
    ),
    `  OK   CLI version resolved (${GLEIP_VERSION})`,
    "  OK   Built-in init assets available"
  ];

  if (
    !initialized ||
    !versionedSetupPresent ||
    !agentInstructionsPresent ||
    !localArtifactsIgnored
  ) {
    lines.push("       Run: npx gleip init");
  }

  return lines;
}

function doctorFix(runtime: CommandRuntime): void {
  const lines = ["gleip doctor --fix"];
  const gitignoreResult = ensureGleipGitignore(runtime.cwd);

  lines.push(`Gitignore protection: ${gitignoreResult}.`);

  const trackedRuntimeFiles = trackedGleipRuntimeFiles(runtime.cwd);

  if (trackedRuntimeFiles.length === 0) {
    lines.push("Tracked Gleip runtime files: none.");
  } else {
    const result = untrackGleipRuntimeFiles(runtime.cwd, trackedRuntimeFiles);

    if (result.ok) {
      lines.push(
        `Removed from Git index: ${trackedRuntimeFiles.join(", ")}.`,
        "Local copies were preserved."
      );
    } else {
      lines.push(`Failed to remove tracked runtime files from Git index: ${result.error}`);
      runtime.setExitCode(1);
    }
  }

  runtime.stdout(lines.join("\n"));
}

function setupDiagnosticLine(ok: boolean, success: string, warning: string): string {
  return ok ? `  OK   ${success}` : `  WARN ${warning}`;
}

function doctorAgents(runtime: CommandRuntime): void {
  const reports = AGENT_INSTRUCTION_TARGETS.map((target) => {
    const file = agentInstructionFile(target);
    const filePath = join(runtime.cwd, file.path);
    const present = isFilePath(filePath);
    const workflowPresent = present && hasGleipWorkflow(readFileSync(filePath, "utf8"));

    return {
      path: file.path,
      present,
      workflowPresent
    };
  });
  const hasAnyAgentFile = reports.some((report) => report.present);
  const lines = [
    "gleip doctor --agents",
    ...reports.map(
      (report) =>
        `${report.path}: ${report.present ? "present" : "missing"}; Gleip workflow: ${
          report.workflowPresent ? "yes" : "no"
        }`
    ),
    "",
    "Suggestions:",
    "- Run `npx gleip init` to prepare generic AGENTS.md.",
    "- Run `npx gleip init <name>` for one target."
  ];

  if (!hasAnyAgentFile) {
    lines.push(
      "",
      "No supported agent files exist yet. This is valid; `npx gleip init` prepares generic AGENTS.md."
    );
  }

  runtime.stdout(lines.join("\n"));
}

function repairAgents(runtime: CommandRuntime, options: RepairAgentsOptions): void {
  const files =
    options.all === true ? allAgentInstructionFiles() : existingAgentInstructionFiles(runtime.cwd);

  if (files.length === 0) {
    runtime.stdout(
      "No existing supported agent instruction files found. Run `npx gleip repair-agents --all` to create all supported files."
    );
    return;
  }

  for (const file of files) {
    writeAgentInstructionFile(join(runtime.cwd, file.path), file.defaultContent, file.target);
  }

  runtime.stdout(`Agent instructions repaired: ${files.map((file) => file.path).join(", ")}.`);
}

function stop(runtime: CommandRuntime, options: StopOptions): void {
  const gleipDir = join(runtime.cwd, ".gleip");
  const sessionPath = join(gleipDir, "session.json");

  if (!existsSync(sessionPath)) {
    reportNoActiveSession(runtime);
    return;
  }

  const archivePath = join(
    gleipDir,
    `session-${runtime.now().toISOString().replace(/[:.]/g, "-")}.json`
  );
  renameSync(sessionPath, archivePath);

  if (options.clean === true) {
    for (const fileName of ["brief.md", "scope-budget.json", "status.md"]) {
      const filePath = join(gleipDir, fileName);

      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }
  }

  runtime.stdout(`Gleip session stopped. Archived to ${archivePath}.`);
}

interface UninstallModification {
  content: string;
  path: string;
}

interface UninstallRemoval {
  path: string;
  recursive: boolean;
}

interface UninstallPlan {
  indexRemovals: string[];
  modifications: UninstallModification[];
  removals: UninstallRemoval[];
  skipped: string[];
}

function uninstallRepository(runtime: CommandRuntime, options: UninstallOptions): void {
  void options.force;
  const plan = createUninstallPlan(runtime.cwd, options.keepAgentFiles === true);

  if (options.dryRun !== true) {
    if (plan.indexRemovals.length > 0) {
      const result = untrackGleipRuntimeFiles(runtime.cwd, plan.indexRemovals);

      if (!result.ok) {
        runtime.stdout(`Gleip uninstall failed to update the Git index: ${result.error}`);
        runtime.setExitCode(1);
        return;
      }
    }

    for (const removal of plan.removals) {
      rmSync(join(runtime.cwd, removal.path), {
        force: true,
        recursive: removal.recursive
      });
    }

    for (const modification of plan.modifications) {
      writeAtomicText(join(runtime.cwd, modification.path), modification.content);
    }
  }

  runtime.stdout(formatUninstallPlan(plan, options.dryRun === true));
}

function createUninstallPlan(cwd: string, keepAgentFiles: boolean): UninstallPlan {
  const plan: UninstallPlan = {
    indexRemovals: [],
    modifications: [],
    removals: [],
    skipped: []
  };

  planGleipRuntimeCleanup(cwd, plan);
  planGeneratedPathRemoval(cwd, ".gleip.yml", defaultConfigContent(), plan);
  planGeneratedPathRemoval(cwd, "GLEIP.md", defaultGleipReadmeContent(), plan);
  planGleipGitignoreCleanup(cwd, plan);

  for (const target of AGENT_INSTRUCTION_TARGETS) {
    planAgentInstructionCleanup(cwd, agentInstructionFile(target), keepAgentFiles, plan);
  }

  return plan;
}

function planGleipRuntimeCleanup(cwd: string, plan: UninstallPlan): void {
  const gleipDirectory = join(cwd, ".gleip");

  if (!existsSync(gleipDirectory)) {
    plan.skipped.push(".gleip (not found)");
    return;
  }

  if (!statSync(gleipDirectory).isDirectory()) {
    plan.skipped.push(".gleip (preserved because it is not the expected directory type)");
    return;
  }

  const existingFiles = listFilesRecursive(gleipDirectory).map((path) =>
    normalizeRepoRelativePath(cwd, path)
  );
  const recognizedFiles = existingFiles.filter(isEphemeralGleipArtifactPath).sort();
  const unknownFiles = existingFiles.filter((path) => !isEphemeralGleipArtifactPath(path)).sort();

  plan.indexRemovals.push(...trackedGleipRuntimeFiles(cwd));

  if (unknownFiles.length === 0) {
    plan.removals.push({ path: ".gleip", recursive: true });
    return;
  }

  for (const path of recognizedFiles) {
    plan.removals.push({ path, recursive: false });
  }

  plan.skipped.push(
    `.gleip (preserved because it contains unknown files: ${unknownFiles.join(", ")})`
  );
}

function planGeneratedPathRemoval(
  cwd: string,
  relativePath: string,
  expectedContent: string,
  plan: UninstallPlan
): void {
  const filePath = join(cwd, relativePath);

  if (!existsSync(filePath)) {
    plan.skipped.push(`${relativePath} (not found)`);
    return;
  }

  if (!statSync(filePath).isFile()) {
    plan.skipped.push(`${relativePath} (preserved because it is not a file)`);
    return;
  }

  if (readFileSync(filePath, "utf8") !== expectedContent) {
    plan.skipped.push(`${relativePath} (preserved because it has local changes)`);
    return;
  }

  plan.removals.push({ path: relativePath, recursive: false });
}

function planGleipGitignoreCleanup(cwd: string, plan: UninstallPlan): void {
  const gitignorePath = join(cwd, ".gitignore");

  if (!existsSync(gitignorePath)) {
    plan.skipped.push(".gitignore Gleip block (not found)");
    return;
  }

  if (!statSync(gitignorePath).isFile()) {
    plan.skipped.push(".gitignore Gleip block (preserved because .gitignore is not a file)");
    return;
  }

  const result = removeGleipGitignoreBlock(readFileSync(gitignorePath, "utf8"));

  if (!result.found) {
    plan.skipped.push(".gitignore Gleip block (not found)");
    return;
  }

  if (result.content.length === 0) {
    plan.removals.push({ path: ".gitignore", recursive: false });
    return;
  }

  plan.modifications.push({ path: ".gitignore", content: result.content });
}

function planAgentInstructionCleanup(
  cwd: string,
  file: AgentInstructionFile,
  keepAgentFiles: boolean,
  plan: UninstallPlan
): void {
  const filePath = join(cwd, file.path);

  if (!existsSync(filePath)) {
    plan.skipped.push(`${file.path} (not found)`);
    return;
  }

  if (!statSync(filePath).isFile()) {
    plan.skipped.push(`${file.path} (preserved because it is not a file)`);
    return;
  }

  if (keepAgentFiles) {
    plan.skipped.push(`${file.path} (--keep-agent-files)`);
    return;
  }

  const result = removeGleipManagedSections(readFileSync(filePath, "utf8"));

  if (!result.found) {
    plan.skipped.push(`${file.path} (no Gleip-managed section)`);
    return;
  }

  if (isEmptyOrGeneratedAgentScaffold(result.content, file.defaultContent)) {
    plan.removals.push({ path: file.path, recursive: false });
    return;
  }

  plan.modifications.push({ path: file.path, content: result.content });
}

function removeGleipManagedSections(content: string): { content: string; found: boolean } {
  const markerPattern = new RegExp(
    `${escapeRegExp(GLEIP_SECTION_START)}[\\s\\S]*?${escapeRegExp(GLEIP_SECTION_END)}`,
    "g"
  );
  const found = markerPattern.test(content);

  if (!found) {
    return { content, found: false };
  }

  const remaining = content
    .replace(markerPattern, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  return {
    content: remaining.length === 0 ? "" : `${remaining}\n`,
    found: true
  };
}

function isEmptyOrGeneratedAgentScaffold(content: string, defaultContent: string): boolean {
  const normalized = content.trim();
  return normalized.length === 0 || normalized === defaultContent.trim();
}

function formatUninstallPlan(plan: UninstallPlan, dryRun: boolean): string {
  return [
    dryRun ? "Gleip uninstall dry run. No files changed." : "Gleip repository cleanup complete.",
    "",
    "Git index entries to remove:",
    ...formatUninstallItems(plan.indexRemovals),
    "",
    "Files/directories to remove:",
    ...formatUninstallItems(plan.removals.map((removal) => removal.path)),
    "",
    "Files whose Gleip section would be removed:",
    ...formatUninstallItems(plan.modifications.map((modification) => modification.path)),
    "",
    "Files skipped/preserved:",
    ...formatUninstallItems(plan.skipped),
    ...(dryRun ? [] : ["", "Next: run `npm uninstall gleip` to remove the package dependency."])
  ].join("\n");
}

function formatUninstallItems(items: string[]): string[] {
  return items.length === 0 ? ["- None."] : items.map((item) => `- ${item}`);
}

function writeGeneratedFile(filePath: string, content: string, force: boolean): void {
  mkdirSync(dirname(filePath), { recursive: true });

  if (existsSync(filePath) && !force) {
    return;
  }

  writeAtomicText(filePath, content);
}

type GitignoreUpdateResult = "created" | "updated" | "unchanged";

function ensureGleipGitignore(cwd: string): GitignoreUpdateResult {
  const gitignorePath = join(cwd, ".gitignore");
  const exists = existsSync(gitignorePath);
  const existing = exists ? readFileSync(gitignorePath, "utf8") : "";
  const lineEnding = existing.includes("\r\n") ? "\r\n" : "\n";
  const block = [GLEIP_GITIGNORE_START, ...GLEIP_GITIGNORE_ENTRIES, GLEIP_GITIGNORE_END].join(
    lineEnding
  );
  const startIndex = existing.indexOf(GLEIP_GITIGNORE_START);
  const endMarkerIndex = startIndex === -1 ? -1 : existing.indexOf(GLEIP_GITIGNORE_END, startIndex);
  const hasCompleteBlock = startIndex !== -1 && endMarkerIndex !== -1;
  let updated: string;

  if (hasCompleteBlock && isGleipRuntimeIgnoredByGit(cwd)) {
    const endIndex = endMarkerIndex + GLEIP_GITIGNORE_END.length;
    updated = `${existing.slice(0, startIndex)}${block}${existing.slice(endIndex)}`;
  } else if (hasCompleteBlock) {
    const withoutBlock = removeGleipGitignoreBlock(existing).content;
    updated = appendGleipGitignoreBlock(withoutBlock, block, lineEnding);
  } else if (startIndex !== -1 || endMarkerIndex !== -1) {
    updated = appendGleipGitignoreBlock(
      removeIncompleteGleipGitignoreLines(existing, lineEnding),
      block,
      lineEnding
    );
  } else if (existing.length === 0) {
    updated = `${block}${lineEnding}`;
  } else {
    updated = appendGleipGitignoreBlock(existing, block, lineEnding);
  }

  if (updated === existing) {
    return "unchanged";
  }

  writeAtomicText(gitignorePath, updated);
  return exists ? "updated" : "created";
}

function hasGleipGitignoreProtection(cwd: string): boolean {
  const gitignorePath = join(cwd, ".gitignore");

  if (!existsSync(gitignorePath) || !statSync(gitignorePath).isFile()) {
    return false;
  }

  const content = readFileSync(gitignorePath, "utf8").replaceAll("\r\n", "\n");
  const startIndex = content.indexOf(GLEIP_GITIGNORE_START);
  const endIndex = content.indexOf(GLEIP_GITIGNORE_END, startIndex);

  if (startIndex === -1 || endIndex === -1) {
    return false;
  }

  const block = content.slice(startIndex, endIndex + GLEIP_GITIGNORE_END.length);
  return (
    GLEIP_GITIGNORE_ENTRIES.every((entry) =>
      block.split("\n").some((line) => line.trim() === entry)
    ) && isGleipRuntimeIgnoredByGit(cwd)
  );
}

function appendGleipGitignoreBlock(existing: string, block: string, lineEnding: string): string {
  if (existing.length === 0) {
    return `${block}${lineEnding}`;
  }

  const separator = existing.endsWith("\n") ? lineEnding : `${lineEnding}${lineEnding}`;
  return `${existing}${separator}${block}${lineEnding}`;
}

function removeIncompleteGleipGitignoreLines(content: string, lineEnding: string): string {
  return content
    .split(/\r?\n/u)
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed !== GLEIP_GITIGNORE_START &&
        trimmed !== GLEIP_GITIGNORE_END &&
        !GLEIP_GITIGNORE_ENTRIES.includes(trimmed as (typeof GLEIP_GITIGNORE_ENTRIES)[number])
      );
    })
    .join(lineEnding)
    .replace(new RegExp(`(?:${escapeRegExp(lineEnding)}){3,}`, "gu"), `${lineEnding}${lineEnding}`);
}

function removeGleipGitignoreBlock(content: string): { content: string; found: boolean } {
  const startIndex = content.indexOf(GLEIP_GITIGNORE_START);
  const endMarkerIndex = startIndex === -1 ? -1 : content.indexOf(GLEIP_GITIGNORE_END, startIndex);

  if (startIndex === -1 || endMarkerIndex === -1) {
    return { content, found: false };
  }

  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
  const endIndex = endMarkerIndex + GLEIP_GITIGNORE_END.length;
  const updated = `${content.slice(0, startIndex)}${content.slice(endIndex)}`
    .replace(new RegExp(`(?:${escapeRegExp(lineEnding)}){3,}`, "gu"), `${lineEnding}${lineEnding}`)
    .trimEnd();

  return {
    content: updated.length === 0 ? "" : `${updated}${lineEnding}`,
    found: true
  };
}

function isGleipRuntimeIgnoredByGit(cwd: string): boolean {
  const result = runGit(cwd, ["check-ignore", "--quiet", "--no-index", ".gleip/state.json"]);

  if (result.status === 0) {
    return true;
  }

  if (result.status === 1) {
    return false;
  }

  return true;
}

function trackedGleipRuntimeFiles(cwd: string): string[] {
  const result = runGit(cwd, ["ls-files", "--", ".gleip"]);

  if (!result.ok) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/\\/gu, "/"))
    .filter((path) => path.length > 0)
    .filter((path) => isEphemeralGleipArtifactPath(path) && existsSync(join(cwd, path)))
    .sort();
}

function untrackGleipRuntimeFiles(cwd: string, paths: string[]): { ok: boolean; error?: string } {
  const runtimePaths = Array.from(new Set(paths.map((path) => path.replace(/\\/gu, "/"))))
    .filter(isEphemeralGleipArtifactPath)
    .sort();

  if (runtimePaths.length === 0) {
    return { ok: true };
  }

  const result = runGit(cwd, ["rm", "--cached", "-f", "--", ...runtimePaths]);

  return result.ok
    ? { ok: true }
    : { ok: false, error: result.stderr || result.stdout || "git rm --cached failed." };
}

function listFilesRecursive(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory)) {
    const entryPath = join(directory, entry);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      files.push(...listFilesRecursive(entryPath));
      continue;
    }

    if (stat.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function getDefaultGleipState(updatedAt = new Date().toISOString()): GleipState {
  return {
    enabled: true,
    updatedAt,
    updatedBy: "local-cli",
    reason: null
  };
}

function loadGleipState(cwd: string): GleipState | undefined {
  const statePath = join(cwd, ".gleip", "state.json");

  if (!existsSync(statePath)) {
    return undefined;
  }

  return JSON.parse(readFileSync(statePath, "utf8")) as GleipState;
}

function writeGleipState(cwd: string, state: GleipState): void {
  ensureGleipDirectory(cwd);
  writeAtomicJson(join(cwd, ".gleip", "state.json"), state);
}

function setGleipEnabled(
  cwd: string,
  enabled: boolean,
  reason: string | undefined,
  updatedAt = new Date().toISOString()
): GleipState {
  const state: GleipState = {
    enabled,
    updatedAt,
    updatedBy: "local-cli",
    reason: reason ?? null
  };

  writeGleipState(cwd, state);
  return state;
}

function writeGleipStateIfMissing(cwd: string, state: GleipState, force: boolean): void {
  const statePath = join(cwd, ".gleip", "state.json");

  if (existsSync(statePath) && !force) {
    return;
  }

  writeGleipState(cwd, state);
}

function disabledStateNote(state: GleipState | undefined, suffix: string): string | undefined {
  if (state?.enabled !== false) {
    return undefined;
  }

  return `Note: Gleip is currently disabled in .gleip/state.json. ${suffix}`;
}

function formatCommandOutput(
  output: string,
  state: GleipState | undefined,
  disabledSuffix: string,
  isJson: boolean
): string {
  const note = disabledStateNote(state, disabledSuffix);

  if (note === undefined || isJson) {
    return output;
  }

  return `${output}\n${note}`;
}

interface AgentInstructionFile {
  defaultContent: string;
  path: string;
  target: AgentInstructionTarget;
}

interface InitAgentInstructionSelection {
  detectedTarget?: AgentInstructionTarget;
  files: AgentInstructionFile[];
}

function initAgentInstructionFiles(
  cwd: string,
  options: InitOptions
): InitAgentInstructionSelection {
  const target = parseAgentTarget(options.agentTarget ?? options.agent);

  if (target === "auto") {
    const detectedTarget = detectAgentInstructionTarget(cwd);

    return {
      detectedTarget,
      files: [agentInstructionFile(detectedTarget)]
    };
  }

  return {
    files: [agentInstructionFile(target === "codex" ? "generic" : target)]
  };
}

function parseAgentTarget(value: string | undefined): AgentTarget {
  const target = value ?? "generic";

  if (SUPPORTED_AGENT_TARGETS.includes(target as AgentTarget)) {
    return target as AgentTarget;
  }

  throw new Error(
    `Unsupported agent target "${target}". Supported values: ${SUPPORTED_AGENT_TARGETS.join(", ")}.`
  );
}

function allAgentInstructionFiles(): AgentInstructionFile[] {
  return AGENT_INSTRUCTION_TARGETS.map((target) => agentInstructionFile(target));
}

function detectAgentInstructionTarget(cwd: string): AgentInstructionTarget {
  const targets: AgentInstructionTarget[] = [];

  if (existsSync(join(cwd, "AGENTS.md"))) {
    targets.push("generic");
  }

  if (existsSync(join(cwd, "CLAUDE.md"))) {
    targets.push("claude");
  }

  if (existsSync(join(cwd, "GEMINI.md"))) {
    targets.push("gemini");
  }

  return targets.length === 1 ? (targets[0] ?? "generic") : "generic";
}

function existingAgentInstructionFiles(cwd: string): AgentInstructionFile[] {
  return allAgentInstructionFiles().filter((file) => existsSync(join(cwd, file.path)));
}

function agentInstructionFile(target: AgentInstructionTarget): AgentInstructionFile {
  if (target === "claude") {
    return {
      path: "CLAUDE.md",
      defaultContent: "# Claude Instructions\n",
      target
    };
  }

  if (target === "gemini") {
    return {
      path: "GEMINI.md",
      defaultContent: "# Gemini Instructions\n",
      target
    };
  }

  return {
    path: "AGENTS.md",
    defaultContent: "# Agent Instructions\n",
    target
  };
}

function writeAgentInstructionFile(
  filePath: string,
  defaultContent: string,
  target: AgentInstructionTarget
): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : defaultContent;
  writeAtomicText(filePath, upsertGleipSection(existing, target));
}

function upsertGleipSection(content: string, target: AgentInstructionTarget): string {
  const section = gleipSectionContent(target);
  const markerPattern = new RegExp(
    `${escapeRegExp(GLEIP_SECTION_START)}[\\s\\S]*?${escapeRegExp(GLEIP_SECTION_END)}`
  );

  if (markerPattern.test(content)) {
    return ensureTrailingNewline(content.replace(markerPattern, section));
  }

  return `${content.trimEnd()}\n\n${section}\n`;
}

function gleipSectionContent(target: AgentInstructionTarget): string {
  const targetLine =
    target === "claude"
      ? "Claude Code must run Gleip before editing code."
      : target === "gemini"
        ? "Gemini CLI must run Gleip before editing code."
        : "Codex-style and generic coding agents must run Gleip before editing code.";

  return `${GLEIP_SECTION_START}
## Gleip Workflow

- This repository uses Gleip local guidance. ${targetLine}
- If the local package command cannot be run, report that Gleip evidence is unavailable and continue only within the user's existing authority.
- Before editing code, check \`.gleip/state.json\`. If \`enabled\` is false, treat Gleip guidance as inactive without creating a mandatory confirmation prompt.
- If enabled, run \`npx --no-install gleip preflight "<user task>"\`.
- In a read-only planning mode, where you must not write files or run mutating commands, do not run the commands above. Use \`npx --no-install gleip preflight --plan-mode "<user task>"\` and \`npx --no-install gleip validate-plan --plan-mode --task "<user task>" "<plan>"\` instead. Both compute the same guidance and write nothing.
- \`gleip brief\`, \`gleip state\`, \`gleip status --compact\`, \`gleip check --plan-mode\`, and \`gleip stats\` are also safe to run without writing.
- Once you are authorized to write, re-run \`preflight\` and \`validate-plan\` without \`--plan-mode\` so the evidence is recorded.
- Read \`.gleip/canonical-task.json\` first. Treat it as the authoritative task contract.
- Read \`.gleip/brief.md\` as a derived navigation aid and \`.gleip/scope-budget.json\` as scope guidance.
- If the brief omits or conflicts with the canonical task, follow the canonical task.
- Check active task revisions and amendments in \`.gleip/canonical-task.json\` before planning.
- For broad or sensitive changes, draft a short implementation plan and run \`npx --no-install gleip validate-plan "<plan>"\` before implementing it. Other plan checks are advisory.
- Treat \`aligned\` as ready, review \`advisory\`, clarify \`needs_clarification\`, clean up \`needs_cleanup\`, and request approval for \`needs_approval\`.
- During implementation, use the expected paths in \`.gleip/scope-budget.json\` as guidance and explain necessary expansion.
- Keep changes minimal and scoped to the canonical task.
- Do not edit or commit files under \`.gleip/\` unless the user explicitly asks.
- During iteration, run the narrowest existing validation that covers the changed area.
- Do not rerun a full validation suite while repository state is unchanged.
- For large repetitive command output, use \`npx --no-install gleip run -- <command>\` or pipe evidence through \`npx --no-install gleip compress\` only when the output is non-authoritative execution evidence.
- Treat compressed displays as compact evidence views only. Retrieve exact originals with \`npx --no-install gleip retrieve <reference>\` whenever omitted evidence is needed.
- Never replace canonical task state, active brief, requirement ledger, accepted plan, scope state, completion state, approvals, policy, source code, dependency manifests, or CI configuration with compressed output.
- Before final completion, verify every mandatory canonical requirement with available local evidence, then run the complete required validation once. Rerun it only after changes that can invalidate the result.
- Before claiming completion, run \`npx --no-install gleip check --incremental\`.
- Run \`npx --no-install gleip status --compact\` whenever Gleip's expected next action is unclear.
- Address cleanup and action-required findings before finalizing. Request approval for approval-required changes.
- Before the final response, run \`npx --no-install gleip status --compact\`. Report \`advisory\`, \`needs_attention\`, \`needs_cleanup\`, or \`needs_approval\` clearly.
- Before the final response, run \`npx --no-install gleip finalize\` and report its exact-state completion status. The legacy \`report\` command remains compatibility output only.
- Treat the final evidence bundle under \`.gleip/runs/<run-id>/final/latest.json\` as the primary local completion artifact.
- Final response should concisely include changed files or summary, verification run, residual risks, and Gleip status when relevant.

## Gleip working standard

### 1. Think before coding

Do not assume, hide confusion, or silently choose between ambiguous interpretations.

Before implementing:
- State material assumptions explicitly.
- Resolve ordinary ambiguity from local repository evidence when the risk is low.
- Ask before editing only when requirements conflict, protected changes need approval, user decisions are missing, or safety-sensitive scope is unclear.
- If a simpler approach exists, say so.
- Push back when the requested approach appears overcomplicated, risky, or broader than needed.

### 2. Simplicity first

Implement the minimum code that solves the requested problem.

Rules:
- Do not add features beyond what was asked.
- Do not add abstractions for single-use code.
- Do not add flexibility, configurability, or extension points that were not requested.
- Do not add error handling for impossible scenarios.
- If the solution is much larger than necessary, simplify it before finalizing.
- Prefer the implementation a senior engineer would consider direct and boring.

### 3. Surgical changes

Touch only what the task requires.

When editing existing code:
- Do not improve adjacent code, comments, naming, or formatting unless required.
- Do not refactor unrelated code.
- Match the existing style, even if a different style would be preferable.
- If unrelated dead code is found, mention it instead of deleting it.
- Remove only imports, variables, functions, files, or tests made obsolete by your own changes.
- Every changed line should trace directly to the user’s request.

### 4. Goal-driven execution

Turn the task into verifiable goals before implementing.

Examples:
- “Add validation” means define invalid-input cases, test them, then make them pass.
- “Fix the bug” means reproduce the bug with a focused test, then make it pass.
- “Refactor X” means verify behavior before and after the refactor.

For multi-step tasks, state a brief plan in this format:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

### Gleip checklist for every coding task

- [ ] Check \`.gleip/state.json\`
- [ ] Run \`npx --no-install gleip preflight "<task>"\`, or \`preflight --plan-mode\` while you cannot write
- [ ] Read \`.gleip/canonical-task.json\`
- [ ] Use \`.gleip/brief.md\` as an index, not a replacement
- [ ] Validate broad or sensitive plans with \`npx --no-install gleip validate-plan\`
- [ ] Implement within \`.gleip/scope-budget.json\`
- [ ] Run narrow validation while iterating and complete required validation once before final completion
- [ ] Use compression only for non-authoritative execution evidence; retrieve exact originals before relying on omitted diagnostics
- [ ] Run \`npx --no-install gleip check --incremental\`
- [ ] Run \`npx --no-install gleip status --compact\`
- [ ] Run \`npx --no-install gleip finalize\`
- [ ] Include concise review evidence: changed files or summary, tests run, risks, and Gleip status
${GLEIP_SECTION_END}`;
}

function hasGleipWorkflow(content: string): boolean {
  const requiredCommands = [
    "gleip preflight",
    "gleip validate-plan",
    "gleip check",
    "gleip status"
  ];

  return (
    content.includes(GLEIP_SECTION_START) &&
    content.includes(GLEIP_SECTION_END) &&
    requiredCommands.every((command) => content.includes(command))
  );
}

function ensureGleipDirectory(cwd: string): void {
  const gleipDir = join(cwd, ".gleip");

  if (existsSync(gleipDir) && !statSync(gleipDir).isDirectory()) {
    throw new Error(".gleip exists but is not a directory.");
  }

  mkdirSync(gleipDir, { recursive: true });
}

function defaultConfigContent(): string {
  return `version: 1
# advisory, strict, and enterprise are reserved compatibility aliases with no extra enforcement.
mode: passive

# Documentation only: principles are recorded for human readers and are not enforced.
principles:
  - Keep generated code lean, scoped, tested, and merge-ready.
  - Avoid speculative refactors and unnecessary dependencies.

limits:
  # Narrows the plan validation file ceiling.
  max_files_changed_warning: 12
  # Line limits size the scope budget and appear in the brief. They are reported as
  # metrics and do not emit drift findings on their own.
  max_lines_added_warning: 500
  max_lines_deleted_warning: 250

# Setting a check to false turns that detection off. Disabled checks are named in
# \`gleip check\` output so a weakened posture stays visible to reviewers.
checks:
  skipped_tests: true
  deleted_tests: true
  dependency_bloat: true
  ci_weakening: true
  risky_files: true
  secrets: true

risky_files:
  - package.json
  - pnpm-lock.yaml
  - .github/**
  - "**/*.config.*"
  - "**/*secret*"

protected_paths: []
allowed_paths: []

approval_required_for:
  - dependency_changes
  - ci_changes
  - security_policy_changes

required_commands: []

compression:
  enabled: true
  audit_only: false
  min_input_bytes: 900
  min_estimated_tokens_saved: 80
  min_confidence: medium
  allowed_classes:
    - test_output
    - build_output
    - log_output
    - structured_json
    - search_results
    - file_listing
    - command_output
    - git_diff
  envelope_format: human

# Documentation only: these describe the intended working style and are not enforced.
agent_behavior:
  minimal_scoped_changes: true
  avoid_speculative_refactors: true
  avoid_unnecessary_dependencies: true
  preserve_tests_and_ci: true
  explain_changed_files: true
`;
}

function defaultGleipReadmeContent(): string {
  return `# Gleip

This repository uses Gleip as a local-only guidance tool for AI coding agents. Gleip is not a permission system and performs no external review.

Agents should run \`npx --no-install gleip preflight "<task>"\` before editing code, read \`.gleip/canonical-task.json\` as the authoritative task contract, use \`.gleip/brief.md\` as a derived navigation aid, validate a short plan with \`npx --no-install gleip validate-plan "<plan>"\`, use the generated expected scope as guidance, optionally route large non-authoritative execution evidence through \`npx --no-install gleip run -- <command>\`, then run \`npx --no-install gleip check --incremental\`, \`npx --no-install gleip status --compact\`, and \`npx --no-install gleip report\` before the final response. Compressed displays are never task, scope, scoring, or review-readiness authority; exact originals remain local and retrievable with \`npx --no-install gleip retrieve <reference>\`.

To remove Gleip from this repository, run \`npx --no-install gleip uninstall\`, then run \`npm uninstall gleip\` to remove the package dependency.
`;
}

function scopeBudgetContent(scopeBudget: ScopeBudget): string {
  return `${JSON.stringify(scopeBudget, null, 2)}\n`;
}

function readScopeBudget(cwd: string): ScopeBudget | undefined {
  const scopeBudgetPath = join(cwd, ".gleip", "scope-budget.json");

  if (!existsSync(scopeBudgetPath)) {
    return undefined;
  }

  return JSON.parse(readFileSync(scopeBudgetPath, "utf8")) as ScopeBudget;
}

function readBaseline(cwd: string): SessionBaseline | undefined {
  const baselinePath = join(cwd, ".gleip", "baseline.json");

  if (!existsSync(baselinePath)) {
    return undefined;
  }

  return JSON.parse(readFileSync(baselinePath, "utf8")) as SessionBaseline;
}

function canonicalTaskPath(cwd: string): string {
  return join(cwd, ".gleip", "canonical-task.json");
}

function createCanonicalTaskArtifact(input: {
  content: string;
  createdAt: string;
  sessionId: string;
  source: CanonicalTaskSessionReference["source"];
}): CanonicalTaskArtifact {
  const taskId = `task-${shortHash(input.sessionId)}`;
  const revision = createCanonicalTaskRevision({
    content: input.content,
    createdAt: input.createdAt,
    revisionNumber: 1,
    sessionId: input.sessionId,
    source: input.source,
    taskId
  });

  return canonicalTaskArtifactFromRevisions({
    createdAt: input.createdAt,
    provenance: { complete: true, source: input.source },
    revisions: [revision],
    sessionId: input.sessionId,
    taskId,
    updatedAt: input.createdAt
  });
}

function appendCanonicalTaskRevision(
  artifact: CanonicalTaskArtifact,
  input: {
    content: string;
    createdAt: string;
    source: CanonicalTaskSessionReference["source"];
  }
): CanonicalTaskArtifact {
  const revision = createCanonicalTaskRevision({
    content: input.content,
    createdAt: input.createdAt,
    previousRevisionId: artifact.activeRevisionId,
    revisionNumber: artifact.revisions.length + 1,
    sessionId: artifact.sessionId,
    source: input.source,
    taskId: artifact.taskId
  });
  const revisions = artifact.revisions.map((candidate) => ({
    ...candidate,
    status: "superseded" as const
  }));

  return canonicalTaskArtifactFromRevisions({
    createdAt: artifact.createdAt,
    provenance: artifact.provenance,
    revisions: [...revisions, revision],
    sessionId: artifact.sessionId,
    taskId: artifact.taskId,
    updatedAt: input.createdAt
  });
}

function createCanonicalTaskRevision(input: {
  content: string;
  createdAt: string;
  previousRevisionId?: string;
  revisionNumber: number;
  sessionId: string;
  source: CanonicalTaskSessionReference["source"];
  taskId: string;
}): CanonicalTaskRevision {
  const contentHash = hashCanonicalContent(input.content);

  return {
    schemaVersion: "1.0.0",
    authority: "canonical",
    immutable: true,
    sessionId: input.sessionId,
    taskId: input.taskId,
    revisionId: `revision-${input.revisionNumber}-${shortHash(
      `${input.sessionId}:${input.revisionNumber}:${contentHash}`
    )}`,
    revisionNumber: input.revisionNumber,
    source: input.source,
    content: input.content,
    contentHash,
    byteCount: Buffer.byteLength(input.content, "utf8"),
    characterCount: Array.from(input.content).length,
    createdAt: input.createdAt,
    ...(input.previousRevisionId === undefined
      ? {}
      : { previousRevisionId: input.previousRevisionId }),
    status: "active"
  };
}

/**
 * Schema version stamped on the compact on-disk form. Reads accept both this and "1.0.0".
 */
const CANONICAL_TASK_COMPACT_SCHEMA_VERSION = "1.1.0";

function canonicalTaskArtifactFromRevisions(input: {
  createdAt: string;
  provenance: CanonicalTaskArtifact["provenance"];
  revisions: CanonicalTaskRevision[];
  sessionId: string;
  taskId: string;
  updatedAt: string;
}): CanonicalTaskArtifact {
  const activeRevision = input.revisions.at(-1);
  const effectiveContent = input.revisions.map((revision) => revision.content).join("\n\n");
  const contentHash = hashCanonicalContent(effectiveContent);
  const requirementLedger = extractRequirementLedger({
    taskText: effectiveContent,
    canonicalTaskHash: contentHash,
    revisions: input.revisions.map((revision) => ({
      revisionId: revision.revisionId,
      revisionNumber: revision.revisionNumber,
      content: revision.content
    }))
  }) as RequirementLedger;

  return {
    schemaVersion: "1.0.0",
    authority: "canonical",
    immutable: true,
    sessionId: input.sessionId,
    taskId: input.taskId,
    activeRevisionId: activeRevision?.revisionId ?? "revision-0",
    effectiveContent,
    contentHash,
    byteCount: Buffer.byteLength(effectiveContent, "utf8"),
    characterCount: Array.from(effectiveContent).length,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    revisions: input.revisions,
    requirementLedger,
    provenance: input.provenance
  };
}

function readCanonicalTaskArtifact(cwd: string): CanonicalTaskArtifact | undefined {
  const result = readJsonFile<unknown>(canonicalTaskPath(cwd));

  if (!isRecord(result.value)) {
    return undefined;
  }

  const expanded = expandCanonicalTaskArtifact(result.value);

  return isValidCanonicalTaskArtifact(expanded) ? expanded : undefined;
}

function isValidCanonicalTaskArtifact(value: unknown): value is CanonicalTaskArtifact {
  if (!isRecord(value) || !Array.isArray(value.revisions) || !isRecord(value.requirementLedger)) {
    return false;
  }

  if (
    value.schemaVersion !== "1.0.0" ||
    value.authority !== "canonical" ||
    value.immutable !== true ||
    typeof value.sessionId !== "string" ||
    typeof value.taskId !== "string" ||
    typeof value.activeRevisionId !== "string" ||
    typeof value.effectiveContent !== "string" ||
    typeof value.contentHash !== "string"
  ) {
    return false;
  }

  if (hashCanonicalContent(value.effectiveContent) !== value.contentHash) {
    return false;
  }

  return value.revisions.every(isCanonicalTaskRevision);
}

function isCanonicalTaskRevision(value: unknown): value is CanonicalTaskRevision {
  return (
    isRecord(value) &&
    value.schemaVersion === "1.0.0" &&
    value.authority === "canonical" &&
    value.immutable === true &&
    typeof value.revisionId === "string" &&
    typeof value.revisionNumber === "number" &&
    typeof value.content === "string" &&
    typeof value.contentHash === "string" &&
    hashCanonicalContent(value.content) === value.contentHash
  );
}

function canonicalTaskFromCompatibleSession(
  session: GleipSession | undefined,
  createdAt: string,
  fallbackBrief?: string
): CanonicalTaskArtifact | undefined {
  const sessionId = session?.sessionId ?? createSessionId(createdAt);

  if (typeof session?.task === "string" && session.task.length > 0) {
    return {
      ...createCanonicalTaskArtifact({
        content: session.task,
        createdAt,
        sessionId,
        source: "compatibility_session_task"
      }),
      provenance: {
        complete: true,
        source: "compatibility_session_task",
        note: "Created from 0.8.x session.task compatibility data."
      }
    };
  }

  if (fallbackBrief !== undefined && fallbackBrief.trim().length > 0) {
    return {
      ...createCanonicalTaskArtifact({
        content: fallbackBrief,
        createdAt,
        sessionId,
        source: "compatibility_brief"
      }),
      provenance: {
        complete: false,
        source: "compatibility_brief",
        note: "Original task text was unavailable; derived brief was retained with incomplete provenance."
      }
    };
  }

  return undefined;
}

function canonicalTaskReference(artifact: CanonicalTaskArtifact): CanonicalTaskReference {
  return {
    authority: "canonical",
    taskId: artifact.taskId,
    activeRevisionId: artifact.activeRevisionId,
    contentHash: artifact.contentHash,
    artifactPath: ".gleip/canonical-task.json"
  };
}

function canonicalTaskSessionReference(
  artifact: CanonicalTaskArtifact
): CanonicalTaskSessionReference {
  const activeRevision = artifact.revisions.find(
    (revision) => revision.revisionId === artifact.activeRevisionId
  );

  return {
    ...canonicalTaskReference(artifact),
    byteCount: artifact.byteCount,
    characterCount: artifact.characterCount,
    revisionCount: artifact.revisions.length,
    source: activeRevision?.source ?? artifact.provenance.source
  };
}

function requirementLedgerSummary(ledger: RequirementLedger): RequirementLedgerSummary {
  const active = ledger.requirements.filter((requirement) => requirement.status === "active");

  return {
    schemaVersion: "1.0.0",
    authority: "derived",
    requirementCount: ledger.requirements.length,
    mandatoryCount: active.filter((requirement) => requirement.obligation === "required").length,
    prohibitedCount: active.filter((requirement) => requirement.obligation === "prohibited").length,
    optionalCount: active.filter(
      (requirement) =>
        requirement.obligation === "optional" || requirement.obligation === "suggestion"
    ).length,
    conflictCount: ledger.conflicts.length
  };
}

function writeCanonicalTaskArtifact(cwd: string, artifact: CanonicalTaskArtifact): void {
  ensureGleipDirectory(cwd);
  writeAtomicJson(canonicalTaskPath(cwd), compactCanonicalTaskArtifact(artifact));
}

/**
 * Drop everything the artifact can reconstruct before writing it.
 *
 * The agent instructions tell the agent to read this file first and treat it as authoritative,
 * so its size is a direct token cost on every task. It stored the task text twice --
 * `effectiveContent` is the revisions concatenated -- and repeated each requirement's text
 * alongside the offsets that already locate it, which together accounted for roughly four fifths
 * of a large spec's artifact.
 *
 * `sourceText` is kept for any requirement whose span does not reproduce it exactly (a sentence
 * wrapped across lines is stored with its newline in the source but normalized in the ledger),
 * so nothing is ever lost to a lossy round-trip.
 */
function compactCanonicalTaskArtifact(artifact: CanonicalTaskArtifact): unknown {
  const revisions = new Map(
    artifact.revisions.map((revision) => [revision.revisionId, revision.content])
  );
  const defaultRevisionId = artifact.revisions.at(-1)?.revisionId;
  const rest: Omit<CanonicalTaskArtifact, "effectiveContent"> & { effectiveContent?: string } = {
    ...artifact
  };
  delete rest.effectiveContent;

  return {
    ...rest,
    schemaVersion: CANONICAL_TASK_COMPACT_SCHEMA_VERSION,
    requirementLedger: {
      ...artifact.requirementLedger,
      requirements: artifact.requirementLedger.requirements.map((requirement) => {
        const { sourceText, ...withoutText } = requirement;
        const source = revisions.get(requirement.canonicalRevisionId);
        const recoverable =
          source !== undefined &&
          normalizeRequirementText(
            source.slice(requirement.sourceStart, requirement.sourceEnd)
          ) === sourceText;
        const compact: Record<string, unknown> = recoverable
          ? { ...withoutText }
          : { ...requirement };

        // Drop what the ledger root already states or what the reader defaults to. At a few
        // hundred requirements these repeated constants are a large share of the file.
        if (compact.offsetEncoding === artifact.requirementLedger.offsetEncoding) {
          delete compact.offsetEncoding;
        }

        if (compact.canonicalRevisionId === defaultRevisionId) {
          delete compact.canonicalRevisionId;
        }

        if (compact.status === "active") {
          delete compact.status;
        }

        if (compact.explicit === false) {
          delete compact.explicit;
        }

        if (Array.isArray(compact.relatedPaths) && compact.relatedPaths.length === 0) {
          delete compact.relatedPaths;
        }

        return compact;
      })
    }
  };
}

/**
 * Restore the fields `compactCanonicalTaskArtifact` removed. Artifacts written before the
 * compact form still carry them, so both shapes read identically.
 */
function expandCanonicalTaskArtifact(value: Record<string, unknown>): Record<string, unknown> {
  const revisionValues = Array.isArray(value.revisions) ? value.revisions : [];
  const revisions = new Map(
    revisionValues
      .filter(isCanonicalTaskRevision)
      .map((revision) => [revision.revisionId, revision.content])
  );
  const defaultRevisionId = revisionValues.filter(isCanonicalTaskRevision).at(-1)?.revisionId;
  const effectiveContent =
    typeof value.effectiveContent === "string"
      ? value.effectiveContent
      : revisionValues
          .filter(isCanonicalTaskRevision)
          .map((revision) => revision.content)
          .join("\n\n");
  const ledger = isRecord(value.requirementLedger) ? value.requirementLedger : undefined;
  const requirements = Array.isArray(ledger?.requirements) ? ledger.requirements : [];

  return {
    ...value,
    schemaVersion: "1.0.0",
    effectiveContent,
    ...(ledger === undefined
      ? {}
      : {
          requirementLedger: {
            ...ledger,
            requirements: requirements.map((requirement) => {
              if (!isRecord(requirement)) {
                return requirement;
              }

              // Restore the fields the compact form omits as redundant or defaulted.
              const canonicalRevisionId =
                typeof requirement.canonicalRevisionId === "string"
                  ? requirement.canonicalRevisionId
                  : (defaultRevisionId ?? "");
              const source = revisions.get(canonicalRevisionId);

              return {
                status: "active",
                explicit: false,
                relatedPaths: [],
                offsetEncoding: ledger.offsetEncoding ?? "utf16",
                ...requirement,
                canonicalRevisionId,
                sourceText:
                  typeof requirement.sourceText === "string"
                    ? requirement.sourceText
                    : source === undefined
                      ? ""
                      : normalizeRequirementText(
                          source.slice(
                            Number(requirement.sourceStart),
                            Number(requirement.sourceEnd)
                          )
                        )
              };
            })
          }
        })
  };
}

function normalizeRequirementText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function hashCanonicalContent(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

function shortHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 12);
}

function readJsonFile<T>(path: string): { value?: T; error?: string } {
  if (!existsSync(path)) {
    return { error: "File not found." };
  }

  try {
    if (!statSync(path).isFile()) {
      return { error: "Path is not a file." };
    }

    return { value: JSON.parse(readFileSync(path, "utf8")) as T };
  } catch (error) {
    return { error: formatError(error) };
  }
}

function readTextFile(path: string): string | undefined {
  try {
    return existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : undefined;
  } catch {
    return undefined;
  }
}

/** The status artifact, only when it describes the repository state being reported on. */
function currentStatusContent(
  runtime: CommandRuntime,
  repositoryFingerprint: string
): string | undefined {
  const content = readTextFile(join(runtime.cwd, ".gleip", "status.md"));

  return content !== undefined && isCurrentStatusContent(content, repositoryFingerprint)
    ? content
    : undefined;
}

/**
 * Classify the run's command attestations as verification evidence for the current state.
 *
 * Returns `undefined` when the ledger cannot be read, which the report treats as "not consulted"
 * and falls back to the status artifact -- the behaviour before attestations were consulted at all.
 */
function verificationEvidenceForRun(
  runtime: CommandRuntime,
  context: { runId: string; repositoryFingerprint: string; taskRevision: number }
): VerificationEvidenceSummary | undefined {
  try {
    return summarizeVerificationEvidence(
      replayRun(runtime.cwd, context.runId).evidence,
      context.repositoryFingerprint,
      context.taskRevision,
      runtime.now().toISOString()
    );
  } catch {
    // A corrupt or partially written ledger must not stop completion reporting; the status
    // artifact remains available as the fallback signal.
    return undefined;
  }
}

function isCurrentStatusContent(content: string, repositoryFingerprint: string): boolean {
  const fingerprintMatch = /^- Repository fingerprint:\s*(.+)$/imu.exec(content);

  if (fingerprintMatch?.[1] === undefined) {
    return false;
  }

  return fingerprintMatch[1].trim() === repositoryFingerprint;
}

async function loadConfigForReport(runtime: CommandRuntime): Promise<GleipConfigLike | undefined> {
  try {
    return (await runtime.loadConfig(runtime.cwd)) as GleipConfigLike;
  } catch {
    return undefined;
  }
}

function driftResultWithoutBudget(diff: GitDiffContext): DriftResult {
  return {
    status: diff.isGitRepo ? "clean" : "advisory",
    findings: [],
    metrics: {
      filesChanged: diff.changedFiles.length,
      linesAdded: diff.totalLinesAdded,
      linesDeleted: diff.totalLinesDeleted
    },
    summary:
      diff.changedFiles.length === 0
        ? "No working tree changes detected."
        : "Working tree changes detected without an active scope budget."
  };
}

function normalizeDriftResult(result: DriftResult): DriftResult {
  const findings = result.findings.map((finding) => {
    if (
      finding.severity === "cleanup_required" ||
      finding.severity === "approval_required" ||
      finding.severity === "action_required" ||
      finding.severity === "warn" ||
      finding.severity === "info"
    ) {
      return finding;
    }

    if (
      finding.code === "LOCAL_ARTIFACT_INCLUDED" ||
      finding.code === "SECRET_FILE_CHANGED" ||
      finding.category === "local_artifacts" ||
      finding.category === "secrets"
    ) {
      return { ...finding, severity: "cleanup_required" as const };
    }

    if (finding.severity === "fail") {
      return { ...finding, severity: "approval_required" as const };
    }

    if (finding.severity === "warning") {
      return { ...finding, severity: "warn" as const };
    }

    return { ...finding, severity: "action_required" as const };
  });
  const status: DriftStatus = findings.some((finding) => finding.severity === "cleanup_required")
    ? "needs_cleanup"
    : findings.some((finding) => finding.severity === "approval_required")
      ? "needs_approval"
      : findings.some((finding) => finding.severity === "action_required")
        ? "needs_attention"
        : findings.some((finding) => finding.severity === "warn")
          ? "advisory"
          : "clean";

  return {
    ...result,
    status,
    findings
  };
}

function reportInteractionSummary(report: SessionReport): string {
  return [
    `Gleip report ready · output discipline: ${report.scores.outputDiscipline}/100`,
    "Report: .gleip/report.md",
    `Next: include the generated compact Gleip block${report.finalResponse.unresolvedWarnings === 0 ? "" : ` and report ${report.finalResponse.unresolvedWarnings} unresolved warning(s)`}`
  ].join("\n");
}

function createSessionId(createdAt: string): string {
  return `session-${createdAt.replace(/[^0-9]/g, "")}`;
}

function artifactMetadata(
  input: Omit<ArtifactMetadata, "sequence" | "superseded">
): ArtifactMetadata {
  return {
    ...input,
    sequence: phaseSequence(input.phase),
    superseded: false
  };
}

function phaseSequence(phase: ArtifactMetadata["phase"]): number {
  switch (phase) {
    case "preflight":
      return 1;
    case "implementation":
      return 2;
    case "verification":
      return 3;
    case "final":
      return 4;
  }
}

function statusContent(
  driftResult: DriftResult,
  nextAction: string,
  baseline: BaselineContext,
  artifact?: Omit<ArtifactMetadata, "sequence" | "superseded">
): string {
  const metadata =
    artifact === undefined
      ? ""
      : [
          `- Phase: ${artifact.phase}`,
          `- Generated: ${artifact.generatedAt}`,
          ...(artifact.repositoryFingerprint === undefined
            ? []
            : [`- Repository fingerprint: ${artifact.repositoryFingerprint}`])
        ].join("\n") + "\n";

  return `# Gleip Status

${metadata}- Current artifact: .gleip/status.md
- Status: ${driftResult.status}
- Session files changed: ${driftResult.metrics.filesChanged}
- Lines added: ${driftResult.metrics.linesAdded}
- Lines deleted: ${driftResult.metrics.linesDeleted}
- Pre-existing files ignored: ${baseline.preExistingFilesIgnored}
- Pre-existing files changed after preflight: ${baseline.possiblyPreExistingFiles.length}

## Findings

### Cleanup required
${formatMarkdownFindingGroup(driftResult.findings, "cleanup_required")}

### Approval required
${formatMarkdownFindingGroup(driftResult.findings, "approval_required")}

### Action required
${formatMarkdownFindingGroup(driftResult.findings, "action_required")}

### Warn
${formatMarkdownFindingGroup(driftResult.findings, "warn")}

### Info
${formatMarkdownFindingGroup(driftResult.findings, "info")}

## Next action

${nextAction}
`;
}

function emptyDriftResult(): DriftResult {
  return {
    status: "clean",
    findings: [],
    metrics: {
      filesChanged: 0,
      linesAdded: 0,
      linesDeleted: 0
    },
    summary: "No working tree changes detected."
  };
}

function emptyRepoContext(): RepoContext {
  return {
    taskTerms: [],
    likelyRelevantFiles: [],
    likelyTestFiles: [],
    existingPatternMatches: [],
    contextFiles: [],
    dependencyFiles: [],
    ciFiles: [],
    riskyMatchedPaths: [],
    scannedFileCount: 0,
    skippedDirectoryCount: 0
  };
}

function normalizeRepoRelativePath(cwd: string, absolutePath: string): string {
  return relative(cwd, absolutePath).replace(/\\/gu, "/");
}

function latestSuccessfulPlanValidation(
  session: GleipSession | undefined
): PlanValidationRecord | undefined {
  const latestSuccessful =
    session?.latestSuccessfulValidation ?? session?.latestSuccessfulPlanValidation;

  if (latestSuccessful !== undefined && isSuccessfulPlanValidationStatus(latestSuccessful.status)) {
    return latestSuccessful;
  }

  const latest = session?.latestPlanValidation;

  if (latest !== undefined && isSuccessfulPlanValidationStatus(latest.status)) {
    return latest;
  }

  return undefined;
}

function latestValidationAttempt(
  session: GleipSession | undefined
): PlanValidationRecord | undefined {
  return session?.latestValidationAttempt ?? session?.latestPlanValidation;
}

function scopeBudgetWithValidatedPlanScope(
  scopeBudget: ScopeBudget,
  latestPlanValidation: PlanValidationRecord | undefined
): ScopeBudget {
  if (
    latestPlanValidation === undefined ||
    !isSuccessfulPlanValidationStatus(latestPlanValidation.status)
  ) {
    return scopeBudget;
  }

  const directTargets = acceptedPlanTargets(latestPlanValidation, "direct");
  const derivedTargets = acceptedPlanTargets(latestPlanValidation, "derived");
  const fallbackTargets =
    latestPlanValidation.targetClassifications === undefined
      ? (latestPlanValidation.parsedPlan.proposedFiles ?? []).map(normalizePlanPath)
      : [];
  const mentionTargets = crediblePlanMentionTargets(latestPlanValidation.parsedPlan);
  const acceptedTargets = mergePathLists(
    directTargets,
    derivedTargets,
    fallbackTargets,
    mentionTargets
  );

  if (acceptedTargets.length === 0) {
    return scopeBudget;
  }

  const contextTargets = acceptedTargets.filter(isContextDocsPath);
  const hasSourceTargets = acceptedTargets.some(isSourceLikePlanTarget);
  const workflowProfile = refineWorkflowProfileForAcceptedTargets(scopeBudget, acceptedTargets);

  return {
    ...scopeBudget,
    taskType:
      scopeBudget.taskType === "unknown" && hasSourceTargets
        ? "local_behavior_change"
        : scopeBudget.taskType,
    confidence:
      scopeBudget.confidence === "low" && hasSourceTargets ? "high" : scopeBudget.confidence,
    workflowProfile,
    planRequired: workflowProfile !== "documentation_only",
    requiredTests:
      workflowProfile === "documentation_only"
        ? false
        : scopeBudget.requiredTests || hasSourceTargets,
    verificationExpected:
      workflowProfile === "documentation_only"
        ? false
        : scopeBudget.verificationExpected || scopeBudget.requiredTests || hasSourceTargets,
    allowedPaths: mergePathLists(scopeBudget.allowedPaths, acceptedTargets),
    expectedPaths: acceptedTargets,
    explicitScope: mergePathLists(
      scopeBudget.explicitScope ?? [],
      directTargets,
      fallbackTargets,
      mentionTargets.filter((path) => !derivedTargets.includes(path))
    ),
    derivedScope: mergePathLists(scopeBudget.derivedScope ?? [], derivedTargets),
    contextDocsTouchAllowed:
      scopeBudget.contextDocsTouchAllowed === true || contextTargets.length > 0,
    readOnlyContextPaths: (scopeBudget.readOnlyContextPaths ?? []).filter(
      (path) => !acceptedTargets.includes(normalizePlanPath(path))
    )
  };
}

function crediblePlanMentionTargets(parsedPlan: AgentPlan): string[] {
  const rawText = parsedPlan.rawText;
  const mentions = parsedPlan.fileMentions ?? [];
  const outputFiles = parsedPlan.outputFiles ?? [];

  return mergePathLists(
    mentions
      .filter(
        (mention) =>
          mention.role === "edit" ||
          (mention.role === "output" &&
            isEditablePlanTarget(mention.path) &&
            hasPlanEditIntentForPath(rawText, mention.path))
      )
      .map((mention) => mention.path),
    outputFiles.filter(
      (path) => isEditablePlanTarget(path) && hasPlanEditIntentForPath(rawText, path)
    )
  );
}

function isEditablePlanTarget(path: string): boolean {
  const normalized = normalizePlanPath(path).toLowerCase();
  const fileName = normalized.split("/").at(-1) ?? "";

  return (
    isSourceLikePlanTarget(normalized) ||
    isDocumentationPlanTarget(normalized) ||
    normalized.includes("/tests/") ||
    normalized.includes("__tests__/") ||
    /\.(?:spec|test)\.[a-z0-9]+$/iu.test(fileName) ||
    /\.(?:css|html|json|scss|toml|ya?ml)$/iu.test(fileName)
  );
}

function hasPlanEditIntentForPath(text: string, path: string): boolean {
  const normalizedText = normalizePlanPath(text);
  const normalizedPath = normalizePlanPath(path);
  const index = normalizedText.indexOf(normalizedPath);

  if (index < 0) {
    return false;
  }

  const prefix = normalizedText.slice(Math.max(0, index - 140), index);

  return /\b(?:add|change|connect|edit|extend|implement|migrate|modify|patch|refactor|synchronize|touch|update|wire)\b/iu.test(
    prefix
  );
}

function refineWorkflowProfileForAcceptedTargets(
  scopeBudget: ScopeBudget,
  acceptedTargets: string[]
): WorkflowProfile {
  if (
    scopeBudget.workflowProfile === "sensitive_change" ||
    acceptedTargets.some(isSensitivePlanTarget)
  ) {
    return "sensitive_change";
  }

  if (
    acceptedTargets.length <= 2 &&
    acceptedTargets.length > 0 &&
    acceptedTargets.every(isDocumentationPlanTarget)
  ) {
    return "documentation_only";
  }

  const sourceTargets = acceptedTargets.filter(isSourceLikePlanTarget);
  const topLevelAreas = new Set(sourceTargets.map((path) => path.split("/").slice(0, 2).join("/")));

  if (sourceTargets.length > 4 || topLevelAreas.size > 2) {
    return "broad_change";
  }

  return "local_behavior_change";
}

function isSensitivePlanTarget(path: string): boolean {
  const normalized = normalizePlanPath(path);
  const fileName = normalized.split("/").at(-1)?.toLowerCase() ?? "";

  return (
    fileName === "package.json" ||
    fileName.endsWith("lock") ||
    fileName.endsWith(".lock") ||
    normalized === "pnpm-lock.yaml" ||
    normalized.startsWith(".github/workflows/") ||
    normalized.startsWith(".circleci/") ||
    /(^|\/)(auth|security|payments?|migrations?|infra|infrastructure|secrets?)(\/|\.|$)/iu.test(
      normalized
    ) ||
    /(?:^|[.-])config\.(?:js|cjs|mjs|ts|json|yml|yaml|toml)$/iu.test(fileName)
  );
}

function isDocumentationPlanTarget(path: string): boolean {
  const normalized = normalizePlanPath(path).toLowerCase();
  const fileName = normalized.split("/").at(-1) ?? "";

  return (
    normalized.startsWith("docs/") ||
    ["readme.md", "changelog.md", "full_context.md", "project_context.md", "notes.md"].includes(
      fileName
    )
  );
}

function isContextDocsPath(path: string): boolean {
  const fileName = normalizePlanPath(path).toLowerCase().split("/").at(-1) ?? "";

  return ["full_context.md", "project_context.md", "notes.md"].includes(fileName);
}

function isSourceLikePlanTarget(path: string): boolean {
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|rb|php|vue|svelte)$/iu.test(
    normalizePlanPath(path)
  );
}

function isSuccessfulPlanValidationStatus(status: PlanValidationStatus): boolean {
  return status === "aligned" || status === "advisory" || status === "approved";
}

function passivePlanValidationResult(
  result: PlanValidationResult,
  scopeBudget: ScopeBudget
): PlanValidationResult {
  if (scopeBudget.planRequired === true || isSuccessfulPlanValidationStatus(result.status)) {
    return result;
  }

  return {
    ...result,
    status: "advisory",
    summary: `${result.findings.length} passive finding(s) recorded; plan validation is not required for this workflow.`,
    nextAction: "Continue with the scoped change and verify completion evidence."
  };
}

function acceptedPlanTargets(
  validation: PlanValidationRecord,
  classification: ScopeTargetClassification["classification"]
): string[] {
  return (validation.targetClassifications ?? [])
    .filter((target) => target.classification === classification)
    .map((target) => normalizePlanPath(target.target));
}

function mergePathLists(...pathLists: string[][]): string[] {
  return Array.from(
    new Set(
      pathLists
        .flat()
        .map(normalizePlanPath)
        .filter((path) => path.length > 0)
    )
  ).sort();
}

function normalizePlanPath(path: string): string {
  return path.replace(/\\/gu, "/").replace(/^\.\//u, "");
}

/**
 * The scope budget an agent reads in plan mode, with the compatibility aliases collapsed.
 *
 * `expectedPaths`/`allowedPaths`/`derivedScope`, `protectedChecks`/`hardGates`,
 * `approvalRequiredChanges`/`blockedWithoutApproval` and
 * `pauseAndClarifyConditions`/`stopConditions` are the same values under different keys. The
 * persisted artifact keeps them for schema compatibility; repeating them to a reader that has no
 * other way to consume Gleip is pure cost, so the plan-mode view emits each value once.
 */
function planModeScopeView(scopeBudget: ScopeBudget): Record<string, unknown> {
  return {
    taskType: scopeBudget.taskType,
    confidence: scopeBudget.confidence,
    riskLevel: scopeBudget.riskLevel,
    workflowProfile: scopeBudget.workflowProfile,
    planRequired: scopeBudget.planRequired,
    taskBreadth: scopeBudget.taskBreadth,
    expectedFilesChanged: scopeBudget.expectedFilesChanged,
    softLimits: scopeBudget.softLimits,
    hardGates: scopeBudget.hardGates,
    expectedPaths: scopeBudget.expectedPaths,
    explicitScope: scopeBudget.explicitScope,
    suspiciousPaths: scopeBudget.suspiciousPaths,
    approvalRequiredFor: scopeBudget.approvalRequiredFor,
    blockedWithoutApproval: scopeBudget.blockedWithoutApproval,
    requiredTests: scopeBudget.requiredTests,
    stopConditions: scopeBudget.stopConditions,
    readOnlyContextPaths: scopeBudget.readOnlyContextPaths ?? [],
    reasons: scopeBudget.reasons
  };
}

function planModePreflightJson(
  canonicalTask: CanonicalTaskArtifact,
  scopeBudget: ScopeBudget,
  brief: string,
  classification: TaskClassification
): Record<string, unknown> {
  return {
    mode: "plan_mode",
    persisted: false,
    canonicalTask: {
      contentHash: canonicalTask.contentHash,
      byteCount: canonicalTask.byteCount,
      characterCount: canonicalTask.characterCount,
      requirementLedger: canonicalTask.requirementLedger
    },
    classification,
    scopeBudget: planModeScopeView(scopeBudget),
    brief
  };
}

function planModePreflightSummary(brief: string, scopeBudget: ScopeBudget): string {
  return [
    brief.trimEnd(),
    "",
    "---",
    "Gleip plan mode · nothing was written. Re-run `gleip preflight` without --plan-mode to record evidence.",
    scopeBudget.planRequired === true
      ? "Next: draft a plan and check it with `gleip validate-plan --plan-mode --task \"<task>\" \"<plan>\"`."
      : "Next: implement the scoped change once you are authorized to write."
  ].join("\n");
}

function summarizeScopeBudget(scopeBudget: ScopeBudget): ScopeBudgetSummary {
  return {
    expectedFilesChanged: scopeBudget.expectedFilesChanged,
    ...(scopeBudget.workflowProfile === undefined
      ? {}
      : { workflowProfile: scopeBudget.workflowProfile }),
    ...(scopeBudget.planRequired === undefined ? {} : { planRequired: scopeBudget.planRequired }),
    softLimits: scopeBudget.softLimits,
    hardGates: scopeBudget.hardGates,
    approvalRequiredCount: scopeBudget.approvalRequiredFor.length,
    blockedWithoutApprovalCount: scopeBudget.blockedWithoutApproval.length,
    requiredTests: scopeBudget.requiredTests,
    stopConditionsCount: scopeBudget.stopConditions.length
  };
}

function summarizeBaseline(baseline: SessionBaseline): BaselineSummary {
  const base = {
    createdAt: baseline.createdAt,
    changedFilesCount: baseline.changedFiles.length,
    totalLinesAdded: baseline.totalLinesAdded,
    totalLinesDeleted: baseline.totalLinesDeleted
  };

  return baseline.note === undefined ? base : { ...base, note: baseline.note };
}

function baselineContextForPreflight(baseline: SessionBaseline): BaselineContext {
  return {
    hasBaseline: true,
    preExistingFilesIgnored: baseline.changedFiles.length,
    sessionFilesChanged: 0,
    baselineCreatedAt: baseline.createdAt,
    includeBaseline: false,
    possiblyPreExistingFiles: []
  };
}

function addBaselineNote(brief: string, baseline: SessionBaseline): string {
  if (baseline.changedFiles.length === 0) {
    return brief;
  }

  return `${brief.trimEnd()}

## Baseline note

Pre-existing changes detected. Avoid touching unrelated pre-existing files unless required by the task.
`;
}

function defaultScopeBudgetForCheck(config: GleipConfigLike): ScopeBudget {
  const hardGates = {
    newDependenciesAllowed: false,
    ciChangesAllowed: false,
    skippedTestsAllowed: false,
    deletedTestsAllowed: false,
    secretsAllowed: false
  };
  const approvalRequiredChanges = [
    "dependency_changes",
    "ci_changes",
    "secrets",
    ...(config.protected_paths ?? [])
  ];

  return {
    taskType: "unknown",
    confidence: "low",
    riskLevel: "medium",
    workflowProfile: "local_behavior_change",
    planRequired: true,
    taskBreadth: "local",
    expectedFilesChanged: { min: 0, max: 0 },
    expectedLinesAdded: { min: 0, max: 0 },
    expectedLinesDeleted: { min: 0, max: 0 },
    softLimits: {
      maxFilesChanged: config.limits?.max_files_changed_warning ?? 12,
      maxLinesAdded: config.limits?.max_lines_added_warning ?? 500,
      maxLinesDeleted: config.limits?.max_lines_deleted_warning ?? 250
    },
    hardGates,
    protectedChecks: hardGates,
    allowedPaths: [],
    expectedPaths: [],
    explicitScope: [],
    derivedScope: [],
    suspiciousPaths: [],
    approvalRequiredFor: [
      ...(config.approval_required_for ?? []),
      ...(config.protected_paths ?? []),
      ...(config.risky_files ?? [])
    ],
    blockedWithoutApproval: approvalRequiredChanges,
    approvalRequiredChanges,
    requiredTests: true,
    verificationExpected: true,
    testGuidance: [],
    stopConditions: [],
    pauseAndClarifyConditions: [],
    contextDocsTouchAllowed: false,
    readOnlyContextPaths: [],
    reasons: ["No active Gleip session was found; check used a conservative default budget."]
  };
}

function scopeBudgetFromSummary(
  summary: ScopeBudgetSummary | undefined,
  classification: TaskClassification
): ScopeBudget {
  const expectedFilesChanged = summary?.expectedFilesChanged ?? { min: 0, max: 0 };
  const softLimits = summary?.softLimits ?? {
    maxFilesChanged: 0,
    maxLinesAdded: 0,
    maxLinesDeleted: 0
  };
  const hardGates = summary?.hardGates ?? {
    newDependenciesAllowed: false,
    ciChangesAllowed: false,
    skippedTestsAllowed: false,
    deletedTestsAllowed: false,
    secretsAllowed: false
  };
  const approvalRequiredChanges = Array.from(
    { length: summary?.blockedWithoutApprovalCount ?? 0 },
    (_, index) => String(index + 1)
  );
  const stopConditions = Array.from({ length: summary?.stopConditionsCount ?? 0 }, (_, index) =>
    String(index + 1)
  );
  const requiredTests = summary?.requiredTests ?? classification.likelyRequiresTests;
  const workflowProfile =
    summary?.workflowProfile ?? classification.workflowProfile ?? "local_behavior_change";

  return {
    taskType: classification.taskType,
    confidence: classification.confidence,
    riskLevel: classification.riskLevel,
    workflowProfile,
    planRequired: summary?.planRequired ?? workflowProfile !== "documentation_only",
    taskBreadth: "local",
    expectedFilesChanged,
    expectedLinesAdded: { min: 0, max: 0 },
    expectedLinesDeleted: { min: 0, max: 0 },
    softLimits,
    hardGates,
    protectedChecks: hardGates,
    allowedPaths: [],
    expectedPaths: [],
    explicitScope: [],
    derivedScope: [],
    suspiciousPaths: [],
    approvalRequiredFor: Array.from({ length: summary?.approvalRequiredCount ?? 0 }, (_, index) =>
      String(index + 1)
    ),
    blockedWithoutApproval: approvalRequiredChanges,
    approvalRequiredChanges,
    requiredTests,
    verificationExpected: requiredTests,
    testGuidance: [],
    stopConditions,
    pauseAndClarifyConditions: stopConditions,
    contextDocsTouchAllowed: false,
    readOnlyContextPaths: [],
    reasons: []
  };
}

/**
 * Name the files behind findings that ask for action. A finding the agent must act on is not
 * actionable if the output does not say which file it is about.
 */
function formatBlockingFindingLines(findings: DriftFinding[]): string[] {
  const actionable = orderFindings(findings).filter(
    (finding) =>
      severityRank(finding.severity) >= severityRank("action_required") &&
      (finding.examples ?? []).length > 0
  );

  if (actionable.length === 0) {
    return [];
  }

  return actionable.map(
    (finding) =>
      `- ${finding.title}: ${(finding.examples ?? []).join(", ")}${
        finding.count !== undefined && finding.count > (finding.examples ?? []).length
          ? ` (+${finding.count - (finding.examples ?? []).length} more)`
          : ""
      }`
  );
}

function formatScopeTargetLines(findings: DriftFinding[]): string[] {
  const targets = findings.flatMap((finding) => finding.targetClassifications ?? []);

  if (targets.length === 0) {
    return [];
  }

  return [
    "Scope targets needing clarification:",
    ...targets.map(
      (target) =>
        `- ${target.target} [${target.classification}]: ${target.reason} Evidence: ${target.evidence}${target.nextAction === undefined ? "" : ` Next: ${target.nextAction}`}`
    )
  ];
}

/**
 * Name the `.gleip.yml` checks that are switched off.
 *
 * Wiring `checks.*` makes the config real, but a disabled detector is silent by nature: a repo
 * with secret detection off looks exactly like one with it on. Stating it in the output keeps
 * the weakened posture visible to whoever reads the result.
 */
function disabledChecksNotice(config: GleipConfigLike | undefined): string[] {
  const checks = config?.checks;

  if (checks === undefined) {
    return [];
  }

  const disabled = Object.entries(checks)
    .filter(([, enabled]) => enabled === false)
    .map(([name]) => name)
    .sort();

  return disabled.length === 0
    ? []
    : [`Checks disabled by .gleip.yml: ${disabled.join(", ")}`];
}

function statusInteractionSummary(
  commandName: "check" | "status",
  driftResult: DriftResult,
  nextAction: string,
  baseline: BaselineContext,
  config?: GleipConfigLike
): string {
  const lines = [
    `Gleip ${commandName} complete · status: ${driftResult.status}`,
    `Changes: ${driftResult.metrics.filesChanged} files, +${driftResult.metrics.linesAdded}/-${driftResult.metrics.linesDeleted}`
  ];

  if (driftResult.findings.length > 0) {
    const highestFinding = orderFindings(driftResult.findings)[0];
    lines.push(
      `Findings: ${driftResult.findings.length} · highest: ${
        highestFinding === undefined ? "review required" : formatFindingLabel(highestFinding)
      }`
    );
    for (const line of formatBlockingFindingLines(driftResult.findings)) {
      lines.push(line);
    }
    for (const line of formatScopeTargetLines(driftResult.findings)) {
      lines.push(line);
    }
  }

  for (const line of disabledChecksNotice(config)) {
    lines.push(line);
  }

  if (baseline.possiblyPreExistingFiles.length > 0) {
    lines.push(
      `Baseline: ${baseline.possiblyPreExistingFiles.length} pre-existing file(s) changed after preflight; attribution is file-level`
    );
  } else if (driftResult.findings.length === 0 && baseline.preExistingFilesIgnored > 0) {
    lines.push(`Baseline: ${baseline.preExistingFilesIgnored} pre-existing file(s) ignored`);
  }

  lines.push(
    commandName === "status" &&
      (driftResult.status === "clean" || driftResult.status === "advisory")
      ? "Next: generate report"
      : `Next: ${nextAction}`
  );

  return lines.join("\n");
}

function planValidationInteractionSummary(result: PlanValidationResult): string {
  const phase =
    result.status === "aligned"
      ? "aligned with declared task scope"
      : `${result.status.replace(/_/gu, " ")} · ${result.findings.length} finding(s)`;
  const lines = [`Gleip plan check ${phase}`];

  // Print every finding that asks for something, with the evidence behind it. Printing only
  // findings[0] and never its evidence meant the agent was told "one or more mandatory
  // requirements are missing" and not which ones -- while the requirement ids were already
  // computed and sitting in the finding. Counting findings the output never shows is worse
  // than terse; it is a dead end.
  for (const finding of orderPlanFindings(result.findings).filter(
    (candidate) => planSeverityRank(candidate.severity) >= planSeverityRank("warn")
  )) {
    lines.push(`Finding: ${formatFindingLabel(finding)} · ${finding.message}`);

    for (const evidence of finding.evidence ?? []) {
      lines.push(`  - ${evidence}`);
    }
  }

  const scopeTargets = (result.targetClassifications ?? []).filter(
    (target) => target.classification === "adjacent" || target.classification === "unexplained"
  );

  if (scopeTargets.length > 0) {
    lines.push("Scope targets needing clarification:");
    for (const target of scopeTargets) {
      lines.push(
        `- ${target.target} [${target.classification}]: ${target.reason} Evidence: ${target.evidence}${target.nextAction === undefined ? "" : ` Next: ${target.nextAction}`}`
      );
    }
  }

  lines.push(
    `Next: ${result.status === "aligned" ? "implement the plan, run verification, then run status" : result.nextAction}`
  );
  return lines.join("\n");
}

function planValidationJson(result: PlanValidationResult): {
  status: PlanValidationStatus;
  findings: PlanValidationFinding[];
  nextAction: string;
  parsedPlan: AgentPlan;
  targetClassifications?: ScopeTargetClassification[];
  requirementCoverage?: PlanRequirementCoverage;
} {
  return {
    status: result.status,
    findings: orderPlanFindings(result.findings),
    nextAction: result.nextAction,
    parsedPlan: result.parsedPlan,
    ...(result.targetClassifications === undefined
      ? {}
      : { targetClassifications: result.targetClassifications }),
    // The per-requirement coverage analysis was computed on every run and then dropped from the
    // JSON contract, leaving it unreachable for any caller using --json.
    ...(result.requirementCoverage === undefined
      ? {}
      : { requirementCoverage: result.requirementCoverage })
  };
}

function orderPlanFindings(findings: PlanValidationFinding[]): PlanValidationFinding[] {
  return [...findings].sort((left, right) => {
    const severityDifference = planSeverityRank(right.severity) - planSeverityRank(left.severity);

    if (severityDifference !== 0) {
      return severityDifference;
    }

    return left.title.localeCompare(right.title);
  });
}

function planSeverityRank(severity: PlanValidationFinding["severity"]): number {
  if (severity === "cleanup_required") {
    return 5;
  }

  if (severity === "fail" || severity === "approval_required" || severity === "blocking") {
    return 4;
  }

  if (severity === "action_required") {
    return 3;
  }

  if (severity === "warn" || severity === "warning") {
    return 2;
  }

  return 1;
}

function statusJson(
  driftResult: DriftResult,
  nextAction: string,
  baseline: BaselineContext,
  artifact?: Omit<ArtifactMetadata, "sequence" | "superseded">
): {
  artifact?: ArtifactMetadata;
  baseline: {
    hasBaseline: boolean;
    preExistingFilesIgnored: number;
    possiblyPreExistingFiles: string[];
    sessionFilesChanged: number;
    baselineCreatedAt?: string;
  };
  findings: DriftFinding[];
  metrics: DriftResult["metrics"];
  nextAction: string;
  status: DriftStatus;
} {
  const baselineJson = {
    hasBaseline: baseline.hasBaseline,
    preExistingFilesIgnored: baseline.preExistingFilesIgnored,
    possiblyPreExistingFiles: baseline.possiblyPreExistingFiles,
    sessionFilesChanged: baseline.sessionFilesChanged,
    ...(baseline.baselineCreatedAt === undefined
      ? {}
      : { baselineCreatedAt: baseline.baselineCreatedAt })
  };

  return {
    ...(artifact === undefined ? {} : { artifact: artifactMetadata(artifact) }),
    status: driftResult.status,
    metrics: driftResult.metrics,
    baseline: baselineJson,
    findings: orderFindings(driftResult.findings),
    nextAction
  };
}

function printEfficiencyMode(
  runtime: CommandRuntime,
  options: PrintStatusOptions,
  state: GleipState | undefined,
  input: {
    fingerprint: string;
    repositoryFingerprint: string;
    cached: IncrementalCheckCache | undefined;
    reused: boolean;
    completeResult: CachedCheckResult;
    createdAt: string;
    session?: GleipSession | undefined;
    task: string;
  }
): boolean {
  if (options.incremental === true) {
    const delta = compareFindingSets(
      input.cached?.result.driftResult.findings ?? [],
      input.completeResult.driftResult.findings
    );
    const baselineRun = input.cached === undefined;

    if (!input.reused && options.planMode !== true) {
      writeCheckCache(runtime.cwd, {
        schemaVersion: CHECK_CACHE_SCHEMA_VERSION,
        gleipVersion: GLEIP_VERSION,
        fingerprint: input.fingerprint,
        repositoryFingerprint: input.repositoryFingerprint,
        result: input.completeResult,
        metadata: { createdAt: input.createdAt }
      });
    }

    runtime.stdout(
      formatCommandOutput(
        options.json === true
          ? JSON.stringify(
              incrementalCheckJson(input.completeResult, delta, {
                baseline: baselineRun,
                reused: input.reused,
                forced: options.force === true
              }),
              null,
              2
            )
          : incrementalCheckSummary(input.completeResult, delta, {
              baseline: baselineRun,
              reused: input.reused,
              forced: options.force === true
            }),
        state,
        options.disabledSuffix ?? "Check can still be run manually.",
        options.json === true
      )
    );
    applyCiExitCode(runtime, options, input.completeResult.driftResult.findings);
    return true;
  }

  if (options.compact === true) {
    runtime.stdout(
      compactStatusSummary({
        session: input.session,
        task: input.task,
        repositoryChanged:
          input.cached === undefined ||
          input.cached.repositoryFingerprint !== input.repositoryFingerprint,
        checkNecessary: !input.reused,
        driftResult: input.completeResult.driftResult,
        nextAction: input.completeResult.nextAction
      })
    );
    return true;
  }

  return false;
}

function createCheckStateFingerprint(
  cwd: string,
  input: {
    repositoryFingerprint: string;
    session?: GleipSession | undefined;
    state?: GleipState | undefined;
    baseline?: SessionBaseline | undefined;
    scopeBudget: ScopeBudget;
    config: GleipConfigLike;
    includeBaseline: boolean;
  }
): string {
  const session = input.session;

  return hashDeterministicValue({
    gleipVersion: GLEIP_VERSION,
    repositoryFingerprint: input.repositoryFingerprint,
    session:
      session === undefined
        ? null
        : {
            sessionId: session.sessionId ?? null,
            task: session.task ?? null,
            taskFile: session.taskFile ?? null,
            canonicalTask: session.canonicalTask ?? null,
            requirementLedgerSummary: session.requirementLedgerSummary ?? null,
            classification: session.classification ?? null,
            repoContext: session.repoContext ?? null,
            scopeBudgetSummary: session.scopeBudgetSummary ?? null,
            latestValidationAttempt: session.latestValidationAttempt ?? null,
            latestSuccessfulValidation: session.latestSuccessfulValidation ?? null,
            latestPlanValidation: session.latestPlanValidation ?? null,
            latestSuccessfulPlanValidation: session.latestSuccessfulPlanValidation ?? null,
            createdAt: session.created_at ?? null
          },
    briefHash: hashLocalFile(join(cwd, ".gleip", "brief.md")),
    canonicalTaskHash: hashLocalFile(join(cwd, ".gleip", "canonical-task.json")),
    baseline: input.baseline ?? null,
    scopeBudget: input.scopeBudget,
    config: input.config,
    configFileHash: hashLocalFile(join(cwd, ".gleip.yml")),
    state: input.state ?? null,
    flags: {
      includeBaseline: input.includeBaseline
    }
  });
}

function hashLocalFile(path: string): string | null {
  try {
    if (!existsSync(path) || !statSync(path).isFile()) {
      return null;
    }

    return createHash("sha256")
      .update(readFileSync(path, "utf8").replace(/\r\n/gu, "\n"))
      .digest("hex");
  } catch {
    return null;
  }
}

function hashDeterministicValue(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }

  return value;
}

function normalizedCheckResult(result: DriftResult): DriftResult {
  const normalized = normalizeDriftResult(result);

  return {
    ...normalized,
    findings: orderFindings(normalized.findings).map(normalizeFindingForCache)
  };
}

function normalizeFindingForCache(finding: DriftFinding): DriftFinding {
  return {
    ...finding,
    ...(finding.file === undefined ? {} : { file: normalizeCachedPath(finding.file) }),
    ...(finding.examples === undefined
      ? {}
      : { examples: finding.examples.map(normalizeCachedPath) }),
    ...(finding.targetClassifications === undefined
      ? {}
      : {
          targetClassifications: finding.targetClassifications.map((target) => ({
            ...target,
            target: normalizeCachedPath(target.target)
          }))
        })
  };
}

function normalizeCachedPath(path: string): string {
  return path.replace(/\\/gu, "/").replace(/^\.\//u, "");
}

function compareFindingSets(previous: DriftFinding[], current: DriftFinding[]): FindingDelta {
  const previousByIdentity = new Map(
    previous.map((finding) => [findingIdentity(finding), normalizeFindingForCache(finding)])
  );
  const added: DriftFinding[] = [];
  const updated: DriftFinding[] = [];
  let unchanged = 0;

  for (const finding of current.map(normalizeFindingForCache)) {
    const identity = findingIdentity(finding);
    const prior = previousByIdentity.get(identity);

    if (prior === undefined) {
      added.push(finding);
    } else if (stableSerialize(prior) === stableSerialize(finding)) {
      unchanged += 1;
    } else {
      updated.push(finding);
    }

    previousByIdentity.delete(identity);
  }

  return {
    added: orderFindings(added),
    updated: orderFindings(updated),
    resolved: orderFindings(Array.from(previousByIdentity.values())),
    unchanged
  };
}

function findingIdentity(finding: DriftFinding): string {
  return stableSerialize({
    code: finding.code ?? null,
    category: finding.category,
    title: finding.title,
    file: finding.file === undefined ? null : normalizeCachedPath(finding.file)
  });
}

function readCompatibleCheckCache(cwd: string): IncrementalCheckCache | undefined {
  const result = readJsonFile<unknown>(join(cwd, ".gleip", "check-cache.json"));

  return isCompatibleCheckCache(result.value) ? result.value : undefined;
}

function isCompatibleCheckCache(value: unknown): value is IncrementalCheckCache {
  if (!isRecord(value)) {
    return false;
  }

  const result = value.result;

  return (
    value.schemaVersion === CHECK_CACHE_SCHEMA_VERSION &&
    value.gleipVersion === GLEIP_VERSION &&
    typeof value.fingerprint === "string" &&
    typeof value.repositoryFingerprint === "string" &&
    isRecord(value.metadata) &&
    typeof value.metadata.createdAt === "string" &&
    isRecord(result) &&
    isCachedDriftResult(result.driftResult) &&
    typeof result.nextAction === "string" &&
    isBaselineContext(result.baseline)
  );
}

function isCachedDriftResult(value: unknown): value is DriftResult {
  if (!isRecord(value) || !Array.isArray(value.findings) || !isRecord(value.metrics)) {
    return false;
  }

  return (
    ["clean", "advisory", "needs_attention", "needs_cleanup", "needs_approval"].includes(
      String(value.status)
    ) &&
    typeof value.summary === "string" &&
    typeof value.metrics.filesChanged === "number" &&
    typeof value.metrics.linesAdded === "number" &&
    typeof value.metrics.linesDeleted === "number" &&
    value.findings.every(isCachedFinding)
  );
}

function isCachedFinding(value: unknown): value is DriftFinding {
  return (
    isRecord(value) &&
    (value.code === undefined || typeof value.code === "string") &&
    ["info", "warn", "action_required", "approval_required", "cleanup_required"].includes(
      String(value.severity)
    ) &&
    typeof value.title === "string" &&
    typeof value.message === "string" &&
    typeof value.category === "string" &&
    (value.file === undefined || typeof value.file === "string") &&
    (value.examples === undefined ||
      (Array.isArray(value.examples) &&
        value.examples.every((example) => typeof example === "string"))) &&
    (value.targetClassifications === undefined ||
      (Array.isArray(value.targetClassifications) &&
        value.targetClassifications.every(
          (target) =>
            isRecord(target) &&
            typeof target.target === "string" &&
            typeof target.classification === "string" &&
            typeof target.reason === "string" &&
            typeof target.evidence === "string"
        )))
  );
}

function isBaselineContext(value: unknown): value is BaselineContext {
  return (
    isRecord(value) &&
    typeof value.hasBaseline === "boolean" &&
    typeof value.preExistingFilesIgnored === "number" &&
    typeof value.sessionFilesChanged === "number" &&
    typeof value.includeBaseline === "boolean" &&
    (value.baselineCreatedAt === undefined || typeof value.baselineCreatedAt === "string") &&
    Array.isArray(value.possiblyPreExistingFiles) &&
    value.possiblyPreExistingFiles.every((path) => typeof path === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function writeCheckCache(cwd: string, cache: IncrementalCheckCache): void {
  ensureGleipDirectory(cwd);
  writeAtomicJson(join(cwd, ".gleip", "check-cache.json"), cache);
}

function incrementalCheckSummary(
  result: CachedCheckResult,
  delta: FindingDelta,
  options: { baseline: boolean; reused: boolean; forced: boolean }
): string {
  if (options.baseline) {
    const findings = result.driftResult.findings.map(formatMarkdownFinding);

    return [
      "Gleip incremental check executed | baseline",
      `Status: ${result.driftResult.status}`,
      `Changes: ${result.driftResult.metrics.filesChanged} files, +${result.driftResult.metrics.linesAdded}/-${result.driftResult.metrics.linesDeleted}`,
      `Findings (${findings.length}):`,
      ...(findings.length === 0 ? ["- None"] : findings),
      `Next: ${result.nextAction}`
    ].join("\n");
  }

  return [
    `Gleip incremental check ${options.reused ? "reused" : "executed"} | ${
      options.reused ? "fingerprint unchanged" : options.forced ? "forced delta" : "delta"
    }`,
    `Status: ${result.driftResult.status}`,
    ...formatDeltaGroup("Added", delta.added),
    ...formatDeltaGroup("Updated", delta.updated),
    ...formatDeltaGroup("Resolved", delta.resolved),
    `Unchanged: ${delta.unchanged}`,
    `Next: ${result.nextAction}`
  ].join("\n");
}

function formatDeltaGroup(label: string, findings: DriftFinding[]): string[] {
  return findings.length === 0
    ? [`${label}: 0`]
    : [`${label}: ${findings.length}`, ...findings.map(formatMarkdownFinding)];
}

function incrementalCheckJson(
  result: CachedCheckResult,
  delta: FindingDelta,
  options: { baseline: boolean; reused: boolean; forced: boolean }
): ReturnType<typeof statusJson> & { incremental: Record<string, unknown> } {
  const deltaEmitted = options.baseline
    ? 0
    : delta.added.length + delta.updated.length + delta.resolved.length;
  const base = statusJson(result.driftResult, result.nextAction, result.baseline);

  return {
    ...base,
    findings: options.baseline ? base.findings : [],
    incremental: {
      execution: options.reused ? "reused" : "executed",
      baseline: options.baseline,
      forced: options.forced,
      delta: options.baseline ? { added: [], updated: [], resolved: [], unchanged: 0 } : delta,
      completeFindingCount: result.driftResult.findings.length,
      efficiency: {
        checksRequested: 1,
        checksExecuted: options.reused ? 0 : 1,
        checksReused: options.reused ? 1 : 0,
        reuseRate: options.reused ? 1 : 0,
        fullFindingsEmitted: options.baseline ? result.driftResult.findings.length : 0,
        deltaFindingsEmitted: deltaEmitted,
        findingsAdded: options.baseline ? 0 : delta.added.length,
        findingsUpdated: options.baseline ? 0 : delta.updated.length,
        findingsResolved: options.baseline ? 0 : delta.resolved.length,
        changedFiles: result.driftResult.metrics.filesChanged,
        validationCycles: "unavailable",
        repeatedValidationCycles: "unavailable",
        observedCommands: ["gleip check --incremental"],
        repeatedObservedCommands: "unavailable"
      }
    }
  };
}

function compactStatusSummary(input: {
  session?: GleipSession | undefined;
  task: string;
  repositoryChanged: boolean;
  checkNecessary: boolean;
  driftResult: DriftResult;
  nextAction: string;
}): string {
  const warningCount = input.driftResult.findings.filter(
    (finding) => displaySeverity(finding.severity) === "warn"
  ).length;
  const blockingCount = input.driftResult.findings.filter((finding) => {
    const severity = displaySeverity(finding.severity);
    return (
      severity === "action_required" ||
      severity === "approval_required" ||
      severity === "cleanup_required"
    );
  }).length;

  // The capture date is the only way to tell that this session belongs to an earlier task. An
  // agent that cannot re-run preflight has to be able to spot a stale brief from the status line.
  const capturedAt = input.session?.created_at;

  return [
    `Session: ${input.session?.sessionId ?? "none"} | Task: ${input.task}${
      capturedAt === undefined ? "" : ` | Captured: ${capturedAt}`
    }`,
    // "Repository changed" meant "changed since the cached check fingerprint" here and "differs
    // from the baseline" in `check`. Both readings are defensible; wearing the same wording in
    // two commands the generated instructions run back-to-back is not, because the pair can
    // report "6 files changed" and "Repository changed: no" one after the other.
    `Changed since last check: ${input.repositoryChanged ? "yes" : "no"}`,
    `Findings: ${warningCount} warning, ${blockingCount} blocking`,
    `Check necessary: ${input.checkNecessary ? "yes" : "no"}`,
    `Next: ${
      input.checkNecessary ? "run npx --no-install gleip check --incremental" : input.nextAction
    }`
  ].join("\n");
}

function nextActionForReport(driftResult: DriftResult): string {
  if (driftResult.status === "clean" && driftResult.metrics.filesChanged === 0) {
    return "Begin implementation or run npx --no-install gleip preflight if this is not the intended session.";
  }

  return deriveBundledNextAction(driftResult.findings);
}

function formatMarkdownFindingGroup(
  findings: DriftFinding[],
  severity: "info" | "warn" | "action_required" | "approval_required" | "cleanup_required"
): string {
  const group = orderFindings(findings).filter(
    (finding) => displaySeverity(finding.severity) === severity
  );

  if (group.length === 0) {
    return "- None";
  }

  return group.map(formatMarkdownFinding).join("\n");
}

function formatMarkdownFinding(finding: DriftFinding): string {
  const recommendation =
    finding.recommendation === undefined ? "" : ` Recommendation: ${finding.recommendation}`;
  const targets =
    finding.targetClassifications === undefined || finding.targetClassifications.length === 0
      ? ""
      : `\n${finding.targetClassifications
          .map(
            (target) =>
              `  - ${target.target} [${target.classification}]: ${target.reason}${target.nextAction === undefined ? "" : ` Next: ${target.nextAction}`}`
          )
          .join("\n")}`;

  return `- ${formatFindingLabel(finding)}: ${finding.message}${recommendation}${targets}`;
}

function orderFindings(findings: DriftFinding[]): DriftFinding[] {
  return [...findings].sort((a, b) => {
    const severityDifference = severityRank(b.severity) - severityRank(a.severity);

    if (severityDifference !== 0) {
      return severityDifference;
    }

    return a.title.localeCompare(b.title);
  });
}

function severityRank(severity: DriftFinding["severity"]): number {
  if (severity === "cleanup_required") {
    return 5;
  }

  if (
    severity === "fail" ||
    severity === "approval_required" ||
    severity === "blocking" ||
    severity === "blocked"
  ) {
    return 4;
  }

  if (severity === "action_required") {
    return 3;
  }

  if (severity === "warn" || severity === "warning") {
    return 2;
  }

  return 1;
}

function formatFindingLabel(finding: {
  code?: string;
  severity: DriftFinding["severity"] | PlanValidationFinding["severity"];
  title: string;
}): string {
  const code = finding.code === undefined ? "" : `[${finding.code}] `;

  return `${code}${displaySeverity(finding.severity)}: ${finding.title}`;
}

function displaySeverity(
  severity: DriftFinding["severity"] | PlanValidationFinding["severity"]
): "info" | "warn" | "action_required" | "approval_required" | "cleanup_required" {
  if (severity === "cleanup_required") {
    return "cleanup_required";
  }

  if (severity === "fail" || severity === "approval_required") {
    return "approval_required";
  }

  if (severity === "blocking" || severity === "blocked" || severity === "action_required") {
    return "action_required";
  }

  if (severity === "warn" || severity === "warning") {
    return "warn";
  }

  return "info";
}

function applyCiExitCode(
  runtime: CommandRuntime,
  options: PrintStatusOptions,
  findings: DriftFinding[]
): void {
  if (
    options.ci === true &&
    findings.some(
      (finding) => finding.code !== undefined && CI_BLOCKING_FINDING_CODES.has(finding.code)
    )
  ) {
    runtime.setExitCode(1);
  }
}

function reportNoActiveSession(runtime: CommandRuntime): void {
  runtime.stdout(
    '[NO_ACTIVE_SESSION] action_required: No active Gleip session found. Run: npx gleip preflight "<task>"'
  );
  runtime.setExitCode(1);
}

function isSupportedNodeVersion(version: string): boolean {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  return Number.isInteger(major) && major >= 20;
}

function isInsideGitRepository(cwd: string): boolean {
  let current = resolve(cwd);

  while (true) {
    if (existsSync(join(current, ".git"))) {
      return true;
    }

    const parent = dirname(current);

    if (parent === current) {
      return false;
    }

    current = parent;
  }
}

function runGit(
  cwd: string,
  args: string[]
): { ok: boolean; status: number | null; stdout: string; stderr: string } {
  try {
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      shell: false
    });

    return {
      ok: result.status === 0,
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")
  ) as { version?: unknown };

  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("Gleip package version is missing.");
  }

  return packageJson.version;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFilePath(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function notGitRepositoryMessage(): string {
  return "This directory is not a git repository. Run Gleip inside a repo or pass --cwd.";
}

function legacyArgusWarnings(cwd: string): string[] {
  const warnings: string[] = [];

  if (
    existsSync(join(cwd, ".argus.yml")) ||
    existsSync(join(cwd, ".argus")) ||
    existsSync(join(cwd, "ARGUS.md")) ||
    agentsHasLegacyArgusMarkers(cwd)
  ) {
    warnings.push(
      "Legacy Argus files detected. This pre-release has been renamed to Gleip. Re-run `npx gleip init` and remove old Argus files after verifying."
    );
  }

  return warnings;
}

function agentsHasLegacyArgusMarkers(cwd: string): boolean {
  const agentsPath = join(cwd, "AGENTS.md");

  if (!existsSync(agentsPath)) {
    return false;
  }

  const content = readFileSync(agentsPath, "utf8");

  return (
    content.includes(LEGACY_ARGUS_SECTION_START) ||
    content.includes(LEGACY_ARGUS_SECTION_END) ||
    content.includes(LEGACY_ARGUS_WORKFLOW_SECTION_START) ||
    content.includes(LEGACY_ARGUS_WORKFLOW_SECTION_END)
  );
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (entrypoint === fileURLToPath(import.meta.url)) {
  await createGleipCommand().parseAsync(process.argv);
}
