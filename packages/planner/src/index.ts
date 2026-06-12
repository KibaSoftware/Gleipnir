import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { FindingCode, FindingSeverity } from "@gleip/core/findings";

export const packageName = "@gleip/planner";

export type TaskType =
  | "copy_change"
  | "ui_tweak"
  | "bug_fix"
  | "small_feature"
  | "api_endpoint"
  | "refactor"
  | "dependency_upgrade"
  | "migration"
  | "auth_security_change"
  | "infra_ci_change"
  | "test_only"
  | "unknown";

export type Confidence = "low" | "medium" | "high";

export type RiskLevel = "low" | "medium" | "high";

export interface TaskClassification {
  taskType: TaskType;
  confidence: Confidence;
  riskLevel: RiskLevel;
  reasons: string[];
  likelyRequiresTests: boolean;
  likelyAllowsNewDependencies: boolean;
}

export interface RepoContext {
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

export interface RepoFileMatch {
  path: string;
  score: number;
  reasons: string[];
}

export interface RepoPatternMatch {
  pattern: string;
  path: string;
  score: number;
  reasons: string[];
}

export interface DiscoverRepoContextOptions {
  cwd: string;
  task: string;
  config?: RepoContextConfig;
  classification?: TaskClassification;
  maxFiles?: number;
  maxMatches?: number;
}

export interface RepoContextConfig {
  approval_required_for?: string[];
  allowed_paths?: string[];
  protected_paths?: string[];
  risky_files?: string[];
}

export interface ScopeBudget {
  taskType: TaskType;
  confidence: Confidence;
  riskLevel: RiskLevel;
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

export interface NumberRange {
  min: number;
  max: number;
}

export interface CreateScopeBudgetInput {
  task: string;
  classification: TaskClassification;
  repoContext: RepoContext;
  config?: ScopeBudgetConfig;
}

export interface ScopeBudgetConfig extends RepoContextConfig {
  limits?: {
    max_files_changed_warning?: number;
    max_lines_added_warning?: number;
    max_lines_deleted_warning?: number;
  };
}

export interface GenerateImplementationBriefInput {
  task: string;
  classification: TaskClassification;
  repoContext: RepoContext;
  scopeBudget: ScopeBudget;
  config?: ScopeBudgetConfig;
}

export interface AgentPlan {
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

export type PlanValidationStatus = "approved" | "needs_revision" | "requires_approval";

export interface PlanValidationFinding {
  code: FindingCode;
  severity: FindingSeverity;
  title: string;
  message: string;
  recommendation?: string;
  evidence?: string[];
}

export interface PlanValidationResult {
  status: PlanValidationStatus;
  findings: PlanValidationFinding[];
  summary: string;
  nextAction: string;
  parsedPlan: AgentPlan;
}

export interface ValidateAgentPlanInput {
  planText: string;
  scopeBudget: ScopeBudget;
  config?: ScopeBudgetConfig;
}

interface ClassificationRule {
  confidence: Confidence;
  likelyAllowsNewDependencies: boolean;
  likelyRequiresTests: boolean;
  patterns: RegExp[];
  riskLevel: RiskLevel;
  taskType: TaskType;
}

interface ScopeBudgetDefault {
  expectedFilesChanged: NumberRange;
  expectedLinesAdded: NumberRange;
  expectedLinesDeleted: NumberRange;
  softLimits: {
    maxFilesChanged: number;
    maxLinesAdded: number;
    maxLinesDeleted: number;
  };
  requiredTests: boolean;
  riskLevel: RiskLevel;
}

const rules: ClassificationRule[] = [
  {
    taskType: "infra_ci_change",
    confidence: "high",
    riskLevel: "high",
    likelyRequiresTests: true,
    likelyAllowsNewDependencies: false,
    patterns: [
      /\bci\b/i,
      /\bgithub actions?\b/i,
      /\bworkflow\b/i,
      /\bdocker\b/i,
      /\bdeploy(?:ment)?\b/i,
      /\binfrastructure\b/i,
      /\bpipeline\b/i,
      /\bbuild config\b/i
    ]
  },
  {
    taskType: "auth_security_change",
    confidence: "high",
    riskLevel: "high",
    likelyRequiresTests: true,
    likelyAllowsNewDependencies: true,
    patterns: [
      /\bauth(?:entication|orization)?\b/i,
      /\blog ?in\b/i,
      /\blogout\b/i,
      /\bsession\b/i,
      /\bpassword\b/i,
      /\btoken\b/i,
      /\bpermission\b/i,
      /\brole\b/i,
      /\bsso\b/i,
      /\boauth\b/i,
      /\bsecurity\b/i
    ]
  },
  {
    taskType: "migration",
    confidence: "high",
    riskLevel: "high",
    likelyRequiresTests: true,
    likelyAllowsNewDependencies: false,
    patterns: [
      /\bmigrations?\b/i,
      /\bschema\b/i,
      /\bdatabase\b/i,
      /\b(?:alter|drop|rename)\s+(?:table|column|index)\b/i,
      /\b(?:table|column|index)\s+(?:migration|schema|change)\b/i
    ]
  },
  {
    taskType: "dependency_upgrade",
    confidence: "high",
    riskLevel: "medium",
    likelyRequiresTests: true,
    likelyAllowsNewDependencies: true,
    patterns: [
      /\bupgrade\b/i,
      /\bupdate dependency\b/i,
      /\bbump\b/i,
      /\bpackage\b/i,
      /\blibrary\b/i,
      /\bversion\b/i
    ]
  },
  {
    taskType: "api_endpoint",
    confidence: "high",
    riskLevel: "medium",
    likelyRequiresTests: true,
    likelyAllowsNewDependencies: false,
    patterns: [
      /\bendpoint\b/i,
      /\broute\b/i,
      /\bapi\b/i,
      /\b(?:get|post|put|patch|delete)\s+\/[\w/:.-]*/i,
      /\bcontroller\b/i,
      /\bhandler\b/i
    ]
  },
  {
    taskType: "refactor",
    confidence: "high",
    riskLevel: "medium",
    likelyRequiresTests: true,
    likelyAllowsNewDependencies: false,
    patterns: [
      /\brefactor\b/i,
      /\bcleanup\b/i,
      /\brestructure\b/i,
      /\bsimplify\b/i,
      /\breorganize\b/i,
      /\brewrite\b/i
    ]
  },
  {
    taskType: "test_only",
    confidence: "high",
    riskLevel: "low",
    likelyRequiresTests: false,
    likelyAllowsNewDependencies: false,
    patterns: [
      /\btests?\b/i,
      /\bspecs?\b/i,
      /\bcoverage\b/i,
      /\bunit test\b/i,
      /\bintegration test\b/i
    ]
  },
  {
    taskType: "bug_fix",
    confidence: "high",
    riskLevel: "medium",
    likelyRequiresTests: true,
    likelyAllowsNewDependencies: false,
    patterns: [
      /\bfix\b/i,
      /\bbugs?\b/i,
      /\bcrash(?:es)?\b/i,
      /\berrors?\b/i,
      /\bfailing\b/i,
      /\bbroken\b/i,
      /\bregression\b/i,
      /\bnull\b/i,
      /\bundefined\b/i,
      /\bmissing\b/i
    ]
  },
  {
    taskType: "small_feature",
    confidence: "medium",
    riskLevel: "medium",
    likelyRequiresTests: true,
    likelyAllowsNewDependencies: false,
    patterns: [
      /\badd\b/i,
      /\bcreate\b/i,
      /\bimplement\b/i,
      /\bsupport\b/i,
      /\benable\b/i,
      /\bexport\b/i,
      /\bimport\b/i,
      /\bfilter\b/i,
      /\bsearch\b/i,
      /\bsort\b/i
    ]
  },
  {
    taskType: "copy_change",
    confidence: "high",
    riskLevel: "low",
    likelyRequiresTests: false,
    likelyAllowsNewDependencies: false,
    patterns: [
      /\bcopy\b/i,
      /\btext\b/i,
      /\blabel\b/i,
      /\bmessage\b/i,
      /\bwording\b/i,
      /\bempty state\b/i,
      /\bplaceholder\b/i,
      /\btypo\b/i,
      /\btitle\b/i,
      /\bdescription\b/i
    ]
  },
  {
    taskType: "ui_tweak",
    confidence: "high",
    riskLevel: "low",
    likelyRequiresTests: false,
    likelyAllowsNewDependencies: false,
    patterns: [
      /\bcolou?r\b/i,
      /\bstyle\b/i,
      /\blayout\b/i,
      /\bspacing\b/i,
      /\bbutton\b/i,
      /\bmodal\b/i,
      /\bpage\b/i,
      /\bcomponent\b/i,
      /\bvisual\b/i,
      /\bcss\b/i,
      /\bclass\b/i
    ]
  }
];

const defaultMaxFiles = 5000;
const defaultMaxMatches = 20;
const maxContentBytes = 200 * 1024;

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "out",
  "vendor",
  "target",
  ".gleip"
]);

const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".cs",
  ".rb",
  ".php",
  ".vue",
  ".svelte"
]);

