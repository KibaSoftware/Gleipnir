import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { FindingCode, FindingSeverity } from "@gleip/core/findings";

export const packageName = "@gleip/planner";

export type TaskType =
  | "documentation_update"
  | "copy_change"
  | "ui_tweak"
  | "bug_fix"
  | "local_behavior_change"
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

export type WorkflowProfile =
  | "documentation_only"
  | "local_behavior_change"
  | "broad_change"
  | "sensitive_change";

export interface TaskClassification {
  taskType: TaskType;
  confidence: Confidence;
  riskLevel: RiskLevel;
  reasons: string[];
  likelyRequiresTests: boolean;
  likelyAllowsNewDependencies: boolean;
  workflowProfile?: WorkflowProfile;
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
  /** Files and directories seen by the scan, used to reject scope paths that do not exist. */
  knownPaths?: string[];
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
  workflowProfile?: WorkflowProfile;
  planRequired?: boolean;
  taskBreadth?: TaskBreadth;
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
  /**
   * Detection toggles from `.gleip.yml`. `GLEIP.md` calls configuration a user-facing API, but
   * these were read by no code at all -- setting `secrets: false` did not disable secret
   * detection, and setting it `true` guaranteed nothing. Disabling one is now reported in
   * `check` output so a weakened posture is visible to whoever reads the result.
   */
  checks?: {
    skipped_tests?: boolean;
    deleted_tests?: boolean;
    dependency_bloat?: boolean;
    ci_weakening?: boolean;
    risky_files?: boolean;
    secrets?: boolean;
  };
}

export interface GenerateImplementationBriefInput {
  task: string;
  classification: TaskClassification;
  repoContext: RepoContext;
  scopeBudget: ScopeBudget;
  config?: ScopeBudgetConfig;
  canonicalTask?: CanonicalTaskReference;
  requirementLedger?: RequirementLedger;
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

export type TaskBreadth = "local" | "feature" | "subsystem" | "cross_cutting" | "repository_wide";

export type ScopeTargetTier = "direct" | "derived" | "adjacent" | "unexplained";

export interface ScopeTargetClassification {
  target: string;
  classification: ScopeTargetTier;
  reason: string;
  evidence: string;
  nextAction?: string;
}

export interface PlanFileMention {
  path: string;
  role: "edit" | "context" | "output";
  markedNew: boolean;
}

export type PlanValidationStatus =
  | "aligned"
  | "advisory"
  | "needs_clarification"
  | "needs_approval"
  | "needs_cleanup";

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
  targetClassifications?: ScopeTargetClassification[];
  requirementCoverage?: PlanRequirementCoverage;
}

export interface ValidateAgentPlanInput {
  planText: string;
  scopeBudget: ScopeBudget;
  config?: ScopeBudgetConfig;
  cwd?: string;
  taskText?: string;
  contextFiles?: string[];
  requirementLedger?: RequirementLedger;
}

export type RequirementObligation =
  | "required"
  | "prohibited"
  | "optional"
  | "suggestion"
  | "informational";

export type RequirementCategory =
  | "architecture"
  | "behavior"
  | "CI"
  | "compatibility"
  | "dependency"
  | "documentation"
  | "migration"
  | "output"
  | "packaging"
  | "performance"
  | "platform"
  | "privacy"
  | "process"
  | "release"
  | "scope"
  | "security"
  | "safety"
  | "unknown"
  | "verification";

export interface CanonicalTaskReference {
  authority: "canonical";
  taskId: string;
  activeRevisionId: string;
  contentHash: string;
  artifactPath: string;
}

export interface RequirementSourceRevision {
  revisionId: string;
  revisionNumber: number;
  content: string;
}

export interface RequirementLedgerInput {
  taskText: string;
  canonicalTaskHash?: string;
  revisions?: RequirementSourceRevision[];
}

export interface RequirementLedger {
  schemaVersion: "1.0.0";
  authority: "derived";
  canonicalTaskHash?: string;
  offsetEncoding: "utf16";
  requirements: TaskRequirement[];
  conflicts: RequirementConflict[];
  generatedAt?: string;
}

export interface TaskRequirement {
  id: string;
  sourceText: string;
  canonicalRevisionId: string;
  sourceStart: number;
  sourceEnd: number;
  offsetEncoding: "utf16";
  category: RequirementCategory;
  obligation: RequirementObligation;
  status: "active" | "superseded" | "ambiguous";
  confidence: Confidence;
  explicit: boolean;
  relatedPaths: string[];
  relatedVerification?: string;
  supersededBy?: string;
}

export interface RequirementConflict {
  id: string;
  requirementIds: string[];
  reason: string;
  severity: "advisory" | "blocking";
}

export type BriefRequirementCoverageStatus =
  | "represented"
  | "partially_represented"
  | "referenced"
  | "omitted"
  | "ambiguous";

export interface BriefRequirementCoverage {
  requirementId: string;
  status: BriefRequirementCoverageStatus;
  reason: string;
}

export interface BriefCoverageAnalysis {
  authority: "derived";
  canonicalTaskHash?: string;
  coverageStatus: "complete" | "omissions_visible" | "ambiguous";
  omittedRequirementCount: number;
  ambiguousRequirementCount: number;
  requirements: BriefRequirementCoverage[];
}

export type PlanRequirementCoverageStatus =
  | "addressed"
  | "partially_addressed"
  | "explicitly_deferred"
  | "not_applicable"
  | "missing"
  | "conflicting"
  | "ambiguous";

export interface PlanRequirementCoverageItem {
  requirementId: string;
  status: PlanRequirementCoverageStatus;
  reason: string;
  evidence?: string[];
}

export interface PlanRequirementCoverage {
  requirements: PlanRequirementCoverageItem[];
  missingRequired: string[];
  conflictingRequirements: string[];
  deferredRequirements: string[];
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
  explicitOutputTargets: string[];
  explicitOnlyTargets: string[];
  /**
   * Module names inferred from prose. These are guesses, so their path forms are only admitted
   * to the scope budget once they resolve against the scanned repository.
   */
  declaredModuleAreas: string[];
}

interface DeclaredTaskScope {
  paths: string[];
  labels: string[];
  hasBroadScopeSignal: boolean;
  moduleAreas: string[];
}

interface PlanStructure {
  hasFiles: boolean;
  hasImplementation: boolean;
  hasRiskRationale: boolean;
  hasVerification: boolean;
}

type PlanValidationMode =
  | "analysis"
  | "documentation"
  | "implementation"
  | "investigation"
  | "migration_configuration"
  | "operation"
  | "unknown";

