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
  ReportRiskLevel,
  ReportScopeBudget,
  ReportWarning,
  ReportWarningSeverity,
  ReportWarningType,
  SessionReport,
  TestIntegrity
} from "./report.js";

export type DriftStatus = "within_scope" | "warning" | "approval_required" | "blocked";

export type DriftSeverity = "info" | "warning" | "approval_required" | "blocked";

export interface DriftFinding {
  severity: DriftSeverity;
  title: string;
  message: string;
  file?: string;
  count?: number;
  examples?: string[];
  recommendation?: string;
  category: string;
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
}

export interface ScopeBudgetLike {
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
  approvalRequiredFor: string[];
  blockedWithoutApproval: string[];
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

const SKIPPED_TEST_PATTERNS = [
  "test.skip",
  "it.skip",
  "describe.skip",
  "xit(",
  "xtest(",
  "pending("
];

export function detectScopeDrift(input: DetectScopeDriftInput): DriftResult {
  const changedFiles = input.gitDiffContext.changedFiles.map(normalizePath).sort();
  const fileStats = input.gitDiffContext.fileStats.map((stat) => ({
    ...stat,
    path: normalizePath(stat.path)
  }));
  const findings: DriftFinding[] = [];

  if (input.gitDiffContext.isGitRepo === false) {
    findings.push({
      severity: "warning",
      title: "Git repository unavailable",
      message: input.gitDiffContext.error ?? "Gleip could not inspect the working tree.",
      recommendation: "Run status from inside a git repository before final response.",
      category: "git"
    });
  }

  if (changedFiles.length === 0) {
    return {
      status: findings.some((finding) => finding.severity === "warning")
        ? "warning"
        : "within_scope",
      findings,
      metrics: {
        filesChanged: 0,
        linesAdded: 0,
        linesDeleted: 0
      },
      summary:
        findings.length === 0
          ? "No working tree changes detected."
          : "Git diff could not be fully inspected."
    };
  }

  addSecretFindings(findings, changedFiles, input.scopeBudget);
  addSkippedTestFindings(findings, input.gitDiffContext.rawDiff, input.scopeBudget);
  addDeletedTestFindings(findings, fileStats, input.scopeBudget);
  addDependencyFindings(findings, changedFiles, input.scopeBudget);
  addCiFindings(findings, changedFiles, input.scopeBudget);
  addSoftLimitFindings(findings, input.scopeBudget, {
    filesChanged: changedFiles.length,
    linesAdded: input.gitDiffContext.totalLinesAdded,
    linesDeleted: input.gitDiffContext.totalLinesDeleted
  });
  addOutsideScopeFindings(findings, changedFiles, input.scopeBudget);
  addApprovalPathFindings(findings, changedFiles, input.scopeBudget);
  addBlockedPathFindings(findings, changedFiles, input.scopeBudget);

  const normalizedFindings = normalizeDriftFindings(findings);
  const status = aggregateStatus(normalizedFindings);

  return {
    status,
    findings: normalizedFindings,
    metrics: {
      filesChanged: changedFiles.length,
      linesAdded: input.gitDiffContext.totalLinesAdded,
      linesDeleted: input.gitDiffContext.totalLinesDeleted
    },
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

export function deriveNextAction(status: DriftStatus): string {
  if (status === "blocked") {
    return "Fix blocked issues before continuing. Do not proceed until skipped/deleted tests or secret changes are resolved.";
  }

  if (status === "approval_required") {
    return "Stop and ask for approval before continuing, or revise the implementation to stay within budget.";
  }

  if (status === "warning") {
    return "Review warnings and reduce scope if practical. Continue only if the expanded scope is justified.";
  }

  return "Continue. Run relevant tests before final response.";
}

function addSoftLimitFindings(
  findings: DriftFinding[],
  scopeBudget: ScopeBudgetLike,
  metrics: { filesChanged: number; linesAdded: number; linesDeleted: number }
): void {
  if (metrics.filesChanged > scopeBudget.softLimits.maxFilesChanged) {
    findings.push({
      severity: "warning",
      title: "File count exceeds scope budget",
      message: `${metrics.filesChanged} files changed; soft limit is ${scopeBudget.softLimits.maxFilesChanged}.`,
      recommendation:
        "Keep changes focused or ask for approval if the task is broader than expected.",
      category: "soft_limit"
    });
  }

  if (metrics.linesAdded > scopeBudget.softLimits.maxLinesAdded) {
    findings.push({
      severity: "warning",
      title: "Added lines exceed scope budget",
      message: `${metrics.linesAdded} lines added; soft limit is ${scopeBudget.softLimits.maxLinesAdded}.`,
      recommendation: "Check whether the implementation can be narrowed.",
      category: "soft_limit"
    });
  }

  if (metrics.linesDeleted > scopeBudget.softLimits.maxLinesDeleted) {
    findings.push({
      severity: "warning",
      title: "Deleted lines exceed scope budget",
      message: `${metrics.linesDeleted} lines deleted; soft limit is ${scopeBudget.softLimits.maxLinesDeleted}.`,
      recommendation: "Check whether deleted behavior is intentional and scoped.",
      category: "soft_limit"
    });
  }
}

function addDependencyFindings(
  findings: DriftFinding[],
  changedFiles: string[],
  scopeBudget: ScopeBudgetLike
): void {
  if (scopeBudget.hardGates.newDependenciesAllowed) {
    return;
  }

  const dependencyFiles = changedFiles.filter(isDependencyFile);

  if (dependencyFiles.length > 0) {
    findings.push({
      severity: "approval_required",
      title: "Dependency files changed",
      message: `${formatExamples(dependencyFiles)} changed, but new dependency changes are not allowed by the budget.`,
      count: dependencyFiles.length,
      examples: dependencyFiles.slice(0, 3),
      recommendation: "Stop and ask for approval before changing dependency files.",
      category: "dependencies"
    });
  }
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
      severity: "approval_required",
      title: "CI configuration changed",
      message: `${formatExamples(ciFiles)} changed, but CI changes are not allowed by the budget.`,
      count: ciFiles.length,
      examples: ciFiles.slice(0, 3),
      recommendation: "Stop and ask for approval before changing CI configuration.",
      category: "ci"
    });
  }
}

