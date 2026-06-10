#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

const GLEIP_SECTION_START = "<!-- GLEIP:START -->";
const GLEIP_SECTION_END = "<!-- GLEIP:END -->";
const LEGACY_ARGUS_SECTION_START = "<!-- ARGUS:START -->";
const LEGACY_ARGUS_SECTION_END = "<!-- ARGUS:END -->";
const LEGACY_ARGUS_WORKFLOW_SECTION_START = "<!-- ARGUS:AGENT-WORKFLOW:START -->";
const LEGACY_ARGUS_WORKFLOW_SECTION_END = "<!-- ARGUS:AGENT-WORKFLOW:END -->";
const SUPPORTED_AGENT_TARGETS = ["auto", "generic", "codex", "claude", "cursor"] as const;
const AGENT_INSTRUCTION_TARGETS = ["generic", "claude", "cursor"] as const;
const NO_AGENT_SETUP_MESSAGE =
  "No specific agent setup detected. Created generic AGENTS.md. To prepare all supported agents, run `npx gleip init --all-agents`.";
const GLEIP_VERSION = "0.3.0";
const REPORT_SCHEMA_VERSION = "1.0.0";

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
  stderr?: OutputWriter;
  stdout?: OutputWriter;
  generateSessionReport?: GenerateSessionReport;
  renderSessionReportMarkdown?: RenderSessionReportMarkdown;
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
  stderr: OutputWriter;
  stdout: OutputWriter;
  generateSessionReport: GenerateSessionReport;
  renderSessionReportMarkdown: RenderSessionReportMarkdown;
  validateAgentPlan: ValidateAgentPlan;
}

interface InitOptions {
  agent?: string;
  allAgents?: boolean;
  force?: boolean;
}

interface DoctorOptions {
  agents?: boolean;
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
  includeBaseline?: boolean;
  json?: boolean;
}

interface ValidatePlanOptions {
  file?: string;
  json?: boolean;
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
}

interface DiscoverRepoContextOptions {
  classification: TaskClassification;
  config: GleipConfigLike;
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

type DriftStatus = "within_scope" | "warning" | "approval_required" | "blocked";

interface DriftFinding {
  severity: "info" | "warning" | "approval_required" | "blocked";
  title: string;
  message: string;
  file?: string;
  count?: number;
  examples?: string[];
  recommendation?: string;
  category: string;
}

interface RepoContext {
  taskTerms: string[];
  likelyRelevantFiles: RepoFileMatch[];
  likelyTestFiles: RepoFileMatch[];
  existingPatternMatches: RepoPatternMatch[];
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
    ciChangesAllowed: boolean;
    skippedTestsAllowed: boolean;
    deletedTestsAllowed: boolean;
    secretsAllowed: boolean;
  };
  allowedPaths: string[];
  suspiciousPaths: string[];
  approvalRequiredFor: string[];
  blockedWithoutApproval: string[];
  requiredTests: boolean;
  testGuidance: string[];
  stopConditions: string[];
  reasons: string[];
}

type PlanValidationStatus = "approved" | "needs_revision" | "requires_approval";

interface PlanValidationFinding {
  severity: "info" | "warning" | "approval_required";
  title: string;
  message: string;
  recommendation?: string;
  evidence?: string[];
}

interface AgentPlan {
  rawText: string;
  proposedFiles: string[];
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
}

interface GenerateSessionReportInput {
  version: string;
  schemaVersion: string;
  sessionId?: string | null;
  generatedAt: string;
  scopeBudget?: ScopeBudget;
  diff: GitDiffContext;
  driftResult: DriftResult;
  planValidation?: PlanValidationResult;
  statusContent?: string;
  missingArtifacts?: string[];
}

