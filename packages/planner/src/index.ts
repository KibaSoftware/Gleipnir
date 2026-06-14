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
  contextFiles?: string[];
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
  contextFiles?: string[];
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
    dependencyMetadataChangesAllowed?: boolean;
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
  contextFiles?: string[];
  outputFiles?: string[];
  fileMentions?: PlanFileMention[];
  proposedDependencies: string[];
  proposedTests: string[];
  mentionedRiskyAreas: string[];
  mentionsCiChanges: boolean;
  mentionsNewDependencies: boolean;
  mentionsTestWeakening: boolean;
  mentionsBroadRefactor: boolean;
}

export interface PlanFileMention {
  path: string;
  role: "edit" | "context" | "output";
  markedNew: boolean;
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
  cwd?: string;
  taskText?: string;
  contextFiles?: string[];
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

interface TaskScopeHints {
  contextFiles: string[];
  declaredPaths: string[];
  declaredScopeLabels: string[];
  hasBroadScopeSignal: boolean;
  explicitEditTargets: string[];
  explicitOnlyTargets: string[];
}

interface DeclaredTaskScope {
  paths: string[];
  labels: string[];
  hasBroadScopeSignal: boolean;
}

interface PlanStructure {
  hasFiles: boolean;
  hasImplementation: boolean;
  hasRiskRationale: boolean;
  hasVerification: boolean;
}

interface DependencyRequirement {
  name: string;
  strength: "preferred" | "required";
}

interface ScopeRationale {
  path: string;
  specific: boolean;
  vague: boolean;
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
      /\bupdate dependenc(?:y|ies)\b/i,
      /\bbump\b/i,
      /\b(?:package|library|framework)\s+(?:upgrade|update)\b/i
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
  "venv",
  ".venv",
  "env",
  ".env",
  "dist",
  "build",
  "generated",
  "coverage",
  ".coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "out",
  "vendor",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".parcel-cache",
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

const generatedArtifactExtensions = new Set([".pyc", ".pyo", ".class", ".map"]);

const generatedArtifactNames = new Set([
  ".coverage",
  "coverage.xml",
  "coverage.json",
  "coverage-final.json",
  "coverage.out",
  "coverage.lcov",
  "lcov.info",
  "cobertura.xml"
]);

const contextFileIndicators = [
  "context",
  "spec",
  "requirements",
  "task",
  "prompt",
  "brief",
  "design",
  "note",
  "notes",
  "reference"
] as const;

const dependencyFileNames = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "requirements.txt",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
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

const lockfileNames = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "poetry.lock",
  "go.sum",
  "Cargo.lock",
  "Gemfile.lock",
  "composer.lock"
]);

const expectedOutputDirectories = new Set([
  "build",
  "coverage",
  "dist",
  "examples",
  "generated",
  "out",
  "output",
  "reports",
  "samples"
]);

const dependencyRegistry = [
  "typer",
  "rich",
  "pydantic",
  "pytest",
  "pandas",
  "numpy",
  "matplotlib",
  "zod",
  "playwright",
  "vitest",
  "jest",
  "react",
  "next",
  "eslint",
  "typescript"
] as const;