interface PlanEvidence {
  hasApproach: boolean;
  hasScopeTarget: boolean;
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
    taskType: "documentation_update",
    confidence: "high",
    riskLevel: "low",
    likelyRequiresTests: false,
    likelyAllowsNewDependencies: false,
    patterns: [
      /\b(?:docs?|documentation|readme|changelog|guide|context)\b/iu,
      /\b(?:document|describe|clarify)\b/iu,
      /\b(?:markdown|\.md)\b/iu
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
    taskType: "local_behavior_change",
    confidence: "high",
    riskLevel: "medium",
    likelyRequiresTests: true,
    likelyAllowsNewDependencies: false,
    patterns: [
      /\b(?:adjust|optimi[sz]e|tune|correct|repair|improve)\b[^.\n]{0,80}\b(?:runtime|behavior|logic|calculation|label(?:ing)?|flow|handling)\b/iu,
      /\b(?:runtime|behavior|logic|calculation|handler|parser|label(?:ing)?)\b[^.\n]{0,80}\b(?:adjust|optimi[sz]e|tune|correct|repair|improve)\b/iu
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
  "tmp",
  "temp",
  ".tmp",
  "cache",
  "logs",
  "runs",
  "output",
  "outputs",
  "artifacts",
  "test-results",
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
  ".toml",
  ".xml"
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
  "artifacts",
  "build",
  "cache",
  "coverage",
  "dist",
  "examples",
  "fixtures",
  "generated",
  "logs",
  "out",
  "output",
  "outputs",
  "reports",
  "results",
  "runs",
  "samples",
  "snapshots",
  "state",
  "temp",
  "tmp"
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
  documentation_update: {
    expectedFilesChanged: { min: 1, max: 2 },
    expectedLinesAdded: { min: 0, max: 80 },
    expectedLinesDeleted: { min: 0, max: 80 },
    softLimits: { maxFilesChanged: 2, maxLinesAdded: 120, maxLinesDeleted: 120 },
    requiredTests: false,
    riskLevel: "low"
  },
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
  local_behavior_change: {
    expectedFilesChanged: { min: 1, max: 4 },
    expectedLinesAdded: { min: 0, max: 160 },
    expectedLinesDeleted: { min: 0, max: 120 },
    softLimits: { maxFilesChanged: 5, maxLinesAdded: 220, maxLinesDeleted: 180 },
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

  // Classify on what the task asks for, not on what it forbids. Matching the raw text meant an
  // "Out of scope" section listing sensitive areas escalated the task into them: "Do not touch CI
  // configuration" made a CSV export endpoint an infra_ci_change, inheriting the sensitive_change
  // profile and high risk. Writing a spec responsibly should not raise its own risk rating.
  const classificationText = taskTextWithoutProhibitions(normalizedTask);

  for (const rule of rules) {
    if (rule.taskType === "test_only") {
      continue;
    }

    if (rule.taskType === "documentation_update" && !isDocumentationOnlyTask(normalizedTask)) {
      continue;
    }

    if (findMatches(rule.patterns, classificationText).length > 0) {
      return buildClassification(rule, classificationText);
    }
  }

  const semanticLocalClassification = classifyComposedLocalBehaviorTask(normalizedTask);

  if (semanticLocalClassification !== undefined) {
    return semanticLocalClassification;
  }

  return unknownClassification("No deterministic task signals matched.");
}

/**
 * Blank out the spans of active prohibitions, leaving everything else in place.
 *
 * Spans are replaced with spaces rather than removed so surrounding words never join, and so
 * offsets into the original text stay meaningful.
 */
function taskTextWithoutProhibitions(task: string): string {
  const prohibitions = extractRequirementLedger(task)
    .requirements.filter(
      (requirement) => requirement.obligation === "prohibited" && requirement.status === "active"
    )
    .sort((left, right) => right.sourceStart - left.sourceStart);

  let result = task;

  for (const prohibition of prohibitions) {
    const { sourceStart, sourceEnd } = prohibition;

    if (sourceEnd <= sourceStart || sourceEnd > result.length) {
      continue;
    }

    result = `${result.slice(0, sourceStart)}${" ".repeat(sourceEnd - sourceStart)}${result.slice(sourceEnd)}`;
  }

  return result;
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

  // Gleip's own generated files are dense with generic software vocabulary, so the lexical
  // relevance heuristic ranked AGENTS.md above real source for almost any task -- the brief then
  // nominated Gleip's configuration as the implementation target for a shopping-cart bug fix.
  // They stay eligible only when the task names one of them explicitly.
  const relevanceFiles = scan.files.filter(
    (path) =>
      !contextFiles.has(path) &&
      (!isGleipGeneratedFile(path) || taskScopeHints.explicitEditTargets.includes(path))
  );
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
    skippedDirectoryCount: scan.skippedDirectoryCount,
    knownPaths: knownRepositoryPaths(scan.files)
  };
}

/**
 * Whether a declared scope path is worth admitting to the budget.
 *
 * Declared paths are category guesses derived from prose -- the "output" category alone
 * contributes `reports`, `results`, `samples` and `examples` whenever a task happens to use the
 * word "result". Directories that do not exist cannot be the work, and every one of them widens
 * expected scope, which is what let an explicitly forbidden file pass a scope check unnoticed.
 *
 * Globs are patterns rather than locations, so they are always kept; so is everything when the
 * repository has not been scanned.
 */
function isPlausibleDeclaredPath(path: string, knownPaths: string[] | undefined): boolean {
  if (knownPaths === undefined || knownPaths.length === 0 || hasGlobSyntax(path)) {
    return true;
  }

  const normalized = normalizePath(path);

  return knownPaths.some(
    (known) => known === normalized || known.startsWith(`${normalized}/`)
  );
}

/** Gleip's own generated configuration and instruction files. */
function isGleipGeneratedFile(path: string): boolean {
  return ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "GLEIP.md", ".gleip.yml"].includes(
    normalizePath(path)
  );
}

/** Every scanned file plus each of its ancestor directories. */
function knownRepositoryPaths(files: string[]): string[] {
  const paths = new Set<string>();

  for (const file of files) {
    const normalized = normalizePath(file);
    paths.add(normalized);

    const parts = normalized.split("/");

    for (let index = 1; index < parts.length; index += 1) {
      paths.add(parts.slice(0, index).join("/"));
    }
  }

  return [...paths].sort(comparePaths);
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
  const taskBreadth = inferTaskBreadth(input.task, input.classification, taskScopeHints);
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
  const explicitScope = buildExplicitScope(taskScopeHints);
  const derivedScope = allowedPaths.filter(
    (path) => !explicitScope.some((explicitPath) => pathsOverlap(path, explicitPath))
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
  // `checks.*` disables a detector. A check that is off means the corresponding change is
  // allowed through, which is what "allowed" means in a hard gate.
  const checks = input.config?.checks;
  const hardGates = {
    newDependenciesAllowed: newDependenciesAllowed || checks?.dependency_bloat === false,
    dependencyMetadataChangesAllowed:
      dependencyMetadataChangesAllowed || checks?.dependency_bloat === false,
    ciChangesAllowed: ciChangesAllowed || checks?.ci_weakening === false,
    skippedTestsAllowed: checks?.skipped_tests === false,
    deletedTestsAllowed: checks?.deleted_tests === false,
    secretsAllowed: checks?.secrets === false
  };
  const contextDocsTouchAllowed =
    taskScopeHints.explicitEditTargets.some(isContextDocsPath) ||
    taskScopeHints.explicitOnlyTargets.some(isContextDocsPath) ||
    (taskScopeHints.declaredScopeLabels.includes("context_docs") &&
      taskScopeHints.contextFiles.length === 0);
  const workflowProfile = deriveWorkflowProfile(input.classification, taskBreadth, taskScopeHints);
  const planRequired = workflowProfile === "broad_change" || workflowProfile === "sensitive_change";
  const effectiveAllowedPaths =
    workflowProfile === "documentation_only"
      ? documentationOnlyScope(taskScopeHints)
      : allowedPaths;
  const effectiveExplicitScope =
    workflowProfile === "documentation_only" ? effectiveAllowedPaths : explicitScope;
  const effectiveDerivedScope = workflowProfile === "documentation_only" ? [] : derivedScope;
  const effectiveRequiredTests = workflowProfile === "documentation_only" ? false : requiredTests;
  const effectiveRiskLevel =
    workflowProfile === "documentation_only"
      ? "low"
      : maxRisk(defaults.riskLevel, input.classification.riskLevel);

  return {
    taskType: input.classification.taskType,
    confidence: input.classification.confidence,
    riskLevel: effectiveRiskLevel,
    workflowProfile,
    planRequired,
    taskBreadth,
    expectedFilesChanged,
    expectedLinesAdded: defaults.expectedLinesAdded,
    expectedLinesDeleted: defaults.expectedLinesDeleted,
    softLimits,
    hardGates,
    protectedChecks: hardGates,
    allowedPaths: effectiveAllowedPaths,
    expectedPaths: effectiveAllowedPaths,
    explicitScope: effectiveExplicitScope,
    derivedScope: effectiveDerivedScope,
    suspiciousPaths,
    approvalRequiredFor,
    blockedWithoutApproval,
    approvalRequiredChanges: blockedWithoutApproval,
    requiredTests: effectiveRequiredTests,
    verificationExpected: effectiveRequiredTests,
    testGuidance:
      workflowProfile === "documentation_only"
        ? ["Review content, formatting, generated-file status, and final diff."]
        : testGuidanceFor(input.classification.taskType),
    stopConditions:
      workflowProfile === "documentation_only"
        ? [
            "Stop if the change requires executable config, generated files, CI, dependencies, security policy, or runtime behavior edits.",
            "Stop if the documentation update expands beyond the requested file or nearby docs."
          ]
        : stopConditions,
    pauseAndClarifyConditions:
      workflowProfile === "documentation_only"
        ? [
            "Stop if the change requires executable config, generated files, CI, dependencies, security policy, or runtime behavior edits.",
            "Stop if the documentation update expands beyond the requested file or nearby docs."
          ]
        : stopConditions,
    contextDocsTouchAllowed,
    readOnlyContextPaths: taskScopeHints.contextFiles,
    reasons: buildBudgetReasons(input, defaults, allowedPaths, blockedWithoutApproval)
  };
}

export function extractRequirementLedger(
  input: RequirementLedgerInput | string
): RequirementLedger {
  const source =
    typeof input === "string"
      ? { taskText: input }
      : input.revisions !== undefined && input.revisions.length > 0
        ? input
        : {
            ...input,
            revisions: [{ revisionId: "revision-1", revisionNumber: 1, content: input.taskText }]
          };
  const revisions = source.revisions ?? [
    { revisionId: "revision-1", revisionNumber: 1, content: source.taskText }
  ];
  const requirements: TaskRequirement[] = [];

  for (const revision of revisions.sort(
    (left, right) => left.revisionNumber - right.revisionNumber
  )) {
    for (const candidate of extractRequirementCandidates(revision)) {
      requirements.push({
        ...candidate,
        id: `REQ-${String(requirements.length + 1).padStart(3, "0")}`
      });
    }
  }

  applyExplicitSupersession(requirements);
  const conflicts = detectRequirementConflicts(requirements);

  return {
    schemaVersion: "1.0.0",
    authority: "derived",
    ...(typeof input === "string" || input.canonicalTaskHash === undefined
      ? {}
      : { canonicalTaskHash: input.canonicalTaskHash }),
    offsetEncoding: "utf16",
    requirements,
    conflicts
  };
}

export function analyzeBriefCoverage(
  briefText: string,
  ledger: RequirementLedger
): BriefCoverageAnalysis {
  const coverage = activeMandatoryRequirements(ledger).map((requirement) => {
    const status = briefCoverageStatus(briefText, requirement);

    return {
      requirementId: requirement.id,
      status,
      reason: briefCoverageReason(status, requirement)
    };
  });
  const omittedRequirementCount = coverage.filter((item) => item.status === "omitted").length;
  const ambiguousRequirementCount = coverage.filter((item) => item.status === "ambiguous").length;

  return {
    authority: "derived",
    ...(ledger.canonicalTaskHash === undefined
      ? {}
      : { canonicalTaskHash: ledger.canonicalTaskHash }),
    coverageStatus:
      omittedRequirementCount > 0
        ? "omissions_visible"
        : ambiguousRequirementCount > 0
          ? "ambiguous"
          : "complete",
    omittedRequirementCount,
    ambiguousRequirementCount,
    requirements: coverage
  };
}

export function analyzePlanRequirementCoverage(
  planText: string,
  parsedPlan: AgentPlan,
  ledger: RequirementLedger,
  planStructure?: PlanStructure
): PlanRequirementCoverage {
  const structure = planStructure ?? inferPlanStructureForCoverage(planText, parsedPlan);
  const items = activeMandatoryRequirements(ledger).map((requirement) =>
    planRequirementCoverageItem(planText, parsedPlan, requirement, structure)
  );

  return {
    requirements: items,
    missingRequired: items
      .filter((item) => item.status === "missing")
      .map((item) => item.requirementId),
    conflictingRequirements: items
      .filter((item) => item.status === "conflicting")
      .map((item) => item.requirementId),
    deferredRequirements: items
      .filter((item) => item.status === "explicitly_deferred")
      .map((item) => item.requirementId)
  };
}

export function generateImplementationBrief(input: GenerateImplementationBriefInput): string {
  const { task, classification, repoContext, scopeBudget } = input;
  const taskReference = formatTaskReference(task, input.canonicalTask);

  if (scopeBudget.workflowProfile === "documentation_only") {
    return withBriefAuthority(
      `# Gleip Implementation Brief

${taskReference}
Profile: documentation_only
Risk: ${scopeBudget.riskLevel}
Expected scope:
${formatAllowedScope(scopeBudget.expectedPaths ?? scopeBudget.allowedPaths)}
Verification: content review, formatting/generated-file check where applicable, and final diff validation
Approval required: no

Active risks:
- None

Applicable protections:
- Dependency and CI changes require approval if introduced.
- Tests may not be skipped, deleted, or weakened.
- Secrets are always blocked.
`,
      input
    );
  }

  if (scopeBudget.workflowProfile === "local_behavior_change") {
    return withBriefAuthority(
      `# Gleip Implementation Brief

## Task
${taskReference}

## Classification
- Type: ${classification.taskType}
- Profile: local_behavior_change
- Risk: ${scopeBudget.riskLevel}
- Confidence: ${classification.confidence}

## Plan
Draft a short plan naming the implementation file(s), focused verification, and any context-document touch. Validate it with \`npx --no-install gleip validate-plan "<plan>"\`.

## Likely files
Implementation:
${formatFileMatchesForBrief(repoContext.likelyRelevantFiles, 5)}

Tests:
${formatFileMatchesForBrief(repoContext.likelyTestFiles, 5)}

## Expected scope
${formatAllowedScope(scopeBudget.expectedPaths ?? scopeBudget.allowedPaths)}

## Verification expected
${formatRequiredTests(scopeBudget)}

## Active risks
- None detected during preflight.

## Applicable protections
- Dependency and CI changes require approval if introduced.
- Tests may not be skipped, deleted, or weakened.
- Secrets are always blocked.

## Before final response
Run focused verification, \`npx --no-install gleip check --incremental\`, and \`npx --no-install gleip status --compact\`. Report files changed, tests run, and residual risks.
`,
      input
    );
  }

  return withBriefAuthority(
    `# Gleip Implementation Brief

## Task
${taskReference}

## Classification
- Type: ${classification.taskType}
- Profile: ${scopeBudget.workflowProfile ?? "local_behavior_change"}
- Risk: ${classification.riskLevel}
- Confidence: ${classification.confidence}
- Focused verification likely expected: ${formatYesNo(classification.likelyRequiresTests)}
- New dependencies likely allowed: ${formatYesNo(classification.likelyAllowsNewDependencies)}

## Working rule
Implement the smallest clear change that satisfies the task. Use the expected scope as guidance, explain necessary expansion, and avoid speculative refactors.

## Before editing code
1. Draft a short implementation plan.
2. Run \`npx --no-install gleip validate-plan "<plan>"\` or \`npx --no-install gleip validate-plan --file <file>\`.
3. Address clarification, cleanup, or approval findings before finalizing the plan.

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

## Expected scope
${formatAllowedScope(scopeBudget.allowedPaths)}

## Approval required
${formatApprovalRequired(scopeBudget.approvalRequiredFor)}

## Protected checks
- Preserve test integrity.
- Preserve CI unless the task requests or approves a change.
- Keep secrets and environment files out of the change set.
- ${formatDependencyGate(scopeBudget)}
- ${formatCiGate(scopeBudget)}

## Verification expected
${formatRequiredTests(scopeBudget)}

## Iterative verification
- Run the narrowest existing validation that covers the changed area while iterating.
- Do not rerun a full validation suite while repository state is unchanged.
- Run complete required validation once before final completion.
- Rerun complete validation only after changes that can invalidate the result.

## Pause and clarify conditions
${formatStringListForBrief(scopeBudget.stopConditions, 8)}

## Before final response
1. Run complete required validation if it has not been run for the current repository state.
2. Run \`npx --no-install gleip check --incremental\`.
3. Run \`npx --no-install gleip status --compact\`.
4. Report files changed.
5. Report tests run.
6. Report whether Gleip status is clean, advisory, needs_attention, needs_cleanup, or needs_approval.
`,
    input
  );
}

function extractRequirementCandidates(
  revision: RequirementSourceRevision
): Array<Omit<TaskRequirement, "id">> {
  const requirements: Array<Omit<TaskRequirement, "id">> = [];
  let sectionContext: RequirementObligation | undefined;
  let sectionCategory: RequirementCategory | undefined;
  let fallbackCandidate:
    | {
        segment: RequirementSourceSegment;
        sourceText: string;
        sectionCategory: RequirementCategory | undefined;
      }
    | undefined;

  for (const segment of requirementSourceSegments(revision.content)) {
    // A Markdown heading is never a requirement. An unrecognized one still ends the previous
    // section, so following lines do not inherit an unrelated section's obligation or category.
    if (segment.isMarkdownHeading) {
      const heading = requirementSectionHeading(segment.text);
      sectionContext = heading?.obligation;
      sectionCategory = heading?.category;
      continue;
    }

    const heading = segment.canBeHeading ? requirementSectionHeading(segment.text) : undefined;

    if (heading !== undefined) {
      sectionContext = heading.obligation;
      sectionCategory = heading.category;
      continue;
    }

    const sourceText = stripMarkdownListMarker(segment.text);
    const obligation = classifyRequirementObligation(sourceText, sectionContext);

    // Remember the first thing that reads like an instruction in case nothing else qualifies.
    // Instruction verbs are a closed vocabulary, so a task phrased outside it would otherwise
    // contribute nothing and leave a ledger holding only its guardrails.
    const rememberFallback = (): void => {
      if (fallbackCandidate === undefined && sectionContext !== "prohibited") {
        fallbackCandidate = { segment, sourceText, sectionCategory };
      }
    };

    if (obligation === "informational" && !hasRequirementSignal(sourceText)) {
      rememberFallback();
      continue;
    }

    // Free prose under a heading is background narration, not an obligation. A list item
    // inherits its section's obligation on its own; a plain sentence must carry its own
    // evidence. Without this, every narrative sentence under "## Requirements" -- including
    // "The orders service currently has no export capability." -- becomes mandatory.
    const carriesOwnObligation =
      classifyRequirementObligation(sourceText, undefined) !== "informational";

    if (
      !segment.isListItem &&
      !carriesOwnObligation &&
      !hasRequirementSignal(sourceText) &&
      !hasActionableRequirementVerb(sourceText)
    ) {
      rememberFallback();
      continue;
    }

    const markerOffset = segment.text.length - stripMarkdownListMarker(segment.text).length;
    const sourceStart = segment.start + markerOffset;
    const explicit = hasExplicitRequirementSignal(sourceText) || sectionContext !== undefined;
    const category = sectionCategory ?? classifyRequirementCategory(sourceText);
    const relatedVerification = relatedVerificationText(sourceText);

    requirements.push({
      sourceText,
      canonicalRevisionId: revision.revisionId,
      sourceStart,
      sourceEnd: sourceStart + sourceText.length,
      offsetEncoding: "utf16",
      category,
      obligation,
      status: obligation === "informational" ? "ambiguous" : "active",
      confidence: explicit ? "high" : obligation === "informational" ? "low" : "medium",
      explicit,
      relatedPaths: extractPathTokens(sourceText).sort(comparePaths),
      ...(relatedVerification === undefined ? {} : { relatedVerification })
    });
  }

  // A task that states only what not to do has been read wrong. If prohibitions were recorded
  // but no work was, promote the first instruction-shaped segment rather than handing back a
  // ledger of pure prohibitions -- that shape is what made a task's own target look forbidden.
  // A task with no obligations at all is background prose and stays empty.
  if (
    fallbackCandidate !== undefined &&
    requirements.some((requirement) => requirement.obligation === "prohibited") &&
    !requirements.some(
      (requirement) =>
        requirement.obligation === "required" || requirement.obligation === "suggestion"
    )
  ) {
    const { segment, sourceText, sectionCategory: category } = fallbackCandidate;
    const markerOffset = segment.text.length - stripMarkdownListMarker(segment.text).length;
    const sourceStart = segment.start + markerOffset;

    requirements.unshift({
      sourceText,
      canonicalRevisionId: revision.revisionId,
      sourceStart,
      sourceEnd: sourceStart + sourceText.length,
      offsetEncoding: "utf16",
      category: category ?? classifyRequirementCategory(sourceText),
      obligation: "required",
      status: "active",
      // Inferred from position rather than stated, so it does not bind like an explicit one.
      confidence: "low",
      explicit: false,
      relatedPaths: extractPathTokens(sourceText).sort(comparePaths)
    });
  }

  return requirements;
}

interface RequirementSourceSegment {
  text: string;
  start: number;
  end: number;
  isMarkdownHeading: boolean;
  isListItem: boolean;
  /**
   * Whether this segment may be interpreted as a section heading. A clause taken from inside a
   * sentence must not be: stripping its trailing punctuation would otherwise make it look like a
   * heading to the "short line without terminal punctuation" heuristic, and the whole clause
   * would be consumed as a section marker instead of recorded as a requirement.
   */
  canBeHeading: boolean;
}

/**
 * Split task source into requirement-sized units.
 *
 * Segmenting on newlines alone made phrasing decide meaning: two sentences typed on one line
 * merged into a single unit (so a trailing "do not ..." guardrail inverted the whole
 * instruction), while one sentence hard-wrapped across two lines split into fragments that were
 * not sentences. Both are the same bug seen from opposite sides.
 *
 * Continuation lines are joined into a block first, then the block is split on sentence
 * terminators. Offsets stay exact against the original content: a sentence spanning a line break
 * is still one contiguous span in the source.
 */
function requirementSourceSegments(content: string): RequirementSourceSegment[] {
  const segments: RequirementSourceSegment[] = [];
  let block: Array<{ text: string; start: number }> = [];
  let blockIsListItem = false;

  const flushBlock = (): void => {
    if (block.length === 0) {
      return;
    }

    const joined = joinBlockLines(block);
    const spans = sentenceSpans(joined.text);

    for (const span of spans) {
      const raw = joined.text.slice(span.start, span.end);
      const leading = raw.length - raw.trimStart().length;
      const text = raw.trim().replace(/;$/u, "");

      if (text.length === 0) {
        continue;
      }

      const start = joined.positions[span.start + leading] ?? 0;
      const end = (joined.positions[span.start + leading + text.length - 1] ?? start) + 1;

      segments.push({
        text,
        start,
        end,
        isMarkdownHeading: false,
        isListItem: blockIsListItem,
        canBeHeading: spans.length === 1 && !blockIsListItem
      });
    }

    block = [];
    blockIsListItem = false;
  };

  for (const line of sourceLines(content)) {
    const trimmed = line.text.trim();
    const start = line.start + line.text.indexOf(trimmed);

    if (trimmed.length === 0) {
      flushBlock();
      continue;
    }

    if (/^#{1,6}\s/u.test(trimmed)) {
      flushBlock();
      segments.push({
        text: trimmed,
        start,
        end: start + trimmed.length,
        isMarkdownHeading: true,
        isListItem: false,
        canBeHeading: true
      });
      continue;
    }

    const isListItem = /^(?:[-*+]|\d+\.)\s+/u.test(trimmed);

    // A list item and a label line ("Requirements:") each begin their own unit, so they never
    // absorb the line beneath them.
    if (isListItem || /:$/u.test(trimmed)) {
      flushBlock();
      blockIsListItem = isListItem;
    }

    block.push({ text: trimmed, start });

    if (/:$/u.test(trimmed)) {
      flushBlock();
    }
  }

  flushBlock();

  return segments;
}

/**
 * Join a block's lines with single spaces, recording the source offset of every joined character
 * so segment spans can be mapped back to exact positions in the original text.
 */
function joinBlockLines(lines: Array<{ text: string; start: number }>): {
  text: string;
  positions: number[];
} {
  let text = "";
  const positions: number[] = [];

  for (const line of lines) {
    if (text.length > 0) {
      positions.push(line.start);
      text += " ";
    }

    for (let index = 0; index < line.text.length; index += 1) {
      positions.push(line.start + index);
    }

    text += line.text;
  }

  return { text, positions };
}

const nonTerminalAbbreviations = new Set([
  "e.g",
  "i.e",
  "etc",
  "vs",
  "cf",
  "approx",
  "no",
  "fig",
  "al",
  "mr",
  "mrs",
  "ms",
  "dr",
  "st",
  "jr",
  "sr",
  "inc",
  "ltd",
  "co"
]);

/**
 * Locate sentence (and independent-clause) spans within a joined block.
 *
 * A boundary is a terminator followed by whitespace and the start of a new sentence, which keeps
 * decimals ("10.5"), version numbers ("1.0.0") and file extensions ("src/cart.ts so ...") intact
 * because none of those are followed by whitespace plus a capital. Semicolons separate
 * independent clauses and are treated as boundaries too, so "must stream rows; may not buffer"
 * yields one requirement and one prohibition rather than a single ambiguous unit.
 */
function sentenceSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const boundary = /([.!?])(["'’)\]]*)\s+(?=[A-Z0-9([{"'`])|(;)\s+(?=\S)/gu;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(text)) !== null) {
    if (match[1] !== undefined && isAbbreviationBoundary(text, match.index)) {
      continue;
    }

    const terminatorLength =
      match[3] !== undefined ? 1 : (match[1]?.length ?? 0) + (match[2]?.length ?? 0);
    const end = match.index + terminatorLength;

    if (end > cursor) {
      spans.push({ start: cursor, end });
    }

    cursor = boundary.lastIndex;
  }

  if (cursor < text.length) {
    spans.push({ start: cursor, end: text.length });
  }

  return spans;
}

function isAbbreviationBoundary(text: string, terminatorIndex: number): boolean {
  const word = /([A-Za-z][A-Za-z.]*)$/u.exec(text.slice(0, terminatorIndex))?.[1];

  if (word === undefined) {
    return false;
  }

  const normalized = word.toLowerCase().replace(/\.$/u, "");

  return normalized.length === 1 || nonTerminalAbbreviations.has(normalized);
}

/**
 * Whether the text instructs an action.
 *
 * Many of these words are also ordinary nouns, so matching them anywhere turned background
 * narration into mandatory requirements: "This *document* is the full task contract" and
 * "*Support* has asked for a way to export orders" were both recorded as obligations. Task
 * instructions are written in the imperative, so an ambiguous word only counts when it opens the
 * clause and is not followed by an auxiliary verb ("Support **has** asked" is narration;
 * "Document **the** new endpoint" is an instruction).
 */
function hasActionableRequirementVerb(text: string): boolean {
  const unambiguous =
    /\b(?:implement|supersede|refactor|reimplement|deprecate)\b|\bmake sure\b/iu.test(text);
  const imperative =
    /^(?:update|fix|add|remove|preserve|support|verify|validate|run|prepare|document|replace|create|delete|rename|migrate|return|stream|expose|handle|emit|register|extend|enable|disable|move|split|extract|resolve|address|apply|complete|correct|adjust|convert|restore|harden|simplify|refactor|port|upgrade|wire|rewrite|introduce|drop|allow|prevent|reject|accept|print|report|store|load|parse|render|check)\s+(?!has\b|have\b|had\b|is\b|are\b|was\b|were\b|will\b|would\b|can\b|could\b|should\b|may\b|must\b|might\b)/iu.test(
      text
    );

  return unambiguous || imperative;
}

function sourceLines(content: string): Array<{ text: string; start: number }> {
  const lines: Array<{ text: string; start: number }> = [];
  const pattern = /([^\r\n]*)(?:\r\n|\r|\n|$)/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const text = match[1] ?? "";

    if (text.length > 0 || match.index < content.length) {
      lines.push({ text, start: match.index });
    }

    if (match[0] === "") {
      break;
    }
  }

  return lines;
}

function requirementSectionHeading(
  line: string
): { obligation: RequirementObligation; category?: RequirementCategory } | undefined {
  const looksLikeHeading =
    /^#{1,6}\s/u.test(line) ||
    /:\s*$/u.test(line) ||
    (!/[.!?]\s*$/u.test(line) && line.length <= 80);

  if (!looksLikeHeading) {
    return undefined;
  }

  const normalized = line
    .replace(/^#{1,6}\s*/u, "")
    .replace(/:$/u, "")
    .trim()
    .toLowerCase();

  if (/\b(?:must not|do not|never|exclusions?|prohibited|out of scope)\b/u.test(normalized)) {
    return { obligation: "prohibited", category: "scope" };
  }

  if (
    /\b(?:acceptance criteria|requirements?|required|constraints?|expected result|before completion)\b/u.test(
      normalized
    )
  ) {
    return { obligation: "required" };
  }

  if (/\b(?:verification|tests?|validation|checks?)\b/u.test(normalized)) {
    return { obligation: "required", category: "verification" };
  }

  if (/\b(?:release instructions?|release checklist|packaging)\b/u.test(normalized)) {
    return { obligation: "required", category: "release" };
  }

  if (/\b(?:optional|suggestions?|nice to have|could consider)\b/u.test(normalized)) {
    return { obligation: "optional" };
  }

  return undefined;
}

function stripMarkdownListMarker(value: string): string {
  return value.replace(/^\s*(?:[-*+]|\d+\.)\s*/u, "").trim();
}

function classifyRequirementObligation(
  text: string,
  sectionContext: RequirementObligation | undefined
): RequirementObligation {
  // Explicit negative modals are prohibitions wherever they appear. "may not" and "cannot" are
  // prohibitions too -- they were previously read as permissions because the optional branch
  // matched "may" before the prohibition branch was consulted.
  if (
    /\b(?:must not|may not|shall not|will not|cannot|can not|do not|don't|doesn't|never|prohibit(?:ed)?)\b/iu.test(
      text
    )
  ) {
    return "prohibited";
  }

  // A leading "No ..." states a prohibition ("No other customer's data is reachable"). A bare
  // "no" mid-sentence does not: "confirm no regressions" is a verification step, and "has no
  // export capability" is background narration. Matching it anywhere inverted both.
  if (/^no\b/iu.test(text) && sectionContext !== "required") {
    return "prohibited";
  }

  if (sectionContext === "prohibited") {
    return "prohibited";
  }

  // An explicit section heading outranks a line-level keyword, so an acceptance criterion is not
  // downgraded by an incidental "may" or promoted by an incidental "no".
  if (sectionContext === "required") {
    return "required";
  }

  if (/\b(?:must|required|requires?|ensure)\b/iu.test(text)) {
    return "required";
  }

  if (/\b(?:optional|may|could|nice to have)\b/iu.test(text)) {
    return "optional";
  }

  if (sectionContext === "optional" || sectionContext === "suggestion") {
    return sectionContext;
  }

  if (/\b(?:should|recommended|consider)\b/iu.test(text)) {
    return "suggestion";
  }

  if (
    /\b(?:acceptance criteria|before completion|expected result)\b/iu.test(text) ||
    hasActionableRequirementVerb(text)
  ) {
    return "required";
  }

  return sectionContext ?? "informational";
}

function hasRequirementSignal(text: string): boolean {
  return (
    hasExplicitRequirementSignal(text) ||
    /\b(?:acceptance criteria|expected result|before completion|release instructions?|replace|supersede)\b/iu.test(
      text
    )
  );
}

function hasExplicitRequirementSignal(text: string): boolean {
  return /\b(?:must|must not|do not|don't|never|required|requires?|optional|should|recommended|consider|ensure|before completion|expected result)\b/iu.test(
    text
  );
}

function classifyRequirementCategory(text: string): RequirementCategory {
  const normalized = text.toLowerCase();

  if (
    /\b(?:test|tests|verify|verification|validate|validation|lint|typecheck|build|smoke)\b/u.test(
      normalized
    )
  ) {
    return "verification";
  }

  if (/\b(?:docs?|documentation|readme|changelog|context file)\b/u.test(normalized)) {
    return "documentation";
  }

  if (/\b(?:release|version|tag|publish|pack|tarball|npm)\b/u.test(normalized)) {
    return "release";
  }

  if (/\b(?:package|packaging|archive|install|bundle)\b/u.test(normalized)) {
    return "packaging";
  }

  if (/\b(?:dependency|dependencies|lockfile|package manager)\b/u.test(normalized)) {
    return "dependency";
  }

  if (/\b(?:ci|workflow|github actions?|pipeline)\b/u.test(normalized)) {
    return "CI";
  }

  if (
    /\b(?:windows|macos|linux|cross-platform|path semantics|unicode|utf-?8)\b/u.test(normalized)
  ) {
    return "platform";
  }

  if (/\b(?:local-only|telemetry|network|remote|privacy|provider|api call)\b/u.test(normalized)) {
    return "privacy";
  }

  if (/\b(?:secret|security|auth|authentication|permission|safety)\b/u.test(normalized)) {
    return "security";
  }

  if (/\b(?:scope|file|path|touch|edit|modify|change set|diff)\b/u.test(normalized)) {
    return "scope";
  }

  if (/\b(?:report|final response|output|artifact|brief)\b/u.test(normalized)) {
    return "output";
  }

  if (/\b(?:migration|migrate|schema)\b/u.test(normalized)) {
    return "migration";
  }

  if (/\b(?:architecture|abstraction|boundary|design)\b/u.test(normalized)) {
    return "architecture";
  }

  if (/\b(?:performance|efficient|token|wasted work)\b/u.test(normalized)) {
    return "performance";
  }

  if (/\b(?:process|workflow|before|after|step)\b/u.test(normalized)) {
    return "process";
  }

  if (/\b(?:behavior|feature|bug|fix|implement|support)\b/u.test(normalized)) {
    return "behavior";
  }

  return "unknown";
}

function relatedVerificationText(text: string): string | undefined {
  return /\b(?:test|tests|verify|verification|validate|validation|lint|typecheck|build|smoke)\b/iu.test(
    text
  )
    ? text
    : undefined;
}

function applyExplicitSupersession(requirements: TaskRequirement[]): void {
  for (const requirement of requirements) {
    if (
      !/\b(?:replace|replaces|supersede|supersedes|instead of|no longer|now use|change .* from .* to)\b/iu.test(
        requirement.sourceText
      )
    ) {
      continue;
    }

    for (const candidate of requirements) {
      if (
        candidate.id === requirement.id ||
        candidate.status !== "active" ||
        candidate.canonicalRevisionId === requirement.canonicalRevisionId
      ) {
        continue;
      }

      if (
        candidate.category === requirement.category ||
        pathsIntersect(candidate.relatedPaths, requirement.relatedPaths)
      ) {
        candidate.status = "superseded";
        candidate.supersededBy = requirement.id;
      }
    }
  }
}

function detectRequirementConflicts(requirements: TaskRequirement[]): RequirementConflict[] {
  const conflicts: RequirementConflict[] = [];
  const active = requirements.filter(
    (requirement) =>
      requirement.status === "active" &&
      (requirement.obligation === "required" || requirement.obligation === "prohibited")
  );

  for (let index = 0; index < active.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < active.length; nextIndex += 1) {
      const left = active[index];
      const right = active[nextIndex];

      if (left === undefined || right === undefined || left.obligation === right.obligation) {
        continue;
      }

      if (!requirementsConflict(left, right)) {
        continue;
      }

      conflicts.push({
        id: `REQ-CONFLICT-${String(conflicts.length + 1).padStart(3, "0")}`,
        requirementIds: [left.id, right.id].sort(),
        reason: "Required and prohibited canonical requirements overlap.",
        severity: pathsIntersect(left.relatedPaths, right.relatedPaths) ? "blocking" : "advisory"
      });
    }
  }

  return conflicts;
}

function requirementsConflict(left: TaskRequirement, right: TaskRequirement): boolean {
  if (pathsIntersect(left.relatedPaths, right.relatedPaths)) {
    return true;
  }

  return (
    left.category === right.category && tokenOverlapRatio(left.sourceText, right.sourceText) >= 0.35
  );
}

function pathsIntersect(left: string[], right: string[]): boolean {
  return left.some((leftPath) => right.some((rightPath) => pathsOverlap(leftPath, rightPath)));
}

function activeMandatoryRequirements(ledger: RequirementLedger): TaskRequirement[] {
  return ledger.requirements.filter(
    (requirement) =>
      requirement.status === "active" &&
      (requirement.obligation === "required" || requirement.obligation === "prohibited")
  );
}

function briefCoverageStatus(
  briefText: string,
  requirement: TaskRequirement
): BriefRequirementCoverageStatus {
  const normalizedBrief = normalizeComparableText(briefText);

  if (normalizedBrief.includes(requirement.id.toLowerCase())) {
    return "referenced";
  }

  if (
    requirement.relatedPaths.length > 0 &&
    requirement.relatedPaths.some((path) => normalizedBrief.includes(path.toLowerCase()))
  ) {
    return "represented";
  }

  const overlap = tokenOverlapRatio(briefText, requirement.sourceText);

  if (overlap >= 0.55) {
    return "represented";
  }

  if (overlap >= 0.25) {
    return "partially_represented";
  }

  return requirement.confidence === "low" ? "ambiguous" : "omitted";
}

function briefCoverageReason(
  status: BriefRequirementCoverageStatus,
  requirement: TaskRequirement
): string {
  if (status === "represented") {
    return "Requirement text, path, or equivalent keywords appear in the derived brief.";
  }

  if (status === "partially_represented") {
    return "Some requirement keywords appear in the derived brief.";
  }

  if (status === "referenced") {
    return "Requirement is listed by stable ID in the derived brief.";
  }

  if (status === "ambiguous") {
    return "Low-confidence requirement was not clearly represented.";
  }

  return `${requirement.id} is not repeated in the derived brief body.`;
}

function planRequirementCoverageItem(
  planText: string,
  parsedPlan: AgentPlan,
  requirement: TaskRequirement,
  planStructure: PlanStructure
): PlanRequirementCoverageItem {
  if (planDefersRequirement(planText, requirement)) {
    return {
      requirementId: requirement.id,
      status: "explicitly_deferred",
      reason: "Plan explicitly defers this canonical requirement.",
      evidence: [requirement.sourceText]
    };
  }

  if (requirement.obligation === "prohibited") {
    return planViolatesProhibition(planText, parsedPlan, requirement)
      ? {
          requirementId: requirement.id,
          status: "conflicting",
          reason: "Plan conflicts with a prohibited canonical requirement.",
          evidence: [requirement.sourceText]
        }
      : {
          requirementId: requirement.id,
          status: "addressed",
          reason: "No planned action conflicts with this prohibition.",
          evidence: [requirement.sourceText]
        };
  }

  const evidence = requirementEvidence(planText, parsedPlan, requirement, planStructure);

  if (evidence.coverage === "addressed") {
    return {
      requirementId: requirement.id,
      status: "addressed",
      reason: "Plan covers the canonical requirement with local evidence.",
      evidence: evidence.evidence
    };
  }

  if (evidence.coverage === "partial") {
    return {
      requirementId: requirement.id,
      status: "partially_addressed",
      reason: "Plan covers part of the canonical requirement.",
      evidence: evidence.evidence
    };
  }

  if (requirement.confidence === "low") {
    return {
      requirementId: requirement.id,
      status: "ambiguous",
      reason: "Requirement extraction confidence is low; plan coverage is advisory.",
      evidence: [requirement.sourceText]
    };
  }

  return {
    requirementId: requirement.id,
    status: "missing",
    reason: "Plan does not address this mandatory canonical requirement.",
    evidence: [requirement.sourceText]
  };
}

function planDefersRequirement(planText: string, requirement: TaskRequirement): boolean {
  const normalizedPlan = normalizeComparableText(planText);

  return (
    normalizedPlan.includes(requirement.id.toLowerCase()) &&
    /\b(?:defer|deferred|later|follow-up|not in this patch|not applicable)\b/iu.test(planText)
  );
}

function planViolatesProhibition(
  planText: string,
  parsedPlan: AgentPlan,
  requirement: TaskRequirement
): boolean {
  const text = normalizeComparableText(`${planText}\n${parsedPlan.proposedFiles.join("\n")}`);

  if (
    requirement.relatedPaths.length > 0 &&
    requirement.relatedPaths.some((path) =>
      parsedPlan.proposedFiles.some((planned) => pathsOverlap(planned, path))
    )
  ) {
    return true;
  }

  if (requirement.category === "dependency" && parsedPlan.mentionsNewDependencies) {
    return true;
  }

  if (requirement.category === "CI" && parsedPlan.mentionsCiChanges) {
    return true;
  }

  if (requirement.category === "verification" && parsedPlan.mentionsTestWeakening) {
    return true;
  }

  if (
    /\b(?:publish|push|tag|commit)\b/u.test(text) &&
    /\b(?:publish|push|tag|commit)\b/iu.test(requirement.sourceText)
  ) {
    return true;
  }

  return false;
}

function requirementEvidence(
  planText: string,
  parsedPlan: AgentPlan,
  requirement: TaskRequirement,
  planStructure: PlanStructure
): { coverage: "addressed" | "partial" | "missing"; evidence: string[] } {
  const normalizedPlan = normalizeComparableText(planText);

  if (requirement.relatedPaths.length > 0) {
    const coveredPaths = requirement.relatedPaths.filter((path) =>
      parsedPlan.proposedFiles.some((planned) => pathsOverlap(planned, path))
    );

    if (coveredPaths.length === requirement.relatedPaths.length) {
      return { coverage: "addressed", evidence: coveredPaths };
    }

    if (coveredPaths.length > 0) {
      return { coverage: "partial", evidence: coveredPaths };
    }
  }

  if (requirement.category === "verification") {
    return planStructure.hasVerification
      ? { coverage: "addressed", evidence: ["verification wording"] }
      : { coverage: "missing", evidence: [] };
  }

  if (
    requirement.category === "documentation" &&
    (parsedPlan.proposedFiles.some(isDocumentationTarget) ||
      /\b(?:docs?|documentation|readme|changelog)\b/u.test(normalizedPlan))
  ) {
    return { coverage: "addressed", evidence: ["documentation wording"] };
  }

  if (
    (requirement.category === "release" || requirement.category === "packaging") &&
    /\b(?:version|release|changelog|package|pack|smoke|build|tarball|npm)\b/u.test(normalizedPlan)
  ) {
    return { coverage: "addressed", evidence: ["release/package wording"] };
  }

  if (
    requirement.category === "platform" &&
    /\b(?:windows|macos|linux|cross-platform|path|unicode|utf-?8)\b/u.test(normalizedPlan)
  ) {
    return { coverage: "addressed", evidence: ["platform wording"] };
  }

  if (tokenOverlapRatio(planText, requirement.sourceText) >= 0.45) {
    return { coverage: "addressed", evidence: ["requirement keyword overlap"] };
  }

  if (tokenOverlapRatio(planText, requirement.sourceText) >= 0.25) {
    return { coverage: "partial", evidence: ["partial requirement keyword overlap"] };
  }

  return { coverage: "missing", evidence: [] };
}

function inferPlanStructureForCoverage(planText: string, parsedPlan: AgentPlan): PlanStructure {
  return {
    hasFiles: parsedPlan.proposedFiles.length > 0 || extractPathTokens(planText).length > 0,
    hasImplementation:
      parsedPlan.proposedFiles.length > 0 ||
      /\b(?:implement|update|modify|edit|change|fix|add|remove|refactor)\b/iu.test(planText),
    hasRiskRationale: /\b(?:risk|rationale|because|needed|required|scope|assumption)\b/iu.test(
      planText
    ),
    hasVerification:
      /\b(?:test|tests|verify|verification|validate|validation|lint|typecheck|build|smoke|check)\b/iu.test(
        planText
      )
  };
}

function isDocumentationTarget(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  const fileName = basename(normalized);

  return (
    normalized.startsWith("docs/") ||
    ["readme.md", "changelog.md", "agents.md", "contributing.md"].includes(fileName)
  );
}

function tokenOverlapRatio(left: string, right: string): number {
  const leftTokens = new Set(requirementTokens(left));
  const rightTokens = requirementTokens(right);

  if (rightTokens.length === 0) {
    return 0;
  }

  let overlap = 0;

  for (const token of rightTokens) {
    if (leftTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / rightTokens.length;
}

function requirementTokens(value: string): string[] {
  return normalizeComparableText(value)
    .split(/[^a-z0-9_/-]+/u)
    .filter((token) => token.length > 2)
    .filter(
      (token) =>
        !new Set([
          "the",
          "and",
          "for",
          "that",
          "this",
          "with",
          "from",
          "into",
          "must",
          "should",
          "required",
          "require",
          "requires"
        ]).has(token)
    );
}

function normalizeComparableText(value: string): string {
  return normalizePath(value).toLowerCase();
}

function formatTaskReference(
  task: string,
  canonicalTask: CanonicalTaskReference | undefined
): string {
  const preview = taskPreview(task);

  if (canonicalTask === undefined) {
    return `Task preview: ${preview}`;
  }

  return [
    `- Canonical task: ${canonicalTask.artifactPath}`,
    `- Canonical revision: ${canonicalTask.activeRevisionId}`,
    `- Canonical hash: ${canonicalTask.contentHash}`,
    `- Task preview: ${preview}`
  ].join("\n");
}

function taskPreview(task: string): string {
  const compact = task.replace(/\s+/gu, " ").trim();

  return compact.length <= 220 ? compact : `${compact.slice(0, 217)}...`;
}

function withBriefAuthority(body: string, input: GenerateImplementationBriefInput): string {
  const coverage =
    input.requirementLedger === undefined
      ? undefined
      : analyzeBriefCoverage(body, input.requirementLedger);
  const metadata = {
    authority: "derived",
    canonicalTaskId: input.canonicalTask?.taskId ?? null,
    canonicalRevisionId: input.canonicalTask?.activeRevisionId ?? null,
    canonicalTaskHash:
      input.canonicalTask?.contentHash ?? input.requirementLedger?.canonicalTaskHash ?? null,
    generatedFrom: input.canonicalTask?.artifactPath ?? "task text received by Gleip",
    briefSchemaVersion: "1.0.0",
    coverageStatus: coverage?.coverageStatus ?? "unavailable",
    omittedRequirementCount: coverage?.omittedRequirementCount ?? 0,
    ambiguousRequirementCount: coverage?.ambiguousRequirementCount ?? 0
  };
  const authority = [
    "<!-- GLEIP_BRIEF_METADATA",
    JSON.stringify(metadata, null, 2),
    "GLEIP_BRIEF_METADATA -->",
    "## Authority",
    "This brief is derived from the canonical user task.",
    "It is a navigation aid, not a replacement.",
    "If it omits or conflicts with a user requirement, the canonical task is authoritative.",
    "Do not infer that omitted brief details are optional."
  ].join("\n");

  return `${body.trimEnd()}\n\n${authority}\n\n${formatBriefCoverageSection(
    input.requirementLedger,
    coverage
  )}\n`;
}

function formatBriefCoverageSection(
  ledger: RequirementLedger | undefined,
  coverage: BriefCoverageAnalysis | undefined
): string {
  if (ledger === undefined || coverage === undefined) {
    return [
      "## Canonical requirement coverage",
      "- Requirement ledger unavailable for this brief."
    ].join("\n");
  }

  const omitted = coverage.requirements
    .filter((item) => item.status === "omitted" || item.status === "ambiguous")
    .map((item) => ledger.requirements.find((requirement) => requirement.id === item.requirementId))
    .filter((requirement): requirement is TaskRequirement => requirement !== undefined)
    .slice(0, 10);

  return [
    "## Canonical requirement coverage",
    `- Coverage status: ${coverage.coverageStatus}`,
    `- Mandatory/prohibited requirements checked: ${coverage.requirements.length}`,
    `- Omitted from navigation body: ${coverage.omittedRequirementCount}`,
    `- Ambiguous coverage: ${coverage.ambiguousRequirementCount}`,
    "",
    "Canonical requirements not repeated in this brief:",
    ...(omitted.length === 0
      ? ["- None detected."]
      : omitted.map((requirement) => `- ${requirement.id}: ${shortRequirementText(requirement)}`))
  ].join("\n");
}

function shortRequirementText(requirement: TaskRequirement): string {
  const compact = requirement.sourceText.replace(/\s+/gu, " ").trim();

  return compact.length <= 120 ? compact : `${compact.slice(0, 117)}...`;
}

export function parseAgentPlan(
  planText: string,
  contextFiles: string[] = [],
  options: { cwd?: string } = {}
): AgentPlan {
  const fileAnalysis = extractPlanFileMentions(planText, contextFiles, options.cwd);
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
  const parsedPlan = parseAgentPlan(input.planText, input.contextFiles, {
    ...(input.cwd === undefined ? {} : { cwd: input.cwd })
  });
  const findings: PlanValidationFinding[] = [];
  const planStructure = analyzePlanStructure(parsedPlan, input.scopeBudget, input.taskText ?? "");
  const targetClassifications = classifyPlanTargets({
    parsedPlan,
    scopeBudget: input.scopeBudget,
    planText: input.planText,
    taskText: input.taskText ?? "",
    ...(input.cwd === undefined ? {} : { cwd: input.cwd })
  });
  const scopeTargetsNeedingClarification = targetClassifications.filter(
    (target) => target.classification === "adjacent" || target.classification === "unexplained"
  );
  const riskyFiles = parsedPlan.proposedFiles.filter(isRiskyPlanPath);
  const unexpectedRiskyFiles = riskyFiles.filter(
    (path) => !taskRequestsRiskyPath(input.taskText ?? "", path)
  );

  if (input.planText.trim().length === 0) {
    findings.push({
      code: "PLAN_MISSING",
      severity: "action_required",
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
      message:
        "The plan does not include a recognizable implementation, changes, or approach section.",
      recommendation:
        "Add a short implementation or changes section describing the intended actions."
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

  if (parsedPlan.mentionsNewDependencies && !input.scopeBudget.hardGates.newDependenciesAllowed) {
    findings.push({
      code: "DEPENDENCY_CHANGE_INTENT",
      severity: "approval_required",
      title: "New dependency intent",
      message:
        "The plan proposes a new dependency that requires approval under the current guidance.",
      recommendation: "Request approval to add the dependency, or revise the plan without it.",
      evidence: parsedPlan.proposedDependencies
    });
  }

  if (parsedPlan.mentionsCiChanges && !input.scopeBudget.hardGates.ciChangesAllowed) {
    findings.push({
      code: "CI_CHANGE_INTENT",
      severity: "approval_required",
      title: "CI change intent",
      message:
        "The plan proposes CI or workflow changes that require clarification under the current policy.",
      recommendation: "Provide the requested CI scope or ask the user for approval.",
      evidence: ciEvidence(parsedPlan)
    });
  }

  if (parsedPlan.mentionsTestWeakening) {
    findings.push({
      code: "TEST_WEAKENED",
      severity: "action_required",
      title: "Test weakening intent",
      message: "The plan mentions skipping, deleting, disabling, or weakening tests.",
      recommendation:
        "Revise the plan to preserve tests and CI. Do not weaken tests without explicit user approval."
    });
  }

  findings.push(
    ...validatePlanFilesAgainstScope(
      parsedPlan,
      input.scopeBudget,
      input.config,
      input.planText,
      targetClassifications
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
      message:
        "The plan includes dependency, CI, config, secret, or security-sensitive files outside the declared task scope.",
      recommendation: "Confirm the named reason and verification for each risky category.",
      evidence: unexpectedRiskyFiles
    });
  }

  if (
    parsedPlan.proposedFiles.length > input.scopeBudget.softLimits.maxFilesChanged &&
    shouldWarnForPlanFileCount(input.scopeBudget, targetClassifications)
  ) {
    findings.push({
      code: "PLAN_SCOPE_EXCEEDS_BUDGET",
      severity: "warn",
      title: "Plan exceeds expected scope",
      message: `The plan proposes ${parsedPlan.proposedFiles.length} files; the scope budget soft maximum is ${input.scopeBudget.softLimits.maxFilesChanged}.`,
      recommendation:
        "Add rationale for adjacent targets, remove unrelated targets, or confirm explicit breadth.",
      evidence: parsedPlan.proposedFiles
    });
  }

  const protectedSemanticFindings = validateProtectedSemanticScope(
    input.taskText ?? "",
    input.planText
  );
  findings.push(...protectedSemanticFindings);
  const requirementCoverage =
    input.requirementLedger === undefined
      ? undefined
      : analyzePlanRequirementCoverage(
          input.planText,
          parsedPlan,
          input.requirementLedger,
          planStructure
        );
  if (input.requirementLedger !== undefined && requirementCoverage !== undefined) {
    findings.push(...validatePlanRequirements(input.requirementLedger, requirementCoverage));
  }

  if (input.scopeBudget.requiredTests && !planStructure.hasVerification) {
    findings.push({
      code: "MISSING_TEST_STRATEGY",
      severity: "warn",
      title: "Verification expectation missing",
      message:
        "The scope guidance expects verification, but the plan does not include a concrete validation method.",
      recommendation:
        "Add the focused tests, build checks, comparison, reproduction, review, or constrained validation that will be run."
    });
    findings.push({
      code: "PLAN_NO_VERIFICATION",
      severity: "warn",
      title: "Verification structure missing",
      message:
        "The scope budget requires verification, but the plan has no recognizable verification evidence.",
      recommendation:
        "Add the tests, checks, comparison, reproduction, review, or manual verification that will be run."
    });
  }

  if (parsedPlan.mentionsBroadRefactor && input.scopeBudget.taskType !== "refactor") {
    const severeRefactor = detectsHighRiskRefactor(input.planText);

    findings.push({
      code: "BROAD_REFACTOR_INTENT",
      severity: severeRefactor ? "action_required" : "warn",
      title: "Broad refactor intent",
      message:
        "The plan uses broad refactor wording, but the task was not classified as a refactor.",
      recommendation:
        "Narrow the plan to the smallest change needed for the task, or ask for approval."
    });
  }

  const riskStructureRequired =
    unexpectedRiskyFiles.length > 0 ||
    scopeTargetsNeedingClarification.length > 0 ||
    (parsedPlan.proposedFiles.length > input.scopeBudget.softLimits.maxFilesChanged &&
      shouldWarnForPlanFileCount(input.scopeBudget, targetClassifications)) ||
    parsedPlan.mentionsBroadRefactor;

  if (riskStructureRequired && !planStructure.hasRiskRationale) {
    findings.push({
      code: "PLAN_RISK_RATIONALE_MISSING",
      severity: "warn",
      title: "Risk or scope rationale missing",
      message:
        "The plan includes risky categories or scope expansion without recognizable risks, assumptions, constraints, or scope-rationale language.",
      recommendation:
        "Add the affected area, why it is needed, and how the expanded area will be verified."
    });
  }

  if (isPlanVague(parsedPlan, planStructure)) {
    findings.push({
      code: "PLAN_TOO_VAGUE",
      severity: "warn",
      title: "Vague implementation plan",
      message:
        "The plan is too short or does not name concrete files, tests, dependencies, or actions.",
      recommendation: "Provide files to inspect or change and tests to add or run."
    });
  }

  const status = planValidationStatus(findings);

  return {
    status,
    findings: orderPlanFindings(findings),
    summary: planValidationSummary(status, findings),
    nextAction: planValidationNextAction(status),
    parsedPlan,
    targetClassifications,
    ...(requirementCoverage === undefined ? {} : { requirementCoverage })
  };
}

function validatePlanRequirements(
  ledger: RequirementLedger,
  coverage: PlanRequirementCoverage
): PlanValidationFinding[] {
  const findings: PlanValidationFinding[] = [];
  const requirementById = new Map(
    ledger.requirements.map((requirement) => [requirement.id, requirement])
  );
  const blockingConflicts = ledger.conflicts.filter((conflict) => conflict.severity === "blocking");

  if (blockingConflicts.length > 0) {
    findings.push({
      code: "CANONICAL_REQUIREMENT_CONFLICT",
      severity: "action_required",
      title: "Canonical requirements conflict",
      message:
        "The canonical task has required and prohibited requirements that overlap and need clarification.",
      recommendation:
        "Resolve the conflicting user requirements or add an explicit superseding amendment.",
      evidence: blockingConflicts.flatMap((conflict) => conflict.requirementIds)
    });
  }

  if (coverage.conflictingRequirements.length > 0) {
    findings.push({
      code: "CANONICAL_PROHIBITION_CONFLICT",
      severity: "action_required",
      title: "Plan conflicts with canonical prohibition",
      message: "The plan proposes work that conflicts with a prohibited canonical requirement.",
      recommendation: "Remove the prohibited action or obtain explicit user approval.",
      evidence: coverage.conflictingRequirements.flatMap((id) =>
        requirementEvidenceById(requirementById, id)
      )
    });
  }

  if (coverage.missingRequired.length > 0) {
    findings.push({
      code: "CANONICAL_REQUIREMENT_MISSING",
      severity: "warn",
      title: "Mandatory canonical requirement missing",
      message:
        "The plan does not address one or more mandatory requirements from the canonical task.",
      recommendation:
        "Update the plan to cover the missing canonical requirements or explicitly defer them with rationale.",
      evidence: coverage.missingRequired.flatMap((id) =>
        requirementEvidenceById(requirementById, id)
      )
    });
  }

  return findings;
}

function requirementEvidenceById(
  requirementById: Map<string, TaskRequirement>,
  id: string
): string[] {
  const requirement = requirementById.get(id);

  return requirement === undefined ? [id] : [`${id}: ${shortRequirementText(requirement)}`];
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
  const explicitOutputTargets = new Set(extractExplicitOutputTargets(task));
  const explicitOnlyTargets = new Set<string>();
  const declaredScope = extractDeclaredTaskScope(task);

  for (const path of explicitOutputTargets) {
    explicitEditTargets.delete(path);
  }

  for (const line of task.split(/\r?\n/u)) {
    const onlyMatch = /\b(?:(?:modify|edit|change|touch)\s+only|only\s+update)\s+(.+)$/iu.exec(
      line
    );

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

  for (const path of explicitOnlyTargets) {
    contextFiles.delete(path);
  }

  // A file the task requires work on is never read-only context, whatever phrasing produced the
  // context match. Requiring a change and forbidding one are contradictory instructions, and the
  // requirement is the one the user stated directly -- so it wins. This keeps the two path lists
  // disjoint by construction rather than by the accuracy of clause segmentation.
  for (const path of requiredRequirementPaths(task)) {
    contextFiles.delete(path);
  }

  return {
    contextFiles: [...contextFiles].sort(comparePaths),
    declaredPaths: declaredScope.paths,
    declaredScopeLabels: declaredScope.labels,
    hasBroadScopeSignal: declaredScope.hasBroadScopeSignal,
    explicitEditTargets: [...explicitEditTargets].sort(comparePaths),
    explicitOutputTargets: [...explicitOutputTargets].sort(comparePaths),
    explicitOnlyTargets: [...explicitOnlyTargets].sort(comparePaths),
    declaredModuleAreas: declaredScope.moduleAreas
  };
}

function extractExplicitOutputTargets(task: string): string[] {
  const outputTargets = new Set<string>();

  for (const clause of splitIntentClauses(task)) {
    for (const path of extractPathTokens(clause)) {
      if (isOutputArtifactMention(clause, path)) {
        outputTargets.add(path);
      }
    }
  }

  return [...outputTargets].sort(comparePaths);
}

function extractDeclaredTaskScope(task: string): DeclaredTaskScope {
  const paths = new Set<string>();
  const labels = new Set<string>();
  const moduleAreas = new Set<string>();
  const hasBroadScopeSignal =
    /\b(?:spanning|across)\b|\b(?:broad patch|full implementation|multi-area|multiple workstreams?|large patch)\b|\b(?:touch(?:es|ing)?|cover(?:s|ing)?|involv(?:es|ing))\s+(?:multiple|several)\s+(?:areas|modules|packages|components|subsystems|workstreams)\b/iu.test(
      task
    );
  const contextPaths = new Set(extractPhraseContextPaths(task));

  for (const segment of splitTaskScopeSegments(task)) {
    if (!hasDeclaredScopeIntent(segment) || hasNegativeEditIntent(segment)) {
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
      /\bdocs?|documentation|architecture|project context|context maintenance|context polish\b/iu,
      ["docs", "**/docs/**"],
      paths,
      labels
    );
    addDeclaredCategory(
      categoryText,
      "context_docs",
      /\b(?:context|architecture)\s+(?:files?|docs?|documentation|updates?|maintenance|polish)\b/iu,
      [
        "FULL_CONTEXT.md",
        "PROJECT_CONTEXT.md",
        "ARCHITECTURE.md",
        "AGENTS.md",
        "CLAUDE.md",
        "CONTRIBUTING.md",
        "NOTES.md",
        "docs",
        "**/docs/**"
      ],
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
      /\b(?:sample output|output artifacts?|generated output|reports?|results?|fixtures?|state files?|cache files?)\b/iu,
      ["artifacts", "examples", "out", "output", "outputs", "reports", "results", "samples"],
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
      [".github/workflows", ".circleci", ".buildkite", ".gitlab-ci.yml", "azure-pipelines.yml"],
      paths,
      labels
    );

    // Module names are inferred from prose and are frequently wrong -- "covering the happy path,
    // an empty result set, and an unauthenticated request" yielded a module called
    // "empty-result". Their path forms are therefore deferred until they can be checked against
    // the scanned repository (see moduleScopePaths).
    for (const moduleName of extractNamedScopeAreas(categoryText)) {
      labels.add(`module:${moduleName}`);
      moduleAreas.add(moduleName);
    }
  }

  return {
    paths: [...paths].sort(comparePaths),
    labels: [...labels].sort(comparePaths),
    hasBroadScopeSignal,
    moduleAreas: [...moduleAreas].sort(comparePaths)
  };
}

/**
 * Path forms for an inferred module area, admitted only when the area names something that
 * actually exists in the repository. Inventing paths for a module that does not exist inflates
 * expected scope until it excludes almost nothing -- which is how an explicitly forbidden file
 * passed a scope check unnoticed.
 */
function moduleScopePaths(moduleAreas: string[], knownPaths: string[]): string[] {
  const known = new Set(knownPaths.map(normalizePath));
  const paths = new Set<string>();
  // No scan information means "unknown", not "absent" -- callers without a repository context
  // still get the inferred paths.
  const canVerify = known.size > 0;

  for (const moduleName of moduleAreas) {
    const candidates = [moduleName, `src/${moduleName}`, `packages/${moduleName}`];
    const resolved = canVerify
      ? candidates.filter((candidate) => known.has(candidate))
      : candidates;

    if (resolved.length === 0) {
      continue;
    }

    for (const path of resolved) {
      paths.add(path);
    }

    paths.add(`**/${moduleName}/**`);
    paths.add(`**/${moduleName}.*`);
  }

  return [...paths];
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

/**
 * Paths that an active, mandatory requirement names as work to be done.
 */
function requiredRequirementPaths(task: string): string[] {
  return extractRequirementLedger(task)
    .requirements.filter(
      (requirement) =>
        requirement.status === "active" &&
        (requirement.obligation === "required" || requirement.obligation === "suggestion") &&
        // A requirement inferred from position rather than stated must not override an explicit
        // read-only marking; only what the task actually asks for outranks context.
        requirement.confidence !== "low"
    )
    .flatMap((requirement) => requirement.relatedPaths);
}

function extractExplicitEditTargets(text: string): string[] {
  const targets = new Set<string>();
  const phraseContextPaths = new Set(extractPhraseContextPaths(text));
  let editListActive = false;

  for (const clause of splitIntentClauses(text)) {
    const hasEditIntent: boolean = hasAffirmativeEditIntent(clause);
    const paths: string[] = hasEditIntent
      ? extractPathTokens(leadingEditableTargetSegment(clause), {
          structuredPathContext: true
        })
      : extractPathTokens(clause);
    const continuationPaths: string[] = editListActive
      ? editTargetListContinuationPaths(clause)
      : [];
    const isContinuation: boolean = continuationPaths.length > 0;
    const targetPaths: string[] = isContinuation && !hasEditIntent ? continuationPaths : paths;

    if (!hasEditIntent && !isContinuation) {
      editListActive = false;
      continue;
    }

    for (const path of targetPaths) {
      if (phraseContextPaths.has(path)) {
        continue;
      }

      targets.add(path);
    }

    editListActive = targetPaths.length > 0 && !/[.!?]\s*$/u.test(clause);
  }

  return [...targets];
}

function editTargetListContinuationPaths(clause: string): string[] {
  const targetSegment = leadingEditTargetSegment(clause);
  const paths = extractPathTokens(targetSegment);

  if (paths.length === 0 || hasNegativeEditIntent(clause)) {
    return [];
  }

  const commandText = stripPathTokens(targetSegment);

  return /\b(?:read|review|run|execute|verify|check|test|inspect|reference|context)\b/iu.test(
    commandText
  )
    ? []
    : paths;
}

function leadingEditTargetSegment(clause: string): string {
  const match =
    /^(.+?)(?:[.!?]\s+(?=(?:read|review|run|execute|verify|check|test|inspect)\b)|$)/iu.exec(
      clause
    );

  return match?.[1] ?? clause;
}

function leadingEditableTargetSegment(clause: string): string {
  const normalizedClause = clause.replace(/^\s*(?:[-*]|\d+\.)\s*/u, "");
  const match =
    /^(.+?)(?:\s*(?:->|=>)\s*(?=(?:check|run|test|validate|verify)\b)|\s+\band\s+(?=(?:check|run|test|validate|verify)\b)|\s+\b(?:as|based on|because|by|for|so that|to|using|via|with)\b|[.!?]\s+(?=(?:check|inspect|read|review|run|test|validate|verify)\b)|$)/iu.exec(
      normalizedClause
    );

  return match?.[1] ?? clause;
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
    const negation = negativeEditIntentMatch(clause);

    if (negation !== undefined) {
      // Only what the prohibition actually covers is read-only. In "Fix src/cart.ts but do not
      // change the public contract", the file named before the negation is the edit target.
      addExtractedPaths(contextPaths, clause.slice(negation.index + negation.length));
      continue;
    }

    for (const marker of [/\bbased on\b/iu, /\bread from\b/iu]) {
      const match = marker.exec(clause);

      if (match?.index !== undefined) {
        addExtractedPaths(contextPaths, clause.slice(match.index + match[0].length));
      }
    }

    if (
      /\b(?:as context|for context|for reference|use this file as context)\b/iu.test(clause) ||
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
  // Sentences first, so a trailing guardrail ("... . Do not change X.") is its own clause and
  // cannot claim the paths named by the instruction before it. Splitting only on newlines and
  // punctuation meant a two-sentence single-line task was treated as one clause, and every path
  // in it -- including the file the user asked to edit -- was filed as read-only context.
  return requirementSourceSegments(text)
    .filter((segment) => !segment.isMarkdownHeading)
    .flatMap((segment) =>
      segment.text.split(
        /[;,]|\bthen\b|\band\s+(?=(?:modify|update|create|add|edit|change|touch|implement)\b)/iu
      )
    )
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

// Verbs that name an edit. "fix" was absent, so the most ordinary bug-report phrasing --
// "Fix the discount function in src/cart.ts" -- produced no explicit edit target at all, and the
// file the user asked to change could then be captured as read-only context instead.
const editIntentVerbs =
  "modify|update|create|add|edit|change|touch|implement|fix|repair|correct|refactor|rename|remove|delete|migrate";

function hasAffirmativeEditIntent(value: string): boolean {
  return (
    !hasNegativeEditIntent(value) && new RegExp(`\\b(?:${editIntentVerbs})\\b`, "iu").test(value)
  );
}

function hasNegativeEditIntent(value: string): boolean {
  return negativeEditIntentMatch(value) !== undefined;
}

function negativeEditIntentMatch(value: string): { index: number; length: number } | undefined {
  const match = new RegExp(
    `\\b(?:do not|don't|must not|never)\\s+(?:${editIntentVerbs})\\b`,
    "iu"
  ).exec(value);

  return match === null ? undefined : { index: match.index, length: match[0].length };
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

  return generatedArtifactExtensions.has(extname(fileName)) || generatedArtifactNames.has(fileName);
}

function isNewDependencyAllowed(classification: TaskClassification, task: string): boolean {
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
      /\bupdate\s+(?:a\s+|the\s+)?(?:dependencies|dependency|library|framework)\b/iu.test(task)) &&
    !/\b(?:package|project|release)\s+version\b/iu.test(task);

  return (
    (classification.taskType === "dependency_upgrade" && hasAffirmativeDependencyIntent) ||
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

function extractPlanFileMentions(
  planText: string,
  additionalContextFiles: string[] = [],
  cwd?: string
): {
  proposedFiles: string[];
  contextFiles: string[];
  outputFiles: string[];
  fileMentions: PlanFileMention[];
} {
  const allPaths = new Set<string>();
  let inTargetSection = false;

  for (const line of planText.split(/\r?\n/u)) {
    const label = sectionLabel(line);
    if (label !== undefined) {
      inTargetSection =
        /^(?:files?|scope|targets?|touched files?|modules?|routes?|surfaces?)$/iu.test(label);
    }
    const pathSource = hasStructuredTargetPrefix(line) ? leadingEditableTargetSegment(line) : line;

    for (const path of extractPathTokens(pathSource, {
      structuredPathContext: inTargetSection || hasStructuredTargetPrefix(line)
    })) {
      allPaths.add(path);
    }
  }

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
        if (cwd === undefined || !isExistingRepoFile(cwd, path)) {
          markedNewFiles.add(path);
        }
      }
    }
  }

  for (const path of explicitEditTargets) {
    contextFiles.delete(path);
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
  const normalizedPath = normalizePath(path);
  const firstSegment = normalizedPath.toLowerCase().split("/")[0] ?? "";
  const label = sectionLabel(clause);
  const outputSection =
    label !== undefined &&
    /\b(?:artifact|artifacts|coverage|fixture|fixtures|generated|output|outputs|report|reports|result|results|state file|state files)\b/iu.test(
      label
    );
  const pathSuggestsOutput =
    expectedOutputDirectories.has(firstSegment) || isGeneratedArtifact(normalizedPath);
  const artifactLanguage =
    /\b(?:artifact|generated(?: output| artifact)?|output artifact|coverage report|report file|result file|fixture|state file)\b/iu.test(
      clause
    );
  const directOutputVerb = hasDirectOutputVerbForPath(clause, normalizedPath);
  const directEditIntent = hasDirectEditIntentForPath(clause, normalizedPath);

  if (directEditIntent && !outputSection && !directOutputVerb) {
    return false;
  }

  return (
    (outputSection && (pathSuggestsOutput || artifactLanguage || directOutputVerb)) ||
    (directOutputVerb && (pathSuggestsOutput || artifactLanguage)) ||
    (pathSuggestsOutput && artifactLanguage && !directEditIntent)
  );
}

function hasDirectEditIntentForPath(clause: string, path: string): boolean {
  const pathIndex = normalizedIndexOfPath(clause, path);
  const prefix = pathIndex < 0 ? clause : clause.slice(0, pathIndex);

  return (
    !hasNegativeEditIntent(prefix) &&
    /\b(?:add behavior to|change|connect|edit|extend|implement|migrate|modify|patch|refactor|remove behavior from|synchronize|touch|update|wire)\b/iu.test(
      prefix
    )
  );
}

function hasDirectOutputVerbForPath(clause: string, path: string): boolean {
  const variants = pathVariants(path);

  return variants.some((variant) =>
    new RegExp(
      `\\b(?:build|dump|emit|export|generate|output|produce|record|render|save|write)\\b[^.\\n]{0,100}${escapeRegExp(
        variant
      )}`,
      "iu"
    ).test(clause)
  );
}

function normalizedIndexOfPath(value: string, path: string): number {
  const normalizedValue = normalizePath(value);

  return pathVariants(path).reduce((index, variant) => {
    const nextIndex = normalizedValue.indexOf(variant);

    if (nextIndex < 0) {
      return index;
    }

    return index < 0 ? nextIndex : Math.min(index, nextIndex);
  }, -1);
}

function pathVariants(path: string): string[] {
  const normalizedPath = normalizePath(path);

  return [normalizedPath, normalizedPath.replace(/\//gu, "\\")];
}

function extractPathTokens(
  value: string,
  options: { structuredPathContext?: boolean } = {}
): string[] {
  return value
    .split(/\s+/u)
    .map((token) => ({ raw: token, cleaned: cleanPlanToken(token) }))
    .filter((token) => isFileLikePlanPath(token.cleaned, token.raw, options))
    .map((token) => token.cleaned)
    .map(normalizePath);
}

function cleanPlanToken(value: string): string {
  return value.replace(/^[`"'<([{]+/u, "").replace(/[`"'>)\]},.;:]+$/u, "");
}

function isFileLikePlanPath(
  value: string,
  rawValue = value,
  options: { structuredPathContext?: boolean } = {}
): boolean {
  if (value.length === 0 || /\s/u.test(value) || /^https?:\/\//iu.test(value)) {
    return false;
  }

  if (isNonRepositoryToken(value)) {
    return false;
  }

  const normalizedValue = normalizePath(value);
  const fileName = basename(normalizedValue);
  const hasPathSyntax = normalizedValue.includes("/");
  const hasStrongWrapper = /^[`"'<([{].*[`"'>)\]}.,;:]?$/u.test(rawValue);
  const hasGlob = hasGlobSyntax(normalizedValue);
  const hasRecognizedExtension =
    /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|toml|xml|css|scss|html|py|go|rs|java|kt|cs|rb|php|vue|svelte|lock)$/iu.test(
      fileName
    );

  return (
    dependencyFileNames.has(fileName) ||
    isCiFile(normalizedValue) ||
    ["Dockerfile", "Jenkinsfile", "Makefile"].includes(fileName) ||
    hasRecognizedExtension ||
    hasGlob ||
    normalizedValue.startsWith("./") ||
    normalizedValue.startsWith("../") ||
    (hasPathSyntax && (hasStrongWrapper || options.structuredPathContext === true))
  );
}

/**
 * Reject tokens that look like paths but can never name a file in the repository.
 *
 * A backticked `text/csv` or `/orders/export` in a task spec has path syntax and a strong
 * wrapper, so both were admitted as repository paths and then classified as plan targets.
 */
function isNonRepositoryToken(value: string): boolean {
  const isMimeType =
    /^(?:text|application|image|audio|video|font|model|multipart|message)\/[a-z0-9][a-z0-9.+-]*$/iu.test(
      value
    );
  // A rooted token with no file extension is a URL route, not a repository path. Repository
  // paths in task text are written relative to the root.
  const isUrlRoute = value.startsWith("/") && !/\.[a-z0-9]+$/iu.test(value);

  return isMimeType || isUrlRoute;
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
  const ignored = new Set(["and", "dependency", "dependencies", "package", "packages", "update"]);

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
    withoutNegatedPlanClauses(planText)
  );
}

function extractPlanTests(planText: string, proposedFiles: string[]): string[] {
  const tests = new Set<string>();
  const affirmativeText = withoutNegatedPlanClauses(planText);

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
    const match = phrase.exec(affirmativeText);

    if (match?.[0]) {
      tests.add(match[0].toLowerCase());
    }
  }

  return [...tests].sort(comparePaths);
}

function detectsCiIntent(planText: string, proposedFiles: string[]): boolean {
  const affirmativeText = withoutNegatedPlanClauses(planText);

  return (
    proposedFiles.some(isCiFile) ||
    /\b(?:github actions?|workflows?|ci|pipeline|jenkinsfile|gitlab-ci)\b/iu.test(
      affirmativeText
    ) ||
    /\.github\/workflows\//iu.test(normalizePath(affirmativeText))
  );
}

function withoutNegatedPlanClauses(planText: string): string {
  return planText.replace(
    /\b(?:do not|don't|must not|never|without|no)\b[^\n.;]*?(?=\bbut\b|[.;\n]|$)/giu,
    " "
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

function collectPlanEvidence(
  parsedPlan: AgentPlan,
  scopeBudget: ScopeBudget,
  taskText: string
): PlanEvidence {
  const affirmativeText = withoutNegatedPlanClauses(parsedPlan.rawText);
  const clauses = splitEvidenceClauses(affirmativeText);
  const mode = inferPlanValidationMode(parsedPlan.rawText, scopeBudget, taskText);

  return {
    hasApproach: hasActionableApproach(clauses),
    hasScopeTarget: hasScopeTargetEvidence(parsedPlan, clauses),
    hasVerification: hasVerificationEvidence(parsedPlan, clauses, mode)
  };
}

function inferPlanValidationMode(
  planText: string,
  scopeBudget: ScopeBudget,
  taskText: string
): PlanValidationMode {
  const text = `${taskText}\n${planText}`;

  if (
    /\b(?:publish|release|registry|installed cli|fixture repositor(?:y|ies)|working tree|worktree|package version|expected version)\b/iu.test(
      text
    )
  ) {
    return "operation";
  }

  if (/\b(?:documentation|docs?|guide|markdown|references?|migration guide)\b/iu.test(text)) {
    return "documentation";
  }

  if (
    /\b(?:request logs?|reproduce|failing request|debug|investigat|trace|malformed-input)\b/iu.test(
      text
    )
  ) {
    return "investigation";
  }

  if (
    /\b(?:audit|read-only|financial model|source sheets?|event study|historical data|unsupported assumptions?|limitations?|independently validated)\b/iu.test(
      text
    )
  ) {
    return "analysis";
  }

  if (/\b(?:migration|configuration|config|deployment contract|production config)\b/iu.test(text)) {
    return "migration_configuration";
  }

  const implementationTaskTypes: TaskType[] = [
    "api_endpoint",
    "auth_security_change",
    "bug_fix",
    "dependency_upgrade",
    "infra_ci_change",
    "migration",
    "refactor",
    "small_feature",
    "test_only",
    "ui_tweak"
  ];

  if (implementationTaskTypes.includes(scopeBudget.taskType)) {
    return "implementation";
  }

  return "unknown";
}

function splitEvidenceClauses(text: string): string[] {
  const normalized = text.replace(/^\s*(?:[-*]|\d+\.)\s*/gmu, "");

  return normalized
    .split(
      /\r?\n|[.;]|\bthen\b|,\s+(?=(?:and\s+)?(?:check|compare|confirm|document|identify|inspect|record|report|reproduce|review|state|validate|verify)\b)|\band\s+(?=(?:add|build|change|check|compare|confirm|create|edit|implement|inspect|modify|publish|record|reproduce|review|revise|run|update|validate|verify)\b)/iu
    )
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

function hasActionableApproach(clauses: string[]): boolean {
  const approachClauses = clauses.filter(hasApproachClauseEvidence);

  return approachClauses.length > 0;
}

function hasApproachClauseEvidence(clause: string): boolean {
  return (
    /\b(?:add|build|change|compare|compile|confirm|create|document|edit|expose|fix|identify|implement|inspect|modify|perform|publish|read|reconcile|record|remove|rename|report|reproduce|review|revise|state|update|use|wire)\b/iu.test(
      clause
    ) && hasActionObject(clause)
  );
}

function hasActionObject(clause: string): boolean {
  const words = clause
    .toLowerCase()
    .split(/[^a-z0-9_-]+/u)
    .filter((word) => word.length > 0);
  const actionIndex = words.findIndex((word) =>
    [
      "add",
      "build",
      "change",
      "check",
      "compare",
      "compile",
      "confirm",
      "create",
      "document",
      "edit",
      "expose",
      "fix",
      "identify",
      "implement",
      "inspect",
      "modify",
      "perform",
      "publish",
      "read",
      "reconcile",
      "record",
      "remove",
      "rename",
      "report",
      "reproduce",
      "review",
      "revise",
      "state",
      "update",
      "use",
      "wire"
    ].includes(word)
  );

  if (actionIndex < 0) {
    return false;
  }

  return words
    .slice(actionIndex + 1)
    .some((word) => word.length > 2 && !planEvidenceStopWords.has(word));
}

const planEvidenceStopWords = new Set([
  "a",
  "an",
  "and",
  "any",
  "as",
  "at",
  "be",
  "for",
  "if",
  "in",
  "is",
  "it",
  "of",
  "or",
  "that",
  "the",
  "their",
  "to",
  "where",
  "with"
]);

function hasScopeTargetEvidence(parsedPlan: AgentPlan, clauses: string[]): boolean {
  if (parsedPlan.proposedFiles.length > 0) {
    return true;
  }

  return clauses.some((clause) =>
    /\b(?:api contract|commands?|deployment contract|documented schema|failing request|financial model|fixture repositor(?:y|ies)|frontend|generated output|historical data|installed cli|internal references?|keyboard navigation|migration guide|package|parser implementation|production configuration|registry|rendered markdown|request logs?|responsive navigation|runtime behavior|source files?|source sheets?|working tree|worktree)\b/iu.test(
      clause
    )
  );
}

function hasVerificationEvidence(
  parsedPlan: AgentPlan,
  clauses: string[],
  mode: PlanValidationMode
): boolean {
  if (parsedPlan.proposedTests.length > 0) {
    return true;
  }

  return clauses.some(
    (clause) =>
      hasCommonVerificationEvidence(clause) || hasModeSpecificVerificationEvidence(clause, mode)
  );
}

function hasCommonVerificationEvidence(clause: string): boolean {
  return (
    /\b(?:run|execute)\b[^.\n]{0,100}\b(?:tests?|test suite|pytest|vitest|jest|specs?|lint|typecheck|build|compile|smoke|pack|cli|fixture|commands?)\b/iu.test(
      clause
    ) ||
    /\b(?:build|compile|typecheck|lint|pack)\b(?:\s+(?:the\s+)?(?:application|app|frontend|package|project|release))?\b/iu.test(
      clause
    ) ||
    /\bverify\b[^.\n]{0,100}\b(?:behavior|clean|contract|expected|keyboard|navigation|result|status|unchanged|version|works?)\b/iu.test(
      clause
    ) ||
    /\bvalidate\b[^.\n]{0,100}\b(?:against|commands?|contract|current|expected|references?|with)\b/iu.test(
      clause
    ) ||
    /\bcompare\b[^.\n]{0,100}\b(?:against|to|with)\b/iu.test(clause) ||
    /\breconcile\b[^.\n]{0,100}\b(?:against|to|with)\b/iu.test(clause) ||
    /\breproduce\b[^.\n]{0,100}\b(?:bug|case|error|failing|failure|malformed|request)\b/iu.test(
      clause
    ) ||
    /\bconfirm\b[^.\n]{0,100}\b(?:clean|expected|exposes|registry|remains|status|unchanged|version|working tree|worktree)\b/iu.test(
      clause
    ) ||
    /\bcheck\b[^.\n]{0,100}\b(?:contract|formatting|links?|references?|result|status|working tree|worktree)\b/iu.test(
      clause
    ) ||
    /\binspect\b[^.\n]{0,100}\b(?:logs?|mobile|desktop|rendered|result|response|runtime behavior|output)\b/iu.test(
      clause
    ) ||
    /\breview\b[^.\n]{0,100}\b(?:formatting|output|rendered|result)\b/iu.test(clause) ||
    /\b(?:document|record|report|state)\b[^.\n]{0,120}\b(?:cannot be (?:independently |safely )?(?:confirmed|validated|verified)|limitations?|uncertainty|unsupported assumptions?)\b/iu.test(
      clause
    )
  );
}

function hasModeSpecificVerificationEvidence(clause: string, mode: PlanValidationMode): boolean {
  switch (mode) {
    case "analysis":
      return /\b(?:event study|evidence review|historical data|source sheets?|unsupported assumptions?)\b/iu.test(
        clause
      );
    case "documentation":
      return /\b(?:check internal references?|review rendered markdown|validate each command|link validation|formatting problems?)\b/iu.test(
        clause
      );
    case "implementation":
      return /\b(?:inspect the result|keyboard navigation|manual verification|responsive rendering|runtime verification)\b/iu.test(
        clause
      );
    case "investigation":
      return /\b(?:request logs?|reproduce the failing request|documented api contract|remaining uncertainty|trace)\b/iu.test(
        clause
      );
    case "migration_configuration":
      return /\b(?:deployment contract|production configuration|cannot be safely verified|without executing)\b/iu.test(
        clause
      );
    case "operation":
      return /\b(?:registry exposes|expected version|installed cli|fixture repositor(?:y|ies)|working tree is clean|worktree remains unchanged|health checks?|rollback)\b/iu.test(
        clause
      );
    case "unknown":
      return false;
  }
}

function analyzePlanStructure(
  parsedPlan: AgentPlan,
  scopeBudget: ScopeBudget,
  taskText: string
): PlanStructure {
  const text = parsedPlan.rawText;
  const affirmativeText = withoutNegatedPlanClauses(text);
  const evidence = collectPlanEvidence(parsedPlan, scopeBudget, taskText);
  const hasFilesLabel = hasSectionLabel(
    text,
    /^(?:files?|scope|targets?|touched files?|modules?|components?)$/iu
  );
  const hasImplementationLabel = hasSectionLabel(
    text,
    /^(?:implementation|changes?|approach|steps?|execution)$/iu
  );
  const hasVerificationLabel = hasSectionLabel(
    text,
    /^(?:verification|tests?|test strategy|checks?|validation)$/iu
  );
  const hasRiskLabel = hasSectionLabel(
    text,
    /^(?:risks?|assumptions?|constraints?|scope rationale|expansion rationale)$/iu
  );

  return {
    hasFiles:
      hasFilesLabel ||
      parsedPlan.proposedFiles.length > 0 ||
      evidence.hasScopeTarget ||
      /\b(?:module|component|package)\s+[a-z0-9_.@/-]+\b/iu.test(text),
    hasImplementation: hasImplementationLabel || evidence.hasApproach,
    hasVerification:
      hasVerificationLabel || parsedPlan.proposedTests.length > 0 || evidence.hasVerification,
    hasRiskRationale:
      hasRiskLabel ||
      (/\b(?:because|since|required for|required to|needed to|included to)\b/iu.test(
        affirmativeText
      ) &&
        (evidence.hasVerification ||
          /\b(?:verify|test|check|lint|typecheck|build|pack|smoke)\b/iu.test(affirmativeText)))
  };
}

function hasSectionLabel(text: string, concept: RegExp): boolean {
  return text.split(/\r?\n/u).some((line) => {
    const label = sectionLabel(line);

    return label !== undefined && concept.test(label);
  });
}

function sectionLabel(line: string): string | undefined {
  const normalizedLine = line.replace(/^\s*(?:#{1,6}|[-*]|\d+\.)\s*/u, "").trim();
  const separatorMatch = /^([A-Za-z][A-Za-z0-9 _/-]{0,40})\s*[:-]\s*/u.exec(normalizedLine);

  if (separatorMatch?.[1] !== undefined) {
    return separatorMatch[1].trim().toLowerCase();
  }

  if (normalizedLine.split(/\s+/u).length <= 4) {
    return normalizedLine.toLowerCase();
  }

  return undefined;
}

function hasStructuredTargetPrefix(line: string): boolean {
  return /^\s*(?:[-*]|\d+\.)\s*(?:add|create|edit|modify|update|change|touch|target|file|path)\b/iu.test(
    line
  );
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
      message:
        "The plan names edit targets that do not exist and are not marked as new or created.",
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
      title: "Required dependency needs approval or an accepted alternative",
      message: `The task appears to require a missing dependency (${missingBlockedPackages.join(", ")}), and adding it requires approval under the current guidance.`,
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
      severity: "approval_required",
      title: "Dependency substitution requires approval",
      message:
        "The plan substitutes an explicitly required dependency without an accepted-alternative or user-approval marker.",
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

  for (const manifestName of ["pyproject.toml", "requirements.txt", "setup.cfg", "setup.py"]) {
    const manifestPath = join(cwd, manifestName);

    if (!existsSync(manifestPath)) {
      continue;
    }

    const content = readFileSync(manifestPath, "utf8");

    for (const packageName of dependencyRegistry) {
      if (
        new RegExp(`(^|[^a-z0-9_-])${escapeRegExp(packageName)}([^a-z0-9_-]|$)`, "imu").test(
          content
        )
      ) {
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
    const cleanupPaths = strongMissing.filter((path) => riskyPathCategory(path) === "secret");
    const approvalPaths = strongMissing.filter((path) => !cleanupPaths.includes(path));

    if (cleanupPaths.length > 0) {
      findings.push({
        code: "RISKY_CHANGE_RATIONALE_REQUIRED",
        severity: "cleanup_required",
        title: "Secret or env file should be removed",
        message: "The plan includes a secret or environment file.",
        recommendation: "Remove the file from the plan and verify it is ignored.",
        evidence: cleanupPaths
      });
    }

    if (approvalPaths.length > 0) {
      findings.push({
        code: "RISKY_CHANGE_RATIONALE_REQUIRED",
        severity: "approval_required",
        title: "Risky change rationale required",
        message:
          "The plan proposes dependency, lockfile, CI, or security-sensitive changes without a named reason.",
        recommendation:
          "Name why each risky file is needed and how it will be verified, or request approval.",
        evidence: approvalPaths
      });
    }
  }

  if (missing.length > 0) {
    findings.push({
      code: "RISKY_CHANGE_RATIONALE_REQUIRED",
      severity: "warn",
      title: "Config change rationale required",
      message:
        "The plan proposes broad configuration changes without a specific reason and verification.",
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
      new RegExp(
        `\\b(?:change|update|modify|add|configure)\\b[^.\\n]{0,50}\\b${escapeRegExp(category)}\\b`,
        "iu"
      ).test(taskText))
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

function classifyPlanTargets(input: {
  parsedPlan: AgentPlan;
  scopeBudget: ScopeBudget;
  planText: string;
  taskText: string;
  cwd?: string;
}): ScopeTargetClassification[] {
  const explicitScope =
    input.scopeBudget.explicitScope ??
    input.scopeBudget.expectedPaths ??
    input.scopeBudget.allowedPaths;
  const derivedScope = input.scopeBudget.derivedScope ?? [];
  const taskTerms = extractTaskTerms(input.taskText);
  const directTargets = input.parsedPlan.proposedFiles.filter(
    (path) =>
      isWithinAllowedPaths(path, explicitScope) ||
      isAcceptedContextDocsPlanTouch(path, input.scopeBudget) ||
      isAcceptedDocumentationPlanTouch(path, input.planText, input.taskText, input.scopeBudget)
  );

  return input.parsedPlan.proposedFiles.map((rawTarget) => {
    const target = normalizePath(rawTarget);
    const operationLine = findPlanLineForPath(input.planText, target);
    const operationEvidence = operationLine ?? target;
    const rationale = findScopeRationale(input.planText, target);

    if (isReadOnlyContextTarget(target, input.scopeBudget)) {
      return {
        target,
        classification: "unexplained",
        reason: "Target is marked as read-only context for the active task.",
        evidence: "read-only context declaration",
        nextAction: "Do not edit the context file unless the task explicitly changes it."
      };
    }

    if (
      isWithinAllowedPaths(target, explicitScope) ||
      isAcceptedContextDocsPlanTouch(target, input.scopeBudget) ||
      isAcceptedDocumentationPlanTouch(target, input.planText, input.taskText, input.scopeBudget)
    ) {
      return {
        target,
        classification: "direct",
        reason: "Target matches explicit task scope or a declared scope pattern.",
        evidence: matchingScopeEvidence(target, explicitScope) ?? "explicit task scope"
      };
    }

    if (isWithinAllowedPaths(target, derivedScope)) {
      return {
        target,
        classification: "derived",
        reason: "Target matches repository context derived from task anchors.",
        evidence: matchingScopeEvidence(target, derivedScope) ?? "derived scope budget entry"
      };
    }

    const relationship = findRepositoryRelationship(
      input.cwd,
      target,
      directTargets.length > 0 ? directTargets : explicitScope
    );

    if (relationship !== undefined) {
      return {
        target,
        classification: "derived",
        reason: relationship.reason,
        evidence: relationship.evidence
      };
    }

    if (
      rationale.specific ||
      (isBroadTaskBreadth(input.scopeBudget.taskBreadth) &&
        hasObjectiveOperationEvidence(operationEvidence, taskTerms))
    ) {
      return {
        target,
        classification: "derived",
        reason: rationale.specific
          ? "Plan gives a specific operation rationale and verification for the target."
          : "Target operation matches terms from a broad task objective.",
        evidence: operationEvidence
      };
    }

    if (
      isBroadTaskBreadth(input.scopeBudget.taskBreadth) &&
      isOrdinaryImplementationPath(target) &&
      rationale.vague
    ) {
      return {
        target,
        classification: "adjacent",
        reason:
          "Target is plausible for the declared broad task, but no structural relationship or operation rationale was found.",
        evidence: operationEvidence,
        nextAction: "Add a target-specific rationale and verification."
      };
    }

    return {
      target,
      classification: "unexplained",
      reason:
        "No credible structural or semantic relationship to the requested objective was found.",
      evidence: operationEvidence,
      nextAction: "Remove the target from the plan or justify why it belongs to the task."
    };
  });
}

function isBroadTaskBreadth(breadth: TaskBreadth | undefined): boolean {
  return breadth === "subsystem" || breadth === "cross_cutting" || breadth === "repository_wide";
}

function hasObjectiveOperationEvidence(value: string, taskTerms: string[]): boolean {
  const normalized = value.toLowerCase();
  const usefulTerms = taskTerms.filter((term) => term.length > 3);

  return usefulTerms.some((term) => normalized.includes(term));
}

function isOrdinaryImplementationPath(path: string): boolean {
  return (
    isSourceFile(path) ||
    isTestFile(path) ||
    isContextDocsPath(path) ||
    broadConfigFileNames.has(basename(path)) ||
    /(?:^|[.-])config\.(?:js|cjs|mjs|ts|json|yml|yaml|toml)$/iu.test(basename(path))
  );
}

function findPlanLineForPath(planText: string, path: string): string | undefined {
  const normalizedPath = normalizePath(path).toLowerCase();
  const windowsPath = normalizedPath.replace(/\//gu, "\\");
  const fileName = basename(normalizedPath);

  return planText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => {
      const normalizedLine = normalizePath(line).toLowerCase();
      return (
        normalizedLine.includes(normalizedPath) ||
        line.toLowerCase().includes(windowsPath) ||
        normalizedLine.includes(fileName)
      );
    });
}

function matchingScopeEvidence(path: string, scopeEntries: string[]): string | undefined {
  return scopeEntries.find((entry) => isWithinAllowedPaths(path, [entry]));
}

function findRepositoryRelationship(
  cwd: string | undefined,
  target: string,
  directTargets: string[]
): { reason: string; evidence: string } | undefined {
  const normalizedTarget = normalizePath(target);
  const normalizedDirectTargets = directTargets.map(normalizePath).filter((path) => path !== ".");

  for (const directTarget of normalizedDirectTargets) {
    if (pathsOverlap(normalizedTarget, directTarget)) {
      return {
        reason: "Target overlaps an explicitly scoped target.",
        evidence: directTarget
      };
    }

    if (isLikelyTestForTarget(normalizedTarget, directTarget)) {
      return {
        reason: "Target is a focused test for an explicitly scoped target.",
        evidence: directTarget
      };
    }
  }

  if (cwd === undefined) {
    return undefined;
  }

  for (const directTarget of normalizedDirectTargets) {
    if (fileImportsTarget(cwd, directTarget, normalizedTarget)) {
      return {
        reason: "Target is imported by an explicitly scoped target.",
        evidence: directTarget
      };
    }

    if (fileImportsTarget(cwd, normalizedTarget, directTarget)) {
      return {
        reason: "Target imports an explicitly scoped target.",
        evidence: directTarget
      };
    }
  }

  return undefined;
}

function isLikelyTestForTarget(path: string, target: string): boolean {
  if (!isTestFile(path)) {
    return false;
  }

  const pathStem = fileStem(path)
    .replace(/\.(?:test|spec)$/iu, "")
    .toLowerCase();
  const targetStem = fileStem(target).toLowerCase();

  return pathStem === targetStem || pathStem.endsWith(`/${targetStem}`);
}

function fileImportsTarget(cwd: string, importer: string, target: string): boolean {
  const importerPath = resolve(cwd, importer);

  if (!existsSync(importerPath) || !statSync(importerPath).isFile()) {
    return false;
  }

  let content: string;

  try {
    content = readFileSync(importerPath, "utf8");
  } catch {
    return false;
  }

  const imports = Array.from(
    content.matchAll(
      /(?:import\s+(?:[^'"]+\s+from\s+)?|export\s+[^'"]+\s+from\s+|require\()\s*['"]([^'"]+)['"]/giu
    )
  ).map((match) => match[1] ?? "");

  return imports.some((specifier) => importSpecifierResolvesTo(cwd, importer, specifier, target));
}

function importSpecifierResolvesTo(
  cwd: string,
  importer: string,
  specifier: string,
  target: string
): boolean {
  if (!specifier.startsWith(".")) {
    return false;
  }

  const importerDirectory = dirname(resolve(cwd, importer));
  const basePath = resolve(importerDirectory, specifier);
  const targetPath = normalizePath(relative(cwd, resolve(cwd, target)));
  const candidates = [
    basePath,
    ...[...sourceExtensions, ".json"].map((extension) => `${basePath}${extension}`),
    ...[...sourceExtensions, ".json"].map((extension) => join(basePath, `index${extension}`))
  ].map((candidate) => normalizePath(relative(cwd, candidate)));

  return candidates.includes(targetPath);
}

function shouldWarnForPlanFileCount(
  scopeBudget: ScopeBudget,
  targetClassifications: ScopeTargetClassification[]
): boolean {
  if (targetClassifications.length === 0) {
    return false;
  }

  if (
    isBroadTaskBreadth(scopeBudget.taskBreadth) &&
    targetClassifications.every(
      (target) => target.classification === "direct" || target.classification === "derived"
    )
  ) {
    return false;
  }

  if (!isBroadTaskBreadth(scopeBudget.taskBreadth)) {
    return true;
  }

  return targetClassifications.some(
    (target) => target.classification === "adjacent" || target.classification === "unexplained"
  );
}

function isReadOnlyContextTarget(path: string, scopeBudget: ScopeBudget): boolean {
  const normalizedPath = normalizePath(path);

  return (scopeBudget.readOnlyContextPaths ?? []).some(
    (contextPath) => normalizePath(contextPath) === normalizedPath
  );
}

function isAcceptedDocumentationPlanTouch(
  path: string,
  planText: string,
  taskText: string,
  scopeBudget: ScopeBudget
): boolean {
  const normalizedPath = normalizePath(path);

  if (isReadOnlyContextTarget(normalizedPath, scopeBudget) || !isContextDocsPath(normalizedPath)) {
    return false;
  }

  const line = findPlanLineForPath(planText, normalizedPath) ?? "";
  const taskTerms = extractTaskTerms(taskText).filter((term) => term.length > 3);

  return (
    /\b(?:update|document|describe|clarify)\b/iu.test(line) &&
    (taskTerms.length === 0 ||
      taskTerms.some((term) => line.toLowerCase().includes(term)) ||
      /\b(?:runtime|behavior|behaviour|logic)\b/iu.test(line))
  );
}

function validateProtectedSemanticScope(
  taskText: string,
  planText: string
): PlanValidationFinding[] {
  const protectedSemantics = detectProtectedSemantics(taskText);

  if (protectedSemantics.length === 0) {
    return [];
  }

  const violations = protectedSemantics.filter((semantic) =>
    protectedSemanticViolationPattern(semantic).test(planText)
  );

  if (violations.length === 0) {
    return [];
  }

  return [
    {
      code: "PLAN_HARD_GATE_VIOLATION",
      severity: "action_required",
      title: "Protected semantic boundary crossed",
      message: `The plan proposes changes to protected semantic area(s): ${violations.join(", ")}.`,
      recommendation:
        "Revise the operation to stay within the requested behavior or ask for explicit approval.",
      evidence: violations
    }
  ];
}

function detectProtectedSemantics(taskText: string): string[] {
  const protectedSemantics = new Set<string>();

  const explicitPatterns: Array<[string, RegExp]> = [
    [
      "calculation",
      /\b(?:do not|don't|must not|without|no)\b[^.\n]{0,60}\b(?:calculation|business logic|pricing|billing|payment)\b/iu
    ],
    [
      "contract",
      /\b(?:do not|don't|must not|without|no)\b[^.\n]{0,60}\b(?:public contract|api contract|interface|schema)\b/iu
    ],
    [
      "persistence",
      /\b(?:do not|don't|must not|without|no)\b[^.\n]{0,60}\b(?:persistence|database|storage|migration|schema)\b/iu
    ],
    [
      "authentication",
      /\b(?:do not|don't|must not|without|no)\b[^.\n]{0,60}\b(?:auth|authentication|authorization|session|permission)\b/iu
    ]
  ];

  for (const [semantic, pattern] of explicitPatterns) {
    if (pattern.test(taskText)) {
      protectedSemantics.add(semantic);
    }
  }

  if (
    /\b(?:presentation-only|visual-only|layout-only|styling-only|docs-only|documentation-only)\b/iu.test(
      taskText
    )
  ) {
    protectedSemantics.add("calculation");
    protectedSemantics.add("contract");
    protectedSemantics.add("persistence");
    protectedSemantics.add("authentication");
  }

  return [...protectedSemantics].sort();
}

function protectedSemanticViolationPattern(semantic: string): RegExp {
  switch (semantic) {
    case "authentication":
      return /\b(?:alter|change|modify|rewrite|replace|update)\b[^.\n]{0,80}\b(?:auth|authentication|authorization|session|permission|redirect semantics?)\b/iu;
    case "calculation":
      return /\b(?:alter|change|modify|rewrite|replace|update)\b[^.\n]{0,80}\b(?:calculation|business logic|pricing|billing|payment amount|tax|discount)\b/iu;
    case "contract":
      return /\b(?:alter|change|modify|rewrite|replace|update)\b[^.\n]{0,80}\b(?:public contract|api contract|interface|schema|response shape|request shape)\b/iu;
    case "persistence":
      return /\b(?:alter|change|modify|rewrite|replace|update)\b[^.\n]{0,80}\b(?:persistence|database|storage|migration|schema|table|column)\b/iu;
    default:
      return /$a/u;
  }
}

function formatScopeTargetSummary(targets: ScopeTargetClassification[]): string {
  const adjacent = targets.filter((target) => target.classification === "adjacent");
  const unexplained = targets.filter((target) => target.classification === "unexplained");
  const count = targets.length;
  const groups = [
    adjacent.length === 0 ? "" : `${adjacent.length} adjacent`,
    unexplained.length === 0 ? "" : `${unexplained.length} unexplained`
  ].filter((value) => value.length > 0);

  return `${count} proposed target(s) need clarification (${groups.join(", ")}). ${formatScopeTargetEvidence(targets).join(" ")}`;
}

function formatScopeTargetEvidence(targets: ScopeTargetClassification[]): string[] {
  return targets.map(
    (target) =>
      `${target.target} [${target.classification}]: ${target.reason} Evidence: ${target.evidence}${target.nextAction === undefined ? "" : ` Next: ${target.nextAction}`}`
  );
}

function validatePlanFilesAgainstScope(
  parsedPlan: AgentPlan,
  scopeBudget: ScopeBudget,
  config: ScopeBudgetConfig | undefined,
  planText: string,
  targetClassifications: ScopeTargetClassification[]
): PlanValidationFinding[] {
  const classificationOutsidePaths = targetClassifications
    .filter(
      (target) => target.classification === "adjacent" || target.classification === "unexplained"
    )
    .map((target) => target.target);
  const approvalRequiredFromAllTargets = parsedPlan.proposedFiles.filter((path) =>
    isPlanPathApprovalRequiredForPlan(path, parsedPlan, scopeBudget, config)
  );
  const outsideAllowedPaths = dedupe([
    ...classificationOutsidePaths,
    ...approvalRequiredFromAllTargets
  ]);

  if (outsideAllowedPaths.length === 0) {
    return [];
  }

  const approvalRequiredPaths = outsideAllowedPaths.filter((path) =>
    isPlanPathApprovalRequiredForPlan(path, parsedPlan, scopeBudget, config)
  );
  const cleanupPaths = approvalRequiredPaths.filter(isSecretPath);
  const approvalPaths = approvalRequiredPaths.filter((path) => !cleanupPaths.includes(path));
  const warningPaths = classificationOutsidePaths.filter(
    (path) => !approvalRequiredPaths.includes(path)
  );
  const findings: PlanValidationFinding[] = [];

  if (cleanupPaths.length > 0) {
    findings.push({
      code: "PLAN_HARD_GATE_VIOLATION",
      severity: "cleanup_required",
      title: "Plan includes a secret or env file",
      message:
        "The plan includes a secret or environment file that should not be part of the change set.",
      recommendation: "Remove the file from the plan and verify it is ignored.",
      evidence: cleanupPaths
    });
  }

  if (approvalPaths.length > 0) {
    findings.push({
      code: "APPROVAL_REQUIRED_PATH_CHANGED",
      severity: "approval_required",
      title: "Files require approval",
      message: `${approvalPaths.length} proposed file(s) are outside expected scope and match approval-required paths or categories.`,
      recommendation: "Request approval for these files or revise the plan to remove them.",
      evidence: approvalPaths
    });
    findings.push({
      code: "PLAN_HARD_GATE_VIOLATION",
      severity: "approval_required",
      title: "Plan includes an approval-required category",
      message:
        "The plan includes dependency, CI, security-sensitive, or protected paths that require approval under the active guidance.",
      recommendation: "Request approval or revise the plan to remove the approval-required paths.",
      evidence: approvalPaths
    });
  }

  if (warningPaths.length > 0) {
    const warningTargets = targetClassifications.filter((target) =>
      warningPaths.includes(target.target)
    );
    findings.push({
      code: "SCOPE_EXPANSION_WARN",
      severity: "warn",
      title: "Files outside expected scope",
      message: formatScopeTargetSummary(warningTargets),
      recommendation:
        "Add a rationale for adjacent targets and remove or justify unexplained targets.",
      evidence: formatScopeTargetEvidence(warningTargets)
    });
  }

  findings.push({
    code: "PLAN_SCOPE_OUTSIDE_BUDGET",
    severity: "warn",
    title: "Plan exceeds expected scope",
    message: formatScopeTargetSummary(
      targetClassifications.filter((target) => outsideAllowedPaths.includes(target.target))
    ),
    recommendation:
      "Name why each adjacent or unexplained file is needed and how the area will be verified.",
    evidence: formatScopeTargetEvidence(
      targetClassifications.filter((target) => outsideAllowedPaths.includes(target.target))
    )
  });

  const rationales = outsideAllowedPaths.map((path) => findScopeRationale(planText, path));
  const missingRationales = rationales.filter(
    (rationale) => !rationale.specific && !rationale.vague
  );
  const vagueRationales = rationales.filter((rationale) => rationale.vague);

  if (missingRationales.length > 0) {
    findings.push({
      code: "SCOPE_EXPANSION_RATIONALE_REQUIRED",
      severity: "warn",
      title: "Scope rationale required",
      message:
        "The plan expands beyond expected paths without naming why each extra area is needed and how it will be verified.",
      recommendation: "Add a specific scope rationale for each expanded file, module, or category.",
      evidence: missingRationales.map((rationale) => rationale.path)
    });
  }

  if (vagueRationales.length > 0) {
    findings.push({
      code: "SCOPE_EXPANSION_RATIONALE_VAGUE",
      severity: "warn",
      title: "Scope rationale is vague",
      message:
        "The plan includes expansion wording that does not identify a concrete reason and verification for the extra area.",
      recommendation:
        "Name the affected file or category, the reason it is needed, and the verification for that area.",
      evidence: vagueRationales.map((rationale) => rationale.path)
    });
  }

  return findings;
}

function isAcceptedContextDocsPlanTouch(path: string, scopeBudget: ScopeBudget): boolean {
  if (scopeBudget.contextDocsTouchAllowed !== true || !isContextDocsPath(path)) {
    return false;
  }

  return !(scopeBudget.readOnlyContextPaths ?? []).some(
    (contextPath) => normalizePath(contextPath) === normalizePath(path)
  );
}

function isContextDocsPath(path: string): boolean {
  const normalized = normalizePath(path);
  const fileName = basename(normalized).toLowerCase();

  return (
    normalized.toLowerCase().startsWith("docs/") ||
    [
      "full_context.md",
      "project_context.md",
      "architecture.md",
      "agents.md",
      "claude.md",
      "contributing.md",
      "notes.md"
    ].includes(fileName)
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

function isPlanPathApprovalRequiredForPlan(
  path: string,
  parsedPlan: AgentPlan,
  scopeBudget: ScopeBudget,
  config: ScopeBudgetConfig | undefined
): boolean {
  if (
    isDependencyFile(path) &&
    !lockfileNames.has(basename(path)) &&
    scopeBudget.hardGates.dependencyMetadataChangesAllowed === true &&
    !parsedPlan.mentionsNewDependencies
  ) {
    return false;
  }

  return isPlanPathApprovalRequired(path, scopeBudget, config);
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

  return path === pattern || path.startsWith(`${pattern}/`) || matchesGlob(pattern, path);
}

function pathsOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizePath(left).replace(/\/$/u, "");
  const normalizedRight = normalizePath(right).replace(/\/$/u, "");

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}/`) ||
    normalizedRight.startsWith(`${normalizedLeft}/`) ||
    matchesGlob(normalizedRight, normalizedLeft) ||
    matchesGlob(normalizedLeft, normalizedRight)
  );
}

function isSecretPath(path: string): boolean {
  return /(^|\/)(?:\.env|.*secret.*|.*secrets.*)(?:\/|\.|$)/iu.test(normalizePath(path));
}

function ciEvidence(parsedPlan: AgentPlan): string[] {
  const evidence = parsedPlan.proposedFiles.filter(isCiFile);

  return evidence.length > 0 ? evidence : ["CI/workflow wording"];
}

function isPlanVague(parsedPlan: AgentPlan, planStructure: PlanStructure): boolean {
  const wordCount = parsedPlan.rawText.trim().split(/\s+/u).filter(Boolean).length;
  const hasConcreteSignal =
    parsedPlan.proposedFiles.length > 0 ||
    parsedPlan.proposedDependencies.length > 0 ||
    parsedPlan.proposedTests.length > 0 ||
    parsedPlan.mentionedRiskyAreas.length > 0 ||
    planStructure.hasFiles ||
    planStructure.hasImplementation ||
    planStructure.hasVerification;
  const hasConcreteTargetAndAction =
    (parsedPlan.proposedFiles.length > 0 || planStructure.hasFiles) &&
    (parsedPlan.proposedTests.length > 0 ||
      planStructure.hasImplementation ||
      planStructure.hasVerification);

  return (wordCount < 5 && !hasConcreteTargetAndAction) || !hasConcreteSignal;
}

function planValidationStatus(findings: PlanValidationFinding[]): PlanValidationStatus {
  if (findings.some((finding) => finding.severity === "cleanup_required")) {
    return "needs_cleanup";
  }

  if (
    findings.some(
      (finding) =>
        finding.severity === "approval_required" ||
        finding.severity === "fail" ||
        finding.severity === "blocking"
    )
  ) {
    return "needs_approval";
  }

  if (findings.some((finding) => finding.severity === "action_required")) {
    return "needs_clarification";
  }

  if (findings.some((finding) => finding.severity === "warn")) {
    const clarificationCodes = new Set<FindingCode>([
      "PLAN_REQUIRED_SECTION_MISSING",
      "PLAN_NO_FILES_MENTIONED",
      "PLAN_NO_VERIFICATION",
      "MISSING_TEST_STRATEGY",
      "PLAN_RISK_RATIONALE_MISSING",
      "SCOPE_EXPANSION_RATIONALE_REQUIRED",
      "SCOPE_EXPANSION_RATIONALE_VAGUE",
      "DEPENDENCY_REQUIREMENT_CONFLICT",
      "CANONICAL_REQUIREMENT_MISSING"
    ]);

    return findings.some((finding) => clarificationCodes.has(finding.code))
      ? "needs_clarification"
      : "advisory";
  }

  return "aligned";
}

function planValidationSummary(
  status: PlanValidationStatus,
  findings: PlanValidationFinding[]
): string {
  if (status === "aligned") {
    return "Plan is aligned with declared task scope.";
  }

  return `${findings.length} finding(s) provide guidance before implementation.`;
}

function planValidationNextAction(status: PlanValidationStatus): string {
  if (status === "aligned") {
    return "Implement the plan, keep expansion explained, and run the stated verification.";
  }

  if (status === "advisory") {
    return "Review the advisory findings and add scope rationale where useful.";
  }

  if (status === "needs_clarification") {
    return "Clarify the plan structure, scope rationale, or verification, then run validate-plan again.";
  }

  if (status === "needs_cleanup") {
    return "Remove cleanup-required files or artifacts from the plan, then run validate-plan again.";
  }

  return "Request approval for the identified change or remove it from the plan.";
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
  if (severity === "cleanup_required") {
    return 5;
  }

  if (severity === "approval_required" || severity === "fail" || severity === "blocking") {
    return 4;
  }

  if (severity === "action_required") {
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

  for (const path of taskScopeHints.explicitOutputTargets) {
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

  const declaredPaths = [
    ...taskScopeHints.declaredPaths,
    ...moduleScopePaths(taskScopeHints.declaredModuleAreas, repoContext.knownPaths ?? [])
  ];

  for (const path of declaredPaths) {
    if (
      explicitTargets.length > 0 &&
      explicitTargets.some(isNonExecutableDocumentationPath) &&
      (path === "docs" || path === "**/docs/**")
    ) {
      continue;
    }

    if (
      !isGeneratedOrContextPath(path, taskScopeHints.contextFiles) &&
      !isGleipGeneratedFile(path) &&
      isPlausibleDeclaredPath(path, repoContext.knownPaths)
    ) {
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

function documentationOnlyScope(taskScopeHints: TaskScopeHints): string[] {
  const explicitTargets = [
    ...taskScopeHints.explicitEditTargets,
    ...taskScopeHints.explicitOnlyTargets
  ].filter(isNonExecutableDocumentationPath);
  const targets =
    explicitTargets.length > 0
      ? explicitTargets
      : taskScopeHints.declaredPaths.filter(isNonExecutableDocumentationPath);

  return dedupe(targets)
    .filter((path) => path !== ".")
    .sort(comparePaths);
}

function buildExplicitScope(taskScopeHints: TaskScopeHints): string[] {
  const paths = new Set<string>([
    ...taskScopeHints.explicitEditTargets,
    ...taskScopeHints.explicitOnlyTargets,
    ...taskScopeHints.explicitOutputTargets,
    ...taskScopeHints.declaredPaths
  ]);

  return [...paths].filter((path) => path !== ".").sort(comparePaths);
}

function inferTaskBreadth(
  task: string,
  classification: TaskClassification,
  taskScopeHints: TaskScopeHints
): TaskBreadth {
  const normalizedTask = task.toLowerCase();

  if (
    /\b(?:repository-wide|repo-wide|entire repository|whole repository|all files|every file|platform-wide|across the repository)\b/iu.test(
      task
    )
  ) {
    return "repository_wide";
  }

  if (
    taskScopeHints.hasBroadScopeSignal ||
    /\b(?:all|every)\b[^.\n]{0,80}\b(?:routes?|surfaces?|consumers?|callers?|usages?|packages?|modules?|features?)\b/iu.test(
      task
    ) ||
    /\b(?:shared|reusable|cross-cutting|cross cutting|architecture|migration)\b/iu.test(task)
  ) {
    return "cross_cutting";
  }

  if (
    classification.taskType === "migration" ||
    taskScopeHints.declaredScopeLabels.length >= 3 ||
    taskScopeHints.explicitEditTargets.length >= 4
  ) {
    return "subsystem";
  }

  if (
    taskScopeHints.declaredScopeLabels.length > 0 ||
    taskScopeHints.explicitEditTargets.length > 1 ||
    /\b(?:feature|route|flow|subsystem|module)\b/iu.test(normalizedTask)
  ) {
    return "feature";
  }

  return "local";
}

function deriveWorkflowProfile(
  classification: TaskClassification,
  taskBreadth: TaskBreadth,
  taskScopeHints: TaskScopeHints
): WorkflowProfile {
  if (
    ["dependency_upgrade", "migration", "auth_security_change", "infra_ci_change"].includes(
      classification.taskType
    ) ||
    taskScopeHints.declaredScopeLabels.some((label) =>
      ["ci", "config", "package_metadata"].includes(label)
    ) ||
    taskScopeHints.explicitEditTargets.some(isSensitiveEditablePath) ||
    taskScopeHints.explicitOnlyTargets.some(isSensitiveEditablePath)
  ) {
    return "sensitive_change";
  }

  const explicitEditableTargets = [
    ...taskScopeHints.explicitEditTargets,
    ...taskScopeHints.explicitOnlyTargets
  ];
  const editableTargets =
    explicitEditableTargets.length > 0 ? explicitEditableTargets : taskScopeHints.declaredPaths;

  if (
    (classification.workflowProfile === "documentation_only" ||
      classification.taskType === "documentation_update") &&
    editableTargets.length > 0 &&
    editableTargets.every(isNonExecutableDocumentationPath)
  ) {
    return "documentation_only";
  }

  if (isBroadTaskBreadth(taskBreadth)) {
    return "broad_change";
  }

  return "local_behavior_change";
}

function isSensitiveEditablePath(path: string): boolean {
  const normalized = normalizePath(path);
  const fileName = basename(normalized);

  return (
    isCiFile(normalized) ||
    isDependencyFile(normalized) ||
    lockfileNames.has(fileName) ||
    isSecretPath(normalized) ||
    /(^|\/)(auth|security|payments?|migrations?|infra|infrastructure)(\/|\.|$)/iu.test(
      normalized
    ) ||
    broadConfigFileNames.has(fileName) ||
    /(?:^|[.-])config\.(?:js|cjs|mjs|ts|json|yml|yaml|toml)$/iu.test(fileName)
  );
}

function isNonExecutableDocumentationPath(path: string): boolean {
  const normalized = normalizePath(path);
  const fileName = basename(normalized).toLowerCase();

  if (isSensitiveEditablePath(normalized)) {
    return false;
  }

  if (["agents.md", "claude.md", "gemini.md", "codeowners"].includes(fileName)) {
    return false;
  }

  return (
    normalized.toLowerCase().startsWith("docs/") ||
    ["readme.md", "changelog.md", "full_context.md", "project_context.md", "notes.md"].includes(
      fileName
    )
  );
}

function buildSuspiciousPaths(repoContext: RepoContext, taskScopeHints: TaskScopeHints): string[] {
  return dedupe([
    ...repoContext.riskyMatchedPaths,
    ...findDangerousPaths(repoContext),
    ...taskScopeHints.explicitEditTargets.filter(isExcludedRepositoryPath)
  ]).sort(comparePaths);
}

function expectedFileRange(defaults: NumberRange, taskScopeHints: TaskScopeHints): NumberRange {
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
    max: Math.max(defaults.max, breadthUnits * 3 + (taskScopeHints.hasBroadScopeSignal ? 2 : 0))
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
    taskScopeHints.explicitEditTargets.length + taskScopeHints.explicitOutputTargets.length
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
    approval.add("approval_required_changes");
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
    `Pause and clarify if more than ${softLimits.maxFilesChanged} files are needed without declared breadth.`,
    "Pause and clarify if tests would be skipped, deleted, or weakened.",
    "Add a scope rationale if the task expands beyond the expected paths."
  ];

  if (!ciChangesAllowed) {
    conditions.push("Request approval if implementation requires changing CI configuration.");
  }

  if (!newDependenciesAllowed) {
    conditions.push("Request approval if a new dependency seems necessary.");
  }

  if (!["auth_security_change", "infra_ci_change", "migration"].includes(classification.taskType)) {
    conditions.push(
      "Request approval for auth, payments, infra, or migration changes; remove secrets from the change set."
    );
  } else {
    conditions.push("Remove secrets from the change set and verify they are ignored.");
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
  } else if (taskScopeHints.declaredScopeLabels.length > 0 || taskScopeHints.hasBroadScopeSignal) {
    reasons.push(
      `Declared task breadth includes ${taskScopeHints.declaredScopeLabels.length} named scope area(s).`
    );
  }

  if (allowedPaths.length > 0) {
    reasons.push(
      `Expected paths seeded from ${allowedPaths.length} likely relevant paths/directories.`
    );
  }

  if (input.repoContext.likelyTestFiles.length > 0) {
    reasons.push(
      `Repo context found ${input.repoContext.likelyTestFiles.length} likely test files.`
    );
  }

  if (blockedWithoutApproval.length > 0) {
    reasons.push(`Approval-required changes: ${blockedWithoutApproval.length} categories.`);
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
    return "- No precise expected paths were identified. Keep changes aligned with the task and explain necessary expansion.";
  }

  return formatStringListForBrief(paths, 8);
}

function formatApprovalRequired(values: string[]): string {
  if (values.length === 0) {
    return "- None beyond default protected checks.";
  }

  return formatStringListForBrief(values, 8);
}

function formatDependencyGate(scopeBudget: ScopeBudget): string {
  return scopeBudget.hardGates.newDependenciesAllowed
    ? "Dependencies may be changed only when directly required by the task and justified."
    : "New dependencies require approval unless explicitly requested.";
}

function formatCiGate(scopeBudget: ScopeBudget): string {
  return scopeBudget.hardGates.ciChangesAllowed
    ? "CI changes are allowed only within the task scope."
    : "CI changes require approval unless explicitly requested.";
}

function formatRequiredTests(scopeBudget: ScopeBudget): string {
  if (!scopeBudget.requiredTests) {
    return "- Use proportionate verification; manual review may be enough for docs-only or non-behavioral changes.";
  }

  return [
    "- Run focused verification appropriate to the change. Existing tests, smoke tests, typecheck, compile checks, CLI dry runs, or manual verification may satisfy this.",
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
    return (
      normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`)
    );
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
    /\b(and|plus|with)\b\s+\b(add|create|implement|enable|support|fix|refactor|update)\b/i.test(
      task
    );
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

function isDocumentationOnlyTask(task: string): boolean {
  const hasDocSignal =
    /\b(?:docs?|documentation|readme|changelog|guide|markdown|context)\b/iu.test(task) ||
    /\.md\b/iu.test(task);
  const hasSensitiveSignal =
    /\b(?:dependency|dependencies|package metadata|package version|ci|workflow|pipeline|auth|security|payment|migration|schema|infrastructure|config)\b/iu.test(
      task
    );
  const hasCodeSignal =
    /\b(?:implement|fix|refactor|runtime|behavior|behaviour|logic|api|endpoint|source|tests?|compile|typecheck)\b/iu.test(
      task
    );

  if (!hasDocSignal || hasSensitiveSignal) {
    return false;
  }

  return (
    !hasCodeSignal ||
    /\b(?:document|describe|clarify)\b[^.\n]{0,80}\b(?:runtime|behavior|behaviour|logic)\b/iu.test(
      task
    )
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
    likelyAllowsNewDependencies: rule.likelyAllowsNewDependencies,
    workflowProfile: workflowProfileForTaskType(rule.taskType, task)
  };
}

function classifyComposedLocalBehaviorTask(task: string): TaskClassification | undefined {
  const actionSignals = findMatches(
    [
      /\bsurgical(?:ly)?\b/iu,
      /\b(?:adjust|change|correct|fix|improve|optimi[sz]e|repair|update|tune)\b/iu
    ],
    task
  );
  const behaviorSignals = findMatches(
    [
      /\b(?:runtime|behavior|behaviour|logic|calculation|handling|parser|resolver|engine|label(?:ing)?|stop|gap|compounding)\b/iu
    ],
    task
  );
  const targetSignals = findMatches(
    [
      /\b(?:module|file|function|component|service|runtime|implementation|source)\b/iu,
      /\b[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*\b/u
    ],
    task
  );

  if (actionSignals.length === 0 || behaviorSignals.length === 0 || targetSignals.length === 0) {
    return undefined;
  }

  return {
    taskType: "local_behavior_change",
    confidence:
      actionSignals.length + behaviorSignals.length + targetSignals.length >= 4 ? "high" : "medium",
    riskLevel: "medium",
    reasons: [
      `Matched behavior-change action signal "${actionSignals[0]}".`,
      `Matched implementation-behavior signal "${behaviorSignals[0]}".`,
      `Matched target signal "${targetSignals[0]}".`
    ],
    likelyRequiresTests: true,
    likelyAllowsNewDependencies: false,
    workflowProfile: "local_behavior_change"
  };
}

function workflowProfileForTaskType(taskType: TaskType, task: string): WorkflowProfile {
  if (
    ["dependency_upgrade", "migration", "auth_security_change", "infra_ci_change"].includes(
      taskType
    )
  ) {
    return "sensitive_change";
  }

  if (taskType === "documentation_update" || taskType === "copy_change") {
    return "documentation_only";
  }

  if (
    /\b(?:spanning|across|repository-wide|repo-wide|multiple|several|cross-cutting|cross cutting)\b/iu.test(
      task
    )
  ) {
    return "broad_change";
  }

  return "local_behavior_change";
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
    likelyAllowsNewDependencies: false,
    workflowProfile: "local_behavior_change"
  };
}
