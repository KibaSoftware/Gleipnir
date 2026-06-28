#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
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
  collectWorkingTreeDiff as collectBundledWorkingTreeDiff,
  createSessionBaseline as createBundledSessionBaseline,
  filterDiffSinceBaseline as filterBundledDiffSinceBaseline,
  fingerprintRepositoryState,
  isEphemeralGleipArtifactPath
} from "../../core/src/index.js";
import {
  classifyTask as classifyBundledTask,
  createScopeBudget as createBundledScopeBudget,
  discoverRepoContext as discoverBundledRepoContext,
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
const REPORT_SCHEMA_VERSION = "1.2.0";
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
}

interface ValidatePlanOptions {
  file?: string;
  json?: boolean;
}

interface PreflightOptions {
  file?: string;
}

interface ReportOptions {
  json?: boolean;
}

interface GleipState {
  enabled: boolean;
  updatedAt: string;
  updatedBy: "local-cli";
  reason: string | null;
}

interface GleipConfigLike {
  approval_required_for?: string[];
  limits?: {
    max_files_changed_warning?: number;
    max_lines_added_warning?: number;
    max_lines_deleted_warning?: number;
  };
  mode?: string;
  protected_paths?: string[];
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
}

interface ValidateAgentPlanInput {
  planText: string;
  scopeBudget: ScopeBudget;
  config?: GleipConfigLike;
  cwd?: string;
  taskText?: string;
  contextFiles?: string[];
}

interface CollectWorkingTreeDiffOptions {
  cwd: string;
  base?: string;
}

interface DetectScopeDriftInput {
  scopeBudget: ScopeBudget;
  gitDiffContext: GitDiffContext;
  config: GleipConfigLike;
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
  missingArtifacts?: string[];
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
  finalResponse: {
    markdown: string;
    unresolvedWarnings: number;
  };
  warnings: Array<{
    id: string;
    type:
      | "scope"
      | "plan"
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
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        '  $ gleip preflight "Fix the checkout discount calculation bug without changing payment provider integration or checkout routing"',
        "  $ gleip preflight --file task.md"
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
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        '  $ gleip validate-plan "Update the discount calculation and its focused checkout tests"',
        "  $ gleip validate-plan --file plan.md",
        "  $ Get-Content plan.md | gleip validate-plan"
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
        "Gleip disabled. Agents should confirm whether to continue without Gleip guidance."
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
        writeStatusFile: false,
        updateSession: false
      });
    });

  program
    .command("report")
    .description("Generate the canonical local-only Gleip session report.")
    .option("--json", "Print the stable report JSON.")
    .action(async (commandOptions: ReportOptions) => {
      await printReport(runtime, commandOptions);
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

async function generateSessionReportFromPackage(
  input: GenerateSessionReportInput
): Promise<SessionReport> {
  return generateBundledSessionReport(input);
}

async function renderSessionReportMarkdownFromPackage(report: SessionReport): Promise<string> {
  return renderBundledSessionReportMarkdown(report);
}

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

    await preflight(runtime, task, normalizeRepoRelativePath(runtime.cwd, taskPath));
    return;
  }

  if (inlineTask.length === 0) {
    runtime.stdout(
      'No task text provided. Pass `gleip preflight "<task>"` or use `--file <path>`.'
    );
    runtime.setExitCode(1);
    return;
  }

  await preflight(runtime, inlineTask);
}