const contentExtensions = new Set([
  ...sourceExtensions,
  ".css",
  ".scss",
  ".html",
  ".md",
  ".json",
  ".yml",
  ".yaml",
  ".toml"
]);

const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".mp3",
  ".wav",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".rar",
  ".7z",
  ".pdf"
]);

const dependencyFileNames = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "requirements.txt",
  "pyproject.toml",
  "poetry.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
  "Gemfile",
  "Gemfile.lock",
  "composer.json",
  "composer.lock"
]);

const stopwords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "this",
  "that",
  "to",
  "when",
  "with",
  "add",
  "change",
  "create",
  "fix",
  "implement",
  "update"
]);

const scopeBudgetDefaults: Record<TaskType, ScopeBudgetDefault> = {
  copy_change: {
    expectedFilesChanged: { min: 1, max: 2 },
    expectedLinesAdded: { min: 0, max: 30 },
    expectedLinesDeleted: { min: 0, max: 30 },
    softLimits: { maxFilesChanged: 3, maxLinesAdded: 50, maxLinesDeleted: 50 },
    requiredTests: false,
    riskLevel: "low"
  },
  ui_tweak: {
    expectedFilesChanged: { min: 1, max: 4 },
    expectedLinesAdded: { min: 0, max: 80 },
    expectedLinesDeleted: { min: 0, max: 80 },
    softLimits: { maxFilesChanged: 5, maxLinesAdded: 120, maxLinesDeleted: 120 },
    requiredTests: false,
    riskLevel: "low"
  },
  bug_fix: {
    expectedFilesChanged: { min: 1, max: 5 },
    expectedLinesAdded: { min: 5, max: 160 },
    expectedLinesDeleted: { min: 0, max: 120 },
    softLimits: { maxFilesChanged: 7, maxLinesAdded: 220, maxLinesDeleted: 180 },
    requiredTests: true,
    riskLevel: "medium"
  },
  small_feature: {
    expectedFilesChanged: { min: 2, max: 6 },
    expectedLinesAdded: { min: 30, max: 220 },
    expectedLinesDeleted: { min: 0, max: 120 },
    softLimits: { maxFilesChanged: 8, maxLinesAdded: 300, maxLinesDeleted: 180 },
    requiredTests: true,
    riskLevel: "medium"
  },
  api_endpoint: {
    expectedFilesChanged: { min: 3, max: 8 },
    expectedLinesAdded: { min: 40, max: 260 },
    expectedLinesDeleted: { min: 0, max: 120 },
    softLimits: { maxFilesChanged: 10, maxLinesAdded: 340, maxLinesDeleted: 180 },
    requiredTests: true,
    riskLevel: "medium"
  },
  refactor: {
    expectedFilesChanged: { min: 2, max: 10 },
    expectedLinesAdded: { min: 0, max: 250 },
    expectedLinesDeleted: { min: 0, max: 250 },
    softLimits: { maxFilesChanged: 12, maxLinesAdded: 320, maxLinesDeleted: 320 },
    requiredTests: true,
    riskLevel: "medium"
  },
  dependency_upgrade: {
    expectedFilesChanged: { min: 1, max: 4 },
    expectedLinesAdded: { min: 0, max: 120 },
    expectedLinesDeleted: { min: 0, max: 120 },
    softLimits: { maxFilesChanged: 6, maxLinesAdded: 180, maxLinesDeleted: 180 },
    requiredTests: true,
    riskLevel: "medium"
  },
  migration: {
    expectedFilesChanged: { min: 2, max: 8 },
    expectedLinesAdded: { min: 20, max: 240 },
    expectedLinesDeleted: { min: 0, max: 140 },
    softLimits: { maxFilesChanged: 10, maxLinesAdded: 320, maxLinesDeleted: 220 },
    requiredTests: true,
    riskLevel: "high"
  },
  auth_security_change: {
    expectedFilesChanged: { min: 2, max: 8 },
    expectedLinesAdded: { min: 30, max: 260 },
    expectedLinesDeleted: { min: 0, max: 160 },
    softLimits: { maxFilesChanged: 10, maxLinesAdded: 340, maxLinesDeleted: 220 },
    requiredTests: true,
    riskLevel: "high"
  },
  infra_ci_change: {
    expectedFilesChanged: { min: 1, max: 5 },
    expectedLinesAdded: { min: 0, max: 160 },
    expectedLinesDeleted: { min: 0, max: 120 },
    softLimits: { maxFilesChanged: 7, maxLinesAdded: 220, maxLinesDeleted: 180 },
    requiredTests: true,
    riskLevel: "high"
  },
  test_only: {
    expectedFilesChanged: { min: 1, max: 5 },
    expectedLinesAdded: { min: 5, max: 180 },
    expectedLinesDeleted: { min: 0, max: 120 },
    softLimits: { maxFilesChanged: 7, maxLinesAdded: 240, maxLinesDeleted: 180 },
    requiredTests: false,
    riskLevel: "low"
  },
  unknown: {
    expectedFilesChanged: { min: 1, max: 6 },
    expectedLinesAdded: { min: 0, max: 200 },
    expectedLinesDeleted: { min: 0, max: 150 },
    softLimits: { maxFilesChanged: 8, maxLinesAdded: 260, maxLinesDeleted: 220 },
    requiredTests: true,
    riskLevel: "medium"
  }
};

export function classifyTask(task: string): TaskClassification {
  const normalizedTask = task.trim();

  if (normalizedTask.length === 0) {
    return unknownClassification("Task is empty.");
  }

  if (isClearlyTestOnly(normalizedTask)) {
    return buildClassification(
      rules.find((rule) => rule.taskType === "test_only")!,
      normalizedTask
    );
  }

  for (const rule of rules) {
    if (rule.taskType === "test_only") {
      continue;
    }

    if (findMatches(rule.patterns, normalizedTask).length > 0) {
      return buildClassification(rule, normalizedTask);
    }
  }

  return unknownClassification("No deterministic task signals matched.");
}

export function extractTaskTerms(task: string): string[] {
  const terms = new Set<string>();
  const tokens = task
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 1 && !stopwords.has(token));

  for (const token of tokens) {
    terms.add(token);

    if (canAddSingular(token)) {
      terms.add(token.slice(0, -1));
    }
  }

  return [...terms].sort();
}

