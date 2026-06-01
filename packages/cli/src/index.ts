#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
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
  validateAgentPlan: ValidateAgentPlan;
}

interface InitOptions {
  force?: boolean;
}

interface StopOptions {
  clean?: boolean;
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
    validateAgentPlan: options.validateAgentPlan ?? validateAgentPlanFromPackage
  };
  const program = new Command();

  program
    .name("gleip")
    .description("Run local-only preflight, scope budget, and status guardrails for coding-agent work.")
    .version("0.1.0")
    .option("--cwd <path>", "Run Gleip against a target repository.", options.cwd)
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        '  $ gleip preflight "Add CSV export to users table"',
        '  $ gleip validate-plan "Modify UserTable, reuse csv utility, add tests"',
        "  $ gleip status"
      ].join("\n")
    );

  program.hook("preAction", (command) => {
    const globalOptions = command.optsWithGlobals<{ cwd?: string }>();
    runtime.cwd = resolve(globalOptions.cwd ?? options.cwd ?? process.cwd());
  });

  program
    .command("init")
    .description("Create local-only Gleip config, policy docs, and agent workflow files.")
    .option("--force", "Overwrite generated Gleip files.")
    .addHelpText("after", '\nExample:\n  $ gleip init')
    .action((commandOptions: InitOptions) => {
      initRepository(runtime, commandOptions);
    });

  program
    .command("preflight")
    .description("Create a local-only brief, scope budget, and status baseline for a task.")
    .argument("<task>", "Task the coding agent is about to implement.")
    .addHelpText("after", '\nExample:\n  $ gleip preflight "Add CSV export to users table"')
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
        '  $ gleip validate-plan "Modify UserTable, reuse csv utility, add tests"',
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
    .option("--include-baseline", "Analyze the full working tree, including preflight baseline changes.")
    .option("--json", "Print status as JSON.")
    .action(async (commandOptions: StatusCommandOptions) => {
      await printStatus(runtime, {
        disabledSuffix: "Status can still be checked manually.",
        includeBaseline: commandOptions.includeBaseline === true,
        json: commandOptions.json === true
      });
    });

  program
    .command("check")
    .description("Check current repository changes against the local-only scope budget.")
    .option("--include-baseline", "Analyze the full working tree, including preflight baseline changes.")
    .option("--json", "Print check result as JSON.")
    .action(async (commandOptions: StatusCommandOptions) => {
      await printStatus(runtime, {
        allowMissingSession: true,
        disabledSuffix: "Check can still be run manually.",
        includeBaseline: commandOptions.includeBaseline === true,
        json: commandOptions.json === true,
        writeStatusFile: false,
        updateSession: false
      });
    });

  program
    .command("doctor")
    .description("Verify this repository can run local-only Gleip commands.")
    .action(async () => {
      await doctor(runtime);
    });

  program
    .command("stop")
    .description("Stop the active gleip preflight session.")
    .option("--clean", "Also remove generated brief, scope budget, and status files.")
    .action((commandOptions: StopOptions) => {
      stop(runtime, commandOptions);
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

async function loadConfigFromSource(error: unknown | undefined): Promise<{ loadConfig: LoadConfig }> {
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
  let controllerPackage: { detectScopeDrift: DetectScopeDrift };

  try {
    controllerPackage = await loadControllerFromSource(undefined);
  } catch (fallbackError) {
    try {
      controllerPackage = (await import(packageName)) as { detectScopeDrift: DetectScopeDrift };
    } catch {
      throw fallbackError;
    }
  }

  return controllerPackage.detectScopeDrift(input);
}

async function loadControllerFromSource(error: unknown): Promise<{
  detectScopeDrift: DetectScopeDrift;
}> {
  const controllerDistUrl = new URL("../../controller/dist/index.js", import.meta.url);
  const controllerSourceUrl = new URL("../../controller/src/index.ts", import.meta.url);

  try {
    return (await import(controllerDistUrl.href)) as {
      detectScopeDrift: DetectScopeDrift;
    };
  } catch (distError) {
    if (isBuiltEntrypoint()) {
      throw distError;
    }
    // Fall through to the TypeScript source path for local tsx development.
  }

  try {
    return (await import(controllerSourceUrl.href)) as {
      detectScopeDrift: DetectScopeDrift;
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

  ensureGleipDirectory(runtime.cwd);
  writeGleipStateIfMissing(runtime.cwd, getDefaultGleipState(runtime.now().toISOString()), force);
  writeGeneratedFile(join(runtime.cwd, ".gleip.yml"), defaultConfigContent(), force);
  writeGeneratedFile(join(runtime.cwd, "GLEIP.md"), defaultGleipReadmeContent(), force);
  writeAgentsFile(join(runtime.cwd, "AGENTS.md"));

  runtime.stdout(
    [
      "Gleip initialized.",
      "",
      "Coding agents should now follow AGENTS.md.",
      "",
      "Next normal flow:",
      '1. Agent runs `gleip preflight "<task>"`.',
      "2. Agent validates its plan with `gleip validate-plan`.",
      "3. Agent runs `gleip status` before final response."
    ].join("\n")
  );
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

  ensureGleipDirectory(runtime.cwd);
  writeFileSync(
    join(runtime.cwd, ".gleip", "session.json"),
    `${JSON.stringify(
      {
        version: 1,
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
  writeFileSync(join(runtime.cwd, ".gleip", "baseline.json"), `${JSON.stringify(baseline, null, 2)}\n`);
  writeFileSync(join(runtime.cwd, ".gleip", "brief.md"), brief);
  writeFileSync(join(runtime.cwd, ".gleip", "scope-budget.json"), scopeBudgetContent(scopeBudget));
  writeFileSync(
    join(runtime.cwd, ".gleip", "status.md"),
    statusContent(initialDriftResult, nextActionForReport(initialDriftResult), baselineContextForPreflight(baseline))
  );

  const output = [
      "Gleip preflight is ready.",
      "",
      "Next steps:",
      "1. Read `.gleip/brief.md`.",
      "2. Validate the plan with `gleip validate-plan`.",
      "3. Implement within `.gleip/scope-budget.json`.",
      "4. Run `gleip status` before the final response."
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
    runtime.stdout('No gleip brief found. Run `gleip preflight "<task>"` first.');
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
    runtime.stdout('No active Gleip session found. Run `gleip preflight "<task>"` first.');
    return;
  }

  const scopeBudget = readScopeBudget(runtime.cwd);

  if (scopeBudget === undefined) {
    runtime.stdout('No scope budget found for this session. Re-run `gleip preflight "<task>"`.');
    return;
  }

  const planText = readPlanText(runtime, planTextParts, options);

  if (planText === undefined) {
    return;
  }

  if (planText.trim().length === 0) {
    runtime.stdout(
      'No plan text provided. Pass `gleip validate-plan "<plan>"`, use `--file <file>`, or pipe a plan on stdin.'
    );
    return;
  }

  const config = (await runtime.loadConfig(runtime.cwd)) as GleipConfigLike;
  const result = await runtime.validateAgentPlan({
    planText,
    scopeBudget,
    config
  });
  const output =
    options.json === true
      ? JSON.stringify(planValidationJson(result), null, 2)
      : terminalPlanValidationContent(result);

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
    runtime.stdout("No gleip state found. Run `gleip init` first.");
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
  disabledSuffix?: string;
  includeBaseline?: boolean;
  json?: boolean;
  writeStatusFile?: boolean;
  updateSession?: boolean;
}

async function printStatus(runtime: CommandRuntime, options: PrintStatusOptions = {}): Promise<void> {
  const sessionPath = join(runtime.cwd, ".gleip", "session.json");
  const state = loadGleipState(runtime.cwd);

  if (!existsSync(sessionPath)) {
    if (options.allowMissingSession === true) {
      await printCheckWithoutSession(runtime, options);
      return;
    }

    runtime.stdout('No active Gleip session found. Run `gleip preflight "<task>"` first.');
    return;
  }

  const session = JSON.parse(readFileSync(sessionPath, "utf8")) as {
    classification?: TaskClassification;
    latestStatus?: unknown;
    repoContext?: RepoContext;
    baseline?: BaselineSummary;
    scopeBudgetSummary?: ScopeBudgetSummary;
    task?: string;
  };
  const updatedAt = runtime.now().toISOString();
  const task = session.task ?? "Unknown task";
  const classification = session.classification ?? (await runtime.classifyTask(task));
  const repoContext = session.repoContext ?? emptyRepoContext();
  const scopeBudget = readScopeBudget(runtime.cwd) ?? scopeBudgetFromSummary(session.scopeBudgetSummary, classification);
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
        : terminalStatusContent(driftResult, nextAction, filtered.baseline),
      state,
      options.disabledSuffix ?? "Status can still be checked manually.",
      options.json === true
    )
  );
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
        : terminalStatusContent(driftResult, nextAction, baseline),
      state,
      options.disabledSuffix ?? "Check can still be run manually.",
      options.json === true
    )
  );
}

async function doctor(runtime: CommandRuntime): Promise<void> {
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

function stop(runtime: CommandRuntime, options: StopOptions): void {
  const gleipDir = join(runtime.cwd, ".gleip");
  const sessionPath = join(gleipDir, "session.json");

  if (!existsSync(sessionPath)) {
    runtime.stdout('No active Gleip session found. Run `gleip preflight "<task>"` first.');
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

  return `${output}\n\n${note}`;
}

function writeAgentsFile(filePath: string): void {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "# Agent Instructions\n";
  writeFileSync(filePath, upsertGleipSection(existing));
}

function upsertGleipSection(content: string): string {
  const section = `${GLEIP_SECTION_START}
## Gleip Workflow

- This repository uses Gleip.
- Gleip is local-only; use Gleip commands in this repository.
- Gleip performs no external review.
- Before editing code, check \`.gleip/state.json\`.
- If \`enabled\` is true, run \`gleip preflight "<task>"\`.
- Read \`.gleip/brief.md\`.
- Follow \`.gleip/scope-budget.json\`.
- Draft a short implementation plan, then run \`gleip validate-plan "<plan>"\` or \`gleip validate-plan --file <file>\`.
- Proceed only if the plan is \`approved\`.
- If Gleip returns \`needs_revision\`, revise the plan and validate it again.
- If Gleip returns \`requires_approval\`, ask the user before proceeding.
- If \`enabled\` is false, ask: "Gleip is currently inactive. Do you want me to proceed without Gleip guardrails? y/n".
- Do not proceed while disabled unless the user confirms; if confirmed, mention in the final response that Gleip was inactive and no Gleip validation was performed.
- Run \`gleip status\` before the final response when Gleip is enabled.
- Stop and ask for approval if Gleip reports \`approval_required\` or \`blocked\`.
${GLEIP_SECTION_END}`;
  const markerPattern = new RegExp(
    `${escapeRegExp(GLEIP_SECTION_START)}[\\s\\S]*?${escapeRegExp(GLEIP_SECTION_END)}`
  );

  if (markerPattern.test(content)) {
    return ensureTrailingNewline(content.replace(markerPattern, section));
  }

  return `${content.trimEnd()}\n\n${section}\n`;
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

Agents should run \`gleip preflight "<task>"\` before editing code, validate a short plan with \`gleip validate-plan "<plan>"\`, follow the generated brief and scope budget, and run \`gleip status\` before the final response.
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

function terminalStatusContent(
  driftResult: DriftResult,
  nextAction: string,
  baseline: BaselineContext
): string {
  if (driftResult.findings.length === 0 && driftResult.metrics.filesChanged === 0) {
    const lines = [
      "Gleip Status",
      `Status: ${driftResult.status}`,
      "",
      "No working tree changes detected.",
      ...formatBaselineLines(baseline),
      "",
      "Next action:",
      nextAction
    ];

    return lines.join("\n");
  }

  const lines = [
    "Gleip Status",
    `Status: ${driftResult.status}`,
    "",
    "Summary:",
    `- Session changes: ${driftResult.metrics.filesChanged} files, +${driftResult.metrics.linesAdded}/-${driftResult.metrics.linesDeleted}`,
    `- Lines added: ${driftResult.metrics.linesAdded}`,
    `- Lines deleted: ${driftResult.metrics.linesDeleted}`,
    `- Pre-existing changes ignored: ${baseline.preExistingFilesIgnored} files`
  ];

  if (driftResult.findings.length > 0) {
    lines.push("", "Findings:", ...formatTerminalFindingGroups(driftResult.findings));
  }

  lines.push("", "Next action:", nextAction);

  return lines.join("\n");
}

function terminalPlanValidationContent(result: PlanValidationResult): string {
  const lines = [
    "Gleip Plan Validation",
    `Status: ${result.status}`,
    "",
    "Findings:"
  ];

  if (result.findings.length === 0) {
    lines.push("- None");
  } else {
    lines.push(...formatPlanFindingGroups(result.findings));
  }

  lines.push("", "Next action:", result.nextAction);

  return lines.join("\n");
}

function formatPlanFindingGroups(findings: PlanValidationFinding[]): string[] {
  const lines: string[] = [];

  for (const severity of ["approval_required", "warning", "info"] as const) {
    const group = orderPlanFindings(findings).filter((finding) => finding.severity === severity);

    if (group.length === 0) {
      continue;
    }

    lines.push(`[${planSeverityLabel(severity)}]`);
    lines.push(...group.map(formatPlanFinding));
    lines.push("");
  }

  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

function formatPlanFinding(finding: PlanValidationFinding): string {
  const evidence =
    finding.evidence === undefined || finding.evidence.length === 0
      ? ""
      : ` Evidence: ${finding.evidence.join(", ")}.`;
  const recommendation =
    finding.recommendation === undefined ? "" : `\n  Recommendation: ${finding.recommendation}`;

  return `- ${finding.title}: ${finding.message}${evidence}${recommendation}`;
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
    const severityDifference =
      planSeverityRank(right.severity) - planSeverityRank(left.severity);

    if (severityDifference !== 0) {
      return severityDifference;
    }

    return left.title.localeCompare(right.title);
  });
}

function planSeverityLabel(severity: PlanValidationFinding["severity"]): string {
  if (severity === "approval_required") {
    return "APPROVAL REQUIRED";
  }

  return severity.toUpperCase();
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

function formatBaselineLines(baseline: BaselineContext): string[] {
  if (!baseline.hasBaseline || baseline.preExistingFilesIgnored === 0) {
    return [];
  }

  if (baseline.includeBaseline) {
    return ["", `Pre-existing baseline changes included: ${baseline.preExistingFilesIgnored} files.`];
  }

  return ["", `Pre-existing changes ignored: ${baseline.preExistingFilesIgnored} files.`];
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
    ...(baseline.baselineCreatedAt === undefined ? {} : { baselineCreatedAt: baseline.baselineCreatedAt })
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
    return "Begin implementation or run gleip preflight if this is not the intended session.";
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

function formatTerminalFindingGroups(findings: DriftFinding[]): string[] {
  const lines: string[] = [];

  for (const severity of ["blocked", "approval_required", "warning", "info"] as const) {
    const group = orderFindings(findings).filter((finding) => finding.severity === severity);

    if (group.length === 0) {
      continue;
    }

    lines.push(`[${severityLabel(severity)}]`);
    lines.push(...group.map(formatTerminalFinding));
    lines.push("");
  }

  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

function formatTerminalFinding(finding: DriftFinding): string {
  const recommendation =
    finding.recommendation === undefined ? "" : `\n  Recommendation: ${finding.recommendation}`;

  return `- ${finding.title}: ${finding.message}${recommendation}`;
}

function formatMarkdownFindingGroup(findings: DriftFinding[], severity: DriftFinding["severity"]): string {
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

function severityLabel(severity: DriftFinding["severity"]): string {
  if (severity === "approval_required") {
    return "APPROVAL REQUIRED";
  }

  return severity.toUpperCase();
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
      "Legacy Argus files detected. This pre-release has been renamed to Gleip. Re-run `gleip init` and remove old Argus files after verifying."
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