async function preflight(runtime: CommandRuntime, task: string, taskFile?: string): Promise<void> {
  const state = loadGleipState(runtime.cwd);
  const config = (await runtime.loadConfig(runtime.cwd)) as GleipConfigLike;
  const classification = await runtime.classifyTask(task);
  const repoContext = await runtime.discoverRepoContext({
    cwd: runtime.cwd,
    task,
    contextFiles: taskFile === undefined ? [] : [taskFile],
    config,
    classification
  });
  const scopeBudget = await runtime.createScopeBudget({
    task,
    classification,
    repoContext,
    config
  });
  const implementationBrief = await runtime.generateImplementationBrief({
    task,
    classification,
    repoContext,
    scopeBudget,
    config
  });
  const createdAt = runtime.now().toISOString();
  const baselineDiff = await runtime.collectWorkingTreeDiff({ cwd: runtime.cwd });

  if (!baselineDiff.isGitRepo) {
    runtime.stdout(notGitRepositoryMessage());
    return;
  }

  const baseline = await runtime.createSessionBaseline(baselineDiff, createdAt);
  const initialDriftResult = emptyDriftResult();
  const brief = addBaselineNote(implementationBrief, baseline);
  const sessionId = createSessionId(createdAt);

  ensureGleipGitignore(runtime.cwd);
  ensureGleipDirectory(runtime.cwd);
  writeFileSync(
    join(runtime.cwd, ".gleip", "session.json"),
    `${JSON.stringify(
      {
        version: 1,
        sessionId,
        task,
        ...(taskFile === undefined ? {} : { taskFile }),
        classification,
        repoContext,
        baseline: summarizeBaseline(baseline),
        scopeBudgetSummary: summarizeScopeBudget(scopeBudget),
        status: "ready",
        approval: "not_required",
        created_at: createdAt,
        updated_at: createdAt
      },
      null,
      2
    )}\n`
  );
  writeFileSync(
    join(runtime.cwd, ".gleip", "baseline.json"),
    `${JSON.stringify(baseline, null, 2)}\n`
  );
  writeFileSync(join(runtime.cwd, ".gleip", "brief.md"), brief);
  writeFileSync(join(runtime.cwd, ".gleip", "scope-budget.json"), scopeBudgetContent(scopeBudget));
  writeFileSync(
    join(runtime.cwd, ".gleip", "status.md"),
    statusContent(
      initialDriftResult,
      nextActionForReport(initialDriftResult),
      baselineContextForPreflight(baseline),
      {
        phase: "preflight",
        generatedAt: createdAt,
        repositoryFingerprint: fingerprintRepositoryState(baselineDiff),
        sessionId,
        currentArtifact: ".gleip/status.md"
      }
    )
  );

  const output = [
    "Gleip preflight complete · brief and scope budget ready",
    "Artifacts: .gleip/brief.md, .gleip/scope-budget.json",
    scopeBudget.planRequired === false
      ? "Next: make the documentation change, review the diff, then run status"
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

  if (!existsSync(sessionPath)) {
    reportNoActiveSession(runtime);
    return;
  }

  const scopeBudget = readScopeBudget(runtime.cwd);

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
  const result = await runtime.validateAgentPlan({
    planText: planInput.text,
    scopeBudget,
    config,
    cwd: runtime.cwd,
    taskText: session.value?.task ?? "",
    contextFiles: planInput.planFile === undefined ? [] : [planInput.planFile]
  });

  if (session.value !== undefined) {
    const updatedAt = runtime.now().toISOString();
    const validationRecord = {
      ...result,
      validatedAt: updatedAt
    };
    const refinedScopeBudget = isSuccessfulPlanValidationStatus(result.status)
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
    if (isSuccessfulPlanValidationStatus(result.status)) {
      writeFileSync(
        join(runtime.cwd, ".gleip", "scope-budget.json"),
        scopeBudgetContent(refinedScopeBudget)
      );
    }
    writeFileSync(
      sessionPath,
      `${JSON.stringify(
        {
          ...session.value,
          ...(refinedClassification === undefined ? {} : { classification: refinedClassification }),
          scopeBudgetSummary: summarizeScopeBudget(refinedScopeBudget),
          latestValidationAttempt: validationRecord,
          latestPlanValidation: validationRecord,
          ...(isSuccessfulPlanValidationStatus(result.status)
            ? {
                latestSuccessfulValidation: validationRecord,
                latestSuccessfulPlanValidation: validationRecord
              }
            : {}),
          updated_at: updatedAt
        },
        null,
        2
      )}\n`
    );
  }
  const output =
    options.json === true
      ? JSON.stringify(planValidationJson(result), null, 2)
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
  const task = session.task ?? "Unknown task";
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
          config
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
    writeFileSync(join(runtime.cwd, ".gleip", "status.md"), status);
  }

  if (options.updateSession !== false) {
    ensureGleipGitignore(runtime.cwd);
    writeFileSync(
      sessionPath,
      `${JSON.stringify(
        {
          ...session,
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
        },
        null,
        2
      )}\n`
    );
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
            filtered.baseline
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

  if (sessionResult.value === undefined) {
    missingArtifacts.push("session.json");
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
            config: config ?? {}
          })
        );
  const latestAttempt = latestValidationAttempt(sessionResult.value);
  const acceptedValidation = latestSuccessfulPlanValidation(sessionResult.value);
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
    ...(statusResult === undefined || !isCurrentStatusContent(statusResult, repositoryFingerprint)
      ? {}
      : { statusContent: statusResult }),
    missingArtifacts
  });
  const markdown = await runtime.renderSessionReportMarkdown(report);

  ensureGleipGitignore(runtime.cwd);
  ensureGleipDirectory(runtime.cwd);
  writeFileSync(join(runtime.cwd, ".gleip", "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(runtime.cwd, ".gleip", "report.md"), markdown);

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
          config
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
            baseline
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
      writeFileSync(join(runtime.cwd, modification.path), modification.content);
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

  writeFileSync(filePath, content);
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

  writeFileSync(gitignorePath, updated);
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
  writeFileSync(join(cwd, ".gleip", "state.json"), `${JSON.stringify(state, null, 2)}\n`);
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
  writeFileSync(filePath, upsertGleipSection(existing, target));
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
- If the local package command cannot be run, ask: "Gleip is configured for this repository, but I could not run it through the local package command. Do you want me to continue without Gleip guidance? y/n". Wait for confirmation.
- Before editing code, check \`.gleip/state.json\`. If \`enabled\` is false, ask: "Gleip is currently inactive. Do you want me to continue without Gleip guidance? y/n". Wait for confirmation.
- If enabled, run \`npx --no-install gleip preflight "<user task>"\`.
- Read \`.gleip/brief.md\` and \`.gleip/scope-budget.json\`.
- For a non-trivial change, draft a short implementation plan and run \`npx --no-install gleip validate-plan "<plan>"\` before implementing it.
- Treat \`aligned\` as ready, review \`advisory\`, clarify \`needs_clarification\`, clean up \`needs_cleanup\`, and request approval for \`needs_approval\`.
- During implementation, use the expected paths in \`.gleip/scope-budget.json\` as guidance and explain necessary expansion.
- Keep changes minimal and scoped to the requested task.
- Do not edit or commit files under \`.gleip/\` unless the user explicitly asks.
- During iteration, run the narrowest existing validation that covers the changed area.
- Do not rerun a full validation suite while repository state is unchanged.
- Before final completion, run the complete required validation once. Rerun it only after changes that can invalidate the result.
- Before claiming completion, run \`npx --no-install gleip check --incremental\`.
- Run \`npx --no-install gleip status --compact\` whenever Gleip's expected next action is unclear.
- Address cleanup and action-required findings before finalizing. Request approval for approval-required changes.
- Before the final response, run \`npx --no-install gleip status --compact\`. Report \`advisory\`, \`needs_attention\`, \`needs_cleanup\`, or \`needs_approval\` clearly.
- Before the final response, run or read \`npx --no-install gleip report\`.
- Treat \`.gleip/report.json\` and \`.gleip/report.md\` as the source of truth for Gleip final status.
- Include only the generated compact block under \`Recommended final response\`; do not paste the full report.
- The generated block contains scope adherence, drift risk, repository hygiene, output discipline, estimated token waste avoided, and unresolved warnings.
- Final response must also include files changed, tests run, and risks.

## Gleip working standard

### 1. Think before coding

Do not assume, hide confusion, or silently choose between ambiguous interpretations.

Before implementing:
- State assumptions explicitly.
- If uncertain, ask before editing.
- If multiple interpretations exist, present them instead of choosing silently.
- If a simpler approach exists, say so.
- Push back when the requested approach appears overcomplicated, risky, or broader than needed.
- If something is unclear, stop, name what is confusing, and ask.

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
- [ ] Run \`npx --no-install gleip preflight "<task>"\`
- [ ] Read \`.gleip/brief.md\`
- [ ] Validate plan with \`npx --no-install gleip validate-plan\`
- [ ] Implement within \`.gleip/scope-budget.json\`
- [ ] Run narrow validation while iterating and complete required validation once before final completion
- [ ] Run \`npx --no-install gleip check --incremental\`
- [ ] Run \`npx --no-install gleip status --compact\`
- [ ] Run or read \`npx --no-install gleip report\`
- [ ] Include only the generated compact Gleip block, plus files changed, tests run, and risks
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
mode: advisory

principles:
  - Keep generated code lean, scoped, tested, and merge-ready.
  - Avoid speculative refactors and unnecessary dependencies.

limits:
  max_files_changed_warning: 12
  max_lines_added_warning: 500
  max_lines_deleted_warning: 250

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

Agents should run \`npx --no-install gleip preflight "<task>"\` before editing code, validate a short plan with \`npx --no-install gleip validate-plan "<plan>"\`, use the generated expected scope as guidance, then run \`npx --no-install gleip check --incremental\`, \`npx --no-install gleip status --compact\`, and \`npx --no-install gleip report\` before the final response.

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
  const acceptedTargets = mergePathLists(directTargets, derivedTargets, fallbackTargets);

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
    explicitScope: mergePathLists(scopeBudget.explicitScope ?? [], directTargets, fallbackTargets),
    derivedScope: mergePathLists(scopeBudget.derivedScope ?? [], derivedTargets),
    contextDocsTouchAllowed:
      scopeBudget.contextDocsTouchAllowed === true || contextTargets.length > 0,
    readOnlyContextPaths: (scopeBudget.readOnlyContextPaths ?? []).filter(
      (path) => !acceptedTargets.includes(normalizePlanPath(path))
    )
  };
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
  const workflowProfile = summary?.workflowProfile ?? classification.workflowProfile ?? "local_behavior_change";

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

function statusInteractionSummary(
  commandName: "check" | "status",
  driftResult: DriftResult,
  nextAction: string,
  baseline: BaselineContext
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
    for (const line of formatScopeTargetLines(driftResult.findings)) {
      lines.push(line);
    }
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
  const firstFinding = orderPlanFindings(result.findings)[0];

  if (firstFinding !== undefined) {
    lines.push(`Finding: ${formatFindingLabel(firstFinding)} · ${firstFinding.message}`);
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
} {
  return {
    status: result.status,
    findings: orderPlanFindings(result.findings),
    nextAction: result.nextAction,
    parsedPlan: result.parsedPlan,
    ...(result.targetClassifications === undefined
      ? {}
      : { targetClassifications: result.targetClassifications })
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

    if (!input.reused) {
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
  writeFileSync(join(cwd, ".gleip", "check-cache.json"), `${JSON.stringify(cache, null, 2)}\n`);
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

  return [
    `Session: ${input.session?.sessionId ?? "none"} | Task: ${input.task}`,
    `Repository changed: ${input.repositoryChanged ? "yes" : "no"}`,
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