export function discoverRepoContext(options: DiscoverRepoContextOptions): RepoContext {
  const cwd = resolve(options.cwd);
  const taskTerms = extractTaskTerms(options.task);
  const maxFiles = options.maxFiles ?? defaultMaxFiles;
  const maxMatches = options.maxMatches ?? defaultMaxMatches;
  const scan = scanRepository(cwd, maxFiles);
  const contentCache = new Map<string, string | undefined>();
  const dependencyFiles = scan.files.filter(isDependencyFile).sort(comparePaths);
  const ciFiles = scan.files.filter(isCiFile).sort(comparePaths);
  const classification = options.classification ?? classifyTask(options.task);

  const likelyRelevantFiles = scan.files
    .map((path) => scoreRelevantFile(cwd, path, taskTerms, classification, contentCache))
    .filter(isMatch)
    .sort(compareMatches)
    .slice(0, maxMatches);
  const likelyTestFiles = scan.files
    .map((path) => scoreTestFile(cwd, path, taskTerms, likelyRelevantFiles, contentCache))
    .filter(isMatch)
    .sort(compareMatches)
    .slice(0, maxMatches);
  const existingPatternMatches = findExistingPatternMatches(
    scan.files,
    taskTerms,
    likelyRelevantFiles,
    likelyTestFiles,
    maxMatches
  );

  return {
    taskTerms,
    likelyRelevantFiles,
    likelyTestFiles,
    existingPatternMatches,
    dependencyFiles,
    ciFiles,
    riskyMatchedPaths: findRiskyMatchedPaths(scan.files, options.config),
    scannedFileCount: scan.scannedFileCount,
    skippedDirectoryCount: scan.skippedDirectoryCount
  };
}

export function createScopeBudget(input: CreateScopeBudgetInput): ScopeBudget {
  const defaults = scopeBudgetDefaults[input.classification.taskType];
  const newDependenciesAllowed = isNewDependencyAllowed(input.classification);
  const ciChangesAllowed = input.classification.taskType === "infra_ci_change";
  const requiredTests =
    input.classification.taskType === "test_only"
      ? false
      : defaults.requiredTests || input.classification.likelyRequiresTests;
  const softLimits = applyConfigLimits(defaults.softLimits, input.config);
  const allowedPaths = buildAllowedPaths(input.repoContext, input.config, requiredTests);
  const suspiciousPaths = buildSuspiciousPaths(input.repoContext);
  const blockedWithoutApproval = buildBlockedWithoutApproval(
    input.classification,
    input.repoContext,
    newDependenciesAllowed,
    ciChangesAllowed
  );
  const approvalRequiredFor = buildApprovalRequiredFor(
    input.classification,
    input.repoContext,
    input.config,
    blockedWithoutApproval
  );
  const stopConditions = buildStopConditions(
    input.classification,
    softLimits,
    newDependenciesAllowed,
    ciChangesAllowed
  );

  return {
    taskType: input.classification.taskType,
    confidence: input.classification.confidence,
    riskLevel: maxRisk(defaults.riskLevel, input.classification.riskLevel),
    expectedFilesChanged: defaults.expectedFilesChanged,
    expectedLinesAdded: defaults.expectedLinesAdded,
    expectedLinesDeleted: defaults.expectedLinesDeleted,
    softLimits,
    hardGates: {
      newDependenciesAllowed,
      ciChangesAllowed,
      skippedTestsAllowed: false,
      deletedTestsAllowed: false,
      secretsAllowed: false
    },
    allowedPaths,
    suspiciousPaths,
    approvalRequiredFor,
    blockedWithoutApproval,
    requiredTests,
    testGuidance: testGuidanceFor(input.classification.taskType),
    stopConditions,
    reasons: buildBudgetReasons(input, defaults, allowedPaths, blockedWithoutApproval)
  };
}

export function generateImplementationBrief(input: GenerateImplementationBriefInput): string {
  const { task, classification, repoContext, scopeBudget } = input;

  return `# Gleip Implementation Brief

## Task
${task}

## Classification
- Type: ${classification.taskType}
- Risk: ${classification.riskLevel}
- Confidence: ${classification.confidence}
- Tests likely required: ${formatYesNo(classification.likelyRequiresTests)}
- New dependencies likely allowed: ${formatYesNo(classification.likelyAllowsNewDependencies)}

## Working rule
Implement the smallest safe change that satisfies the task. Stay inside the scope budget. Do not perform speculative refactors.

## Before editing code
1. Draft a short implementation plan.
2. Run \`npx --no-install gleip validate-plan "<plan>"\` or \`npx --no-install gleip validate-plan --file <file>\`.
3. Proceed only if approved or the user explicitly approves.

## Repo context
Likely relevant files:
${formatFileMatchesForBrief(repoContext.likelyRelevantFiles, 5)}

Likely test files:
${formatFileMatchesForBrief(repoContext.likelyTestFiles, 5)}

Existing pattern matches:
${formatPatternMatchesForBrief(repoContext.existingPatternMatches, 5)}

Dependency files detected:
${formatStringListForBrief(repoContext.dependencyFiles, 5)}

CI files detected:
${formatStringListForBrief(repoContext.ciFiles, 5)}

Risky matched paths:
${formatStringListForBrief(repoContext.riskyMatchedPaths, 5)}

## Scope budget
- Expected files changed: ${formatRange(scopeBudget.expectedFilesChanged)}
- Expected lines added: ${formatRange(scopeBudget.expectedLinesAdded)}
- Soft max files: ${scopeBudget.softLimits.maxFilesChanged}
- Soft max added lines: ${scopeBudget.softLimits.maxLinesAdded}
- Soft max deleted lines: ${scopeBudget.softLimits.maxLinesDeleted}

## Allowed scope
${formatAllowedScope(scopeBudget.allowedPaths)}

## Approval required
${formatApprovalRequired(scopeBudget.approvalRequiredFor)}

## Hard gates
- Do not skip tests.
- Do not delete tests.
- Do not weaken CI.
- Do not expose or modify secrets.
- ${formatDependencyGate(scopeBudget)}
- ${formatCiGate(scopeBudget)}

## Required tests
${formatRequiredTests(scopeBudget)}

## Stop conditions
${formatStringListForBrief(scopeBudget.stopConditions, 8)}

## Before final response
1. Run \`npx --no-install gleip status\`.
2. Run relevant tests if available.
3. Report files changed.
4. Report tests run.
5. Report whether Gleip status is within scope, warning, approval_required, or blocked.
`;
}

export function parseAgentPlan(planText: string): AgentPlan {
  const proposedFiles = extractPlanPaths(planText);
  const proposedDependencies = extractPlanDependencies(planText, proposedFiles);
  const proposedTests = extractPlanTests(planText, proposedFiles);
  const mentionsCiChanges = detectsCiIntent(planText, proposedFiles);
  const mentionsTestWeakening = detectsTestWeakening(planText);
  const mentionsBroadRefactor = detectsBroadRefactor(planText);
  const mentionsNewDependencies = proposedDependencies.length > 0;
  const mentionedRiskyAreas = buildMentionedRiskyAreas({
    mentionsCiChanges,
    mentionsNewDependencies,
    mentionsTestWeakening,
    mentionsBroadRefactor
  });

  return {
    rawText: planText,
    proposedFiles,
    proposedDependencies,
    proposedTests,
    mentionedRiskyAreas,
    mentionsCiChanges,
    mentionsNewDependencies,
    mentionsTestWeakening,
    mentionsBroadRefactor
  };
}