function addOutsideScopeFindings(
  findings: DriftFinding[],
  changedFiles: string[],
  scopeBudget: ScopeBudgetLike
): void {
  if (scopeBudget.allowedPaths.length === 0) {
    return;
  }

  const outsideFiles = changedFiles.filter(
    (path) => !isAllowedPath(path, scopeBudget.allowedPaths) && !hasSpecificHardGateFinding(path)
  );

  if (outsideFiles.length === 0) {
    return;
  }

  const requiresApproval = outsideFiles.some(
    (path) =>
      matchesAnyBudgetEntry(path, scopeBudget.approvalRequiredFor) ||
      matchesAnyBudgetEntry(path, scopeBudget.blockedWithoutApproval)
  );

  findings.push({
    severity: requiresApproval ? "approval_required" : "warning",
    title: "Files outside allowed scope",
    message: `${outsideFiles.length} file(s) changed outside the allowed paths: ${formatExamples(outsideFiles)}.`,
    count: outsideFiles.length,
    examples: outsideFiles.slice(0, 3),
    recommendation: requiresApproval
      ? "Stop and ask for approval before continuing."
      : "Confirm these files are necessary for the task.",
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
      severity: "approval_required",
      title: "Approval-required paths changed",
      message: `${formatExamples(matched)} matched approval-required scope.`,
      count: matched.length,
      examples: matched.slice(0, 3),
      recommendation: "Stop and ask for approval before continuing.",
      category: "approval_required_path"
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
      matchesAnyBudgetEntry(path, scopeBudget.blockedWithoutApproval)
  );

  if (matched.length > 0) {
    findings.push({
      severity: "approval_required",
      title: "Blocked-without-approval paths changed",
      message: `${formatExamples(matched)} matched paths or categories that require approval.`,
      count: matched.length,
      examples: matched.slice(0, 3),
      recommendation: "Stop and ask for approval before continuing.",
      category: "blocked_without_approval"
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
      SKIPPED_TEST_PATTERNS.some((pattern) => trimmed.includes(pattern))
    );
  });

  if (hasSkippedTest) {
    findings.push({
      severity: "blocked",
      title: "Skipped test added",
      message: "The diff adds a skipped or pending test.",
      recommendation: "Remove the skipped test or ask for explicit approval.",
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
      severity: "blocked",
      title: "Test file deleted",
      message: `${formatExamples(deletedTests.map((stat) => stat.path))} deleted.`,
      count: deletedTests.length,
      examples: deletedTests.map((stat) => stat.path).slice(0, 3),
      recommendation: "Restore deleted tests or ask for explicit approval.",
      category: "tests"
    });
  }

  const largeTestDeletions = fileStats.filter(
    (stat) => stat.isDeleted !== true && isTestFile(stat.path) && stat.deleted > 40
  );

  if (largeTestDeletions.length > 0) {
    findings.push({
      severity: "approval_required",
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
      severity: "blocked",
      title: "Secret or env file changed",
      message: `${formatExamples(secretFiles)} changed.`,
      count: secretFiles.length,
      examples: secretFiles.slice(0, 3),
      recommendation:
        "Do not modify secrets through this task. Revert or ask for explicit approval.",
      category: "secrets"
    });
  }
}

function normalizeFindingGroup(findings: DriftFinding[]): DriftFinding {
  const first = findings[0];

  if (first === undefined) {
    return {
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
  ).slice(0, 3);
  const count = findings.reduce((total, finding) => total + (finding.count ?? 1), 0);
  const message = groupedMessage(first, count, examples);
  const recommendation = findings.find(
    (finding) => finding.recommendation !== undefined
  )?.recommendation;

  return recommendation === undefined
    ? {
        severity,
        title: first.title,
        message,
        count,
        category: first.category,
        examples
      }
    : {
        severity,
        title: first.title,
        message,
        count,
        recommendation,
        category: first.category,
        examples
      };
}

function groupedMessage(finding: DriftFinding, count: number, examples: string[]): string {
  const exampleText = examples.length === 0 ? "" : ` Examples: ${examples.join(", ")}.`;

  if (finding.category === "allowed_scope") {
    return `${count === 1 ? "1 file" : `${count} files`} changed outside the approved scope.${exampleText}`;
  }

  if (finding.category === "dependencies") {
    return `${count === 1 ? "1 dependency file" : `${count} dependency files`} changed, but dependency changes are not allowed by the budget.${exampleText}`;
  }

  if (finding.category === "ci") {
    return `${count === 1 ? "1 CI file" : `${count} CI files`} changed, but CI changes are not allowed by the budget.${exampleText}`;
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
  if (findings.some((finding) => finding.severity === "blocked")) {
    return "blocked";
  }

  if (findings.some((finding) => finding.severity === "approval_required")) {
    return "approval_required";
  }

  if (findings.some((finding) => finding.severity === "warning")) {
    return "warning";
  }

  return "within_scope";
}

function summaryForStatus(status: DriftStatus, filesChanged: number): string {
  if (status === "within_scope") {
    return `${filesChanged} changed file(s) are within the active scope budget.`;
  }

  if (status === "warning") {
    return `${filesChanged} changed file(s) need review against soft scope limits.`;
  }

  if (status === "approval_required") {
    return `${filesChanged} changed file(s) include approval-required scope.`;
  }

  return `${filesChanged} changed file(s) include blocked changes.`;
}

function isAllowedPath(path: string, allowedPaths: string[]): boolean {
  return allowedPaths.some((allowedPath) => {
    const normalizedAllowedPath = normalizePath(allowedPath).replace(/\/$/, "");

    return (
      path === normalizedAllowedPath ||
      path.startsWith(`${normalizedAllowedPath}/`) ||
      normalizedAllowedPath.startsWith(`${path}/`)
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

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