const broadConfigFileNames = new Set([
  "Dockerfile",
  "Jenkinsfile",
  "Makefile",
  "eslint.config.js",
  "eslint.config.mjs",
  "tsconfig.json",
  "vite.config.js",
  "vite.config.ts",
  "vitest.config.js",
  "vitest.config.ts",
  "webpack.config.js"
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
  const taskScopeHints = analyzeTaskScope(options.task, options.contextFiles);
  const contextFiles = new Set(taskScopeHints.contextFiles);
  const maxFiles = options.maxFiles ?? defaultMaxFiles;
  const maxMatches = options.maxMatches ?? defaultMaxMatches;
  const scan = scanRepository(cwd, maxFiles);
  const contentCache = new Map<string, string | undefined>();
  const dependencyFiles = scan.files.filter(isDependencyFile).sort(comparePaths);
  const ciFiles = scan.files.filter(isCiFile).sort(comparePaths);
  const classification = options.classification ?? classifyTask(options.task);

  const relevanceFiles = scan.files.filter((path) => !contextFiles.has(path));
  const likelyRelevantFiles = relevanceFiles
    .map((path) => scoreRelevantFile(cwd, path, taskTerms, classification, contentCache))
    .filter(isMatch)
    .sort(compareMatches)
    .slice(0, maxMatches);
  const likelyTestFiles = relevanceFiles
    .map((path) => scoreTestFile(cwd, path, taskTerms, likelyRelevantFiles, contentCache))
    .filter(isMatch)
    .sort(compareMatches)
    .slice(0, maxMatches);
  const existingPatternMatches = findExistingPatternMatches(
    relevanceFiles,
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
    contextFiles: [...contextFiles].sort(comparePaths),
    dependencyFiles,
    ciFiles,
    riskyMatchedPaths: findRiskyMatchedPaths(scan.files, options.config),
    scannedFileCount: scan.scannedFileCount,
    skippedDirectoryCount: scan.skippedDirectoryCount
  };
}

export function createScopeBudget(input: CreateScopeBudgetInput): ScopeBudget {
  const defaults = scopeBudgetDefaults[input.classification.taskType];
  const taskScopeHints = analyzeTaskScope(input.task, input.repoContext.contextFiles);
  const newDependenciesAllowed = isNewDependencyAllowed(input.classification, input.task);
  const ciChangesAllowed = isCiChangeAllowed(input.classification, input.task);
  const dependencyMetadataChangesAllowed =
    taskScopeHints.declaredScopeLabels.includes("package_metadata") ||
    taskScopeHints.explicitEditTargets.some(
      (path) => isDependencyFile(path) && !lockfileNames.has(basename(path))
    );
  const requiredTests =
    input.classification.taskType === "test_only"
      ? false
      : defaults.requiredTests || input.classification.likelyRequiresTests;
  const expectedFilesChanged = expectedFileRange(defaults.expectedFilesChanged, taskScopeHints);
  const softLimits = narrowSoftLimits(
    applyConfigLimits(defaults.softLimits, input.config),
    taskScopeHints
  );
  const allowedPaths = buildAllowedPaths(
    input.repoContext,
    input.config,
    requiredTests,
    taskScopeHints
  );
  const suspiciousPaths = buildSuspiciousPaths(input.repoContext, taskScopeHints);
  const blockedWithoutApproval = buildBlockedWithoutApproval(
    input.classification,
    input.repoContext,
    newDependenciesAllowed,
    ciChangesAllowed,
    dependencyMetadataChangesAllowed
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
    expectedFilesChanged,
    expectedLinesAdded: defaults.expectedLinesAdded,
    expectedLinesDeleted: defaults.expectedLinesDeleted,
    softLimits,
    hardGates: {
      newDependenciesAllowed,
      dependencyMetadataChangesAllowed,
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

export function parseAgentPlan(planText: string, contextFiles: string[] = []): AgentPlan {
  const fileAnalysis = extractPlanFileMentions(planText, contextFiles);
  const proposedFiles = fileAnalysis.proposedFiles;
  const planContextFiles = fileAnalysis.contextFiles;
  const proposedDependencies = extractPlanDependencies(planText, proposedFiles);
  const proposedTests = extractPlanTests(planText, proposedFiles);
  const mentionsCiChanges = detectsCiIntent(planText, proposedFiles);
  const mentionsTestWeakening = detectsTestWeakening(planText);
  const mentionsBroadRefactor = detectsBroadRefactor(planText);
  const mentionsNewDependencies = detectsNewDependencyIntent(planText);
  const mentionedRiskyAreas = buildMentionedRiskyAreas({
    mentionsCiChanges,
    mentionsNewDependencies,
    mentionsTestWeakening,
    mentionsBroadRefactor
  });

  return {
    rawText: planText,
    proposedFiles,
    contextFiles: planContextFiles,
    outputFiles: fileAnalysis.outputFiles,
    fileMentions: fileAnalysis.fileMentions,
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
  const parsedPlan = parseAgentPlan(input.planText, input.contextFiles);
  const findings: PlanValidationFinding[] = [];
  const planStructure = analyzePlanStructure(parsedPlan);
  const outsideAllowedPaths = findOutsideAllowedPaths(parsedPlan, input.scopeBudget);
  const riskyFiles = parsedPlan.proposedFiles.filter(isRiskyPlanPath);
  const unexpectedRiskyFiles = riskyFiles.filter(
    (path) => !taskRequestsRiskyPath(input.taskText ?? "", path)
  );

  if (input.planText.trim().length === 0) {
    findings.push({
      code: "PLAN_MISSING",
      severity: "fail",
      title: "Plan text missing",
      message: "Structural plan validation requires plan text.",
      recommendation: "Provide an inline plan, a plan file, or plan text on stdin."
    });
  }

  if (!planStructure.hasImplementation) {
    findings.push({
      code: "PLAN_REQUIRED_SECTION_MISSING",
      severity: "warn",
      title: "Implementation structure missing",
      message: "The plan does not include a recognizable implementation, changes, or approach section.",
      recommendation: "Add a short implementation or changes section describing the intended actions."
    });
  }

  if (isCodeTask(input.scopeBudget, parsedPlan) && !planStructure.hasFiles) {
    findings.push({
      code: "PLAN_NO_FILES_MENTIONED",
      severity: "warn",
      title: "Files or modules missing",
      message: "The code-task plan does not identify files, modules, or an explicit scope.",
      recommendation: "Name the expected files, modules, or scope category."
    });
  }

  if (
    parsedPlan.mentionsNewDependencies &&
    !input.scopeBudget.hardGates.newDependenciesAllowed
  ) {
    findings.push({
      code: "DEPENDENCY_CHANGE_INTENT",
      severity: "fail",
      title: "New dependency intent",
      message: "The plan proposes a new dependency, but new dependency is blocked by current policy.",
      recommendation: "Request approval to add the dependency, or revise the plan without it.",
      evidence: parsedPlan.proposedDependencies
    });
  }

  if (parsedPlan.mentionsCiChanges && !input.scopeBudget.hardGates.ciChangesAllowed) {
    findings.push({
      code: "CI_CHANGE_INTENT",
      severity: "fail",
      title: "CI change intent",
      message: "The plan proposes CI or workflow changes that require clarification under the current policy.",
      recommendation: "Provide the requested CI scope or ask the user for approval.",
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

  findings.push(
    ...validatePlanFilesAgainstScope(
      parsedPlan,
      input.scopeBudget,
      input.config,
      input.planText
    )
  );
  findings.push(...validateMentionedFiles(parsedPlan, input.cwd));
  findings.push(
    ...validateDependencyRequirements(
      input.taskText ?? "",
      input.planText,
      input.cwd,
      input.scopeBudget
    )
  );
  findings.push(
    ...validateRiskyChangeRationales(
      riskyFiles,
      input.taskText ?? "",
      input.planText,
      input.scopeBudget
    )
  );

  const vendorEditTargets = parsedPlan.proposedFiles.filter(isExcludedRepositoryPath);

  if (vendorEditTargets.length > 0) {
    findings.push({
      code: "PLAN_VENDOR_EDIT_TARGET",
      severity: "warn",
      title: "Excluded path proposed as edit target",
      message:
        "The plan proposes editing dependency, vendor, generated, cache, or build output paths.",
      recommendation:
        "Keep these paths read-only or output-only unless the task explicitly targets them and includes a scope rationale.",
      evidence: vendorEditTargets
    });
  }

  if (unexpectedRiskyFiles.length > 0) {
    findings.push({
      code: "PLAN_RISKY_FILE_MENTIONED",
      severity: "warn",
      title: "Risky file category mentioned",
      message: "The plan includes dependency, CI, config, secret, or security-sensitive files outside the declared task scope.",
      recommendation: "Confirm the named reason and verification for each risky category.",
      evidence: unexpectedRiskyFiles
    });
  }

  if (parsedPlan.proposedFiles.length > input.scopeBudget.softLimits.maxFilesChanged) {
    findings.push({
      code: "PLAN_SCOPE_EXCEEDS_BUDGET",
      severity: "warn",
      title: "Plan exceeds expected scope",
      message: `The plan proposes ${parsedPlan.proposedFiles.length} files; the scope budget soft maximum is ${input.scopeBudget.softLimits.maxFilesChanged}.`,
      recommendation: "Add a specific expansion rationale or narrow the proposed files.",
      evidence: parsedPlan.proposedFiles
    });
  }

  if (input.scopeBudget.requiredTests && !planStructure.hasVerification) {
    findings.push({
      code: "MISSING_TEST_STRATEGY",
      severity: "warn",
      title: "Missing test plan",
      message: "The scope budget requires tests, but the plan does not mention adding, updating, or running tests.",
      recommendation: "Add a focused test plan covering the intended behavior."
    });
    findings.push({
      code: "PLAN_NO_VERIFICATION",
      severity: "warn",
      title: "Verification structure missing",
      message: "The scope budget requires verification, but the plan has no verification section or verification language.",
      recommendation: "Add the tests, checks, or manual verification that will be run."
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

  const riskStructureRequired =
    unexpectedRiskyFiles.length > 0 ||
    outsideAllowedPaths.length > 0 ||
    parsedPlan.proposedFiles.length > input.scopeBudget.softLimits.maxFilesChanged ||
    parsedPlan.mentionsBroadRefactor;

  if (riskStructureRequired && !planStructure.hasRiskRationale) {
    findings.push({
      code: "PLAN_RISK_RATIONALE_MISSING",
      severity: "warn",
      title: "Risk or scope rationale missing",
      message: "The plan includes risky categories or scope expansion without recognizable risks, assumptions, constraints, or scope-rationale language.",
      recommendation: "Add the affected area, why it is needed, and how the expanded area will be verified."
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
        if (isIgnoredDirectory(entry.name)) {
          skippedDirectoryCount += 1;
          continue;
        }

        walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = normalizePath(relative(cwd, absolutePath));

      if (!isGeneratedArtifact(relativePath)) {
        files.push(relativePath);
      }
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

function analyzeTaskScope(task: string, additionalContextFiles: string[] = []): TaskScopeHints {
  const explicitEditTargets = new Set(extractExplicitEditTargets(task));
  const explicitOnlyTargets = new Set<string>();
  const declaredScope = extractDeclaredTaskScope(task);

  for (const line of task.split(/\r?\n/u)) {
    const onlyMatch =
      /\b(?:(?:modify|edit|change|touch)\s+only|only\s+update)\s+(.+)$/iu.exec(line);

    if (onlyMatch?.[1] === undefined) {
      continue;
    }

    const targetText = onlyMatch[1].split(/\b(?:and|but)\s+(?:do not|don't|without)\b/iu)[0] ?? "";

    for (const path of extractPathTokens(targetText)) {
      explicitOnlyTargets.add(path);
    }
  }

  if (explicitOnlyTargets.size > 0) {
    for (const path of explicitEditTargets) {
      if (isTestFile(path)) {
        explicitOnlyTargets.add(path);
      }
    }
  }

  const contextFiles = new Set([
    ...additionalContextFiles.map(normalizePath),
    ...extractReadOnlyContextPaths(task)
  ]);

  for (const path of explicitEditTargets) {
    contextFiles.delete(path);
  }

  return {
    contextFiles: [...contextFiles].sort(comparePaths),
    declaredPaths: declaredScope.paths,
    declaredScopeLabels: declaredScope.labels,
    hasBroadScopeSignal: declaredScope.hasBroadScopeSignal,
    explicitEditTargets: [...explicitEditTargets].sort(comparePaths),
    explicitOnlyTargets: [...explicitOnlyTargets].sort(comparePaths)
  };
}

function extractDeclaredTaskScope(task: string): DeclaredTaskScope {
  const paths = new Set<string>();
  const labels = new Set<string>();
  const hasBroadScopeSignal =
    /\b(?:spanning|across)\b|\b(?:touch(?:es|ing)?|cover(?:s|ing)?|involv(?:es|ing))\s+(?:multiple|several)\s+(?:areas|modules|packages|components|subsystems|workstreams)\b/iu.test(
      task
    );
  const contextPaths = new Set(extractPhraseContextPaths(task));

  for (const segment of splitTaskScopeSegments(task)) {
    if (
      !hasDeclaredScopeIntent(segment) ||
      hasNegativeEditIntent(segment)
    ) {
      continue;
    }

    for (const path of extractPathTokens(segment)) {
      if (!contextPaths.has(path)) {
        paths.add(path);
      }
    }

    const categoryText = stripPathTokens(segment);

    addDeclaredCategory(
      categoryText,
      "cli",
      /\bcli\b/iu,
      ["cli", "src/cli", "packages/cli", "**/cli/**"],
      paths,
      labels
    );
    addDeclaredCategory(
      categoryText,
      "planner",
      /\bplanner\b/iu,
      ["planner", "src/planner", "packages/planner", "**/planner/**"],
      paths,
      labels
    );
    addDeclaredCategory(
      categoryText,
      "source",
      /\b(?:source(?:\s+files?)?|implementation files?)\b/iu,
      ["src", "lib", "app", "**/src/**"],
      paths,
      labels
    );
    addDeclaredCategory(
      testScopeCategoryText(categoryText),
      "tests",
      /\btests?\b/iu,
      ["test", "tests", "**/__tests__/**", "**/*.test.*", "**/*.spec.*"],
      paths,
      labels
    );
    addDeclaredCategory(
      categoryText,
      "docs",
      /\bdocs?|documentation\b/iu,
      ["docs", "**/docs/**"],
      paths,
      labels
    );
    addDeclaredCategory(
      categoryText,
      "readme",
      /\breadme\b/iu,
      ["README.md", "**/README.md"],
      paths,
      labels
    );
    addDeclaredCategory(
      categoryText,
      "changelog",
      /\bchangelog\b/iu,
      ["CHANGELOG.md", "**/CHANGELOG.md"],
      paths,
      labels
    );
    addDeclaredCategory(
      categoryText,
      "package_metadata",
      /\b(?:package|project|release)\s+(?:metadata|version)\b|\bversion\s+(?:metadata|files?)\b/iu,
      [
        "package.json",
        "**/package.json",
        "pyproject.toml",
        "**/pyproject.toml",
        "setup.py",
        "**/setup.py",
        "setup.cfg",
        "**/setup.cfg",
        "Cargo.toml",
        "**/Cargo.toml"
      ],
      paths,
      labels
    );
    addDeclaredCategory(
      categoryText,
      "smoke_tests",
      /\bsmoke(?:\s+tests?|\s+coverage)\b/iu,
      ["scripts/*smoke*", "scripts/**/*smoke*", "**/*smoke*.test.*", "**/*smoke*.spec.*"],
      paths,
      labels
    );
    addDeclaredCategory(
      categoryText,
      "output",
      /\b(?:sample output|output artifacts?|generated output)\b/iu,
      ["examples", "out", "output", "reports", "samples"],
      paths,
      labels
    );
    addDeclaredCategory(
      categoryText,
      "config",
      /\b(?:build\s+config|configuration|config)\b/iu,
      [
        "*config.*",
        "**/*config.*",
        "**/tsconfig*.json",
        "Dockerfile",
        "**/Dockerfile",
        "Makefile",
        "**/Makefile"
      ],
      paths,
      labels
    );
    addDeclaredCategory(
      categoryText,
      "ci",
      /\b(?:ci|github actions?|workflows?|pipeline)\b/iu,
      [
        ".github/workflows",
        ".circleci",
        ".buildkite",
        ".gitlab-ci.yml",
        "azure-pipelines.yml"
      ],
      paths,
      labels
    );

    for (const moduleName of extractNamedScopeAreas(categoryText)) {
      labels.add(`module:${moduleName}`);
      paths.add(moduleName);
      paths.add(`src/${moduleName}`);
      paths.add(`packages/${moduleName}`);
      paths.add(`**/${moduleName}/**`);
      paths.add(`**/${moduleName}.*`);
    }
  }

  return {
    paths: [...paths].sort(comparePaths),
    labels: [...labels].sort(comparePaths),
    hasBroadScopeSignal
  };
}

function splitTaskScopeSegments(task: string): string[] {
  return task
    .split(
      /\r?\n|;|\.(?=\s+(?:do not|don't|must not|never|add|build|change|create|edit|fix|implement|migrate|modify|refactor|update)\b)/iu
    )
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function testScopeCategoryText(segment: string): string {
  if (/\badd\s+or\s+run\s+(?:focused\s+)?tests?\b/iu.test(segment)) {
    return segment;
  }

  return segment.replace(
    /\b(?:run|execute)\s+(?:(?:the|all|existing|focused)\s+)*tests?\b/giu,
    " "
  );
}

function hasDeclaredScopeIntent(segment: string): boolean {
  return (
    /(?:^\s*(?:[-*]\s*)?|:\s*|\b(?:also|and|please|then)\s+)(?:add|build|change|create|edit|fix|implement|migrate|modify|refactor|update)\b/iu.test(
      segment
    ) ||
    /\b(?:span(?:s|ning)?|touch(?:es|ing)?|cover(?:s|ing)?|involv(?:es|ing))\b[^.\n]{0,80}\b(?:areas|modules|packages|components|subsystems|workstreams)\b/iu.test(
      segment
    )
  );
}

function addDeclaredCategory(
  segment: string,
  label: string,
  pattern: RegExp,
  categoryPaths: string[],
  paths: Set<string>,
  labels: Set<string>
): void {
  if (!pattern.test(segment)) {
    return;
  }

  labels.add(label);

  for (const path of categoryPaths) {
    paths.add(path);
  }
}

function extractNamedScopeAreas(segment: string): string[] {
  const areas = new Set<string>();
  const ignored = new Set([
    "app",
    "and",
    "cli",
    "components",
    "config",
    "configuration",
    "coverage",
    "docs",
    "documentation",
    "examples",
    "files",
    "implementation",
    "lib",
    "metadata",
    "modules",
    "output",
    "packages",
    "planner",
    "readme",
    "reports",
    "samples",
    "source",
    "src",
    "subsystems",
    "tests",
    "test",
    "changelog",
    "package",
    "package-metadata",
    "package-version",
    "version",
    "sample-output",
    "smoke",
    "smoke-coverage",
    "updates",
    "workstreams"
  ]);

  for (const match of segment.matchAll(
    /\b(?:across|spanning)\s+(?:areas?|modules?|packages?|components?|subsystems?|workstreams?)?\s*([^.;]+)/giu
  )) {
    for (const value of (match[1] ?? "").split(/[\s,+/&]+/u)) {
      const normalized = normalizeScopeArea(value);

      if (normalized !== undefined && !ignored.has(normalized)) {
        areas.add(normalized);
      }
    }
  }

  for (const match of segment.matchAll(
    /\b(?:area|module|package|component|subsystem|workstream)\s+([a-z][a-z0-9_-]*)\b/giu
  )) {
    const normalized = normalizeScopeArea(match[1] ?? "");

    if (normalized !== undefined && !ignored.has(normalized)) {
      areas.add(normalized);
    }
  }

  for (const match of segment.matchAll(
    /\b(?:add|build|create|implement)\s+(?:a|an|the)?\s*(?:new\s+)?((?:[a-z][a-z0-9_-]*\s+){0,2}(?:feature|subsystem|tool|exporter|service|module))\b/giu
  )) {
    const normalized = normalizeScopeArea(match[1] ?? "");

    if (
      normalized !== undefined &&
      !["feature", "module", "service", "subsystem", "tool"].includes(normalized)
    ) {
      areas.add(normalized);
    }
  }

  for (const match of segment.matchAll(
    /\b(?:migrate|refactor|update)\s+(?:a|an|the)?\s*([a-z][a-z0-9_-]*(?:\s+[a-z][a-z0-9_-]*)?)\s+(?:api\s+)?surface\b/giu
  )) {
    const normalized = normalizeScopeArea(`${match[1] ?? ""}-surface`);

    if (normalized !== undefined) {
      areas.add(normalized);
    }
  }

  for (const match of segment.matchAll(
    /\b(?:add|change|create|edit|implement|migrate|modify|refactor|update)\s+([^.;]+)/giu
  )) {
    const items = (match[1] ?? "").split(/\s*,\s*|\s+and\s+/iu);

    if (items.length < 2) {
      continue;
    }

    for (const item of items) {
      const normalized = normalizeListedScopeArea(item);

      if (normalized !== undefined && !ignored.has(normalized)) {
        areas.add(normalized);
      }
    }
  }

  return [...areas];
}

function normalizeListedScopeArea(value: string): string | undefined {
  const primaryValue = value.split(/\s+(?:because|for|to|with)\b/iu)[0] ?? value;
  const words = primaryValue
    .trim()
    .toLowerCase()
    .replace(/^(?:a|an|and|the|new|only)\s+/u, "")
    .replace(/\s+(?:changes?|files?|modules?|updates?)$/u, "")
    .split(/\s+/u)
    .filter((word) => word.length > 0);
  const rejectedWords = new Set([
    "add",
    "because",
    "build",
    "change",
    "create",
    "edit",
    "for",
    "implement",
    "migrate",
    "modify",
    "refactor",
    "run",
    "spanning",
    "to",
    "update",
    "verify",
    "with"
  ]);

  if (words.length === 0 || words.length > 3 || words.some((word) => rejectedWords.has(word))) {
    return undefined;
  }

  return normalizeScopeArea(words.join("-"));
}

function normalizeScopeArea(value: string): string | undefined {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return /^[a-z][a-z0-9-]*$/u.test(normalized) ? normalized : undefined;
}

function stripPathTokens(value: string): string {
  let stripped = value;

  for (const path of extractPathTokens(value)) {
    for (const variant of [path, path.replace(/\//gu, "\\")]) {
      stripped = stripped.replace(
        new RegExp(`[\`"'(<\\[]?${escapeRegExp(variant)}[\`"')>\\]]?`, "giu"),
        " "
      );
    }
  }

  return stripped;
}

function extractExplicitEditTargets(text: string): string[] {
  const targets = new Set<string>();
  const phraseContextPaths = new Set(extractPhraseContextPaths(text));

  for (const clause of splitIntentClauses(text)) {
    if (!hasAffirmativeEditIntent(clause)) {
      continue;
    }

    for (const path of extractPathTokens(clause)) {
      if (phraseContextPaths.has(path)) {
        continue;
      }

      targets.add(path);
    }
  }

  return [...targets];
}

function extractReadOnlyContextPaths(text: string): string[] {
  const contextPaths = new Set<string>();

  for (const path of extractPathTokens(text)) {
    if (isContextFileName(path)) {
      contextPaths.add(path);
    }
  }

  for (const path of extractPhraseContextPaths(text)) {
    contextPaths.add(path);
  }

  return [...contextPaths];
}

function extractPhraseContextPaths(text: string): string[] {
  const contextPaths = new Set<string>();

  for (const clause of splitIntentClauses(text)) {
    if (hasNegativeEditIntent(clause)) {
      addExtractedPaths(contextPaths, clause);
      continue;
    }

    for (const marker of [/\bbased on\b/iu, /\bread from\b/iu]) {
      const match = marker.exec(clause);

      if (match?.index !== undefined) {
        addExtractedPaths(contextPaths, clause.slice(match.index + match[0].length));
      }
    }

    if (
      /\b(?:as context|for reference|use this file as context)\b/iu.test(clause) ||
      /^\s*(?:context|spec|requirements?|task|prompt|brief|design|notes?|reference)\s*:/iu.test(
        clause
      )
    ) {
      addExtractedPaths(contextPaths, clause);
    }
  }

  return [...contextPaths];
}

function addExtractedPaths(paths: Set<string>, value: string): void {
  for (const path of extractPathTokens(value)) {
    paths.add(path);
  }
}

function splitIntentClauses(text: string): string[] {
  return text
    .split(
      /\r?\n|[;,]|\bthen\b|\band\s+(?=(?:modify|update|create|add|edit|change|touch|implement)\b)/iu
    )
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

function hasAffirmativeEditIntent(value: string): boolean {
  return (
    !hasNegativeEditIntent(value) &&
    /\b(?:modify|update|create|add|edit|change|touch|implement)\b/iu.test(value)
  );
}

function hasNegativeEditIntent(value: string): boolean {
  return /\b(?:do not|don't|must not|never)\s+(?:modify|update|edit|change|touch)\b/iu.test(
    value
  );
}

function isContextFileName(path: string): boolean {
  const fileName = basename(normalizePath(path)).toLowerCase();
  const stem = fileName.slice(0, Math.max(0, fileName.length - extname(fileName).length));
  const parts = stem.split(/[-_.]+/u);

  return contextFileIndicators.some((indicator) => parts.includes(indicator));
}

function isIgnoredDirectory(name: string): boolean {
  const lowerName = name.toLowerCase();
  return ignoredDirectories.has(lowerName) || lowerName.includes("pycache");
}

function isGeneratedArtifact(path: string): boolean {
  const normalizedPath = normalizePath(path);
  const fileName = basename(normalizedPath).toLowerCase();

  return (
    generatedArtifactExtensions.has(extname(fileName)) ||
    generatedArtifactNames.has(fileName)
  );
}

function isNewDependencyAllowed(
  classification: TaskClassification,
  task: string
): boolean {
  if (
    /\b(?:do not|don't|must not|without|no)\b[^.\n]{0,40}\b(?:new )?(?:dependencies|dependency additions?)\b/iu.test(
      task
    )
  ) {
    return false;
  }

  const hasAffirmativeDependencyIntent =
    (/\b(?:add|install|introduce)\b[^.\n]{0,40}\b(?:dependencies|dependency|package|library|framework)\b/iu.test(
      task
    ) ||
      /\b(?:upgrade|bump|replace)\b[^.\n]{0,50}/iu.test(task) ||
      /\bupdate\s+(?:a\s+|the\s+)?(?:dependencies|dependency|library|framework)\b/iu.test(
        task
      )) &&
    !/\b(?:package|project|release)\s+version\b/iu.test(task);

  return (
    (classification.taskType === "dependency_upgrade" &&
      hasAffirmativeDependencyIntent) ||
    (classification.taskType === "auth_security_change" &&
      classification.likelyAllowsNewDependencies)
  );
}

function isCiChangeAllowed(classification: TaskClassification, task: string): boolean {
  if (
    /\b(?:do not|don't|must not|without|no)\b[^.\n]{0,40}\b(?:ci|workflow|pipeline|github actions?)\b/iu.test(
      task
    )
  ) {
    return false;
  }

  return (
    classification.taskType === "infra_ci_change" &&
    /\b(?:add|change|configure|create|edit|modify|update)\b[^.\n]{0,50}\b(?:ci|workflow|pipeline|github actions?)\b/iu.test(
      task
    )
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

function extractPlanFileMentions(planText: string, additionalContextFiles: string[] = []): {
  proposedFiles: string[];
  contextFiles: string[];
  outputFiles: string[];
  fileMentions: PlanFileMention[];
} {
  const allPaths = new Set(extractPathTokens(planText));
  const explicitEditTargets = new Set(extractExplicitEditTargets(planText));
  const contextFiles = new Set([
    ...additionalContextFiles.map(normalizePath),
    ...extractReadOnlyContextPaths(planText)
  ]);
  const outputFiles = new Set<string>();
  const markedNewFiles = new Set<string>();

  for (const clause of splitIntentClauses(planText)) {
    const clausePaths = extractPathTokens(clause);

    for (const path of clausePaths) {
      if (isOutputArtifactMention(clause, path)) {
        outputFiles.add(path);
      }

      if (isNewFileMention(clause, path)) {
        markedNewFiles.add(path);
      }
    }
  }

  for (const path of explicitEditTargets) {
    contextFiles.delete(path);
    outputFiles.delete(path);
  }

  const proposedFiles = [...allPaths]
    .filter((path) => !contextFiles.has(path) && !outputFiles.has(path))
    .sort(comparePaths);
  const fileMentions: PlanFileMention[] = [
    ...proposedFiles.map((path) => ({
      path,
      role: "edit" as const,
      markedNew: markedNewFiles.has(path)
    })),
    ...[...contextFiles].map((path) => ({
      path,
      role: "context" as const,
      markedNew: false
    })),
    ...[...outputFiles].map((path) => ({
      path,
      role: "output" as const,
      markedNew: false
    }))
  ].sort((left, right) => comparePaths(left.path, right.path));

  return {
    proposedFiles,
    contextFiles: [...contextFiles].sort(comparePaths),
    outputFiles: [...outputFiles].sort(comparePaths),
    fileMentions
  };
}

function isNewFileMention(clause: string, path: string): boolean {
  const pathIndex = normalizePath(clause).indexOf(path);
  const prefix = pathIndex < 0 ? clause : clause.slice(0, pathIndex);

  return /\b(?:add|create|introduce|new)\b/iu.test(prefix);
}

function isOutputArtifactMention(clause: string, path: string): boolean {
  const firstSegment = normalizePath(path).toLowerCase().split("/")[0] ?? "";

  return (
    expectedOutputDirectories.has(firstSegment) &&
    /\b(?:artifact|generated|output|produce|write|emit|build output|coverage report)\b/iu.test(
      clause
    )
  );
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
  const ignored = new Set([
    "and",
    "dependency",
    "dependencies",
    "package",
    "packages",
    "update"
  ]);

  return value
    .split(/[\s,]+/u)
    .map(cleanPlanToken)
    .filter((token) => token.length > 0)
    .filter((token) => !token.startsWith("-"))
    .filter((token) => !ignored.has(token.toLowerCase()))
    .filter((token) => !isFileLikePlanPath(token));
}

function detectsNewDependencyIntent(planText: string): boolean {
  return /\b(?:npm\s+(?:install|i)|pnpm\s+add|yarn\s+add|bun\s+add|install\s+[@a-z0-9._/-]+|add\s+(?:a\s+|new\s+)?dependenc(?:y|ies)|add\s+[@a-z0-9._/-]+\s+dependenc(?:y|ies))\b/iu.test(
    planText
  );
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
    /\brun existing tests?\b/iu,
    /\brun focused tests?\b/iu,
    /\brun (?:a )?smoke tests?\b/iu,
    /\bcli smoke tests?\b/iu,
    /\bcompile checks?\b/iu,
    /\btypechecks?\b/iu,
    /\bin-file tests?\b/iu,
    /\bmanual verification\b/iu,
    /\bregression tests?\b/iu,
    /\bpytest\b/iu,
    /\bvitest\b/iu,
    /\bnpm test\b/iu,
    /\bpnpm test\b/iu,
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

function analyzePlanStructure(parsedPlan: AgentPlan): PlanStructure {
  const text = parsedPlan.rawText;
  const hasFilesLabel = hasSectionLabel(
    text,
    /(?:files?|scope|touched files?|modules?|components?)/iu
  );
  const hasImplementationLabel = hasSectionLabel(
    text,
    /(?:implementation|changes?|approach|steps?|execution)/iu
  );
  const hasVerificationLabel = hasSectionLabel(
    text,
    /(?:verification|tests?|checks?|validation)/iu
  );
  const hasRiskLabel = hasSectionLabel(
    text,
    /(?:risks?|assumptions?|constraints?|scope rationale|expansion rationale)/iu
  );

  return {
    hasFiles:
      hasFilesLabel ||
      parsedPlan.proposedFiles.length > 0 ||
      /\b(?:module|component|package)\s+[a-z0-9_.@/-]+\b/iu.test(text),
    hasImplementation:
      hasImplementationLabel ||
      /\b(?:modify|update|create|add|edit|change|implement|reuse|remove|rename|wire|expose)\b/iu.test(
        text
      ),
    hasVerification:
      hasVerificationLabel ||
      parsedPlan.proposedTests.length > 0 ||
      /\b(?:verify|validation|lint|typecheck|build|pack|smoke)\b/iu.test(text),
    hasRiskRationale:
      hasRiskLabel ||
      (/\b(?:because|since|required for|required to|needed to|included to)\b/iu.test(text) &&
        /\b(?:verify|test|check|lint|typecheck|build|pack|smoke)\b/iu.test(text))
  };
}

function hasSectionLabel(text: string, concept: RegExp): boolean {
  return text.split(/\r?\n/u).some((line) => {
    const normalizedLine = line
      .replace(/^\s*(?:#{1,6}|[-*]|\d+\.)\s*/u, "")
      .trim();
    const label = normalizedLine.split(/[:-]/u)[0]?.trim() ?? "";

    return concept.test(label) && (normalizedLine !== label || normalizedLine.split(/\s+/u).length <= 4);
  });
}

function isCodeTask(scopeBudget: ScopeBudget, parsedPlan: AgentPlan): boolean {
  return (
    scopeBudget.taskType !== "copy_change" ||
    parsedPlan.proposedFiles.some((path) => sourceExtensions.has(extname(path).toLowerCase()))
  );
}

function validateMentionedFiles(
  parsedPlan: AgentPlan,
  cwd: string | undefined
): PlanValidationFinding[] {
  if (cwd === undefined) {
    return [];
  }

  const missingFiles = (parsedPlan.fileMentions ?? [])
    .filter((mention) => mention.role === "edit" && !mention.markedNew)
    .map((mention) => mention.path)
    .filter((path) => !isExistingRepoFile(cwd, path));

  if (missingFiles.length === 0) {
    return [];
  }

  return [
    {
      code: "PLAN_MENTIONED_FILE_MISSING",
      severity: "warn",
      title: "Mentioned file does not exist",
      message: "The plan names edit targets that do not exist and are not marked as new or created.",
      recommendation: "Mark new files explicitly with create/add wording, or correct the paths.",
      evidence: missingFiles
    }
  ];
}

function isExistingRepoFile(cwd: string, path: string): boolean {
  const repoRoot = resolve(cwd);
  const absolutePath = resolve(repoRoot, path);
  const relativePath = normalizePath(relative(repoRoot, absolutePath));

  return (
    relativePath !== ".." &&
    !relativePath.startsWith("../") &&
    existsSync(absolutePath) &&
    statSync(absolutePath).isFile()
  );
}

function validateDependencyRequirements(
  taskText: string,
  planText: string,
  cwd: string | undefined,
  scopeBudget: ScopeBudget
): PlanValidationFinding[] {
  const requirements = mergeDependencyRequirements([
    ...extractDependencyRequirements(taskText),
    ...extractDependencyRequirements(planText)
  ]);
  const requiredPackages = requirements.filter(
    (requirement) => requirement.strength === "required"
  );

  if (requiredPackages.length === 0) {
    return [];
  }

  const findings: PlanValidationFinding[] = [];
  const declaredDependencies = collectDeclaredDependencies(cwd);
  const missingBlockedPackages = requiredPackages
    .map((requirement) => requirement.name)
    .filter((name) => !declaredDependencies.has(name))
    .filter(() => !scopeBudget.hardGates.newDependenciesAllowed);

  if (missingBlockedPackages.length > 0) {
    findings.push({
      code: "DEPENDENCY_REQUIREMENT_CONFLICT",
      severity: "warn",
      title: "Required dependency is unavailable under current policy",
      message: `The task appears to require a missing dependency (${missingBlockedPackages.join(", ")}), and new dependency is blocked by current policy.`,
      recommendation:
        "Request approval to add it, or revise the plan with an explicitly accepted alternative.",
      evidence: missingBlockedPackages
    });
  }

  const substitutions = requiredPackages
    .map((requirement) => detectDependencySubstitution(planText, requirement.name))
    .filter((value): value is string => value !== undefined);

  if (substitutions.length > 0 && !hasDependencyAlternativeApproval(planText)) {
    findings.push({
      code: "DEPENDENCY_SUBSTITUTION_REQUIRES_APPROVAL",
      severity: "fail",
      title: "Dependency substitution requires approval",
      message: "The plan substitutes an explicitly required dependency without an accepted-alternative or user-approval marker.",
      recommendation: "Request approval for the named alternative or use the required dependency.",
      evidence: substitutions
    });
  }

  return findings;
}

function extractDependencyRequirements(text: string): DependencyRequirement[] {
  const requirements: DependencyRequirement[] = [];

  for (const packageName of dependencyRegistry) {
    const escapedName = escapeRegExp(packageName);
    const mentionPattern = new RegExp(`\\b${escapedName}\\b`, "iu");

    if (!mentionPattern.test(text)) {
      continue;
    }

    const preferredPattern = new RegExp(
      `\\b(?:prefer|preferred|ideally|optional(?:ly)?|if available)\\b[^.\\n]{0,50}\\b${escapedName}\\b`,
      "iu"
    );
    const requiredPattern = new RegExp(
      `(?:\\b(?:require[sd]?|must use|use|using|run|add|install|with|via)\\b[^.\\n]{0,40}\\b${escapedName}\\b|\\b${escapedName}\\b[^.\\n]{0,25}\\b(?:is required|must be used)\\b)`,
      "iu"
    );

    if (preferredPattern.test(text)) {
      requirements.push({ name: packageName, strength: "preferred" });
    } else if (requiredPattern.test(text)) {
      requirements.push({ name: packageName, strength: "required" });
    }
  }

  return requirements;
}

function mergeDependencyRequirements(
  requirements: DependencyRequirement[]
): DependencyRequirement[] {
  const merged = new Map<string, DependencyRequirement["strength"]>();

  for (const requirement of requirements) {
    const current = merged.get(requirement.name);

    if (current !== "required") {
      merged.set(requirement.name, requirement.strength);
    }
  }

  return [...merged].map(([name, strength]) => ({ name, strength }));
}

function collectDeclaredDependencies(cwd: string | undefined): Set<string> {
  const dependencies = new Set<string>();

  if (cwd === undefined) {
    return dependencies;
  }

  const packageJsonPath = join(cwd, "package.json");

  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<
        string,
        unknown
      >;

      for (const field of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies"
      ]) {
        const values = packageJson[field];

        if (typeof values === "object" && values !== null) {
          for (const name of Object.keys(values)) {
            dependencies.add(name.toLowerCase());
          }
        }
      }
    } catch {
      // Invalid manifests are handled elsewhere; dependency evidence stays conservative.
    }
  }

  for (const manifestName of [
    "pyproject.toml",
    "requirements.txt",
    "setup.cfg",
    "setup.py"
  ]) {
    const manifestPath = join(cwd, manifestName);

    if (!existsSync(manifestPath)) {
      continue;
    }

    const content = readFileSync(manifestPath, "utf8");

    for (const packageName of dependencyRegistry) {
      if (new RegExp(`(^|[^a-z0-9_-])${escapeRegExp(packageName)}([^a-z0-9_-]|$)`, "imu").test(content)) {
        dependencies.add(packageName);
      }
    }
  }

  return dependencies;
}

function detectDependencySubstitution(planText: string, requiredName: string): string | undefined {
  const escapedName = escapeRegExp(requiredName);
  const patterns = [
    new RegExp(
      `\\b(?:use|choose|substitute)\\s+([@a-z0-9_.-]+)\\s+(?:instead of|rather than|for)\\s+${escapedName}\\b`,
      "iu"
    ),
    new RegExp(`\\breplace\\s+${escapedName}\\s+with\\s+([@a-z0-9_.-]+)\\b`, "iu")
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(planText);

    if (match?.[1] !== undefined && match[1].toLowerCase() !== requiredName) {
      return `${requiredName} -> ${match[1]}`;
    }
  }

  return undefined;
}

function hasDependencyAlternativeApproval(planText: string): boolean {
  return /\b(?:user approved|approved alternative|accepted alternative|with explicit approval|user accepts?)\b/iu.test(
    planText
  );
}

function validateRiskyChangeRationales(
  riskyFiles: string[],
  taskText: string,
  planText: string,
  scopeBudget: ScopeBudget
): PlanValidationFinding[] {
  const missing: string[] = [];
  const strongMissing: string[] = [];

  for (const path of riskyFiles) {
    if (taskRequestsRiskyPath(taskText, path) || findScopeRationale(planText, path).specific) {
      continue;
    }

    if (isHardRiskyPath(path, scopeBudget)) {
      strongMissing.push(path);
    } else {
      missing.push(path);
    }
  }

  const findings: PlanValidationFinding[] = [];

  if (strongMissing.length > 0) {
    findings.push({
      code: "RISKY_CHANGE_RATIONALE_REQUIRED",
      severity: "fail",
      title: "Risky change rationale required",
      message: "The plan proposes dependency, lockfile, CI, secret, or security-sensitive changes without a named reason.",
      recommendation: "Name why each risky file is needed and how it will be verified, or request approval.",
      evidence: strongMissing
    });
  }

  if (missing.length > 0) {
    findings.push({
      code: "RISKY_CHANGE_RATIONALE_REQUIRED",
      severity: "warn",
      title: "Config change rationale required",
      message: "The plan proposes broad configuration changes without a specific reason and verification.",
      recommendation: "Add a named config rationale and verification for the affected behavior.",
      evidence: missing
    });
  }

  return findings;
}

function taskRequestsRiskyPath(taskText: string, path: string): boolean {
  if (taskText.trim().length === 0) {
    return false;
  }

  const taskScopeHints = analyzeTaskScope(taskText);
  const normalizedTask = normalizePath(taskText).toLowerCase();
  const normalizedPath = normalizePath(path).toLowerCase();
  const category = riskyPathCategory(path);

  return (
    isWithinAllowedPaths(path, taskScopeHints.declaredPaths) ||
    normalizedTask.includes(normalizedPath) ||
    normalizedTask.includes(basename(normalizedPath)) ||
    (category !== undefined &&
      new RegExp(`\\b(?:change|update|modify|add|configure)\\b[^.\\n]{0,50}\\b${escapeRegExp(category)}\\b`, "iu").test(
        taskText
      ))
  );
}

function isRiskyPlanPath(path: string): boolean {
  return riskyPathCategory(path) !== undefined;
}

function riskyPathCategory(path: string): string | undefined {
  const normalizedPath = normalizePath(path);
  const fileName = basename(normalizedPath);
  const lowerFileName = fileName.toLowerCase();

  if (lockfileNames.has(fileName)) {
    return "lockfile";
  }

  if (isDependencyFile(normalizedPath)) {
    return "dependency";
  }

  if (isCiFile(normalizedPath)) {
    return "ci";
  }

  if (isSecretPath(normalizedPath)) {
    return "secret";
  }

  if (
    /(^|\/)(?:security|policies?)(?:\/|$)/iu.test(normalizedPath) ||
    /^(?:security|codeowners)(?:\.|$)/iu.test(lowerFileName)
  ) {
    return "security";
  }

  if (
    broadConfigFileNames.has(fileName) ||
    /(?:^|[.-])config\.(?:js|cjs|mjs|ts|json|yml|yaml|toml)$/iu.test(fileName)
  ) {
    return "config";
  }

  return undefined;
}

function isHardRiskyPath(path: string, scopeBudget: ScopeBudget): boolean {
  const category = riskyPathCategory(path);

  return (
    category === "lockfile" ||
    category === "secret" ||
    category === "security" ||
    (category === "dependency" && !scopeBudget.hardGates.newDependenciesAllowed) ||
    (category === "ci" && !scopeBudget.hardGates.ciChangesAllowed)
  );
}

function validatePlanFilesAgainstScope(
  parsedPlan: AgentPlan,
  scopeBudget: ScopeBudget,
  config: ScopeBudgetConfig | undefined,
  planText: string
): PlanValidationFinding[] {
  const outsideAllowedPaths = findOutsideAllowedPaths(parsedPlan, scopeBudget);

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
    findings.push({
      code: "PLAN_HARD_GATE_VIOLATION",
      severity: "fail",
      title: "Plan includes a hard-gated category",
      message: "The plan includes dependency, CI, secret, or protected paths that require approval under the active scope budget.",
      recommendation: "Request approval or revise the plan to remove the hard-gated paths.",
      evidence: approvalRequiredPaths
    });
  }

  if (warningPaths.length > 0) {
    findings.push({
      code: "SCOPE_EXPANSION_WARN",
      severity: "warn",
      title: "Files outside allowed scope",
      message: `${warningPaths.length} proposed file(s) exceed declared task scope.`,
      recommendation: "Narrow the plan or add a specific scope rationale for the expanded files.",
      evidence: warningPaths
    });
  }

  findings.push({
    code: "PLAN_SCOPE_OUTSIDE_BUDGET",
    severity: "warn",
    title: "Plan exceeds expected scope",
    message: `${outsideAllowedPaths.length} proposed file(s) exceed declared task scope and require clarification.`,
    recommendation: "Name why each extra file is needed and how the expanded area will be verified.",
    evidence: outsideAllowedPaths
  });

  const rationales = outsideAllowedPaths.map((path) => findScopeRationale(planText, path));
  const missingRationales = rationales.filter((rationale) => !rationale.specific && !rationale.vague);
  const vagueRationales = rationales.filter((rationale) => rationale.vague);

  if (missingRationales.length > 0) {
    findings.push({
      code: "SCOPE_EXPANSION_RATIONALE_REQUIRED",
      severity: "warn",
      title: "Scope rationale required",
      message: "The plan expands beyond expected paths without naming why each extra area is needed and how it will be verified.",
      recommendation: "Add a specific scope rationale for each expanded file, module, or category.",
      evidence: missingRationales.map((rationale) => rationale.path)
    });
  }

  if (vagueRationales.length > 0) {
    findings.push({
      code: "SCOPE_EXPANSION_RATIONALE_VAGUE",
      severity: "warn",
      title: "Scope rationale is vague",
      message: "The plan includes expansion wording that does not identify a concrete reason and verification for the extra area.",
      recommendation: "Name the affected file or category, the reason it is needed, and the verification for that area.",
      evidence: vagueRationales.map((rationale) => rationale.path)
    });
  }

  return findings;
}

function findOutsideAllowedPaths(parsedPlan: AgentPlan, scopeBudget: ScopeBudget): string[] {
  if (parsedPlan.proposedFiles.length === 0 || scopeBudget.allowedPaths.length === 0) {
    return [];
  }

  return parsedPlan.proposedFiles.filter(
    (path) => !isWithinAllowedPaths(path, scopeBudget.allowedPaths)
  );
}

function findScopeRationale(planText: string, path: string): ScopeRationale {
  const matchingClauses = planText
    .split(/\r?\n/u)
    .filter((clause) => rationaleNamesPath(clause, path));

  for (const clause of matchingClauses) {
    const hasReason =
      /\b(?:because|since|so that|required for|required to|needed for|needed to|included to|must change to)\b/iu.test(
        clause
      );
    const hasVerification =
      isTestFile(path) ||
      /\b(?:verify|verification|test|tests|pytest|vitest|jest|smoke|check|typecheck|lint|build|pack)\b/iu.test(
        clause
      );

    if (hasReason && hasVerification && !hasVagueRationale(clause)) {
      return { path, specific: true, vague: false };
    }

    if (hasReason || hasVagueRationale(clause)) {
      return { path, specific: false, vague: true };
    }
  }

  return { path, specific: false, vague: false };
}

function rationaleNamesPath(clause: string, path: string): boolean {
  const normalizedClause = normalizePath(clause).toLowerCase();
  const normalizedPath = normalizePath(path).toLowerCase();
  const category = riskyPathCategory(path);

  return (
    normalizedClause.includes(normalizedPath) ||
    normalizedClause.includes(basename(normalizedPath)) ||
    (category !== undefined && normalizedClause.includes(category))
  );
}

function hasVagueRationale(value: string): boolean {
  return /\b(?:needed for implementation|related files?|refactor|cleanup|make it work)\b/iu.test(
    value
  );
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
    return "Plan is aligned with declared task scope.";
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
  requiredTests: boolean,
  taskScopeHints: TaskScopeHints
): string[] {
  const explicitTargets =
    taskScopeHints.explicitOnlyTargets.length > 0
      ? taskScopeHints.explicitOnlyTargets
      : taskScopeHints.explicitEditTargets;
  const paths = new Set<string>();

  if (taskScopeHints.explicitOnlyTargets.length === 0) {
    for (const path of config?.allowed_paths ?? []) {
      if (!isGeneratedOrContextPath(path, taskScopeHints.contextFiles)) {
        paths.add(path);
      }
    }
  }

  for (const path of explicitTargets) {
    paths.add(path);
  }

  if (taskScopeHints.explicitOnlyTargets.length > 0) {
    if (
      taskScopeHints.declaredScopeLabels.includes("tests") &&
      !taskScopeHints.explicitOnlyTargets.some(isTestFile)
    ) {
      for (const path of taskScopeHints.declaredPaths.filter(isDeclaredTestPattern)) {
        paths.add(path);
      }
    }

    return [...paths].filter((path) => path !== ".").sort(comparePaths);
  }

  for (const path of taskScopeHints.declaredPaths) {
    if (!isGeneratedOrContextPath(path, taskScopeHints.contextFiles)) {
      paths.add(path);
    }
  }

  for (const match of repoContext.likelyRelevantFiles.slice(0, 8)) {
    if (isGeneratedOrContextPath(match.path, taskScopeHints.contextFiles)) {
      continue;
    }

    paths.add(match.path);
    paths.add(dirname(match.path));
  }

  if (requiredTests || repoContext.likelyTestFiles.length > 0) {
    for (const match of repoContext.likelyTestFiles.slice(0, 8)) {
      if (isGeneratedOrContextPath(match.path, taskScopeHints.contextFiles)) {
        continue;
      }

      paths.add(match.path);
      paths.add(dirname(match.path));
    }
  }

  for (const match of repoContext.existingPatternMatches.slice(0, 8)) {
    if (
      match.pattern.startsWith("utility:") &&
      !isGeneratedOrContextPath(match.path, taskScopeHints.contextFiles)
    ) {
      paths.add(match.path);
    }
  }

  return [...paths].filter((path) => path !== ".").sort(comparePaths);
}

function buildSuspiciousPaths(
  repoContext: RepoContext,
  taskScopeHints: TaskScopeHints
): string[] {
  return dedupe([
    ...repoContext.riskyMatchedPaths,
    ...findDangerousPaths(repoContext),
    ...taskScopeHints.explicitEditTargets.filter(isExcludedRepositoryPath)
  ]).sort(comparePaths);
}

function expectedFileRange(
  defaults: NumberRange,
  taskScopeHints: TaskScopeHints
): NumberRange {
  if (taskScopeHints.explicitOnlyTargets.length > 0) {
    const count = Math.max(1, taskScopeHints.explicitOnlyTargets.length);
    const focusedTestAllowance =
      taskScopeHints.declaredScopeLabels.includes("tests") &&
      !taskScopeHints.explicitOnlyTargets.some(isTestFile)
        ? 1
        : 0;

    return { min: count, max: count + focusedTestAllowance };
  }

  const breadthUnits = declaredBreadthUnits(taskScopeHints);

  if (breadthUnits < 2 && !taskScopeHints.hasBroadScopeSignal) {
    return defaults;
  }

  return {
    min: Math.max(defaults.min, Math.min(6, breadthUnits)),
    max: Math.max(
      defaults.max,
      breadthUnits * 3 + (taskScopeHints.hasBroadScopeSignal ? 2 : 0)
    )
  };
}

function narrowSoftLimits(
  defaults: ScopeBudget["softLimits"],
  taskScopeHints: TaskScopeHints
): ScopeBudget["softLimits"] {
  if (taskScopeHints.explicitOnlyTargets.length > 0) {
    const focusedTestAllowance =
      taskScopeHints.declaredScopeLabels.includes("tests") &&
      !taskScopeHints.explicitOnlyTargets.some(isTestFile)
        ? 1
        : 0;

    return {
      ...defaults,
      maxFilesChanged: Math.min(
        defaults.maxFilesChanged,
        taskScopeHints.explicitOnlyTargets.length + focusedTestAllowance
      )
    };
  }

  const breadthUnits = declaredBreadthUnits(taskScopeHints);

  if (breadthUnits < 2 && !taskScopeHints.hasBroadScopeSignal) {
    return defaults;
  }

  const expectedRange = expectedFileRange(
    { min: 1, max: defaults.maxFilesChanged },
    taskScopeHints
  );
  const scaleFactor = 1 + Math.min(2, breadthUnits / 4);

  return {
    maxFilesChanged: Math.max(defaults.maxFilesChanged, expectedRange.max + 4),
    maxLinesAdded: Math.ceil(defaults.maxLinesAdded * scaleFactor),
    maxLinesDeleted: Math.ceil(defaults.maxLinesDeleted * scaleFactor)
  };
}

function isDeclaredTestPattern(path: string): boolean {
  return (
    path === "test" ||
    path === "tests" ||
    path.includes("__tests__") ||
    path.includes(".test.") ||
    path.includes(".spec.")
  );
}

function declaredBreadthUnits(taskScopeHints: TaskScopeHints): number {
  return Math.max(
    taskScopeHints.declaredScopeLabels.length,
    taskScopeHints.explicitEditTargets.length
  );
}

function isGeneratedOrContextPath(path: string, contextFiles: string[]): boolean {
  const normalizedPath = normalizePath(path);
  return (
    isExcludedRepositoryPath(normalizedPath) ||
    contextFiles.some((contextPath) => normalizePath(contextPath) === normalizedPath)
  );
}

function isExcludedRepositoryPath(path: string): boolean {
  const normalizedPath = normalizePath(path);
  const segments = normalizedPath.toLowerCase().split("/");

  return (
    segments.slice(0, -1).some(isIgnoredDirectory) ||
    (segments.length === 1 && isIgnoredDirectory(segments[0] ?? "")) ||
    isGeneratedArtifact(normalizedPath)
  );
}

function buildBlockedWithoutApproval(
  classification: TaskClassification,
  repoContext: RepoContext,
  newDependenciesAllowed: boolean,
  ciChangesAllowed: boolean,
  dependencyMetadataChangesAllowed: boolean
): string[] {
  const blocked: string[] = [];

  if (
    !newDependenciesAllowed &&
    !dependencyMetadataChangesAllowed &&
    repoContext.dependencyFiles.length > 0
  ) {
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

  const taskScopeHints = analyzeTaskScope(input.task, input.repoContext.contextFiles);

  if (taskScopeHints.explicitOnlyTargets.length > 0) {
    reasons.push(
      `Explicit modify-only constraint narrowed scope to ${taskScopeHints.explicitOnlyTargets.length} target(s).`
    );
  } else if (
    taskScopeHints.declaredScopeLabels.length > 0 ||
    taskScopeHints.hasBroadScopeSignal
  ) {
    reasons.push(
      `Declared task breadth includes ${taskScopeHints.declaredScopeLabels.length} named scope area(s).`
    );
  }

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
  const declaredScope = extractDeclaredTaskScope(task);
  const hasDeclaredNonTestScope = declaredScope.labels.some(
    (label) => label !== "tests" && label !== "smoke_tests"
  );

  if (!hasTestSignal || hasImplementationJoin || hasDeclaredNonTestScope) {
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