export function validateAgentPlan(input: ValidateAgentPlanInput): PlanValidationResult {
  const parsedPlan = parseAgentPlan(input.planText);
  const findings: PlanValidationFinding[] = [];

  if (
    parsedPlan.mentionsNewDependencies &&
    !input.scopeBudget.hardGates.newDependenciesAllowed
  ) {
    findings.push({
      code: "DEPENDENCY_CHANGE_INTENT",
      severity: "fail",
      title: "New dependency intent",
      message: "The plan mentions dependency changes, but this scope budget does not allow new dependencies.",
      recommendation: "Revise the plan to avoid dependency changes, or ask the user for explicit approval.",
      evidence: parsedPlan.proposedDependencies
    });
  }

  if (parsedPlan.mentionsCiChanges && !input.scopeBudget.hardGates.ciChangesAllowed) {
    findings.push({
      code: "CI_CHANGE_INTENT",
      severity: "fail",
      title: "CI change intent",
      message: "The plan mentions CI or workflow changes, but this scope budget does not allow CI changes.",
      recommendation: "Revise the plan to avoid CI changes, or ask the user for explicit approval.",
      evidence: ciEvidence(parsedPlan)
    });
  }

  if (parsedPlan.mentionsTestWeakening) {
    findings.push({
      code: "TEST_WEAKENED",
      severity: "fail",
      title: "Test weakening intent",
      message: "The plan mentions skipping, deleting, disabling, or weakening tests.",
      recommendation: "Revise the plan to preserve tests and CI. Do not weaken tests without explicit user approval."
    });
  }

  findings.push(...validatePlanFilesAgainstScope(parsedPlan, input.scopeBudget, input.config));

  if (input.scopeBudget.requiredTests && parsedPlan.proposedTests.length === 0) {
    findings.push({
      code: "MISSING_TEST_STRATEGY",
      severity: "warn",
      title: "Missing test plan",
      message: "The scope budget requires tests, but the plan does not mention adding, updating, or running tests.",
      recommendation: "Add a focused test plan covering the intended behavior."
    });
  }

  if (parsedPlan.mentionsBroadRefactor && input.scopeBudget.taskType !== "refactor") {
    const severeRefactor = detectsHighRiskRefactor(input.planText);

    findings.push({
      code: "BROAD_REFACTOR_INTENT",
      severity: severeRefactor ? "fail" : "warn",
      title: "Broad refactor intent",
      message: "The plan uses broad refactor wording, but the task was not classified as a refactor.",
      recommendation: "Narrow the plan to the smallest change needed for the task, or ask for approval."
    });
  }

  if (isPlanVague(parsedPlan)) {
    findings.push({
      code: "PLAN_TOO_VAGUE",
      severity: "warn",
      title: "Vague implementation plan",
      message: "The plan is too short or does not name concrete files, tests, dependencies, or actions.",
      recommendation: "Provide files to inspect or change and tests to add or run."
    });
  }

  const status = planValidationStatus(findings);

  return {
    status,
    findings: orderPlanFindings(findings),
    summary: planValidationSummary(status, findings),
    nextAction: planValidationNextAction(status),
    parsedPlan
  };
}

function scanRepository(
  cwd: string,
  maxFiles: number
): {
  files: string[];
  scannedFileCount: number;
  skippedDirectoryCount: number;
} {
  const files: string[] = [];
  let skippedDirectoryCount = 0;

  function walk(directory: string): void {
    if (files.length >= maxFiles) {
      return;
    }

    let entries;

    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        return;
      }

      const absolutePath = join(directory, entry.name);

      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name)) {
          skippedDirectoryCount += 1;
          continue;
        }

        walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      files.push(normalizePath(relative(cwd, absolutePath)));
    }
  }

  if (existsSync(cwd)) {
    walk(cwd);
  }

  return {
    files,
    scannedFileCount: files.length,
    skippedDirectoryCount
  };
}

function isNewDependencyAllowed(classification: TaskClassification): boolean {
  return (
    classification.taskType === "dependency_upgrade" ||
    (classification.taskType === "auth_security_change" &&
      classification.likelyAllowsNewDependencies)
  );
}

function applyConfigLimits(
  defaults: ScopeBudgetDefault["softLimits"],
  config: ScopeBudgetConfig | undefined
): ScopeBudget["softLimits"] {
  return {
    maxFilesChanged: Math.min(
      defaults.maxFilesChanged,
      config?.limits?.max_files_changed_warning ?? defaults.maxFilesChanged
    ),
    maxLinesAdded: Math.min(
      defaults.maxLinesAdded,
      config?.limits?.max_lines_added_warning ?? defaults.maxLinesAdded
    ),
    maxLinesDeleted: Math.min(
      defaults.maxLinesDeleted,
      config?.limits?.max_lines_deleted_warning ?? defaults.maxLinesDeleted
    )
  };
}

function extractPlanPaths(planText: string): string[] {
  const paths = new Set<string>();

  for (const line of planText.split(/\r?\n/u)) {
    const candidateLine = isPlanBulletLine(line) || hasPlanFileVerb(line) ? line : "";

    for (const path of extractPathTokens(candidateLine)) {
      paths.add(path);
    }
  }

  for (const path of extractPathTokens(planText)) {
    paths.add(path);
  }

  return [...paths].sort(comparePaths);
}

function extractPathTokens(value: string): string[] {
  return value
    .split(/\s+/u)
    .map(cleanPlanToken)
    .filter(isFileLikePlanPath)
    .map(normalizePath);
}

