import type { FindingCode, FindingSeverity } from "@gleip/core/findings";
import { isEphemeralGleipArtifactPath } from "@gleip/core";

export const packageName = "@gleip/controller";

export {
  clampScore,
  estimateTokens,
  generateSessionReport,
  renderSessionReportMarkdown
} from "./report.js";
export type {
  EfficiencyBasis,
  EfficiencySource,
  GenerateSessionReportInput,
  ReportConfidence,
  ReportDiff,
  ReportDriftFinding,
  ReportDriftResult,
  ReportPlanValidation,
  ReportRequirementCompletion,
  ReportRequirementCompletionItem,
  ReportRequirementLedger,
  ReportRequirementLedgerItem,
  ReportRequirementObligation,
  ReportRequirementStatus,
  ReportRiskLevel,
  ReportScopeBudget,
  ReportWarning,
  ReportWarningSeverity,
  ReportWarningType,
  SessionReport,
  TestIntegrity
} from "./report.js";

export type DriftStatus =
  | "clean"
  | "advisory"
  | "needs_attention"
  | "needs_cleanup"
  | "needs_approval";

export type DriftSeverity = FindingSeverity;

export interface DriftFinding {
  code: FindingCode;
  severity: DriftSeverity;
  title: string;
  message: string;
  file?: string;
  count?: number;
  examples?: string[];
  targetClassifications?: ScopeTargetClassification[];
  recommendation?: string;
  category: string;
}

export interface ScopeTargetClassification {
  target: string;
  classification: "direct" | "derived" | "adjacent" | "unexplained";
  reason: string;
  evidence: string;
  nextAction?: string;
}

export interface DriftResult {
  status: DriftStatus;
  findings: DriftFinding[];
  metrics: {
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
  };
  summary: string;
}

export interface DetectScopeDriftInput {
  scopeBudget: ScopeBudgetLike;
  gitDiffContext: GitDiffContextLike;
  config?: unknown;
  /**
   * The canonical requirement ledger, when one exists. Prohibitions are checked against the
   * changed files directly, so a forbidden file is reported even when it also falls inside
   * expected scope.
   */
  requirementLedger?: RequirementLedgerLike;
}

export interface RequirementLedgerLike {
  requirements: Array<{
    id: string;
    sourceText: string;
    obligation: string;
    status: string;
    explicit?: boolean;
    relatedPaths?: string[];
  }>;
}

export interface ScopeBudgetLike {
  taskBreadth?: "local" | "feature" | "subsystem" | "cross_cutting" | "repository_wide";
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
  expectedPaths?: string[];
  explicitScope?: string[];
  derivedScope?: string[];
  approvalRequiredFor: string[];
  blockedWithoutApproval: string[];
  approvalRequiredChanges?: string[];
  contextDocsTouchAllowed?: boolean;
  readOnlyContextPaths?: string[];
}

export interface GitDiffContextLike {
  changedFiles: string[];
  fileStats: Array<{
    path: string;
    added: number;
    deleted: number;
    isDeleted?: boolean;
  }>;
  rawDiff: string;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  isGitRepo?: boolean;
  hasChanges?: boolean;
  trackedLocalArtifacts?: string[];
  error?: string;
}