interface SessionReport {
  version: string;
  schemaVersion: string;
  sessionId: string | null;
  generatedAt: string;
  scores: {
    scopeAdherence: number;
    planAlignment: number;
    outputDiscipline: number;
    reviewReadiness: number;
  };
  risk: {
    drift: "none" | "low" | "medium" | "high";
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

interface GleipSession {
  sessionId?: string;
  classification?: TaskClassification;
  latestPlanValidation?: PlanValidationResult & { validatedAt?: string };
  latestStatus?: unknown;
  repoContext?: RepoContext;
  baseline?: BaselineSummary;
  scopeBudgetSummary?: ScopeBudgetSummary;
  task?: string;
  [key: string]: unknown;
}

interface ScopeBudgetSummary {
  expectedFilesChanged: NumberRange;
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
    stderr: options.stderr ?? ((message) => console.error(message)),
    stdout: options.stdout ?? ((message) => console.log(message)),
    generateSessionReport: options.generateSessionReport ?? generateSessionReportFromPackage,
    renderSessionReportMarkdown:
      options.renderSessionReportMarkdown ?? renderSessionReportMarkdownFromPackage,
    validateAgentPlan: options.validateAgentPlan ?? validateAgentPlanFromPackage
  };
  const program = new Command();

  program
    .name("gleip")
    .description(
      "Run local-only preflight, scope budget, and status guardrails for coding-agent work."
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
    .option(
      "--agent <name>",
      "Create instructions for auto, generic, codex, claude, or cursor.",
      "auto"
    )
    .option("--all-agents", "Create instructions for generic/Codex, Claude, and Cursor.")
    .option("--force", "Overwrite generated Gleip files.")
    .addHelpText("after", "\nExamples:\n  $ gleip init --all-agents\n  $ gleip init --agent claude")
    .action((commandOptions: InitOptions) => {
      initRepository(runtime, commandOptions);
    });

  program
    .command("preflight")
    .description("Create a local-only brief, scope budget, and status baseline for a task.")
    .argument("<task>", "Task the coding agent is about to implement.")
    .addHelpText(
      "after",
      '\nExample:\n  $ gleip preflight "Fix the checkout discount calculation bug without changing payment provider integration or checkout routing"'
    )
    .action(async (task: string) => {
      await preflight(runtime, task);
    });

  program
    .command("start")
    .description("Alias for gleip preflight.")
    .argument("<task>", "Task the coding agent is about to implement.")
    .action(async (task: string) => {
      await preflight(runtime, task);
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
    .description("Enable local-only Gleip guardrails for this repository.")
    .option("--reason <reason>", "Reason for enabling Gleip.")
    .action((commandOptions: StateChangeOptions) => {
      setGleipEnabled(runtime.cwd, true, commandOptions.reason, runtime.now().toISOString());
      runtime.stdout("Gleip enabled.");
    });

  program
    .command("disable")
    .description("Disable local-only Gleip guardrails for this repository.")
    .option("--reason <reason>", "Reason for disabling Gleip.")
    .action((commandOptions: StateChangeOptions) => {
      setGleipEnabled(runtime.cwd, false, commandOptions.reason, runtime.now().toISOString());
      runtime.stdout(
        "Gleip disabled. Agents should ask before proceeding without Gleip guardrails."
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
    .option(
      "--include-baseline",
      "Analyze the full working tree, including preflight baseline changes."
    )
    .option("--json", "Print status as JSON.")
    .action(async (commandOptions: StatusCommandOptions) => {
      await printStatus(runtime, {
        commandName: "status",
        disabledSuffix: "Status can still be checked manually.",
        includeBaseline: commandOptions.includeBaseline === true,
        json: commandOptions.json === true
      });
    });

  program
    .command("check")
    .description("Check current repository changes against the local-only scope budget.")
    .option(
      "--include-baseline",
      "Analyze the full working tree, including preflight baseline changes."
    )
    .option("--json", "Print check result as JSON.")
    .action(async (commandOptions: StatusCommandOptions) => {
      await printStatus(runtime, {
        allowMissingSession: true,
        commandName: "check",
        disabledSuffix: "Check can still be run manually.",
        includeBaseline: commandOptions.includeBaseline === true,
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
    .option(
      "--keep-agent-files",
      "Keep AGENTS.md, CLAUDE.md, and .cursor/rules/gleip.mdc unchanged."
    )
    .option("--force", "Skip confirmation prompts; does not remove unrelated files.")
    .addHelpText(
      "after",
      [
        "",
        "Removes .gleip/, .gleip.yml, GLEIP.md, Gleip-managed sections in agent files,",
        "and the Gleip-generated Cursor rule. Package dependencies are not changed.",
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
  const packageName = "@gleip/config";
  let configPackage: { loadConfig: LoadConfig };

  try {
    configPackage = await loadConfigFromSource(undefined);
  } catch (fallbackError) {
    try {
      configPackage = (await import(packageName)) as { loadConfig: LoadConfig };
    } catch {
      throw fallbackError;
    }
  }

  return configPackage.loadConfig(cwd);
}

async function loadConfigFromSource(
  error: unknown | undefined
): Promise<{ loadConfig: LoadConfig }> {
  const configDistUrl = new URL("../../config/dist/index.js", import.meta.url);
  const configSourceUrl = new URL("../../config/src/index.ts", import.meta.url);

  try {
    return (await import(configDistUrl.href)) as { loadConfig: LoadConfig };
  } catch (distError) {
    if (isBuiltEntrypoint()) {
      throw distError;
    }
    // Fall through to the TypeScript source path for local tsx development.
  }

  try {
    return (await import(configSourceUrl.href)) as { loadConfig: LoadConfig };
  } catch (sourceError) {
    throw error ?? sourceError;
  }
}

async function classifyTaskFromPackage(task: string): Promise<TaskClassification> {
  const packageName = "@gleip/planner";
  const plannerPackage = await loadPlannerPackage(packageName);

  return plannerPackage.classifyTask(task);
}

async function discoverRepoContextFromPackage(
  options: DiscoverRepoContextOptions
): Promise<RepoContext> {
  const packageName = "@gleip/planner";
  const plannerPackage = await loadPlannerPackage(packageName);

  return plannerPackage.discoverRepoContext(options);
}

async function createScopeBudgetFromPackage(input: CreateScopeBudgetInput): Promise<ScopeBudget> {
  const packageName = "@gleip/planner";
  const plannerPackage = await loadPlannerPackage(packageName);

  return plannerPackage.createScopeBudget(input);
}

async function generateImplementationBriefFromPackage(
  input: GenerateImplementationBriefInput
): Promise<string> {
  const packageName = "@gleip/planner";
  const plannerPackage = await loadPlannerPackage(packageName);

  return plannerPackage.generateImplementationBrief(input);
}

async function validateAgentPlanFromPackage(
  input: ValidateAgentPlanInput
): Promise<PlanValidationResult> {
  const packageName = "@gleip/planner";
  const plannerPackage = await loadPlannerPackage(packageName);

  return plannerPackage.validateAgentPlan(input);
}

async function collectWorkingTreeDiffFromPackage(
  options: CollectWorkingTreeDiffOptions
): Promise<GitDiffContext> {
  const packageName = "@gleip/core";
  const corePackage = await loadCorePackage(packageName);

  return corePackage.collectWorkingTreeDiff(options);
}

async function createSessionBaselineFromPackage(
  diff: GitDiffContext,
  createdAt: string
): Promise<SessionBaseline> {
  const packageName = "@gleip/core";
  const corePackage = await loadCorePackage(packageName);

  return corePackage.createSessionBaseline(diff, createdAt);
}

async function filterDiffSinceBaselineFromPackage(
  currentDiff: GitDiffContext,
  baseline: SessionBaseline | undefined,
  options?: { includeBaseline?: boolean }
): Promise<BaselineFilteredDiff> {
  const packageName = "@gleip/core";
  const corePackage = await loadCorePackage(packageName);

  return corePackage.filterDiffSinceBaseline(currentDiff, baseline, options);
}

async function loadCorePackage(packageName: string): Promise<{
  collectWorkingTreeDiff: CollectWorkingTreeDiff;
  createSessionBaseline: CreateSessionBaseline;
  filterDiffSinceBaseline: FilterDiffSinceBaseline;
}> {
  try {
    return await loadCoreFromSource(undefined);
  } catch (fallbackError) {
    try {
      return (await import(packageName)) as {
        collectWorkingTreeDiff: CollectWorkingTreeDiff;
        createSessionBaseline: CreateSessionBaseline;
        filterDiffSinceBaseline: FilterDiffSinceBaseline;
      };
    } catch {
      throw fallbackError;
    }
  }
}

async function loadCoreFromSource(error: unknown): Promise<{
  collectWorkingTreeDiff: CollectWorkingTreeDiff;
  createSessionBaseline: CreateSessionBaseline;
  filterDiffSinceBaseline: FilterDiffSinceBaseline;
}> {
  const coreDistUrl = new URL("../../core/dist/index.js", import.meta.url);
  const coreSourceUrl = new URL("../../core/src/index.ts", import.meta.url);

  try {
    return (await import(coreDistUrl.href)) as {
      collectWorkingTreeDiff: CollectWorkingTreeDiff;
      createSessionBaseline: CreateSessionBaseline;
      filterDiffSinceBaseline: FilterDiffSinceBaseline;
    };
  } catch (distError) {
    if (isBuiltEntrypoint()) {
      throw distError;
    }
    // Fall through to the TypeScript source path for local tsx development.
  }

  try {
    return (await import(coreSourceUrl.href)) as {
      collectWorkingTreeDiff: CollectWorkingTreeDiff;
      createSessionBaseline: CreateSessionBaseline;
      filterDiffSinceBaseline: FilterDiffSinceBaseline;
    };
  } catch (sourceError) {
    throw error ?? sourceError;
  }
}

async function detectScopeDriftFromPackage(input: DetectScopeDriftInput): Promise<DriftResult> {
  const packageName = "@gleip/controller";
  const controllerPackage = await loadControllerPackage(packageName);

  return controllerPackage.detectScopeDrift(input);
}

async function generateSessionReportFromPackage(
  input: GenerateSessionReportInput
): Promise<SessionReport> {
  const controllerPackage = await loadControllerPackage("@gleip/controller");
  return controllerPackage.generateSessionReport(input);
}

async function renderSessionReportMarkdownFromPackage(report: SessionReport): Promise<string> {
  const controllerPackage = await loadControllerPackage("@gleip/controller");
  return controllerPackage.renderSessionReportMarkdown(report);
}

async function loadControllerPackage(packageName: string): Promise<{
  detectScopeDrift: DetectScopeDrift;
  generateSessionReport: GenerateSessionReport;
  renderSessionReportMarkdown: RenderSessionReportMarkdown;
}> {
  try {
    return await loadControllerFromSource(undefined);
  } catch (fallbackError) {
    try {
      return (await import(packageName)) as {
        detectScopeDrift: DetectScopeDrift;
        generateSessionReport: GenerateSessionReport;
        renderSessionReportMarkdown: RenderSessionReportMarkdown;
      };
    } catch {
      throw fallbackError;
    }
  }
}

async function loadControllerFromSource(error: unknown): Promise<{
  detectScopeDrift: DetectScopeDrift;
  generateSessionReport: GenerateSessionReport;
  renderSessionReportMarkdown: RenderSessionReportMarkdown;
}> {
  const controllerDistUrl = new URL("../../controller/dist/index.js", import.meta.url);
  const controllerSourceUrl = new URL("../../controller/src/index.ts", import.meta.url);

  if (!isBuiltEntrypoint()) {
    try {
      return (await import(controllerSourceUrl.href)) as {
        detectScopeDrift: DetectScopeDrift;
        generateSessionReport: GenerateSessionReport;
        renderSessionReportMarkdown: RenderSessionReportMarkdown;
      };
    } catch {
      // Fall through to dist/package loading for environments without TypeScript loading.
    }
  }

  try {
    const controllerPackage = (await import(controllerDistUrl.href)) as {
      detectScopeDrift: DetectScopeDrift;
      generateSessionReport?: GenerateSessionReport;
      renderSessionReportMarkdown?: RenderSessionReportMarkdown;
    };

    if (
      controllerPackage.generateSessionReport !== undefined &&
      controllerPackage.renderSessionReportMarkdown !== undefined
    ) {
      return {
        detectScopeDrift: controllerPackage.detectScopeDrift,
        generateSessionReport: controllerPackage.generateSessionReport,
        renderSessionReportMarkdown: controllerPackage.renderSessionReportMarkdown
      };
    }

    if (isBuiltEntrypoint()) {
      throw new Error("Built @gleip/controller is missing report exports.");
    }
  } catch (distError) {
    if (isBuiltEntrypoint()) {
      throw distError;
    }
    // Fall through to the TypeScript source path for local tsx development.
  }

  try {
    return (await import(controllerSourceUrl.href)) as {
      detectScopeDrift: DetectScopeDrift;
      generateSessionReport: GenerateSessionReport;
      renderSessionReportMarkdown: RenderSessionReportMarkdown;
    };
  } catch (sourceError) {
    throw error ?? sourceError;
  }
}

async function loadPlannerPackage(packageName: string): Promise<{
  classifyTask: ClassifyTask;
  createScopeBudget: CreateScopeBudget;
  discoverRepoContext: DiscoverRepoContext;
  generateImplementationBrief: GenerateImplementationBrief;
  validateAgentPlan: ValidateAgentPlan;
}> {
  try {
    return await loadPlannerFromSource(undefined);
  } catch (fallbackError) {
    try {
      return (await import(packageName)) as {
        classifyTask: ClassifyTask;
        createScopeBudget: CreateScopeBudget;
        discoverRepoContext: DiscoverRepoContext;
        generateImplementationBrief: GenerateImplementationBrief;
        validateAgentPlan: ValidateAgentPlan;
      };
    } catch {
      throw fallbackError;
    }
  }
}

async function loadPlannerFromSource(error: unknown | undefined): Promise<{
  classifyTask: ClassifyTask;
  createScopeBudget: CreateScopeBudget;
  discoverRepoContext: DiscoverRepoContext;
  generateImplementationBrief: GenerateImplementationBrief;
  validateAgentPlan: ValidateAgentPlan;
}> {
  const plannerDistUrl = new URL("../../planner/dist/index.js", import.meta.url);
  const plannerSourceUrl = new URL("../../planner/src/index.ts", import.meta.url);

  try {
    return (await import(plannerDistUrl.href)) as {
      classifyTask: ClassifyTask;
      createScopeBudget: CreateScopeBudget;
      discoverRepoContext: DiscoverRepoContext;
      generateImplementationBrief: GenerateImplementationBrief;
      validateAgentPlan: ValidateAgentPlan;
    };
  } catch (distError) {
    if (isBuiltEntrypoint()) {
      throw distError;
    }
    // Fall through to the TypeScript source path for local tsx development.
  }

  try {
    return (await import(plannerSourceUrl.href)) as {
      classifyTask: ClassifyTask;
      createScopeBudget: CreateScopeBudget;
      discoverRepoContext: DiscoverRepoContext;
      generateImplementationBrief: GenerateImplementationBrief;
      validateAgentPlan: ValidateAgentPlan;
    };
  } catch (sourceError) {
    throw error ?? sourceError;
  }
}

function initRepository(runtime: CommandRuntime, options: InitOptions): void {
  const force = options.force === true;
  const selection = initAgentInstructionFiles(runtime.cwd, options);
  const agentInstructions = selection.files;
  const agentInstructionFiles = agentInstructions.map((file) => file.path);

  ensureGleipDirectory(runtime.cwd);
  writeGleipStateIfMissing(runtime.cwd, getDefaultGleipState(runtime.now().toISOString()), force);
  writeGeneratedFile(join(runtime.cwd, ".gleip.yml"), defaultConfigContent(), force);
  writeGeneratedFile(join(runtime.cwd, "GLEIP.md"), defaultGleipReadmeContent(), force);
  for (const file of agentInstructions) {
    writeAgentInstructionFile(join(runtime.cwd, file.path), file.defaultContent, file.target);
  }

  const output = [
    "Gleip initialized.",
    `Agent instructions created/updated: ${agentInstructionFiles.join(", ")}.`
  ];

  if (selection.noAgentSetupDetected) {
    output.push(NO_AGENT_SETUP_MESSAGE);
  }

  output.push(
    "",
    "Continue using your coding agent normally.",
    "The agent should run Gleip preflight, validate-plan, status, and report automatically."
  );

  runtime.stdout(output.join("\n"));
}

async function preflight(runtime: CommandRuntime, task: string): Promise<void> {
  const state = loadGleipState(runtime.cwd);
  const config = (await runtime.loadConfig(runtime.cwd)) as GleipConfigLike;
  const classification = await runtime.classifyTask(task);
  const repoContext = await runtime.discoverRepoContext({
    cwd: runtime.cwd,
    task,
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

  ensureGleipDirectory(runtime.cwd);
  writeFileSync(
    join(runtime.cwd, ".gleip", "session.json"),
    `${JSON.stringify(
      {
        version: 1,
        sessionId,
        task,
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
      baselineContextForPreflight(baseline)
    )
  );

  const output = [
    "Gleip preflight complete · brief and scope budget ready",
    "Artifacts: .gleip/brief.md, .gleip/scope-budget.json",
    "Next: validate plan before editing"
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
    runtime.stdout('No gleip brief found. Run `npx --no-install gleip preflight "<task>"` first.');
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
    runtime.stdout(
      'No active Gleip session found. Run `npx --no-install gleip preflight "<task>"` first.'
    );
    return;
  }

  const scopeBudget = readScopeBudget(runtime.cwd);

  if (scopeBudget === undefined) {
    runtime.stdout(
      'No scope budget found for this session. Re-run `npx --no-install gleip preflight "<task>"`.'
    );
    return;
  }

  const planText = readPlanText(runtime, planTextParts, options);

  if (planText === undefined) {
    return;
  }

  if (planText.trim().length === 0) {
    runtime.stdout(
      'No plan text provided. Pass `npx --no-install gleip validate-plan "<plan>"`, use `--file <file>`, or pipe a plan on stdin.'
    );
    return;
  }

  const config = (await runtime.loadConfig(runtime.cwd)) as GleipConfigLike;
  const result = await runtime.validateAgentPlan({
    planText,
    scopeBudget,
    config
  });
  const session = readJsonFile<GleipSession>(sessionPath);

  if (session.value !== undefined) {
    writeFileSync(
      sessionPath,
      `${JSON.stringify(
        {
          ...session.value,
          latestPlanValidation: {
            ...result,
            validatedAt: runtime.now().toISOString()
          },
          updated_at: runtime.now().toISOString()
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
): string | undefined {
  if (options.file !== undefined) {
    const planPath = resolve(runtime.cwd, options.file);

    if (!existsSync(planPath)) {
      runtime.stdout(`Plan file not found: ${options.file}.`);
      return undefined;
    }

    return readFileSync(planPath, "utf8");
  }

  if (planTextParts.length > 0) {
    return planTextParts.join(" ");
  }

  if (!process.stdin.isTTY) {
    return readFileSync(0, "utf8");
  }

  return "";
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
  commandName?: "check" | "status";
  disabledSuffix?: string;
  includeBaseline?: boolean;
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

    runtime.stdout(
      'No active Gleip session found. Run `npx --no-install gleip preflight "<task>"` first.'
    );
    return;
  }

  const session = JSON.parse(readFileSync(sessionPath, "utf8")) as GleipSession;
  const updatedAt = runtime.now().toISOString();
  const task = session.task ?? "Unknown task";
  const classification = session.classification ?? (await runtime.classifyTask(task));
  const repoContext = session.repoContext ?? emptyRepoContext();
  const scopeBudget =
    readScopeBudget(runtime.cwd) ??
    scopeBudgetFromSummary(session.scopeBudgetSummary, classification);
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
  const driftResult = await runtime.detectScopeDrift({
    scopeBudget,
    gitDiffContext: filtered.diff,
    config
  });
  const nextAction = nextActionForReport(driftResult);
  const status = statusContent(driftResult, nextAction, filtered.baseline);

  if (options.writeStatusFile !== false) {
    writeFileSync(join(runtime.cwd, ".gleip", "status.md"), status);
  }

  if (options.updateSession !== false) {
    writeFileSync(
      sessionPath,
      `${JSON.stringify(
        {
          ...session,
          classification,
          repoContext,
          scopeBudgetSummary: summarizeScopeBudget(scopeBudget),
          status: driftResult.status,
          approval: driftResult.status === "approval_required" ? "required" : "not_required",
          latestStatus: {
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
        ? JSON.stringify(statusJson(driftResult, nextAction, filtered.baseline), null, 2)
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
  const statusPath = join(runtime.cwd, ".gleip", "status.md");

  if (sessionResult.value === undefined) {
    missingArtifacts.push("session.json");
  }

  if (scopeBudgetResult.value === undefined) {
    missingArtifacts.push("scope-budget.json");
  }

  if (baselineResult.value === undefined) {
    missingArtifacts.push("baseline.json");
  }

  if (!existsSync(statusPath) || !statSync(statusPath).isFile()) {
    missingArtifacts.push("status.md");
  }

  const config = await loadConfigForReport(runtime);
  const scopeBudget =
    scopeBudgetResult.value ??
    (config === undefined ? undefined : defaultScopeBudgetForCheck(config));
  const gitDiffContext = await runtime.collectWorkingTreeDiff({ cwd: runtime.cwd });
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
      : await runtime.detectScopeDrift({
          scopeBudget,
          gitDiffContext: filtered.diff,
          config: config ?? {}
        });
  const statusContent =
    existsSync(statusPath) && statSync(statusPath).isFile()
      ? readFileSync(statusPath, "utf8")
      : undefined;
  const report = await runtime.generateSessionReport({
    version: GLEIP_VERSION,
    schemaVersion: REPORT_SCHEMA_VERSION,
    sessionId: sessionResult.value?.sessionId ?? null,
    generatedAt,
    ...(scopeBudget === undefined ? {} : { scopeBudget }),
    diff: filtered.diff,
    driftResult,
    ...(sessionResult.value?.latestPlanValidation === undefined
      ? {}
      : { planValidation: sessionResult.value.latestPlanValidation }),
    ...(statusContent === undefined ? {} : { statusContent }),
    missingArtifacts
  });
  const markdown = await runtime.renderSessionReportMarkdown(report);

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
  const driftResult = await runtime.detectScopeDrift({
    scopeBudget: defaultScopeBudgetForCheck(config),
    gitDiffContext,
    config
  });
  const nextAction = nextActionForReport(driftResult);

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
}

async function doctor(runtime: CommandRuntime, options: DoctorOptions = {}): Promise<void> {
  if (options.agents === true) {
    doctorAgents(runtime);
    return;
  }

  const checks: string[] = [];
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

  runtime.stdout(["gleip doctor", ...checks].join("\n"));

  if (failed) {
    process.exitCode = 1;
  }
}

function doctorAgents(runtime: CommandRuntime): void {
  const reports = AGENT_INSTRUCTION_TARGETS.map((target) => {
    const file = agentInstructionFile(target);
    const filePath = join(runtime.cwd, file.path);
    const present = existsSync(filePath);
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
    "- Run `npx gleip init --all-agents` to prepare all supported agent files.",
    "- Run `npx gleip init --agent <name>` for one target."
  ];

  if (!hasAnyAgentFile) {
    lines.push(
      "",
      "No supported agent files exist yet. This is valid; `npx gleip init --all-agents` can prepare the repo before any agent is installed."
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
    runtime.stdout(
      'No active Gleip session found. Run `npx --no-install gleip preflight "<task>"` first.'
    );
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
  modifications: UninstallModification[];
  removals: UninstallRemoval[];
  skipped: string[];
}

function uninstallRepository(runtime: CommandRuntime, options: UninstallOptions): void {
  void options.force;
  const plan = createUninstallPlan(runtime.cwd, options.keepAgentFiles === true);

  if (options.dryRun !== true) {
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
    modifications: [],
    removals: [],
    skipped: []
  };

  planOwnedPathRemoval(cwd, ".gleip", true, plan);
  planOwnedPathRemoval(cwd, ".gleip.yml", false, plan);
  planOwnedPathRemoval(cwd, "GLEIP.md", false, plan);

  for (const target of ["generic", "claude"] as const) {
    planAgentInstructionCleanup(cwd, agentInstructionFile(target), keepAgentFiles, plan);
  }

  planCursorRuleCleanup(cwd, keepAgentFiles, plan);
  return plan;
}

function planOwnedPathRemoval(
  cwd: string,
  relativePath: string,
  expectedDirectory: boolean,
  plan: UninstallPlan
): void {
  const filePath = join(cwd, relativePath);

  if (!existsSync(filePath)) {
    plan.skipped.push(`${relativePath} (not found)`);
    return;
  }

  const matchesExpectedType = expectedDirectory
    ? statSync(filePath).isDirectory()
    : statSync(filePath).isFile();

  if (!matchesExpectedType) {
    plan.skipped.push(
      `${relativePath} (preserved because it is not the expected ${
        expectedDirectory ? "directory" : "file"
      } type)`
    );
    return;
  }

  plan.removals.push({ path: relativePath, recursive: expectedDirectory });
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

function planCursorRuleCleanup(cwd: string, keepAgentFiles: boolean, plan: UninstallPlan): void {
  const file = agentInstructionFile("cursor");
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

  const content = readFileSync(filePath, "utf8");
  const result = removeGleipManagedSections(content);

  if (!result.found || !isEmptyOrGeneratedAgentScaffold(result.content, file.defaultContent)) {
    plan.skipped.push(`${file.path} (preserved because it contains unrelated content)`);
    return;
  }

  plan.removals.push({ path: file.path, recursive: false });
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
  files: AgentInstructionFile[];
  noAgentSetupDetected: boolean;
}

function initAgentInstructionFiles(
  cwd: string,
  options: InitOptions
): InitAgentInstructionSelection {
  if (options.allAgents === true) {
    return {
      files: allAgentInstructionFiles(),
      noAgentSetupDetected: false
    };
  }

  const target = parseAgentTarget(options.agent);

  if (target === "auto") {
    const detectedFiles = detectedAgentInstructionFiles(cwd);

    return {
      files: detectedFiles.length > 0 ? detectedFiles : [agentInstructionFile("generic")],
      noAgentSetupDetected: detectedFiles.length === 0
    };
  }

  return {
    files: [agentInstructionFile(target === "codex" ? "generic" : target)],
    noAgentSetupDetected: false
  };
}

function parseAgentTarget(value: string | undefined): AgentTarget {
  const target = value ?? "auto";

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

function detectedAgentInstructionFiles(cwd: string): AgentInstructionFile[] {
  const files: AgentInstructionFile[] = [];

  if (existsSync(join(cwd, "AGENTS.md"))) {
    files.push(agentInstructionFile("generic"));
  }

  if (existsSync(join(cwd, "CLAUDE.md"))) {
    files.push(agentInstructionFile("claude"));
  }

  if (existsSync(join(cwd, ".cursor")) || existsSync(join(cwd, ".cursor", "rules"))) {
    files.push(agentInstructionFile("cursor"));
  }

  return files;
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

  if (target === "cursor") {
    return {
      path: ".cursor/rules/gleip.mdc",
      defaultContent: "---\ndescription: Gleip workflow\nalwaysApply: true\n---\n",
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
      ? "Claude Code must run Gleip commands itself before editing code; ask the developer only if the local package command cannot be run."
      : target === "cursor"
        ? "This Cursor rule is always on for coding tasks in this repository."
        : "Codex-style and generic coding agents must run Gleip before editing code.";

  return `${GLEIP_SECTION_START}
## Gleip Workflow

- This repository uses Gleip local guardrails. ${targetLine}
- If the local package command cannot be run, ask: "Gleip is configured for this repository, but I could not run it through the local package command. Do you want me to proceed without Gleip guardrails? y/n". Do not proceed without confirmation.
- Before editing code, check \`.gleip/state.json\`. If \`enabled\` is false, ask: "Gleip is currently inactive. Do you want me to proceed without Gleip guardrails? y/n". Do not proceed without confirmation.
- If enabled, run \`npx --no-install gleip preflight "<user task>"\`.
- Read \`.gleip/brief.md\` and \`.gleip/scope-budget.json\`.
- Draft a short implementation plan and run \`npx --no-install gleip validate-plan "<plan>"\`.
- Proceed only if validation is \`approved\`; if \`needs_revision\`, revise and validate again; if \`requires_approval\`, stop and ask the user.
- During implementation, stay inside \`.gleip/scope-budget.json\`.
- Before the final response, run \`npx --no-install gleip status\`. If status is \`warning\`, \`approval_required\`, or \`blocked\`, report it clearly. Stop if status is \`approval_required\` or \`blocked\`.
- Before the final response, run or read \`npx --no-install gleip report\`.
- Treat \`.gleip/report.json\` and \`.gleip/report.md\` as the source of truth for Gleip final status.
- Include only the generated compact block under \`Recommended final response\`; do not paste the full report.
- The generated block contains scope adherence, drift risk, output discipline, estimated token waste avoided, and unresolved warnings.
- Final response must also include files changed, tests run, and risks.

### Gleip checklist for every coding task

- [ ] Check \`.gleip/state.json\`
- [ ] Run \`npx --no-install gleip preflight "<task>"\`
- [ ] Read \`.gleip/brief.md\`
- [ ] Validate plan with \`npx --no-install gleip validate-plan\`
- [ ] Implement within \`.gleip/scope-budget.json\`
- [ ] Run \`npx --no-install gleip status\`
- [ ] Run or read \`npx --no-install gleip report\`
- [ ] Include only the generated compact Gleip block, plus files changed, tests run, and risks
${GLEIP_SECTION_END}`;
}

function hasGleipWorkflow(content: string): boolean {
  return (
    content.includes(GLEIP_SECTION_START) ||
    (content.includes("gleip preflight") &&
      content.includes("gleip validate-plan") &&
      content.includes("gleip status"))
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

This repository uses Gleip as a local-only preflight and sidecar tool for AI coding agents. Gleip performs no external review.

Agents should run \`npx --no-install gleip preflight "<task>"\` before editing code, validate a short plan with \`npx --no-install gleip validate-plan "<plan>"\`, follow the generated brief and scope budget, then run \`npx --no-install gleip status\` and \`npx --no-install gleip report\` before the final response.

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

async function loadConfigForReport(runtime: CommandRuntime): Promise<GleipConfigLike | undefined> {
  try {
    return (await runtime.loadConfig(runtime.cwd)) as GleipConfigLike;
  } catch {
    return undefined;
  }
}

function driftResultWithoutBudget(diff: GitDiffContext): DriftResult {
  return {
    status: diff.isGitRepo ? "within_scope" : "warning",
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

function statusContent(
  driftResult: DriftResult,
  nextAction: string,
  baseline: BaselineContext
): string {
  return `# Gleip Status

- Status: ${driftResult.status}
- Session files changed: ${driftResult.metrics.filesChanged}
- Lines added: ${driftResult.metrics.linesAdded}
- Lines deleted: ${driftResult.metrics.linesDeleted}
- Pre-existing files ignored: ${baseline.preExistingFilesIgnored}

## Findings

### Blocked
${formatMarkdownFindingGroup(driftResult.findings, "blocked")}

### Approval required
${formatMarkdownFindingGroup(driftResult.findings, "approval_required")}

### Warnings
${formatMarkdownFindingGroup(driftResult.findings, "warning")}

### Info
${formatMarkdownFindingGroup(driftResult.findings, "info")}

## Next action

${nextAction}
`;
}

function emptyDriftResult(): DriftResult {
  return {
    status: "within_scope",
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
    dependencyFiles: [],
    ciFiles: [],
    riskyMatchedPaths: [],
    scannedFileCount: 0,
    skippedDirectoryCount: 0
  };
}

function summarizeScopeBudget(scopeBudget: ScopeBudget): ScopeBudgetSummary {
  return {
    expectedFilesChanged: scopeBudget.expectedFilesChanged,
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
  return {
    taskType: "unknown",
    confidence: "low",
    riskLevel: "medium",
    expectedFilesChanged: { min: 0, max: 0 },
    expectedLinesAdded: { min: 0, max: 0 },
    expectedLinesDeleted: { min: 0, max: 0 },
    softLimits: {
      maxFilesChanged: config.limits?.max_files_changed_warning ?? 12,
      maxLinesAdded: config.limits?.max_lines_added_warning ?? 500,
      maxLinesDeleted: config.limits?.max_lines_deleted_warning ?? 250
    },
    hardGates: {
      newDependenciesAllowed: false,
      ciChangesAllowed: false,
      skippedTestsAllowed: false,
      deletedTestsAllowed: false,
      secretsAllowed: false
    },
    allowedPaths: [],
    suspiciousPaths: [],
    approvalRequiredFor: [
      ...(config.approval_required_for ?? []),
      ...(config.protected_paths ?? []),
      ...(config.risky_files ?? [])
    ],
    blockedWithoutApproval: [
      "dependency_changes",
      "ci_changes",
      "secrets",
      ...(config.protected_paths ?? [])
    ],
    requiredTests: true,
    testGuidance: [],
    stopConditions: [],
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

  return {
    taskType: classification.taskType,
    confidence: classification.confidence,
    riskLevel: classification.riskLevel,
    expectedFilesChanged,
    expectedLinesAdded: { min: 0, max: 0 },
    expectedLinesDeleted: { min: 0, max: 0 },
    softLimits,
    hardGates,
    allowedPaths: [],
    suspiciousPaths: [],
    approvalRequiredFor: Array.from({ length: summary?.approvalRequiredCount ?? 0 }, (_, index) =>
      String(index + 1)
    ),
    blockedWithoutApproval: Array.from(
      { length: summary?.blockedWithoutApprovalCount ?? 0 },
      (_, index) => String(index + 1)
    ),
    requiredTests: summary?.requiredTests ?? classification.likelyRequiresTests,
    testGuidance: [],
    stopConditions: Array.from({ length: summary?.stopConditionsCount ?? 0 }, (_, index) =>
      String(index + 1)
    ),
    reasons: []
  };
}

function statusInteractionSummary(
  commandName: "check" | "status",
  driftResult: DriftResult,
  nextAction: string,
  baseline: BaselineContext
): string {
  const lines = [
    `Gleip ${commandName} complete · drift: ${driftRiskLabel(driftResult.status)}`,
    `Changes: ${driftResult.metrics.filesChanged} files, +${driftResult.metrics.linesAdded}/-${driftResult.metrics.linesDeleted}`
  ];

  if (driftResult.findings.length > 0) {
    const highestFinding = orderFindings(driftResult.findings)[0];
    lines.push(
      `Findings: ${driftResult.findings.length} · highest: ${highestFinding?.title ?? "review required"}`
    );
  } else if (baseline.preExistingFilesIgnored > 0) {
    lines.push(`Baseline: ${baseline.preExistingFilesIgnored} pre-existing file(s) ignored`);
  }

  lines.push(
    commandName === "status" &&
      (driftResult.status === "within_scope" || driftResult.status === "warning")
      ? "Next: generate report"
      : `Next: ${nextAction}`
  );

  return lines.join("\n");
}

function planValidationInteractionSummary(result: PlanValidationResult): string {
  const phase =
    result.status === "approved"
      ? "passed · ready to implement within scope"
      : result.status === "needs_revision"
        ? `needs revision · ${result.findings.length} finding(s)`
        : `requires approval · ${result.findings.length} finding(s)`;
  const lines = [`Gleip plan check ${phase}`];
  const firstFinding = orderPlanFindings(result.findings)[0];

  if (firstFinding !== undefined) {
    lines.push(`Finding: ${firstFinding.title} · ${firstFinding.message}`);
  }

  lines.push(
    `Next: ${result.status === "approved" ? "implement within scope, then run status" : result.nextAction}`
  );
  return lines.join("\n");
}

function planValidationJson(result: PlanValidationResult): {
  status: PlanValidationStatus;
  findings: PlanValidationFinding[];
  nextAction: string;
  parsedPlan: AgentPlan;
} {
  return {
    status: result.status,
    findings: orderPlanFindings(result.findings),
    nextAction: result.nextAction,
    parsedPlan: result.parsedPlan
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
  if (severity === "approval_required") {
    return 3;
  }

  if (severity === "warning") {
    return 2;
  }

  return 1;
}

function statusJson(
  driftResult: DriftResult,
  nextAction: string,
  baseline: BaselineContext
): {
  baseline: {
    hasBaseline: boolean;
    preExistingFilesIgnored: number;
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
    sessionFilesChanged: baseline.sessionFilesChanged,
    ...(baseline.baselineCreatedAt === undefined
      ? {}
      : { baselineCreatedAt: baseline.baselineCreatedAt })
  };

  return {
    status: driftResult.status,
    metrics: driftResult.metrics,
    baseline: baselineJson,
    findings: orderFindings(driftResult.findings),
    nextAction
  };
}

function nextActionForReport(driftResult: DriftResult): string {
  if (driftResult.status === "within_scope" && driftResult.metrics.filesChanged === 0) {
    return "Begin implementation or run npx --no-install gleip preflight if this is not the intended session.";
  }

  if (driftResult.status === "within_scope") {
    return "Continue. Run relevant tests before final response.";
  }

  if (driftResult.status === "warning") {
    return "Review warnings and reduce scope if practical. Continue only if the expanded scope is justified.";
  }

  if (driftResult.status === "approval_required") {
    return "Stop and ask for approval before continuing, or revise the implementation to stay within budget.";
  }

  return "Fix blocked issues before continuing. Do not proceed until skipped/deleted tests or secret changes are resolved.";
}

function formatMarkdownFindingGroup(
  findings: DriftFinding[],
  severity: DriftFinding["severity"]
): string {
  const group = orderFindings(findings).filter((finding) => finding.severity === severity);

  if (group.length === 0) {
    return "- None";
  }

  return group.map(formatMarkdownFinding).join("\n");
}

function formatMarkdownFinding(finding: DriftFinding): string {
  const recommendation =
    finding.recommendation === undefined ? "" : ` Recommendation: ${finding.recommendation}`;

  return `- ${finding.title}: ${finding.message}${recommendation}`;
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
  if (severity === "blocked") {
    return 4;
  }

  if (severity === "approval_required") {
    return 3;
  }

  if (severity === "warning") {
    return 2;
  }

  return 1;
}

function driftRiskLabel(status: DriftStatus): "none" | "low" | "medium" | "high" {
  if (status === "blocked") {
    return "high";
  }

  if (status === "approval_required") {
    return "medium";
  }

  if (status === "warning") {
    return "low";
  }

  return "none";
}

function isSupportedNodeVersion(version: string): boolean {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  return Number.isInteger(major) && major >= 20;
}

function isBuiltEntrypoint(): boolean {
  return normalizeFilePath(fileURLToPath(import.meta.url)).endsWith("/dist/index.js");
}

function normalizeFilePath(path: string): string {
  return path.replace(/\\/g, "/");
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

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