function cleanPlanToken(value: string): string {
  return value.replace(/^[`"'<([{]+/u, "").replace(/[`"'>)\]},.;:]+$/u, "");
}

function isFileLikePlanPath(value: string): boolean {
  if (value.length === 0 || /\s/u.test(value) || /^https?:\/\//iu.test(value)) {
    return false;
  }

  const normalizedValue = normalizePath(value);
  const fileName = basename(normalizedValue);

  return (
    dependencyFileNames.has(fileName) ||
    isCiFile(normalizedValue) ||
    ["Dockerfile", "Jenkinsfile", "Makefile"].includes(fileName) ||
    normalizedValue.includes("/") ||
    /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|toml|css|scss|html|py|go|rs|java|kt|cs|rb|php|vue|svelte|lock)$/iu.test(
      fileName
    )
  );
}

function isPlanBulletLine(line: string): boolean {
  return /^\s*(?:[-*]|\d+\.)\s+/u.test(line);
}

function hasPlanFileVerb(line: string): boolean {
  return /\b(?:modify|update|create|add|edit|change|touch|reuse)\b/iu.test(line);
}

function extractPlanDependencies(planText: string, proposedFiles: string[]): string[] {
  const dependencies = new Set<string>();
  const dependencyPatterns = [
    /\b(?:npm\s+(?:install|i)|pnpm\s+add|yarn\s+add|bun\s+add)\s+([^\n;]+)/giu,
    /\binstall\s+([@a-z0-9._/-]+)/giu,
    /\badd\s+(?:a\s+|new\s+)?dependenc(?:y|ies)\s+([^\n.;]+)/giu,
    /\badd\s+([@a-z0-9._/-]+)\s+dependenc(?:y|ies)\b/giu
  ];

  for (const pattern of dependencyPatterns) {
    for (const match of planText.matchAll(pattern)) {
      for (const dependency of splitDependencyTokens(match[1] ?? "")) {
        dependencies.add(dependency);
      }
    }
  }

  for (const path of proposedFiles) {
    if (dependencyFileNames.has(basename(path))) {
      dependencies.add(path);
    }
  }

  return [...dependencies].sort(comparePaths);
}

function splitDependencyTokens(value: string): string[] {
  const ignored = new Set(["dependency", "dependencies", "package", "packages"]);

  return value
    .split(/[\s,]+/u)
    .map(cleanPlanToken)
    .filter((token) => token.length > 0)
    .filter((token) => !token.startsWith("-"))
    .filter((token) => !ignored.has(token.toLowerCase()))
    .filter((token) => !isFileLikePlanPath(token));
}

function extractPlanTests(planText: string, proposedFiles: string[]): string[] {
  const tests = new Set<string>();

  for (const path of proposedFiles) {
    if (isTestFile(path)) {
      tests.add(path);
    }
  }

  for (const phrase of [
    /\badd tests?\b/iu,
    /\bupdate tests?\b/iu,
    /\brun tests?\b/iu,
    /\badd specs?\b/iu,
    /\bupdate specs?\b/iu,
    /\brun specs?\b/iu
  ]) {
    const match = phrase.exec(planText);

    if (match?.[0]) {
      tests.add(match[0].toLowerCase());
    }
  }

  return [...tests].sort(comparePaths);
}

function detectsCiIntent(planText: string, proposedFiles: string[]): boolean {
  return (
    proposedFiles.some(isCiFile) ||
    /\b(?:github actions?|workflows?|ci|pipeline|jenkinsfile|gitlab-ci)\b/iu.test(planText) ||
    /\.github\/workflows\//iu.test(normalizePath(planText))
  );
}

function detectsTestWeakening(planText: string): boolean {
  return /\b(?:skip(?:\s+\w+){0,3}\s+tests?|delete(?:\s+\w+){0,3}\s+tests?|remove failing tests?|disable(?:\s+\w+){0,3}\s+tests?|lower coverage|weaken ci)\b|(?:\b(?:test|it|describe)\.skip\b)/iu.test(
    planText
  );
}

function detectsBroadRefactor(planText: string): boolean {
  return /\b(?:refactor entire|rewrite|restructure|cleanup broadly|reorganize|overhaul|replace all|across the app)\b/iu.test(
    planText
  );
}

function detectsHighRiskRefactor(planText: string): boolean {
  return /\b(?:rewrite|overhaul|replace all|across the app)\b/iu.test(planText);
}

function buildMentionedRiskyAreas(input: {
  mentionsCiChanges: boolean;
  mentionsNewDependencies: boolean;
  mentionsTestWeakening: boolean;
  mentionsBroadRefactor: boolean;
}): string[] {
  const areas: string[] = [];

  if (input.mentionsNewDependencies) {
    areas.push("new_dependencies");
  }

  if (input.mentionsCiChanges) {
    areas.push("ci_changes");
  }

  if (input.mentionsTestWeakening) {
    areas.push("test_weakening");
  }

  if (input.mentionsBroadRefactor) {
    areas.push("broad_refactor");
  }

  return areas;
}

function validatePlanFilesAgainstScope(
  parsedPlan: AgentPlan,
  scopeBudget: ScopeBudget,
  config: ScopeBudgetConfig | undefined
): PlanValidationFinding[] {
  if (parsedPlan.proposedFiles.length === 0 || scopeBudget.allowedPaths.length === 0) {
    return [];
  }

  const outsideAllowedPaths = parsedPlan.proposedFiles.filter(
    (path) => !isWithinAllowedPaths(path, scopeBudget.allowedPaths)
  );

  if (outsideAllowedPaths.length === 0) {
    return [];
  }

  const approvalRequiredPaths = outsideAllowedPaths.filter((path) =>
    isPlanPathApprovalRequired(path, scopeBudget, config)
  );
  const warningPaths = outsideAllowedPaths.filter((path) => !approvalRequiredPaths.includes(path));
  const findings: PlanValidationFinding[] = [];

  if (approvalRequiredPaths.length > 0) {
    findings.push({
      code: "APPROVAL_REQUIRED_PATH_CHANGED",
      severity: "fail",
      title: "Files require approval",
      message: `${approvalRequiredPaths.length} proposed file(s) are outside allowed scope and match approval-required paths or categories.`,
      recommendation: "Ask the user for approval before planning these files, or revise the plan to stay in allowed paths.",
      evidence: approvalRequiredPaths
    });
  }

  if (warningPaths.length > 0) {
    findings.push({
      code: "SCOPE_EXPANSION_WARN",
      severity: "warn",
      title: "Files outside allowed scope",
      message: `${warningPaths.length} proposed file(s) are outside the allowed scope budget paths.`,
      recommendation: "Revise the plan to stay within allowed paths, or explain why the extra files are required.",
      evidence: warningPaths
    });
  }

  return findings;
}

function isWithinAllowedPaths(path: string, allowedPaths: string[]): boolean {
  const normalizedPath = normalizePath(path);

  return allowedPaths.some((allowedPath) => {
    const normalizedAllowedPath = normalizePath(allowedPath);

    return (
      normalizedPath === normalizedAllowedPath ||
      normalizedPath.startsWith(`${normalizedAllowedPath}/`) ||
      matchesGlob(normalizedAllowedPath, normalizedPath)
    );
  });
}

function isPlanPathApprovalRequired(
  path: string,
  scopeBudget: ScopeBudget,
  config: ScopeBudgetConfig | undefined
): boolean {
  if (isDependencyFile(path) && !scopeBudget.hardGates.newDependenciesAllowed) {
    return true;
  }

  if (isCiFile(path) && !scopeBudget.hardGates.ciChangesAllowed) {
    return true;
  }

  if (isSecretPath(path) && !scopeBudget.hardGates.secretsAllowed) {
    return true;
  }

  const indicators = [
    ...scopeBudget.approvalRequiredFor,
    ...scopeBudget.blockedWithoutApproval,
    ...(config?.approval_required_for ?? []),
    ...(config?.protected_paths ?? []),
    ...(config?.risky_files ?? [])
  ];

  return indicators.some((indicator) => planIndicatorMatchesPath(indicator, path));
}

function planIndicatorMatchesPath(indicator: string, path: string): boolean {
  const normalizedIndicator = normalizePath(indicator);
  const normalizedPath = normalizePath(path);
  const lowerIndicator = normalizedIndicator.toLowerCase();

  if (lowerIndicator.includes("dependency") && isDependencyFile(path)) {
    return true;
  }

  if ((lowerIndicator.includes("ci") || lowerIndicator.includes("workflow")) && isCiFile(path)) {
    return true;
  }

  if (lowerIndicator.includes("secret") && isSecretPath(path)) {
    return true;
  }

  const patternText = normalizedIndicator.includes(":")
    ? normalizedIndicator.slice(normalizedIndicator.indexOf(":") + 1)
    : normalizedIndicator;
  const patterns = extractPathTokens(patternText);

  if (patterns.some((pattern) => pathMatchesPattern(normalizedPath, pattern))) {
    return true;
  }

  return pathMatchesPattern(normalizedPath, normalizedIndicator);
}

function pathMatchesPattern(path: string, pattern: string): boolean {
  if (pattern.length === 0) {
    return false;
  }

  return (
    path === pattern ||
    path.startsWith(`${pattern}/`) ||
    matchesGlob(pattern, path)
  );
}

function isSecretPath(path: string): boolean {
  return /(^|\/)(?:\.env|.*secret.*|.*secrets.*)(?:\/|\.|$)/iu.test(normalizePath(path));
}

function ciEvidence(parsedPlan: AgentPlan): string[] {
  const evidence = parsedPlan.proposedFiles.filter(isCiFile);

  return evidence.length > 0 ? evidence : ["CI/workflow wording"];
}

function isPlanVague(parsedPlan: AgentPlan): boolean {
  const wordCount = parsedPlan.rawText.trim().split(/\s+/u).filter(Boolean).length;
  const hasConcreteSignal =
    parsedPlan.proposedFiles.length > 0 ||
    parsedPlan.proposedDependencies.length > 0 ||
    parsedPlan.proposedTests.length > 0 ||
    parsedPlan.mentionedRiskyAreas.length > 0 ||
    /\b(?:modify|update|create|add|fix|implement|inspect|reuse|run)\b/iu.test(parsedPlan.rawText);

  return wordCount < 5 || !hasConcreteSignal;
}

function planValidationStatus(findings: PlanValidationFinding[]): PlanValidationStatus {
  if (
    findings.some(
      (finding) => finding.severity === "fail" || finding.severity === "blocking"
    )
  ) {
    return "requires_approval";
  }

  if (findings.some((finding) => finding.severity === "warn")) {
    return "needs_revision";
  }

  return "approved";
}

function planValidationSummary(
  status: PlanValidationStatus,
  findings: PlanValidationFinding[]
): string {
  if (status === "approved") {
    return "Plan is within the active scope budget.";
  }

  return `${findings.length} finding(s) require attention before implementation.`;
}

function planValidationNextAction(status: PlanValidationStatus): string {
  if (status === "approved") {
    return "Proceed with implementation within the validated scope budget.";
  }

  if (status === "needs_revision") {
    return "Revise the plan and run npx --no-install gleip validate-plan again before editing code.";
  }

  return "Ask the user for approval before proceeding, or revise the plan to avoid approval-required work.";
}

function orderPlanFindings(findings: PlanValidationFinding[]): PlanValidationFinding[] {
  return [...findings].sort((left, right) => {
    const severityDifference =
      planFindingSeverityRank(right.severity) - planFindingSeverityRank(left.severity);

    if (severityDifference !== 0) {
      return severityDifference;
    }

    return left.title.localeCompare(right.title);
  });
}

function planFindingSeverityRank(severity: PlanValidationFinding["severity"]): number {
  if (severity === "blocking") {
    return 4;
  }

  if (severity === "fail") {
    return 3;
  }

  if (severity === "warn") {
    return 2;
  }

  return 1;
}

function buildAllowedPaths(
  repoContext: RepoContext,
  config: ScopeBudgetConfig | undefined,
  requiredTests: boolean
): string[] {
  const paths = new Set<string>(config?.allowed_paths ?? []);

  for (const match of repoContext.likelyRelevantFiles.slice(0, 8)) {
    paths.add(match.path);
    paths.add(dirname(match.path));
  }

  if (requiredTests || repoContext.likelyTestFiles.length > 0) {
    for (const match of repoContext.likelyTestFiles.slice(0, 8)) {
      paths.add(match.path);
      paths.add(dirname(match.path));
    }
  }

  for (const match of repoContext.existingPatternMatches.slice(0, 8)) {
    if (match.pattern.startsWith("utility:")) {
      paths.add(match.path);
    }
  }

  return [...paths].filter((path) => path !== ".").sort(comparePaths);
}

function buildSuspiciousPaths(repoContext: RepoContext): string[] {
  return dedupe([...repoContext.riskyMatchedPaths, ...findDangerousPaths(repoContext)]).sort(
    comparePaths
  );
}

function buildBlockedWithoutApproval(
  classification: TaskClassification,
  repoContext: RepoContext,
  newDependenciesAllowed: boolean,
  ciChangesAllowed: boolean
): string[] {
  const blocked: string[] = [];

  if (!newDependenciesAllowed && repoContext.dependencyFiles.length > 0) {
    blocked.push(`Dependency files: ${repoContext.dependencyFiles.join(", ")}`);
  }

  if (!ciChangesAllowed && repoContext.ciFiles.length > 0) {
    blocked.push(`CI files: ${repoContext.ciFiles.join(", ")}`);
  }

  blocked.push("Secrets and .env files.");

  const dangerousPaths = findDangerousPaths(repoContext);
  const allowedDangerousTaskTypes = new Set<TaskType>([
    "auth_security_change",
    "infra_ci_change",
    "migration"
  ]);

  if (!allowedDangerousTaskTypes.has(classification.taskType) && dangerousPaths.length > 0) {
    blocked.push(`Auth/security/payment/infra/migration paths: ${dangerousPaths.join(", ")}`);
  }

  if (classification.taskType === "test_only" && repoContext.likelyRelevantFiles.length > 0) {
    blocked.push("Runtime source changes outside tests.");
  }

  return dedupe(blocked).sort(comparePaths);
}

function buildApprovalRequiredFor(
  classification: TaskClassification,
  repoContext: RepoContext,
  config: ScopeBudgetConfig | undefined,
  blockedWithoutApproval: string[]
): string[] {
  const approval = new Set<string>(config?.approval_required_for ?? []);

  for (const path of config?.protected_paths ?? []) {
    approval.add(`protected_path:${path}`);
  }

  for (const glob of config?.risky_files ?? []) {
    approval.add(`risky_file:${glob}`);
  }

  if (repoContext.riskyMatchedPaths.length > 0) {
    approval.add(`risky_matched_paths:${repoContext.riskyMatchedPaths.length}`);
  }

  if (blockedWithoutApproval.length > 0) {
    approval.add("blocked_paths_or_categories");
  }

  if (classification.taskType === "refactor") {
    approval.add("broad_refactor");
  }

  if (classification.riskLevel === "high") {
    approval.add("high_risk_task");
  }

  return [...approval].sort(comparePaths);
}

function buildStopConditions(
  classification: TaskClassification,
  softLimits: ScopeBudget["softLimits"],
  newDependenciesAllowed: boolean,
  ciChangesAllowed: boolean
): string[] {
  const conditions = [
    `Stop if more than ${softLimits.maxFilesChanged} files are needed.`,
    "Stop if tests need to be skipped, deleted, or weakened.",
    "Stop if the task appears broader than classified."
  ];

  if (!ciChangesAllowed) {
    conditions.push("Stop if implementation requires changing CI configuration.");
  }

  if (!newDependenciesAllowed) {
    conditions.push("Stop if a new dependency seems necessary.");
  }

  if (!["auth_security_change", "infra_ci_change", "migration"].includes(classification.taskType)) {
    conditions.push("Stop if auth, payments, infra, migrations, or secrets need to be modified.");
  } else {
    conditions.push("Stop if secrets need to be modified.");
  }

  return conditions;
}

function testGuidanceFor(taskType: TaskType): string[] {
  switch (taskType) {
    case "bug_fix":
      return ["Add or update a regression test for the failing behavior."];
    case "small_feature":
      return ["Add or update tests for the new behavior and at least one edge case."];
    case "api_endpoint":
      return ["Cover success, invalid input, and not-found/permission cases where applicable."];
    case "migration":
      return ["Cover migration behavior or affected data access paths where practical."];
    case "auth_security_change":
      return ["Cover success, failure, and permission/security edge cases."];
    case "infra_ci_change":
      return ["Run or document the relevant CI/build validation path."];
    case "test_only":
      return ["Keep changes limited to tests unless explicitly justified."];
    case "refactor":
      return ["Preserve behavior with existing tests or add coverage around moved code."];
    case "dependency_upgrade":
      return ["Run tests that exercise the upgraded package and check lockfile changes."];
    default:
      return ["Add or update focused tests when behavior changes."];
  }
}

function buildBudgetReasons(
  input: CreateScopeBudgetInput,
  defaults: ScopeBudgetDefault,
  allowedPaths: string[],
  blockedWithoutApproval: string[]
): string[] {
  const reasons = [
    `Classified as ${input.classification.taskType} with ${input.classification.confidence} confidence.`,
    `Using ${input.classification.taskType} default expected file range ${defaults.expectedFilesChanged.min}-${defaults.expectedFilesChanged.max}.`,
    `Repo context scanned ${input.repoContext.scannedFileCount} files.`
  ];

  if (allowedPaths.length > 0) {
    reasons.push(
      `Allowed paths seeded from ${allowedPaths.length} likely relevant paths/directories.`
    );
  }

  if (input.repoContext.likelyTestFiles.length > 0) {
    reasons.push(
      `Repo context found ${input.repoContext.likelyTestFiles.length} likely test files.`
    );
  }

  if (blockedWithoutApproval.length > 0) {
    reasons.push(`Blocked without approval: ${blockedWithoutApproval.length} categories.`);
  }

  return reasons;
}

function findDangerousPaths(repoContext: RepoContext): string[] {
  const paths = [
    ...repoContext.likelyRelevantFiles.map((match) => match.path),
    ...repoContext.likelyTestFiles.map((match) => match.path),
    ...repoContext.existingPatternMatches.map((match) => match.path),
    ...repoContext.riskyMatchedPaths
  ];

  return dedupe(paths.filter(isDangerousPath)).sort(comparePaths);
}

function isDangerousPath(path: string): boolean {
  return /(^|\/)(\.env|auth|security|payment|payments|infra|infrastructure|migrations?|secrets?)(\/|\.|$)/iu.test(
    path
  );
}

function maxRisk(left: RiskLevel, right: RiskLevel): RiskLevel {
  const rank: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 };
  return rank[left] >= rank[right] ? left : right;
}