const DEPENDENCY_FILES = new Set([
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

const LOCKFILES = new Set([
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

/**
 * Substring matching read a `process.exit` call as the skipped-test `xit` marker, so any added
 * line calling `process.exit` was reported as "the diff adds a skipped or pending test" -- an
 * action-required finding on ordinary Node code. Each marker must start its own identifier.
 */
const SKIPPED_TEST_PATTERNS = [
  /(?<![\w$.])test\.skip\b/u,
  /(?<![\w$.])it\.skip\b/u,
  /(?<![\w$.])describe\.skip\b/u,
  /(?<![\w$.])xit\s*\(/u,
  /(?<![\w$.])xtest\s*\(/u,
  /(?<![\w$.])pending\s*\(/u
];

export function detectScopeDrift(input: DetectScopeDriftInput): DriftResult {
  const changedFiles = input.gitDiffContext.changedFiles
    .map(normalizePath)
    .filter((path) => !isEphemeralGleipArtifactPath(path))
    .sort();
  const changedFileSet = new Set(changedFiles);
  const fileStats = input.gitDiffContext.fileStats
    .map((stat) => ({
      ...stat,
      path: normalizePath(stat.path)
    }))
    .filter((stat) => changedFileSet.has(stat.path));
  const metrics = {
    filesChanged: changedFiles.length,
    linesAdded: fileStats.reduce((total, stat) => total + stat.added, 0),
    linesDeleted: fileStats.reduce((total, stat) => total + stat.deleted, 0)
  };
  const findings: DriftFinding[] = [];

  if (input.gitDiffContext.isGitRepo === false) {
    findings.push({
      code: "GIT_UNAVAILABLE",
      severity: "warn",
      title: "Git repository unavailable",
      message: input.gitDiffContext.error ?? "Gleip could not inspect the working tree.",
      recommendation: "Run status from inside a git repository before final response.",
      category: "git"
    });
  }

  addLocalArtifactFindings(findings, input.gitDiffContext.trackedLocalArtifacts ?? []);

  if (changedFiles.length === 0) {
    const normalizedFindings = normalizeDriftFindings(findings);
    const status = aggregateStatus(normalizedFindings);

    return {
      status,
      findings: normalizedFindings,
      metrics,
      summary:
        normalizedFindings.length === 0
          ? "No working tree changes detected."
          : summaryForStatus(status, 0)
    };
  }

  addSecretFindings(findings, changedFiles, input.scopeBudget);
  addSkippedTestFindings(findings, input.gitDiffContext.rawDiff, input.scopeBudget);
  addDeletedTestFindings(findings, fileStats, input.scopeBudget);
  addDependencyFindings(findings, changedFiles, input.gitDiffContext.rawDiff, input.scopeBudget);
  addCiFindings(findings, changedFiles, input.scopeBudget);
  addOutsideScopeFindings(findings, changedFiles, fileStats, input.scopeBudget);
  addApprovalPathFindings(findings, changedFiles, input.scopeBudget);
  addBlockedPathFindings(findings, changedFiles, input.scopeBudget);
  addProhibitedPathFindings(findings, changedFiles, input.scopeBudget, input.requirementLedger);

  const normalizedFindings = normalizeDriftFindings(findings);
  const status = aggregateStatus(normalizedFindings);

  return {
    status,
    findings: normalizedFindings,
    metrics,
    summary: summaryForStatus(status, changedFiles.length)
  };
}

export function normalizeDriftFindings(findings: DriftFinding[]): DriftFinding[] {
  const groups = new Map<string, DriftFinding[]>();

  for (const finding of findings) {
    const key = `${finding.category}:${finding.title}`;
    const group = groups.get(key) ?? [];
    group.push(finding);
    groups.set(key, group);
  }

  return Array.from(groups.values()).map(normalizeFindingGroup).sort(compareFindings);
}

export function deriveNextAction(
  input:
    | DriftStatus
    | "within_scope"
    | "warning"
    | "approval_required"
    | "blocked"
    | Array<{ code?: string }>
): string {
  if (Array.isArray(input)) {
    return nextActionForFindings(input);
  }

  if (input === "needs_cleanup") {
    return "Complete the requested cleanup, then rerun status.";
  }

  if (input === "needs_approval") {
    return "Request approval for the identified changes or remove them from the change set.";
  }

  if (input === "needs_attention") {
    return "Address the action-required findings or provide explicit user-approved rationale.";
  }

  if (input === "advisory") {
    return "Review the advisory findings and add scope rationale where the task expands.";
  }

  if (input === "blocked") {
    return "Address the action-required findings, then rerun status.";
  }

  if (input === "approval_required") {
    return "Request approval for the identified changes or remove them from the change set.";
  }

  if (input === "warning") {
    return "Review the advisory findings and add scope rationale where the task expands.";
  }

  return "Continue with focused verification before finalizing.";
}

function addDependencyFindings(
  findings: DriftFinding[],
  changedFiles: string[],
  rawDiff: string,
  scopeBudget: ScopeBudgetLike
): void {
  if (scopeBudget.hardGates.newDependenciesAllowed) {
    return;
  }

  const dependencyFiles = changedFiles.filter(
    (path) =>
      isDependencyFile(path) &&
      !isLockfile(path) &&
      (scopeBudget.hardGates.dependencyMetadataChangesAllowed !== true ||
        diffShowsDependencyAddition(rawDiff, path))
  );

  if (dependencyFiles.length > 0) {
    findings.push({
      code: "DEPENDENCY_FILE_CHANGED",
      severity: "approval_required",
      title: "Dependency files changed",
      message: `${formatExamples(dependencyFiles)} changed and require approval under the current guidance.`,
      count: dependencyFiles.length,
      examples: dependencyFiles.slice(0, 3),
      recommendation: "Request approval for the dependency or metadata change, or remove it.",
      category: "dependencies"
    });
  }

  const lockfiles = changedFiles.filter(isLockfile);

  if (lockfiles.length > 0) {
    findings.push({
      code: "LOCKFILE_CHANGED",
      severity: "approval_required",
      title: "Lockfile changed",
      message: `${formatExamples(lockfiles)} changed and require approval under the current guidance.`,
      count: lockfiles.length,
      examples: lockfiles.slice(0, 3),
      recommendation: "Review the lockfile change and confirm it is required by the task.",
      category: "dependencies"
    });
  }
}

function diffShowsDependencyAddition(rawDiff: string, path: string): boolean {
  const normalizedPath = normalizePath(path);
  const fileName = normalizedPath.split("/").at(-1) ?? "";
  const section = rawDiffSectionForPath(rawDiff, normalizedPath);

  if (section.length === 0) {
    return false;
  }

  const addedLines = section
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));

  if (fileName === "requirements.txt") {
    return addedLines.some((line) => line.trim().length > 0 && !line.trimStart().startsWith("#"));
  }

  const dependencyContext =
    /\b(?:dependencies|devDependencies|peerDependencies|optionalDependencies|project\.dependencies|install_requires|requires-dist)\b/iu.test(
      section
    );

  return (
    dependencyContext &&
    addedLines.some(
      (line) =>
        /["'][@a-z0-9_.-]+["']\s*[:=]/iu.test(line) ||
        /^\s*[@a-z0-9_.-]+(?:\[[^\]]+\])?\s*(?:[<>=~!]|$)/iu.test(line)
    )
  );
}

function rawDiffSectionForPath(rawDiff: string, path: string): string {
  const sections = rawDiff.split(/(?=^diff --git )/gmu);

  return (
    sections.find((section) => {
      const header = section.split(/\r?\n/u)[0] ?? "";
      return header.includes(` a/${path} b/${path}`);
    }) ?? ""
  );
}

function addCiFindings(
  findings: DriftFinding[],
  changedFiles: string[],
  scopeBudget: ScopeBudgetLike
): void {
  if (scopeBudget.hardGates.ciChangesAllowed) {
    return;
  }

  const ciFiles = changedFiles.filter(isCiFile);

  if (ciFiles.length > 0) {
    findings.push({
      code: "CI_FILE_CHANGED",
      severity: "approval_required",
      title: "CI configuration changed",
      message: `${formatExamples(ciFiles)} changed and require approval under the current guidance.`,
      count: ciFiles.length,
      examples: ciFiles.slice(0, 3),
      recommendation: "Add a scope rationale or approval for the CI change, or remove it.",
      category: "ci"
    });
  }
}

function addOutsideScopeFindings(
  findings: DriftFinding[],
  changedFiles: string[],
  fileStats: GitDiffContextLike["fileStats"],
  scopeBudget: ScopeBudgetLike
): void {
  const expectedPaths = scopeBudget.expectedPaths ?? scopeBudget.allowedPaths;
  const statsByPath = new Map(fileStats.map((stat) => [stat.path, stat]));

  if (expectedPaths.length === 0) {
    return;
  }

  const outsideFiles = changedFiles.filter(
    (path) =>
      !isAllowedPath(path, expectedPaths) &&
      !hasSpecificHardGateFinding(path) &&
      !isAcceptedContextDocsTouch(path, statsByPath.get(path), scopeBudget)
  );

  if (outsideFiles.length === 0) {
    return;
  }

  const targetClassifications = outsideFiles.map((path) =>
    classifyChangedTarget(path, scopeBudget)
  );

  findings.push({
    code: "SCOPE_EXPANSION_WARN",
    severity: "warn",
    title: "Files outside expected scope",
    message: formatScopeTargetSummary(targetClassifications),
    count: outsideFiles.length,
    examples: outsideFiles,
    targetClassifications,
    recommendation: "Add rationale for adjacent targets and remove or justify unexplained targets.",
    category: "allowed_scope"
  });
}

function addApprovalPathFindings(
  findings: DriftFinding[],
  changedFiles: string[],
  scopeBudget: ScopeBudgetLike
): void {
  const matched = changedFiles.filter(
    (path) =>
      !hasSpecificHardGateFinding(path) &&
      matchesAnyBudgetEntry(path, scopeBudget.approvalRequiredFor)
  );

  if (matched.length > 0) {
    findings.push({
      code: "APPROVAL_REQUIRED_PATH_CHANGED",
      severity: "approval_required",
      title: "Approval-required paths changed",
      message: `${formatExamples(matched)} matched approval-required scope.`,
      count: matched.length,
      examples: matched.slice(0, 3),
      recommendation: "Request approval for these paths or remove them from the change set.",
      category: "approval_required_path"
    });
  }
}

/**
 * Report changes to files the task forbade.
 *
 * This runs independently of expected scope on purpose. `readOnlyContextPaths` was previously
 * consulted only for context *documents*, so a read-only source file carried no protection at
 * all; and once prose-driven scope inflation had pulled the file's directory into
 * `expectedPaths`, the outside-scope check never saw it either. A file named in an explicit
 * prohibition was therefore changed, `check` said "advisory", and `finalize` said "complete".
 *
 * A prohibition the user wrote themselves binds (`action_required`). One Gleip merely inferred
 * stays advisory -- Gleip enforces the user's stated rule, never its own guess.
 */
function addProhibitedPathFindings(
  findings: DriftFinding[],
  changedFiles: string[],
  scopeBudget: ScopeBudgetLike,
  requirementLedger: RequirementLedgerLike | undefined
): void {
  const prohibitions = (requirementLedger?.requirements ?? []).filter(
    (requirement) => requirement.obligation === "prohibited" && requirement.status === "active"
  );
  const violations = new Map<string, { requirementId: string; sourceText: string }>();

  for (const requirement of prohibitions) {
    for (const declaredPath of requirement.relatedPaths ?? []) {
      const normalized = normalizePath(declaredPath);

      for (const changed of changedFiles) {
        if (changed === normalized || changed.startsWith(`${normalized}/`)) {
          violations.set(changed, {
            requirementId: requirement.id,
            sourceText: requirement.sourceText
          });
        }
      }
    }
  }

  if (violations.size > 0) {
    const files = [...violations.keys()].sort();

    findings.push({
      code: "CANONICAL_PROHIBITION_CONFLICT",
      severity: "action_required",
      title: "Prohibited path changed",
      message: `${formatExamples(files)} ${files.length === 1 ? "is" : "are"} named by a prohibition in the task: ${files
        .map((file) => `${violations.get(file)?.requirementId}: ${violations.get(file)?.sourceText}`)
        .slice(0, 2)
        .join("; ")}`,
      count: files.length,
      examples: files.slice(0, 3),
      recommendation:
        "Revert the change to the prohibited path, or record an approval that names the requirement being overridden.",
      category: "prohibited_path"
    });
  }

  // Read-only context that no explicit prohibition covers: advisory, since the read-only marking
  // is inferred from phrasing rather than stated as a rule.
  const readOnlyTouched = changedFiles.filter(
    (path) =>
      !violations.has(path) &&
      (scopeBudget.readOnlyContextPaths ?? []).some(
        (contextPath) => normalizePath(contextPath) === path
      )
  );

  if (readOnlyTouched.length > 0) {
    findings.push({
      code: "SCOPE_EXPANSION_WARN",
      severity: "warn",
      title: "Read-only context changed",
      message: `${formatExamples(readOnlyTouched)} were treated as read-only context for this task.`,
      count: readOnlyTouched.length,
      examples: readOnlyTouched.slice(0, 3),
      recommendation:
        "Confirm the task intends these files to change, or revert them and keep them as context.",
      category: "read_only_context"
    });
  }
}

function addBlockedPathFindings(
  findings: DriftFinding[],
  changedFiles: string[],
  scopeBudget: ScopeBudgetLike
): void {
  const matched = changedFiles.filter(
    (path) =>
      !hasSpecificHardGateFinding(path) &&
      matchesAnyBudgetEntry(
        path,
        scopeBudget.approvalRequiredChanges ?? scopeBudget.blockedWithoutApproval
      )
  );

  if (matched.length > 0) {
    findings.push({
      code: "BLOCKED_PATH_CHANGED",
      severity: "approval_required",
      title: "Approval-required paths changed",
      message: `${formatExamples(matched)} matched paths or categories that require approval.`,
      count: matched.length,
      examples: matched.slice(0, 3),
      recommendation: "Request approval for these paths or remove them from the change set.",
      category: "approval_required_change"
    });
  }
}

function addSkippedTestFindings(
  findings: DriftFinding[],
  rawDiff: string,
  scopeBudget: ScopeBudgetLike
): void {
  if (scopeBudget.hardGates.skippedTestsAllowed) {
    return;
  }

  const hasSkippedTest = rawDiff.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();

    return (
      trimmed.startsWith("+") &&
      !trimmed.startsWith("+++") &&
      SKIPPED_TEST_PATTERNS.some((pattern) => pattern.test(trimmed))
    );
  });

  if (hasSkippedTest) {
    findings.push({
      code: "TEST_SKIPPED",
      severity: "action_required",
      title: "Skipped test added",
      message: "The diff adds a skipped or pending test.",
      recommendation: "Restore the skipped test or provide explicit user-approved rationale.",
      category: "tests"
    });
  }
}

function addDeletedTestFindings(
  findings: DriftFinding[],
  fileStats: GitDiffContextLike["fileStats"],
  scopeBudget: ScopeBudgetLike
): void {
  if (scopeBudget.hardGates.deletedTestsAllowed) {
    return;
  }

  const deletedTests = fileStats.filter((stat) => stat.isDeleted === true && isTestFile(stat.path));

  if (deletedTests.length > 0) {
    findings.push({
      code: "TEST_DELETED",
      severity: "action_required",
      title: "Test file deleted",
      message: `${formatExamples(deletedTests.map((stat) => stat.path))} deleted.`,
      count: deletedTests.length,
      examples: deletedTests.map((stat) => stat.path).slice(0, 3),
      recommendation: "Restore deleted tests or provide explicit user-approved rationale.",
      category: "tests"
    });
  }

  const largeTestDeletions = fileStats.filter(
    (stat) => stat.isDeleted !== true && isTestFile(stat.path) && stat.deleted > 40
  );

  if (largeTestDeletions.length > 0) {
    findings.push({
      code: "TEST_WEAKENED",
      severity: "action_required",
      title: "Large test deletion",
      message: `${formatExamples(largeTestDeletions.map((stat) => stat.path))} removed many test lines.`,
      count: largeTestDeletions.length,
      examples: largeTestDeletions.map((stat) => stat.path).slice(0, 3),
      recommendation: "Confirm test coverage is preserved before continuing.",
      category: "tests"
    });
  }
}

function addSecretFindings(
  findings: DriftFinding[],
  changedFiles: string[],
  scopeBudget: ScopeBudgetLike
): void {
  if (scopeBudget.hardGates.secretsAllowed) {
    return;
  }

  const secretFiles = changedFiles.filter(isSecretFile);

  if (secretFiles.length > 0) {
    findings.push({
      code: "SECRET_FILE_CHANGED",
      severity: "cleanup_required",
      title: "Secret or env file changed",
      message: `${formatExamples(secretFiles)} changed.`,
      count: secretFiles.length,
      examples: secretFiles.slice(0, 3),
      recommendation: "Remove the secret or env file from the change set and verify it is ignored.",
      category: "secrets"
    });
  }
}

function addLocalArtifactFindings(findings: DriftFinding[], trackedLocalArtifacts: string[]): void {
  const artifacts = trackedLocalArtifacts.map(normalizePath).filter(isLocalArtifact);

  if (artifacts.length === 0) {
    return;
  }

  findings.push({
    code: "LOCAL_ARTIFACT_INCLUDED",
    severity: "cleanup_required",
    title: "Local Gleip artifact included",
    message: `${formatExamples(artifacts)} are tracked by git.`,
    count: artifacts.length,
    examples: artifacts.slice(0, 3),
    recommendation:
      "Remove .gleip session artifacts from version control and keep .gleip/ ignored.",
    category: "local_artifacts"
  });
}

function normalizeFindingGroup(findings: DriftFinding[]): DriftFinding {
  const first = findings[0];

  if (first === undefined) {
    return {
      code: "GIT_UNAVAILABLE",
      severity: "info",
      title: "No finding",
      message: "No finding.",
      category: "unknown"
    };
  }

  const severity = highestSeverity(findings.map((finding) => finding.severity));
  const examples = Array.from(
    new Set(
      findings.flatMap((finding) => {
        if (finding.examples !== undefined) {
          return finding.examples;
        }

        return finding.file === undefined ? [] : [finding.file];
      })
    )
  );
  const targetClassifications = findings.flatMap((finding) => finding.targetClassifications ?? []);
  const count = findings.reduce((total, finding) => total + (finding.count ?? 1), 0);
  const message =
    targetClassifications.length > 0
      ? formatScopeTargetSummary(targetClassifications)
      : groupedMessage(first, count, examples.slice(0, 3));
  const recommendation = findings.find(
    (finding) => finding.recommendation !== undefined
  )?.recommendation;

  return recommendation === undefined
    ? {
        severity,
        code: first.code,
        title: first.title,
        message,
        count,
        category: first.category,
        examples: examples.slice(0, 3),
        ...(targetClassifications.length === 0 ? {} : { targetClassifications })
      }
    : {
        severity,
        code: first.code,
        title: first.title,
        message,
        count,
        recommendation,
        category: first.category,
        examples: examples.slice(0, 3),
        ...(targetClassifications.length === 0 ? {} : { targetClassifications })
      };
}

function groupedMessage(finding: DriftFinding, count: number, examples: string[]): string {
  const exampleText = examples.length === 0 ? "" : ` Examples: ${examples.join(", ")}.`;

  if (finding.category === "allowed_scope") {
    return `${count === 1 ? "1 file" : `${count} files`} changed outside the expected scope.${exampleText}`;
  }

  if (finding.category === "dependencies") {
    const label = finding.code === "LOCKFILE_CHANGED" ? "lockfile" : "dependency file";
    return `${count === 1 ? `1 ${label}` : `${count} ${label}s`} changed and requires approval.${exampleText}`;
  }

  if (finding.category === "ci") {
    return `${count === 1 ? "1 CI file" : `${count} CI files`} changed and requires approval.${exampleText}`;
  }

  if (finding.category === "tests") {
    return `${count === 1 ? finding.message : `${count} test-related issues detected.`}${exampleText}`;
  }

  if (finding.category === "secrets") {
    return `${count === 1 ? "1 secret or env file" : `${count} secret or env files`} changed.${exampleText}`;
  }

  if (count > 1) {
    return `${count} related findings detected.${exampleText}`;
  }

  return `${finding.message}${exampleText}`;
}

function aggregateStatus(findings: DriftFinding[]): DriftStatus {
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
    return "needs_attention";
  }

  if (findings.some((finding) => finding.severity === "warn")) {
    return "advisory";
  }

  return "clean";
}

function summaryForStatus(status: DriftStatus, filesChanged: number): string {
  if (status === "clean") {
    return `${filesChanged} changed file(s) align with the active guidance.`;
  }

  if (status === "advisory") {
    return `${filesChanged} changed file(s) include advisory scope findings.`;
  }

  if (status === "needs_approval") {
    return `${filesChanged} changed file(s) include approval-required scope.`;
  }

  if (status === "needs_cleanup") {
    return `${filesChanged} changed file(s) require cleanup before finalizing.`;
  }

  return `${filesChanged} changed file(s) require attention before finalizing.`;
}

function classifyChangedTarget(
  path: string,
  scopeBudget: ScopeBudgetLike
): ScopeTargetClassification {
  const normalizedPath = normalizePath(path);
  const explicitScope = scopeBudget.explicitScope ?? [];
  const derivedScope = scopeBudget.derivedScope ?? [];

  if (explicitScope.length > 0 && isAllowedPath(normalizedPath, explicitScope)) {
    return {
      target: normalizedPath,
      classification: "direct",
      reason: "Changed file matches explicit task scope.",
      evidence: matchingScopeEvidence(normalizedPath, explicitScope) ?? "explicit scope"
    };
  }

  if (derivedScope.length > 0 && isAllowedPath(normalizedPath, derivedScope)) {
    return {
      target: normalizedPath,
      classification: "derived",
      reason: "Changed file matches derived repository scope.",
      evidence: matchingScopeEvidence(normalizedPath, derivedScope) ?? "derived scope"
    };
  }

  const nearbyEvidence = nearbyScopeEvidence(normalizedPath, scopeBudget);

  if (
    isBroadTaskBreadth(scopeBudget.taskBreadth) &&
    isOrdinaryImplementationPath(normalizedPath) &&
    nearbyEvidence !== undefined
  ) {
    return {
      target: normalizedPath,
      classification: "adjacent",
      reason:
        "Changed file is plausible for the declared broad task, but final diff evidence does not prove the relationship.",
      evidence: nearbyEvidence,
      nextAction: "Confirm the file was covered by the validated plan or add rationale."
    };
  }

  return {
    target: normalizedPath,
    classification: "unexplained",
    reason: "No relationship to the active scope budget was found in final diff evidence.",
    evidence: "actual changed file",
    nextAction: "Remove the change or provide explicit user-approved rationale."
  };
}

function formatScopeTargetSummary(targets: ScopeTargetClassification[]): string {
  const adjacent = targets.filter((target) => target.classification === "adjacent");
  const unexplained = targets.filter((target) => target.classification === "unexplained");
  const groups = [
    adjacent.length === 0 ? "" : `${adjacent.length} adjacent`,
    unexplained.length === 0 ? "" : `${unexplained.length} unexplained`
  ].filter((value) => value.length > 0);
  const details = targets
    .map(
      (target) =>
        `${target.target} [${target.classification}]: ${target.reason}${target.nextAction === undefined ? "" : ` Next: ${target.nextAction}`}`
    )
    .join(" ");

  return `${targets.length} changed target(s) need clarification (${groups.join(", ")}). ${details}`;
}

function matchingScopeEvidence(path: string, entries: string[]): string | undefined {
  return entries.find((entry) => isAllowedPath(path, [entry]));
}

function nearbyScopeEvidence(path: string, scopeBudget: ScopeBudgetLike): string | undefined {
  const entries = [
    ...(scopeBudget.explicitScope ?? []),
    ...(scopeBudget.derivedScope ?? []),
    ...(scopeBudget.expectedPaths ?? scopeBudget.allowedPaths)
  ].map(normalizePath);
  const pathDirectory = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

  return entries.find((entry) => {
    if (entry.includes("*")) {
      return false;
    }

    const entryDirectory = entry.includes("/") ? entry.slice(0, entry.lastIndexOf("/")) : "";

    return (
      pathDirectory.length > 0 &&
      entryDirectory.length > 0 &&
      (pathDirectory === entryDirectory ||
        pathDirectory.startsWith(`${entryDirectory}/`) ||
        entryDirectory.startsWith(`${pathDirectory}/`))
    );
  });
}

function isBroadTaskBreadth(breadth: ScopeBudgetLike["taskBreadth"]): boolean {
  return breadth === "subsystem" || breadth === "cross_cutting" || breadth === "repository_wide";
}

function isOrdinaryImplementationPath(path: string): boolean {
  return (
    isTestFile(path) ||
    /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|toml|css|scss|html|py|go|rs|java|kt|cs|rb|php|vue|svelte)$/iu.test(
      path
    )
  );
}

function isAllowedPath(path: string, allowedPaths: string[]): boolean {
  return allowedPaths.some((allowedPath) => {
    const normalizedAllowedPath = normalizePath(allowedPath).replace(/\/$/, "");

    return (
      path === normalizedAllowedPath ||
      path.startsWith(`${normalizedAllowedPath}/`) ||
      normalizedAllowedPath.startsWith(`${path}/`) ||
      matchesPathPattern(path, normalizedAllowedPath)
    );
  });
}

function matchesAnyBudgetEntry(path: string, entries: string[]): boolean {
  return entries.some((entry) => matchesBudgetEntry(path, entry));
}

function matchesBudgetEntry(path: string, entry: string): boolean {
  const normalizedPath = normalizePath(path).toLowerCase();
  const normalizedEntry = normalizePath(entry).toLowerCase();
  const extractedPattern = extractPathPattern(normalizedEntry);

  if (normalizedEntry.includes(normalizedPath)) {
    return true;
  }

  if (normalizedEntry.includes("dependency") && isDependencyFile(normalizedPath)) {
    return true;
  }

  if (normalizedEntry.includes("ci") && isCiFile(normalizedPath)) {
    return true;
  }

  if (
    (normalizedEntry.includes("secret") || normalizedEntry.includes(".env")) &&
    isSecretFile(normalizedPath)
  ) {
    return true;
  }

  return matchesPathPattern(normalizedPath, extractedPattern);
}

function extractPathPattern(entry: string): string {
  const [, value] = entry.split(/:(.+)/);
  return value?.trim() ?? entry.trim();
}

function matchesPathPattern(path: string, pattern: string): boolean {
  const normalizedPattern = normalizePath(pattern).replace(/\/$/, "");

  if (normalizedPattern.length === 0) {
    return false;
  }

  if (!normalizedPattern.includes("*")) {
    return (
      path === normalizedPattern ||
      path.startsWith(`${normalizedPattern}/`) ||
      normalizedPattern.includes(path)
    );
  }

  const regex = new RegExp(
    `^${escapeRegExp(normalizedPattern)
      .replace(/\\\*\\\*/g, ".*")
      .replace(/\\\*/g, "[^/]*")}$`
  );

  return regex.test(path);
}

function isDependencyFile(path: string): boolean {
  return DEPENDENCY_FILES.has(normalizePath(path).split("/").at(-1) ?? "");
}

function isLockfile(path: string): boolean {
  return LOCKFILES.has(normalizePath(path).split("/").at(-1) ?? "");
}

function isLocalArtifact(path: string): boolean {
  return isEphemeralGleipArtifactPath(path);
}

function hasSpecificHardGateFinding(path: string): boolean {
  return isDependencyFile(path) || isCiFile(path) || isSecretFile(path);
}

function isCiFile(path: string): boolean {
  const normalized = normalizePath(path);

  return (
    normalized.startsWith(".github/workflows/") ||
    normalized === ".gitlab-ci.yml" ||
    normalized === "circle.yml" ||
    normalized.startsWith(".circleci/") ||
    normalized === "Jenkinsfile" ||
    normalized === "azure-pipelines.yml" ||
    normalized === "buildkite.yml" ||
    normalized.startsWith(".buildkite/")
  );
}

function isTestFile(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();

  return (
    normalized.includes("__tests__/") ||
    normalized.includes("/tests/") ||
    normalized.includes("/test/") ||
    /\.test\.[a-z0-9]+$/.test(normalized) ||
    /\.spec\.[a-z0-9]+$/.test(normalized)
  );
}

function isSecretFile(path: string): boolean {
  const fileName = normalizePath(path).split("/").at(-1)?.toLowerCase() ?? "";

  return (
    fileName === ".env" ||
    fileName.startsWith(".env.") ||
    fileName.includes("secret") ||
    fileName.endsWith(".pem") ||
    fileName.endsWith(".key") ||
    fileName === "id_rsa" ||
    fileName === "id_dsa" ||
    fileName === "id_ed25519"
  );
}

function formatExamples(paths: string[]): string {
  const examples = paths.slice(0, 5).join(", ");
  const extra = paths.length > 5 ? `, and ${paths.length - 5} more` : "";

  return `${examples}${extra}`;
}

function compareFindings(a: DriftFinding, b: DriftFinding): number {
  const severityDifference = severityRank(b.severity) - severityRank(a.severity);

  if (severityDifference !== 0) {
    return severityDifference;
  }

  return a.title.localeCompare(b.title);
}

function highestSeverity(severities: DriftSeverity[]): DriftSeverity {
  return severities.reduce<DriftSeverity>(
    (highest, severity) => (severityRank(severity) > severityRank(highest) ? severity : highest),
    "info"
  );
}

function severityRank(severity: DriftSeverity): number {
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

function nextActionForFindings(findings: Array<{ code?: string }>): string {
  if (findings.length === 0) {
    return "Continue with focused verification before finalizing.";
  }

  const codes = new Set(findings.map((finding) => finding.code));
  const actions: string[] = [];

  if (codes.has("LOCAL_ARTIFACT_INCLUDED")) {
    actions.push(
      "Remove .gleip session artifacts from the change set or ensure .gleip/ is ignored, then rerun status."
    );
  }

  if (codes.has("SECRET_FILE_CHANGED")) {
    actions.push("Remove the secret/env file from the change set and verify it is ignored.");
  }

  if (codes.has("TEST_SKIPPED") || codes.has("TEST_DELETED") || codes.has("TEST_WEAKENED")) {
    actions.push(
      "Restore the skipped, deleted, or weakened test or provide explicit user-approved rationale."
    );
  }

  if (codes.has("DEPENDENCY_FILE_CHANGED") || codes.has("LOCKFILE_CHANGED")) {
    actions.push(
      "Request approval for the dependency/metadata change or remove it from the change set."
    );
  }

  if (codes.has("CI_FILE_CHANGED")) {
    actions.push("Add a scope rationale or approval for the CI change, or remove it.");
  }

  if (codes.has("SCOPE_LIMIT_EXCEEDED") || codes.has("SCOPE_EXPANSION_WARN")) {
    actions.push(
      "Review whether the added scope is declared by the task. Add a scope rationale if needed."
    );
  }

  if (codes.has("APPROVAL_REQUIRED_PATH_CHANGED") || codes.has("BLOCKED_PATH_CHANGED")) {
    actions.push("Request approval for the protected change or remove it from the change set.");
  }

  return actions.length > 0
    ? actions.join(" ")
    : "Review the listed findings, address the requested action, and rerun status.";
}

function isAcceptedContextDocsTouch(
  path: string,
  fileStat: GitDiffContextLike["fileStats"][number] | undefined,
  scopeBudget: ScopeBudgetLike
): boolean {
  if (scopeBudget.contextDocsTouchAllowed !== true || !isContextDocsPath(path)) {
    return false;
  }

  if (
    (scopeBudget.readOnlyContextPaths ?? []).some(
      (contextPath) => normalizePath(contextPath) === normalizePath(path)
    )
  ) {
    return false;
  }

  return (fileStat?.added ?? 0) + (fileStat?.deleted ?? 0) <= 120;
}

function isContextDocsPath(path: string): boolean {
  const normalized = normalizePath(path);
  const fileName = normalized.split("/").at(-1)?.toLowerCase() ?? "";

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

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