function formatFileMatchesForBrief(matches: RepoFileMatch[], limit: number): string {
  if (matches.length === 0) {
    return "- None detected.";
  }

  return matches
    .slice(0, limit)
    .map((match) => `- ${match.path} (score ${match.score})`)
    .join("\n");
}

function formatPatternMatchesForBrief(matches: RepoPatternMatch[], limit: number): string {
  if (matches.length === 0) {
    return "- None detected.";
  }

  return matches
    .slice(0, limit)
    .map((match) => `- ${match.pattern}: ${match.path} (score ${match.score})`)
    .join("\n");
}

function formatStringListForBrief(values: string[], limit: number): string {
  if (values.length === 0) {
    return "- None detected.";
  }

  return values
    .slice(0, limit)
    .map((value) => `- ${value}`)
    .join("\n");
}

function formatAllowedScope(paths: string[]): string {
  if (paths.length === 0) {
    return "- No precise allowed paths were identified. Keep changes tightly aligned with the task and existing nearby patterns.";
  }

  return formatStringListForBrief(paths, 8);
}

function formatApprovalRequired(values: string[]): string {
  if (values.length === 0) {
    return "- None beyond default hard gates.";
  }

  return formatStringListForBrief(values, 8);
}

function formatDependencyGate(scopeBudget: ScopeBudget): string {
  return scopeBudget.hardGates.newDependenciesAllowed
    ? "Dependencies may be changed only when directly required by the task and justified."
    : "Do not add dependencies.";
}

function formatCiGate(scopeBudget: ScopeBudget): string {
  return scopeBudget.hardGates.ciChangesAllowed
    ? "CI changes are allowed only within the task scope."
    : "Do not change CI configuration.";
}

function formatRequiredTests(scopeBudget: ScopeBudget): string {
  if (!scopeBudget.requiredTests) {
    return "- Tests may be skipped only if the change is clearly non-behavioral, such as copy or visual-only.";
  }

  return [
    "- Add or update focused tests.",
    ...scopeBudget.testGuidance.slice(0, 5).map((guidance) => `- ${guidance}`)
  ].join("\n");
}

function formatRange(range: NumberRange): string {
  return `${range.min}-${range.max}`;
}

function formatYesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function scoreRelevantFile(
  cwd: string,
  path: string,
  taskTerms: string[],
  classification: TaskClassification,
  contentCache: Map<string, string | undefined>
): RepoFileMatch | undefined {
  if (isTestFile(path) || isDependencyFile(path) || isCiFile(path) || isBinaryFile(path)) {
    return undefined;
  }

  let score = 0;
  const reasons: string[] = [];
  const lowerPath = path.toLowerCase();
  const lowerFileName = basename(path).toLowerCase();
  const lowerDirectory = dirname(path).toLowerCase();

  if (isSourceFile(path)) {
    score += 1;
    reasons.push("Source file extension.");
  }

  for (const term of taskTerms) {
    if (lowerFileName.includes(term)) {
      score += 6;
      reasons.push(`Filename contains task term "${term}".`);
    }

    if (lowerDirectory.includes(term)) {
      score += 4;
      reasons.push(`Directory contains task term "${term}".`);
    }

    if (lowerPath.includes(term)) {
      score += 1;
      reasons.push(`Path contains task term "${term}".`);
    }
  }

  score += classificationPathScore(path, classification, reasons);

  const content = readSmallTextFile(cwd, path, contentCache);

  if (content) {
    for (const term of taskTerms) {
      if (content.includes(term)) {
        score += 2;
        reasons.push(`Content contains task term "${term}".`);
      }
    }
  }

  return score > 0
    ? {
        path,
        score,
        reasons: dedupe(reasons)
      }
    : undefined;
}

function scoreTestFile(
  cwd: string,
  path: string,
  taskTerms: string[],
  likelyRelevantFiles: RepoFileMatch[],
  contentCache: Map<string, string | undefined>
): RepoFileMatch | undefined {
  if (!isTestFile(path) || isBinaryFile(path)) {
    return undefined;
  }

  let score = 5;
  const reasons = ["Test file path pattern."];
  const lowerPath = path.toLowerCase();

  for (const term of taskTerms) {
    if (lowerPath.includes(term)) {
      score += 3;
      reasons.push(`Test path contains task term "${term}".`);
    }
  }

  for (const relevantFile of likelyRelevantFiles) {
    const stem = fileStem(relevantFile.path).toLowerCase();

    if (stem.length > 1 && lowerPath.includes(stem)) {
      score += 4;
      reasons.push(`Likely nearby test for "${relevantFile.path}".`);
    }
  }

  const content = readSmallTextFile(cwd, path, contentCache);

  if (content) {
    for (const term of taskTerms) {
      if (content.includes(term)) {
        score += 1;
        reasons.push(`Test content contains task term "${term}".`);
      }
    }
  }

  return {
    path,
    score,
    reasons: dedupe(reasons)
  };
}

function findExistingPatternMatches(
  files: string[],
  taskTerms: string[],
  likelyRelevantFiles: RepoFileMatch[],
  likelyTestFiles: RepoFileMatch[],
  maxMatches: number
): RepoPatternMatch[] {
  const matches: RepoPatternMatch[] = [];
  const utilityTerms = new Set(["csv", "export", "download", "validation", "auth"]);

  for (const path of files) {
    const lowerPath = path.toLowerCase();

    for (const term of taskTerms) {
      if (lowerPath.includes(term)) {
        matches.push({
          pattern: `task-term:${term}`,
          path,
          score: isSourceFile(path) ? 4 : 2,
          reasons: [`Path contains task term "${term}".`]
        });
      }
    }

    for (const term of utilityTerms) {
      if (taskTerms.includes(term) && lowerPath.includes(term)) {
        matches.push({
          pattern: `utility:${term}`,
          path,
          score: 5,
          reasons: [`Utility path matches "${term}".`]
        });
      }
    }
  }

  for (const testFile of likelyTestFiles) {
    matches.push({
      pattern: "nearby-test",
      path: testFile.path,
      score: testFile.score,
      reasons: ["Likely test near relevant implementation files."]
    });
  }

  for (const relevantFile of likelyRelevantFiles) {
    matches.push({
      pattern: "similar-feature",
      path: relevantFile.path,
      score: relevantFile.score,
      reasons: ["Likely relevant implementation pattern."]
    });
  }

  return dedupePatternMatches(matches).sort(comparePatternMatches).slice(0, maxMatches);
}

function classificationPathScore(
  path: string,
  classification: TaskClassification,
  reasons: string[]
): number {
  const lowerPath = path.toLowerCase();

  switch (classification.taskType) {
    case "api_endpoint":
      if (/\b(api|routes?|controllers?|handlers?)\b/u.test(lowerPath)) {
        reasons.push("Path matches API task type.");
        return 3;
      }
      return 0;
    case "auth_security_change":
      if (/\b(auth|security|login|session|token|password)\b/u.test(lowerPath)) {
        reasons.push("Path matches auth/security task type.");
        return 4;
      }
      return 0;
    case "infra_ci_change":
      if (isCiFile(path)) {
        reasons.push("Path matches CI task type.");
        return 5;
      }
      return 0;
    case "migration":
      if (/\b(migrations?|schema|database|db)\b/u.test(lowerPath)) {
        reasons.push("Path matches migration task type.");
        return 4;
      }
      return 0;
    case "ui_tweak":
      if (/\.(tsx|jsx|vue|svelte|css|scss)$/iu.test(lowerPath)) {
        reasons.push("Path matches UI task type.");
        return 2;
      }
      return 0;
    default:
      return 0;
  }
}

function readSmallTextFile(
  cwd: string,
  path: string,
  contentCache: Map<string, string | undefined>
): string | undefined {
  if (contentCache.has(path)) {
    return contentCache.get(path);
  }

  if (!isContentScannable(path)) {
    contentCache.set(path, undefined);
    return undefined;
  }

  try {
    const absolutePath = join(cwd, path);
    const stats = statSync(absolutePath);

    if (stats.size > maxContentBytes) {
      contentCache.set(path, undefined);
      return undefined;
    }

    const content = readFileSync(absolutePath, "utf8").toLowerCase();
    contentCache.set(path, content);
    return content;
  } catch {
    contentCache.set(path, undefined);
    return undefined;
  }
}

function findRiskyMatchedPaths(files: string[], config: RepoContextConfig | undefined): string[] {
  const globs = [
    ...(config?.risky_files ?? []),
    ...(config?.protected_paths ?? []),
    ...(config?.approval_required_for ?? [])
  ];

  if (globs.length === 0) {
    return [];
  }

  return files.filter((path) => globs.some((glob) => matchesGlob(glob, path))).sort(comparePaths);
}

function isDependencyFile(path: string): boolean {
  return dependencyFileNames.has(basename(path));
}

function isCiFile(path: string): boolean {
  const normalizedPath = normalizePath(path);
  const lowerPath = normalizedPath.toLowerCase();
  const baseName = basename(lowerPath);

  return (
    lowerPath.startsWith(".github/workflows/") ||
    lowerPath.startsWith(".circleci/") ||
    lowerPath.startsWith(".buildkite/") ||
    lowerPath === ".gitlab-ci.yml" ||
    baseName === "circle.yml" ||
    baseName === "jenkinsfile" ||
    baseName === "azure-pipelines.yml" ||
    baseName === "buildkite.yml"
  );
}

function isTestFile(path: string): boolean {
  const lowerPath = normalizePath(path).toLowerCase();
  const segments = lowerPath.split("/");
  const fileName = basename(lowerPath);

  return (
    segments.includes("__tests__") ||
    segments.includes("tests") ||
    segments.includes("test") ||
    fileName.includes(".test.") ||
    fileName.includes(".spec.") ||
    /(?:^|[-_.])(test|spec)(?:[-_.]|$)/u.test(fileName)
  );
}

function isSourceFile(path: string): boolean {
  return sourceExtensions.has(extname(path).toLowerCase());
}

function isContentScannable(path: string): boolean {
  return (
    !isBinaryFile(path) &&
    !isDependencyFile(path) &&
    contentExtensions.has(extname(path).toLowerCase())
  );
}

function isBinaryFile(path: string): boolean {
  return binaryExtensions.has(extname(path).toLowerCase());
}

function isMatch(match: RepoFileMatch | undefined): match is RepoFileMatch {
  return match !== undefined;
}

function compareMatches(left: RepoFileMatch, right: RepoFileMatch): number {
  return right.score - left.score || comparePaths(left.path, right.path);
}

function comparePatternMatches(left: RepoPatternMatch, right: RepoPatternMatch): number {
  return (
    right.score - left.score ||
    comparePaths(left.path, right.path) ||
    left.pattern.localeCompare(right.pattern)
  );
}

function comparePaths(left: string, right: string): number {
  return left.localeCompare(right);
}

function normalizePath(path: string): string {
  return path.replace(/\\/gu, "/");
}

function matchesGlob(pattern: string, path: string): boolean {
  const normalizedPattern = normalizePath(pattern);
  const normalizedPath = normalizePath(path);

  if (!hasGlobSyntax(normalizedPattern)) {
    return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
  }

  return globToRegExp(normalizedPattern).test(normalizedPath);
}

function hasGlobSyntax(pattern: string): boolean {
  return /[*?[\]{}]/u.test(pattern);
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? "";
    const next = pattern[index + 1] ?? "";

    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += escapeRegExp(char);
  }

  return new RegExp(`${source}$`, "u");
}

function fileStem(path: string): string {
  const fileName = basename(path);
  const extension = extname(fileName);
  return extension.length > 0 ? fileName.slice(0, -extension.length) : fileName;
}

function canAddSingular(token: string): boolean {
  return (
    token.length > 3 &&
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    token !== "css" &&
    token !== "sso"
  );
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function dedupePatternMatches(matches: RepoPatternMatch[]): RepoPatternMatch[] {
  const seen = new Set<string>();
  const deduped: RepoPatternMatch[] = [];

  for (const match of matches) {
    const key = `${match.pattern}:${match.path}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(match);
  }

  return deduped;
}

function isClearlyTestOnly(task: string): boolean {
  const hasTestSignal = /\b(tests?|specs?|coverage|unit test|integration test)\b/i.test(task);
  const hasImplementationJoin =
    /\b(and|plus|with)\b\s+\b(add|create|implement|enable|support|fix|refactor)\b/i.test(task);

  if (!hasTestSignal || hasImplementationJoin) {
    return false;
  }

  return (
    /\b(add|update|write|create|fix|improve)\b.{0,40}\b(tests?|specs?|coverage|unit test|integration test)\b/i.test(
      task
    ) || /\b(tests?|specs?|coverage|unit test|integration test)\b\s+for\b/i.test(task)
  );
}

function buildClassification(rule: ClassificationRule, task: string): TaskClassification {
  const matches = findMatches(rule.patterns, task);

  return {
    taskType: rule.taskType,
    confidence: matches.length > 1 ? "high" : rule.confidence,
    riskLevel: rule.riskLevel,
    reasons: matches.map((match) => `Matched "${match}" task signal.`),
    likelyRequiresTests: rule.likelyRequiresTests,
    likelyAllowsNewDependencies: rule.likelyAllowsNewDependencies
  };
}

function findMatches(patterns: RegExp[], task: string): string[] {
  const matches = new Set<string>();

  for (const pattern of patterns) {
    const match = pattern.exec(task);

    if (match?.[0]) {
      matches.add(match[0]);
    }
  }

  return [...matches];
}

function unknownClassification(reason: string): TaskClassification {
  return {
    taskType: "unknown",
    confidence: "low",
    riskLevel: "medium",
    reasons: [reason],
    likelyRequiresTests: true,
    likelyAllowsNewDependencies: false
  };
}
