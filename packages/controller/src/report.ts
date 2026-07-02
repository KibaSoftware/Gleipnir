export type ReportConfidence = "low" | "medium" | "high";
export type ReportRiskLevel = "none" | "low" | "medium" | "high";
export type TestIntegrity = "unknown" | "pass" | "warning" | "fail";
export type ReportWarningType =
  | "scope"
  | "plan"
  | "requirement"
  | "drift"
  | "test_integrity"
  | "output"
  | "review_readiness"
  | "efficiency";
export type ReportWarningSeverity = "info" | "low" | "medium" | "high";
export type EfficiencySource =
  | "avoided_diff"
  | "avoided_file_context"
  | "rejected_plan_item"
  | "scope_budget_reduction"
  | "output_discipline";
export type ReportRequirementObligation =
  | "required"
  | "prohibited"
  | "optional"
  | "suggestion"
  | "informational";
export type ReportRequirementStatus =
  | "satisfied"
  | "unresolved"
  | "violated"
  | "advisory"
  | "not_applicable";

export interface SessionReport {
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
    drift: ReportRiskLevel;
    repositoryHygiene: ReportRiskLevel;
    testIntegrity: TestIntegrity;
    overEdit: ReportRiskLevel;
  };
  efficiency: {
    estimatedTokenWasteAvoided: number;
    confidence: ReportConfidence;
    breakdown: {
      scopeWasteAvoided: number;
      contextWasteAvoided: number;
      outputWasteAvoided: number;
    };
    basis: EfficiencyBasis[];
  };
  requirements: ReportRequirementCompletion;
  finalResponse: {
    markdown: string;
    unresolvedWarnings: number;
  };
  warnings: ReportWarning[];
  summary: {
    changedFilesMentioned: boolean;
    filesChanged: number;
    unplannedFiles: number;
    testsMentioned: boolean;
    risksMentioned: boolean;
  };
}

export interface ArtifactMetadata {
  generatedAt: string;
  repositoryFingerprint?: string;
  sessionId?: string | null;
  phase: "preflight" | "implementation" | "verification" | "final";
  sequence: number;
  superseded: boolean;
  currentArtifact: string;
}

export interface EfficiencyBasis {
  source: EfficiencySource;
  description: string;
  estimatedTokens: number;
  confidence: ReportConfidence;
}

export interface ReportWarning {
  id: string;
  type: ReportWarningType;
  severity: ReportWarningSeverity;
  message: string;
  reason: string;
  evidence: string[];
  files: string[];
  suggestedAction: string | null;
}

export interface ReportRequirementCompletion {
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
  items: ReportRequirementCompletionItem[];
}

export interface ReportRequirementCompletionItem {
  id: string;
  sourceText: string;
  obligation: ReportRequirementObligation;
  category: string;
  status: ReportRequirementStatus;
  evidence: string[];
  relatedPaths: string[];
}

export interface ReportScopeBudget {
  softLimits: {
    maxFilesChanged: number;
    maxLinesAdded: number;
    maxLinesDeleted: number;
  };
  allowedPaths: string[];
  expectedPaths?: string[];
  requiredTests: boolean;
  verificationExpected?: boolean;
  workflowProfile?: "documentation_only" | "local_behavior_change" | "broad_change" | "sensitive_change";
  planRequired?: boolean;
}

export interface ReportDiff {
  changedFiles: string[];
  fileStats: Array<{
    path: string;
    added: number;
    deleted: number;
  }>;
  rawDiff: string;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  isGitRepo: boolean;
  error?: string;
}

export interface ReportDriftFinding {
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
  examples?: string[];
  recommendation?: string;
  category: string;
}

export interface ReportDriftResult {
  status:
    | "clean"
    | "advisory"
    | "needs_attention"
    | "needs_cleanup"
    | "needs_approval"
    | "within_scope"
    | "warning"
    | "approval_required"
    | "blocked";
  findings: ReportDriftFinding[];
}

export interface ReportPlanValidation {
  status:
    | "aligned"
    | "advisory"
    | "needs_clarification"
    | "needs_cleanup"
    | "needs_approval"
    | "approved"
    | "needs_revision"
    | "requires_approval";
  findings: Array<{
    title: string;
    message: string;
    evidence?: string[];
  }>;
  parsedPlan: {
    rawText: string;
    proposedFiles: string[];
    contextFiles?: string[];
    outputFiles?: string[];
    fileMentions?: Array<{
      path: string;
      role: "edit" | "context" | "output";
      markedNew?: boolean;
    }>;
  };
  targetClassifications?: Array<{
    target: string;
    classification: "direct" | "derived" | "adjacent" | "unexplained";
    reason?: string;
    evidence?: string;
  }>;
}

export interface ReportRequirementLedger {
  schemaVersion: string;
  authority: string;
  requirements: ReportRequirementLedgerItem[];
  conflicts?: Array<{
    id?: string;
    requirementIds?: string[];
    summary?: string;
  }>;
}

export interface ReportRequirementLedgerItem {
  id: string;
  sourceText: string;
  category?: string;
  obligation: ReportRequirementObligation;
  status: "active" | "superseded" | "ambiguous";
  relatedPaths?: string[];
  relatedVerification?: string;
}

export interface GenerateSessionReportInput {
  version: string;
  schemaVersion: string;
  sessionId?: string | null;
  generatedAt: string;
  phase?: ArtifactMetadata["phase"];
  repositoryFingerprint?: string;
  scopeBudget?: ReportScopeBudget;
  diff: ReportDiff;
  driftResult: ReportDriftResult;
  baseline?: {
    possiblyPreExistingFiles: string[];
  };
  planValidation?: ReportPlanValidation;
  acceptedPlanValidation?: ReportPlanValidation;
  statusContent?: string;
  requirementLedger?: ReportRequirementLedger;
  missingArtifacts?: string[];
}

interface ScoreDeductions {
  scopeAdherence: number;
  planAlignment: number;
  outputDiscipline: number;
  reviewReadiness: number;
}

export function estimateTokens(characterCount: number): number {
  return Math.ceil(Math.max(0, characterCount) / 4);
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
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

export function generateSessionReport(input: GenerateSessionReportInput): SessionReport {
  const warnings: ReportWarning[] = [];
  const deductions: ScoreDeductions = {
    scopeAdherence: 0,
    planAlignment: 0,
    outputDiscipline: 0,
    reviewReadiness: 0
  };
  const changedFiles = input.diff.changedFiles.map(normalizePath).sort();
  const workflowProfile = input.scopeBudget?.workflowProfile ?? "local_behavior_change";
  const planRequired =
    input.scopeBudget?.planRequired ??
    (workflowProfile !== "documentation_only" && changedFiles.length > 0);
  const verificationRequired =
    (input.scopeBudget?.verificationExpected ?? input.scopeBudget?.requiredTests) === true;
  const acceptedPlanValidation =
    input.acceptedPlanValidation ??
    (input.planValidation !== undefined && isPlanAligned(input.planValidation.status)
      ? input.planValidation
      : undefined);
  const plannedFiles = plannedFilesForReport(acceptedPlanValidation);
  const effectiveExpectedFiles = mergePathLists(
    input.scopeBudget?.expectedPaths ?? input.scopeBudget?.allowedPaths ?? [],
    plannedFiles
  );
  const unplannedFiles =
    input.planValidation === undefined
      ? []
      : changedFiles.filter((path) => !plannedFiles.some((planned) => pathsOverlap(path, planned)));
  const outsideScopeFiles =
    input.scopeBudget === undefined || effectiveExpectedFiles.length === 0
      ? []
      : changedFiles.filter(
          (path) => !effectiveExpectedFiles.some((expected) => pathsOverlap(path, expected))
        );
  const statusContent = input.statusContent ?? "";
  const hasStatusContent = input.statusContent !== undefined && input.statusContent.trim() !== "";
  const changedFilesMentioned = hasChangedFilesEvidence(statusContent);
  const testsMentioned = hasVerificationEvidence(statusContent);
  const risksMentioned = hasEvidenceSection(statusContent, "risks?");
  const repeatedOutput = repeatedNarration(statusContent);
  const repeatedPlanOutput = repeatedPlanNarration(
    statusContent,
    input.planValidation?.parsedPlan.rawText
  );
  const unrelatedSuggestions = findUnrelatedSuggestions(statusContent);
  const excessiveOutputCharacters = excessiveOutputCharacterCount(statusContent);
  const requirementReport = evaluateRequirementCompletion(input, changedFiles, plannedFiles);

  addMissingArtifactWarnings(input.missingArtifacts ?? [], warnings, deductions);

  if (!input.diff.isGitRepo) {
    addWarning(warnings, {
      id: "drift.git-unavailable",
      type: "drift",
      severity: "medium",
      message: "Git state could not be inspected.",
      reason: "Scope and drift scores have incomplete working-tree evidence.",
      evidence: [input.diff.error ?? "Current directory is not a git repository."],
      files: [],
      suggestedAction: "Run the report inside the target git repository."
    });
    deductions.scopeAdherence += 20;
    deductions.reviewReadiness += 20;
  }

  if (input.planValidation === undefined && planRequired) {
    addWarning(warnings, {
      id: "plan.missing",
      type: "plan",
      severity: changedFiles.length > 0 ? "medium" : "low",
      message: "No persisted plan validation was found.",
      reason: "Plan alignment cannot be fully evaluated without a validated plan.",
      evidence: ["The active session has no latestPlanValidation field."],
      files: [],
      suggestedAction: "Run npx --no-install gleip validate-plan before implementation."
    });
    deductions.planAlignment += 25;
    deductions.reviewReadiness += changedFiles.length > 0 ? 10 : 0;
  } else if (input.planValidation !== undefined && !isPlanAligned(input.planValidation.status)) {
    const requiresApproval =
      input.planValidation.status === "requires_approval" ||
      input.planValidation.status === "needs_approval";
    const hasAcceptedScope = acceptedPlanValidation !== undefined;
    addWarning(warnings, {
      id: "plan.guidance",
      type: "plan",
      severity: requiresApproval ? "high" : "medium",
      message: `Latest validation attempt is ${input.planValidation.status}.`,
      reason: hasAcceptedScope
        ? "The latest failed attempt remains workflow guidance; accepted implementation scope still comes from the latest successful validation."
        : "The latest plan includes guidance that should be addressed or explicitly accepted.",
      evidence: input.planValidation.findings.flatMap((finding) => [
        finding.message,
        ...(finding.evidence ?? [])
      ]),
      files: input.planValidation.parsedPlan.proposedFiles,
      suggestedAction: requiresApproval
        ? "Request approval for the attempted change, revise the plan, or validate a successful replacement."
        : "Clarify the plan and validate it again."
    });
    deductions.planAlignment += requiresApproval ? 40 : 25;
    deductions.reviewReadiness += requiresApproval ? 20 : 10;
  }

  if (unplannedFiles.length > 0) {
    addWarning(warnings, {
      id: "plan.unplanned-files",
      type: "plan",
      severity: unplannedFiles.length > 3 ? "high" : "medium",
      message: `${unplannedFiles.length} changed file(s) were not named in the latest validated plan.`,
      reason: "Changed files outside the validated plan reduce plan alignment and review clarity.",
      evidence: unplannedFiles,
      files: unplannedFiles,
      suggestedAction:
        "Remove unrelated changes or revalidate a plan that explicitly covers these files."
    });
    deductions.scopeAdherence += Math.min(32, unplannedFiles.length * 8);
    deductions.planAlignment += Math.min(40, unplannedFiles.length * 10);
    deductions.reviewReadiness += Math.min(24, unplannedFiles.length * 8);
  }

  if (outsideScopeFiles.length > 0) {
    addWarning(warnings, {
      id: "scope.outside-budget",
      type: "scope",
      severity: outsideScopeFiles.length > 3 ? "high" : "medium",
      message: `${outsideScopeFiles.length} changed file(s) are outside the scope budget's expected paths.`,
      reason: "Unexpected files need scope review or rationale.",
      evidence: outsideScopeFiles,
      files: outsideScopeFiles,
      suggestedAction: "Review the expanded scope and add rationale, or remove unrelated changes."
    });
    deductions.scopeAdherence += Math.min(48, outsideScopeFiles.length * 12);
    deductions.planAlignment += Math.min(20, outsideScopeFiles.length * 5);
    deductions.reviewReadiness += Math.min(20, outsideScopeFiles.length * 5);
  }

  addDriftWarnings(input.driftResult, warnings, deductions);
  addBaselineAttributionWarning(input.baseline, warnings);
  addRequirementWarnings(requirementReport, warnings, deductions);
  addOutputWarnings(
    input,
    changedFilesMentioned,
    testsMentioned,
    risksMentioned,
    repeatedOutput,
    repeatedPlanOutput,
    unrelatedSuggestions,
    excessiveOutputCharacters,
    warnings,
    deductions
  );

  const driftRisk = driftRiskFor(
    input.driftResult.status,
    input.diff.isGitRepo,
    input.driftResult.findings
  );
  const repositoryHygieneRisk = repositoryHygieneRiskFor(input.driftResult.findings);
  const testIntegrity = testIntegrityFor(input);
  const overEdit = overEditRisk(
    outsideScopeFiles.length,
    unplannedFiles.length,
    input.driftResult.findings
  );

  deductions.reviewReadiness += riskDeduction(driftRisk);
  deductions.reviewReadiness += riskDeduction(repositoryHygieneRisk);
  if (changedFiles.length > 0 && !changedFilesMentioned) {
    deductions.reviewReadiness += workflowProfile === "documentation_only" ? 5 : 10;
  }
  if (verificationRequired && !testsMentioned) {
    if (!warnings.some((warning) => warning.id === "output.tests-missing")) {
      addWarning(warnings, {
        id: "review.verification-evidence-missing",
        type: "review_readiness",
        severity: "medium",
        message: "Required verification evidence is missing.",
        reason:
          "The active workflow profile requires verification evidence before review readiness can be complete.",
        evidence: ["No status Tests section with concrete content was available."],
        files: [],
        suggestedAction: "Run or report focused verification for the changed behavior."
      });
    }
    deductions.reviewReadiness += 15;
  }
  if (hasStatusContent && !risksMentioned && activeWarningCount(warnings) > 0) {
    deductions.reviewReadiness += 10;
  }
  deductions.reviewReadiness += Math.min(
    30,
    warnings.filter((warning) => warning.severity === "medium" || warning.severity === "high")
      .length * 5
  );
  enforceRequirementReadinessInvariant(requirementReport, deductions);

  const efficiency = calculateEfficiency(
    input,
    outsideScopeFiles,
    repeatedOutput,
    repeatedPlanOutput,
    excessiveOutputCharacters
  );
  const orderedWarnings = orderWarnings(warnings);
  const scores = {
    scopeAdherence: clampScore(100 - deductions.scopeAdherence),
    planAlignment: clampScore(100 - deductions.planAlignment),
    outputDiscipline: clampScore(100 - deductions.outputDiscipline),
    reviewReadiness: clampScore(100 - deductions.reviewReadiness)
  };
  const risk = {
    drift: driftRisk,
    repositoryHygiene: repositoryHygieneRisk,
    testIntegrity,
    overEdit
  };
  const unresolvedWarnings = orderedWarnings.filter(
    (warning) => warning.severity === "medium" || warning.severity === "high"
  ).length;

  return {
    version: input.version,
    schemaVersion: input.schemaVersion,
    sessionId: input.sessionId ?? null,
    generatedAt: input.generatedAt,
    artifact: artifactMetadata({
      phase: input.phase ?? "final",
      generatedAt: input.generatedAt,
      ...(input.repositoryFingerprint === undefined
        ? {}
        : { repositoryFingerprint: input.repositoryFingerprint }),
      sessionId: input.sessionId ?? null,
      currentArtifact: ".gleip/report.json"
    }),
    scores,
    risk,
    efficiency,
    requirements: requirementReport,
    finalResponse: {
      markdown: renderCompactFinalResponse({
        scores,
        driftRisk,
        repositoryHygieneRisk,
        requirements: requirementReport,
        efficiency,
        unresolvedWarnings: orderedWarnings.filter(
          (warning) => warning.severity === "medium" || warning.severity === "high"
        )
      }),
      unresolvedWarnings
    },
    warnings: orderedWarnings,
    summary: {
      changedFilesMentioned,
      filesChanged: changedFiles.length,
      unplannedFiles: unplannedFiles.length,
      testsMentioned,
      risksMentioned
    }
  };
}

export function renderSessionReportMarkdown(report: SessionReport): string {
  const findings =
    report.warnings.length === 0
      ? ["- No evidence-backed warnings."]
      : report.warnings.slice(0, 5).map((warning) => `- ${warning.message}`);
  const requirementLines = requirementSummaryLines(report.requirements);
  const warningLines =
    report.warnings.length === 0
      ? ["- None."]
      : report.warnings
          .slice(0, 5)
          .map(
            (warning) =>
              `- [${warning.severity.toUpperCase()}] ${warning.message} Reason: ${warning.reason}`
          );
  const actions = Array.from(
    new Set(
      report.warnings
        .map((warning) => warning.suggestedAction)
        .filter((action): action is string => action !== null)
    )
  ).slice(0, 4);

  return `# Gleipnir Session Report

Scope adherence: ${report.scores.scopeAdherence}/100
Phase: ${report.artifact?.phase ?? "final"}
Plan alignment: ${report.scores.planAlignment}/100
Output discipline: ${report.scores.outputDiscipline}/100
Review readiness: ${report.scores.reviewReadiness}/100
Output discipline note: ${outputDisciplineNote(report)}

Drift risk: ${titleCase(report.risk.drift)}
Test integrity: ${titleCase(report.risk.testIntegrity)}
Repository hygiene: ${titleCase(report.risk.repositoryHygiene)}
Over-edit risk: ${titleCase(report.risk.overEdit)}

Evidence-based token waste avoided: ${formatTokenEstimateForReport(report.efficiency.estimatedTokenWasteAvoided)}
Confidence: ${titleCase(report.efficiency.confidence)}

## Key findings
${findings.join("\n")}

## Canonical requirements
${requirementLines.join("\n")}

## Evidence-backed warnings
${warningLines.join("\n")}

## Suggested actions
${actions.length === 0 ? "- None." : actions.map((action) => `- ${action}`).join("\n")}

## Recommended final response
Use only this compact block in the agent's final response; do not paste the full report.

${report.finalResponse.markdown}

Token-waste reporting is deterministic and evidence-based. Unavailable means Gleip did not have local evidence for a positive avoided-work estimate.
`;
}

function requirementSummaryLines(report: ReportRequirementCompletion): string[] {
  if (report.summary.total === 0) {
    return ["- No canonical requirement ledger was available."];
  }

  const unresolved = report.items
    .filter((item) => item.obligation === "required" && item.status === "unresolved")
    .slice(0, 5)
    .map((item) => `- Unresolved ${item.id}: ${item.sourceText}`);
  const violated = report.items
    .filter((item) => item.obligation === "prohibited" && item.status === "violated")
    .slice(0, 5)
    .map((item) => `- Prohibited conflict ${item.id}: ${item.sourceText}`);

  return [
    `- Mandatory: ${report.summary.mandatorySatisfied}/${report.summary.mandatory} satisfied; ${report.summary.mandatoryUnresolved} unresolved.`,
    `- Prohibited: ${report.summary.prohibitedSatisfied}/${report.summary.prohibited} respected; ${report.summary.prohibitedViolated} conflict(s).`,
    `- Advisory: ${report.summary.advisory}.`,
    ...unresolved,
    ...violated
  ];
}

function evaluateRequirementCompletion(
  input: GenerateSessionReportInput,
  changedFiles: string[],
  plannedFiles: string[]
): ReportRequirementCompletion {
  const requirements = input.requirementLedger?.requirements ?? [];

  if (requirements.length === 0) {
    return emptyRequirementCompletion();
  }

  const items = requirements
    .filter((requirement) => requirement.status !== "superseded")
    .map((requirement) =>
      evaluateRequirementItem(input, requirement, changedFiles, plannedFiles)
    );
  const mandatory = items.filter((item) => item.obligation === "required");
  const prohibited = items.filter((item) => item.obligation === "prohibited");

  return {
    summary: {
      total: items.length,
      mandatory: mandatory.length,
      mandatorySatisfied: mandatory.filter((item) => item.status === "satisfied").length,
      mandatoryUnresolved: mandatory.filter((item) => item.status === "unresolved").length,
      prohibited: prohibited.length,
      prohibitedSatisfied: prohibited.filter((item) => item.status === "satisfied").length,
      prohibitedViolated: prohibited.filter((item) => item.status === "violated").length,
      advisory: items.filter((item) => item.status === "advisory").length
    },
    items
  };
}

function emptyRequirementCompletion(): ReportRequirementCompletion {
  return {
    summary: {
      total: 0,
      mandatory: 0,
      mandatorySatisfied: 0,
      mandatoryUnresolved: 0,
      prohibited: 0,
      prohibitedSatisfied: 0,
      prohibitedViolated: 0,
      advisory: 0
    },
    items: []
  };
}

function evaluateRequirementItem(
  input: GenerateSessionReportInput,
  requirement: ReportRequirementLedgerItem,
  changedFiles: string[],
  plannedFiles: string[]
): ReportRequirementCompletionItem {
  const relatedPaths = mergePathLists(
    requirement.relatedPaths ?? [],
    extractPathsFromText(requirement.sourceText)
  );

  if (requirement.status === "ambiguous") {
    return {
      id: requirement.id,
      sourceText: requirement.sourceText,
      obligation: requirement.obligation,
      category: requirement.category ?? "unknown",
      status: "advisory",
      evidence: ["Requirement extraction marked this item ambiguous."],
      relatedPaths
    };
  }

  if (requirement.obligation === "required") {
    const evidence = requirementEvidence(input, requirement, relatedPaths, changedFiles, plannedFiles);

    return {
      id: requirement.id,
      sourceText: requirement.sourceText,
      obligation: requirement.obligation,
      category: requirement.category ?? "unknown",
      status: evidence.length === 0 ? "unresolved" : "satisfied",
      evidence:
        evidence.length === 0
          ? ["No local changed-file, plan, or verification evidence satisfied this requirement."]
          : evidence,
      relatedPaths
    };
  }

  if (requirement.obligation === "prohibited") {
    const violationEvidence = prohibitedRequirementEvidence(input, requirement, changedFiles, plannedFiles);

    return {
      id: requirement.id,
      sourceText: requirement.sourceText,
      obligation: requirement.obligation,
      category: requirement.category ?? "unknown",
      status: violationEvidence.length === 0 ? "satisfied" : "violated",
      evidence:
        violationEvidence.length === 0
          ? ["No local evidence of the prohibited action was found."]
          : violationEvidence,
      relatedPaths
    };
  }

  return {
    id: requirement.id,
    sourceText: requirement.sourceText,
    obligation: requirement.obligation,
    category: requirement.category ?? "unknown",
    status: "advisory",
    evidence: ["Optional or informational requirement; not scored as mandatory."],
    relatedPaths
  };
}

function requirementEvidence(
  input: GenerateSessionReportInput,
  requirement: ReportRequirementLedgerItem,
  relatedPaths: string[],
  changedFiles: string[],
  plannedFiles: string[]
): string[] {
  const evidence: string[] = [];
  const category = requirement.category ?? "unknown";
  const statusContent = input.statusContent ?? "";
  const planText = acceptedPlanText(input);
  const changedRelated = changedFiles.filter((path) =>
    relatedPaths.some((relatedPath) => pathsOverlap(path, relatedPath))
  );
  const plannedRelated = plannedFiles.filter((path) =>
    relatedPaths.some((relatedPath) => pathsOverlap(path, relatedPath))
  );
  const changedPlanned = changedFiles.filter((path) =>
    plannedFiles.some((plannedPath) => pathsOverlap(path, plannedPath))
  );

  if (changedRelated.length > 0) {
    evidence.push(`Changed related path(s): ${changedRelated.slice(0, 3).join(", ")}.`);
  }

  if (plannedRelated.length > 0 && changedPlanned.length > 0) {
    evidence.push(
      `Validated plan and final diff overlap on related path(s): ${plannedRelated
        .slice(0, 3)
        .join(", ")}.`
    );
  }

  if (isVerificationRequirement(requirement) && hasVerificationEvidence(statusContent)) {
    evidence.push("Verification evidence was reported in local status content.");
  }

  if (category === "documentation" && changedFiles.some(isDocumentationPath)) {
    evidence.push("Documentation file changes are present.");
  }

  if ((category === "release" || category === "packaging") && changedFiles.some(isReleasePath)) {
    evidence.push("Release or packaging metadata changes are present.");
  }

  if (category === "dependency" && changedFiles.some(isDependencyPath)) {
    evidence.push("Dependency metadata changes are present.");
  }

  if (
    hasRequirementKeywordEvidence(requirement.sourceText, planText) &&
    changedPlanned.length > 0
  ) {
    evidence.push("Accepted plan text covers the requirement and planned files changed.");
  }

  if (
    categoryAllowsStatusEvidence(category) &&
    hasRequirementKeywordEvidence(requirement.sourceText, statusContent)
  ) {
    evidence.push("Local status content covers the process or output requirement.");
  }

  if (
    input.diff.rawDiff.length > 0 &&
    hasRequirementKeywordEvidence(requirement.sourceText, input.diff.rawDiff)
  ) {
    evidence.push("Final diff content contains requirement-specific terms.");
  }

  return uniqueStrings(evidence);
}

function prohibitedRequirementEvidence(
  input: GenerateSessionReportInput,
  requirement: ReportRequirementLedgerItem,
  changedFiles: string[],
  plannedFiles: string[]
): string[] {
  const evidence: string[] = [];
  const text = requirement.sourceText.toLowerCase();
  const planAndDiffText = [acceptedPlanText(input), input.diff.rawDiff, plannedFiles.join("\n")]
    .join("\n")
    .toLowerCase();

  if (/\bdependenc|package|lockfile|install\b/u.test(text) && hasDependencyConflict(input, changedFiles)) {
    evidence.push("Dependency or lockfile change conflicts with a canonical prohibition.");
  }

  if (/\bci\b|continuous integration|workflow/u.test(text) && hasCiConflict(input, changedFiles)) {
    evidence.push("CI workflow change conflicts with a canonical prohibition.");
  }

  if (/\btests?\b|skip|delete|weaken/u.test(text) && hasTestConflict(input)) {
    evidence.push("Test weakening finding conflicts with a canonical prohibition.");
  }

  if (hasProhibitedActionEvidence(requirement.sourceText, planAndDiffText)) {
    evidence.push("Plan or diff evidence contains terms matching the prohibited action.");
  }

  return uniqueStrings(evidence);
}

function addRequirementWarnings(
  report: ReportRequirementCompletion,
  warnings: ReportWarning[],
  deductions: ScoreDeductions
): void {
  const unresolved = report.items.filter(
    (item) => item.obligation === "required" && item.status === "unresolved"
  );
  const violated = report.items.filter(
    (item) => item.obligation === "prohibited" && item.status === "violated"
  );

  if (unresolved.length > 0) {
    addWarning(warnings, {
      id: "requirement.unresolved",
      type: "requirement",
      severity: "medium",
      message: `${unresolved.length} mandatory canonical requirement(s) lack completion evidence.`,
      reason:
        "Review readiness cannot be complete while required canonical task obligations are unresolved.",
      evidence: unresolved.map((item) => `${item.id}: ${item.sourceText}`),
      files: unresolved.flatMap((item) => item.relatedPaths),
      suggestedAction:
        "Implement, verify, or explicitly resolve the listed canonical requirements before finalizing."
    });
    deductions.planAlignment += Math.min(30, unresolved.length * 10);
    deductions.reviewReadiness += Math.min(35, unresolved.length * 12);
  }

  if (violated.length > 0) {
    addWarning(warnings, {
      id: "requirement.prohibited-conflict",
      type: "requirement",
      severity: "high",
      message: `${violated.length} prohibited canonical requirement(s) appear violated.`,
      reason: "The final local evidence conflicts with a canonical task prohibition.",
      evidence: violated.flatMap((item) => [`${item.id}: ${item.sourceText}`, ...item.evidence]),
      files: violated.flatMap((item) => item.relatedPaths),
      suggestedAction: "Remove the prohibited change or get explicit user approval before finalizing."
    });
    deductions.scopeAdherence += Math.min(45, violated.length * 15);
    deductions.planAlignment += Math.min(45, violated.length * 15);
    deductions.reviewReadiness += Math.min(50, violated.length * 25);
  }
}

function enforceRequirementReadinessInvariant(
  report: ReportRequirementCompletion,
  deductions: ScoreDeductions
): void {
  if (report.summary.mandatoryUnresolved > 0 || report.summary.prohibitedViolated > 0) {
    deductions.reviewReadiness = Math.max(deductions.reviewReadiness, 15);
  }
}

function addMissingArtifactWarnings(
  artifacts: string[],
  warnings: ReportWarning[],
  deductions: ScoreDeductions
): void {
  for (const artifact of [...new Set(artifacts)].sort()) {
    addWarning(warnings, {
      id: `artifact.missing.${artifact.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      type: artifact.includes("plan") ? "plan" : "review_readiness",
      severity: artifact === "status.md" ? "medium" : "low",
      message: `Local artifact ${artifact} is missing or unreadable.`,
      reason: "The report used the remaining local evidence and reduced confidence where needed.",
      evidence: [`.gleip/${artifact}`],
      files: [],
      suggestedAction:
        artifact === "session.json" || artifact === "scope-budget.json"
          ? 'Run npx --no-install gleip preflight "<task>" to recreate session artifacts.'
          : "Run npx --no-install gleip status to refresh local status evidence."
    });

    if (artifact === "status.md") {
      deductions.outputDiscipline += 20;
      deductions.reviewReadiness += 10;
    }
  }
}

function addDriftWarnings(
  driftResult: ReportDriftResult,
  warnings: ReportWarning[],
  deductions: ScoreDeductions
): void {
  for (const [index, finding] of driftResult.findings.entries()) {
    const severity = reportSeverity(finding.severity);
    const type = finding.category === "tests" ? "test_integrity" : "drift";
    addWarning(warnings, {
      id: finding.code ?? `drift.${slug(finding.category)}.${index + 1}`,
      type,
      severity,
      message: finding.message,
      reason: `${finding.title} was detected by the local drift check.`,
      evidence: [
        ...(finding.code === undefined ? [] : [finding.code]),
        finding.title,
        ...(finding.examples ?? [])
      ],
      files: finding.examples ?? [],
      suggestedAction: finding.recommendation ?? null
    });

    if (finding.category === "soft_limit") {
      deductions.scopeAdherence += finding.title.includes("File count") ? 15 : 10;
    }

    if (finding.category === "dependencies") {
      deductions.scopeAdherence += 20;
      deductions.reviewReadiness += 15;
    }

    if (finding.category === "tests") {
      deductions.reviewReadiness +=
        finding.severity === "blocking" ||
        finding.severity === "blocked" ||
        finding.severity === "action_required" ||
        finding.severity === "cleanup_required"
          ? 30
          : 15;
    }
  }
}

function addBaselineAttributionWarning(
  baseline: GenerateSessionReportInput["baseline"],
  warnings: ReportWarning[]
): void {
  const files = [...new Set(baseline?.possiblyPreExistingFiles ?? [])].map(normalizePath).sort();

  if (files.length === 0) {
    return;
  }

  addWarning(warnings, {
    id: "baseline.ambiguous-attribution",
    type: "review_readiness",
    severity: "info",
    message: `${files.length} pre-existing baseline file(s) changed again after preflight.`,
    reason:
      "Gleip filters baselines at file granularity; these files are included in current drift, but exact hunk attribution is ambiguous.",
    evidence: files,
    files,
    suggestedAction: null
  });
}

function addOutputWarnings(
  input: GenerateSessionReportInput,
  changedFilesMentioned: boolean,
  testsMentioned: boolean,
  risksMentioned: boolean,
  repeatedOutput: string[],
  repeatedPlanOutput: string[],
  unrelatedSuggestions: string[],
  excessiveOutputCharacters: number,
  warnings: ReportWarning[],
  deductions: ScoreDeductions
): void {
  if (input.statusContent === undefined) {
    return;
  }

  if (!changedFilesMentioned) {
    addWarning(warnings, {
      id: "output.changed-files-missing",
      type: "output",
      severity: "low",
      message: "Status output does not summarize changed files.",
      reason: "A compact final response should state the changed-file count.",
      evidence: [".gleip/status.md has no changed-file summary."],
      files: [],
      suggestedAction: "Include the changed-file count in the final response."
    });
    deductions.outputDiscipline += 10;
  }

  if (!testsMentioned && (input.scopeBudget?.verificationExpected ?? input.scopeBudget?.requiredTests) === true) {
    addWarning(warnings, {
      id: "output.tests-missing",
      type: "output",
      severity: "medium",
      message: "Status output does not include explicit test evidence.",
      reason:
        "Reviewers cannot tell which validation commands ran from the available status artifact.",
      evidence: [".gleip/status.md has no Tests heading with concrete content."],
      files: [],
      suggestedAction: "Include tests run and their results in the final response."
    });
    deductions.outputDiscipline += 15;
  }

  if (!risksMentioned && input.driftResult.findings.length > 0) {
    addWarning(warnings, {
      id: "output.risks-missing",
      type: "output",
      severity: "low",
      message: "Status output does not include an explicit risks section.",
      reason: "Review readiness is lower when residual risks are not stated clearly.",
      evidence: [".gleip/status.md has no Risks heading with concrete content."],
      files: [],
      suggestedAction: "State residual risks or explicitly say that none were identified."
    });
    deductions.outputDiscipline += 15;
  }

  if (repeatedOutput.length > 0) {
    addWarning(warnings, {
      id: "output.repeated-narration",
      type: "output",
      severity: "low",
      message: "Repeated narration was detected in status output.",
      reason: "Repeated long lines add review noise without adding evidence.",
      evidence: repeatedOutput,
      files: [],
      suggestedAction: "Keep the final response compact and avoid repeating the same explanation."
    });
    deductions.outputDiscipline += 10;
  }

  if (repeatedPlanOutput.length > 0) {
    addWarning(warnings, {
      id: "output.repeated-plan-narration",
      type: "output",
      severity: "low",
      message: "Plan narration was repeated in status output.",
      reason:
        "The final response should report outcomes rather than restating the implementation plan.",
      evidence: repeatedPlanOutput,
      files: [],
      suggestedAction: "Remove repeated plan narration from the final response."
    });
    deductions.outputDiscipline += 10;
  }

  if (unrelatedSuggestions.length > 0) {
    addWarning(warnings, {
      id: "output.unrelated-suggestions",
      type: "output",
      severity: "low",
      message: "Potentially unrelated follow-up suggestions were detected.",
      reason: "Unrequested suggestions can expand scope and distract from review evidence.",
      evidence: unrelatedSuggestions,
      files: [],
      suggestedAction: "Remove unrelated follow-up suggestions from the final response."
    });
    deductions.outputDiscipline += 10;
  }

  if (excessiveOutputCharacters > 0) {
    addWarning(warnings, {
      id: "output.excessive-verbosity",
      type: "output",
      severity: "low",
      message: "Status output exceeds the concise output threshold.",
      reason: "Long status narration makes the final handoff harder to scan.",
      evidence: [`${excessiveOutputCharacters} characters exceed the 6000-character threshold.`],
      files: [],
      suggestedAction:
        "Keep the final response focused on changed files, tests, risks, and Gleip results."
    });
    deductions.outputDiscipline += 10;
  }
}

function activeWarningCount(warnings: ReportWarning[]): number {
  return warnings.filter(
    (warning) =>
      warning.type !== "output" &&
      (warning.severity === "medium" || warning.severity === "high")
  ).length;
}

function calculateEfficiency(
  input: GenerateSessionReportInput,
  outsideScopeFiles: string[],
  repeatedOutput: string[],
  repeatedPlanOutput: string[],
  excessiveOutputCharacters: number
): SessionReport["efficiency"] {
  const basis: EfficiencyBasis[] = [];
  let scopeWasteAvoided = 0;
  const contextWasteAvoided = 0;
  let outputWasteAvoided = 0;

  if (
    outsideScopeFiles.length > 0 &&
    input.diff.rawDiff.length > 0 &&
    hasAcceptedScopeEvidence(input)
  ) {
    const characterCount = diffCharactersForFiles(input.diff.rawDiff, outsideScopeFiles);
    const estimatedTokens = estimateTokens(characterCount);

    if (estimatedTokens > 0) {
      scopeWasteAvoided += estimatedTokens;
      basis.push({
        source: "avoided_diff",
        description: `Local drift checks surfaced ${outsideScopeFiles.length} out-of-scope diff file(s) for removal or approval.`,
        estimatedTokens,
        confidence: "medium"
      });
    }
  }

  if (input.planValidation !== undefined && !isPlanAligned(input.planValidation.status)) {
    const evidenceCharacters = input.planValidation.findings
      .flatMap((finding) => [finding.message, ...(finding.evidence ?? [])])
      .join("\n").length;
    const estimatedTokens = estimateTokens(evidenceCharacters);

    if (estimatedTokens > 0) {
      scopeWasteAvoided += estimatedTokens;
      basis.push({
        source: "rejected_plan_item",
        description: "Plan validation surfaced guidance before further implementation.",
        estimatedTokens,
        confidence: "medium"
      });
    }
  }

  const removableOutputCharacters =
    repeatedOutput.join("\n").length +
    repeatedPlanOutput.join("\n").length +
    excessiveOutputCharacters;

  if (removableOutputCharacters > 0) {
    const estimatedTokens = estimateTokens(removableOutputCharacters);
    outputWasteAvoided += estimatedTokens;
    basis.push({
      source: "output_discipline",
      description:
        "Output-discipline guidance identified repeated or excessive narration that can be removed.",
      estimatedTokens,
      confidence: "low"
    });
  }

  const estimatedTokenWasteAvoided = scopeWasteAvoided + contextWasteAvoided + outputWasteAvoided;

  return {
    estimatedTokenWasteAvoided,
    confidence: basis.some((item) => item.confidence === "high")
      ? "high"
      : basis.some((item) => item.confidence === "medium")
        ? "medium"
        : "low",
    breakdown: {
      scopeWasteAvoided,
      contextWasteAvoided,
      outputWasteAvoided
    },
    basis
  };
}

function hasAcceptedScopeEvidence(input: GenerateSessionReportInput): boolean {
  const validation = input.acceptedPlanValidation ?? input.planValidation;

  return validation !== undefined && isPlanAligned(validation.status);
}

function testIntegrityFor(input: GenerateSessionReportInput): TestIntegrity {
  const testFindings = input.driftResult.findings.filter((finding) => finding.category === "tests");

  if (
    testFindings.some(
      (finding) =>
        finding.severity === "blocking" ||
        finding.severity === "blocked" ||
        finding.severity === "action_required" ||
        finding.severity === "cleanup_required"
    )
  ) {
    return "fail";
  }

  if (testFindings.length > 0) {
    return "warning";
  }

  return input.diff.isGitRepo && input.scopeBudget !== undefined ? "pass" : "unknown";
}

function driftRiskFor(
  status: ReportDriftResult["status"],
  isGitRepo: boolean,
  findings: ReportDriftFinding[]
): ReportRiskLevel {
  if (!isGitRepo) {
    return "medium";
  }

  const driftFindings = findings.filter((finding) => finding.category !== "local_artifacts");

  if (driftFindings.length === 0) {
    return "none";
  }

  if (
    driftFindings.some(
      (finding) =>
        finding.severity === "blocking" ||
        finding.severity === "blocked" ||
        finding.severity === "action_required" ||
        finding.severity === "cleanup_required"
    )
  ) {
    return "high";
  }

  if (
    driftFindings.some(
      (finding) => finding.severity === "fail" || finding.severity === "approval_required"
    )
  ) {
    return "medium";
  }

  if (
    driftFindings.some((finding) => finding.severity === "warn" || finding.severity === "warning")
  ) {
    return "low";
  }

  if (status === "warning" || status === "advisory") {
    return "low";
  }

  return "none";
}

function repositoryHygieneRiskFor(findings: ReportDriftFinding[]): ReportRiskLevel {
  const hygieneFindings = findings.filter((finding) => finding.category === "local_artifacts");

  if (hygieneFindings.some((finding) => reportSeverity(finding.severity) === "high")) {
    return "high";
  }

  if (hygieneFindings.some((finding) => reportSeverity(finding.severity) === "medium")) {
    return "medium";
  }

  return hygieneFindings.length > 0 ? "low" : "none";
}

function overEditRisk(
  outsideScopeCount: number,
  unplannedCount: number,
  findings: ReportDriftFinding[]
): ReportRiskLevel {
  const count = Math.max(outsideScopeCount, unplannedCount);

  if (
    count > 5 ||
    findings.some(
      (finding) =>
        finding.category === "dependencies" &&
        (finding.severity === "fail" ||
          finding.severity === "blocking" ||
          finding.severity === "action_required" ||
          finding.severity === "cleanup_required" ||
          finding.severity === "approval_required" ||
          finding.severity === "blocked")
    )
  ) {
    return "high";
  }

  if (count > 2 || findings.some((finding) => finding.category === "soft_limit")) {
    return "medium";
  }

  if (count > 0) {
    return "low";
  }

  return "none";
}

function riskDeduction(risk: ReportRiskLevel): number {
  if (risk === "high") {
    return 40;
  }

  if (risk === "medium") {
    return 25;
  }

  if (risk === "low") {
    return 10;
  }

  return 0;
}

function repeatedNarration(content: string): string[] {
  const counts = new Map<string, number>();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.length < 40 || line === "- None" || line.startsWith("#")) {
      continue;
    }

    counts.set(line, (counts.get(line) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([line]) => line)
    .sort();
}

function repeatedPlanNarration(content: string, planText: string | undefined): string[] {
  if (planText === undefined) {
    return [];
  }

  const normalizedContent = content.toLowerCase();

  return planText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 30 && normalizedContent.includes(line.toLowerCase()))
    .sort();
}

function findUnrelatedSuggestions(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      /\b(if you want|future enhancement|also consider|unrelated follow-up)\b/i.test(line)
    )
    .sort();
}

function hasChangedFilesEvidence(content: string): boolean {
  return /\b(session files changed|files changed|session changes|changes:\s*\d+\s+files)\b/i.test(
    content
  );
}

function excessiveOutputCharacterCount(content: string): number {
  return Math.max(0, content.length - 6000);
}

function hasEvidenceSection(content: string, headingPattern: string): boolean {
  const heading = new RegExp(`^#{1,4}\\s+${headingPattern}\\s*$`, "im");
  const match = heading.exec(content);

  if (match?.index === undefined) {
    return false;
  }

  const afterHeading = content.slice(match.index + match[0].length);
  const section = afterHeading.split(/^#{1,4}\s+/m)[0] ?? "";
  const normalized = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^-\s*(none|not run|unknown)\.?$/i.test(line));

  return normalized.length > 0;
}

function hasVerificationEvidence(content: string): boolean {
  if (
    hasEvidenceSection(content, "tests") ||
    hasEvidenceSection(content, "verification") ||
    hasEvidenceSection(content, "validation") ||
    hasEvidenceSection(content, "checks")
  ) {
    return true;
  }

  return /\b(?:bun|cargo\s+test|dotnet\s+test|eslint|go\s+test|jest|mocha|npm|pnpm|pytest|ruff|tsc|vitest|yarn)\b[^\n]*(?:0|ok|pass(?:ed)?|success(?:ful)?)/iu.test(
    content
  );
}

function acceptedPlanText(input: GenerateSessionReportInput): string {
  const validation =
    input.acceptedPlanValidation ??
    (input.planValidation !== undefined && isPlanAligned(input.planValidation.status)
      ? input.planValidation
      : undefined);

  return validation?.parsedPlan.rawText ?? "";
}

function extractPathsFromText(text: string): string[] {
  const matches = text.match(
    /(?:^|[\s(["'`])((?:[\w.-]+\/)+[\w.@-]+\.[a-z0-9]+|[\w.@-]+\.(?:cjs|cs|go|java|js|jsx|json|kt|md|mjs|php|py|rb|rs|scss|svelte|toml|ts|tsx|vue|ya?ml))/giu
  );

  return (
    matches
      ?.map((match) => match.trim().replace(/^[(["'`]+|[)"'`,.]+$/g, ""))
      .map(normalizePath) ?? []
  );
}

function isVerificationRequirement(requirement: ReportRequirementLedgerItem): boolean {
  return (
    requirement.category === "verification" ||
    requirement.relatedVerification !== undefined ||
    /\b(test|verify|validation|check|typecheck|lint|smoke)\b/iu.test(requirement.sourceText)
  );
}

function categoryAllowsStatusEvidence(category: string): boolean {
  return ["output", "process", "release", "scope", "safety", "privacy", "security"].includes(
    category
  );
}

function hasRequirementKeywordEvidence(requirementText: string, evidenceText: string): boolean {
  const keywords = requirementKeywords(requirementText);

  if (keywords.length === 0 || evidenceText.trim().length === 0) {
    return false;
  }

  const normalizedEvidence = evidenceText.toLowerCase();
  const matched = keywords.filter((keyword) => normalizedEvidence.includes(keyword));
  const threshold = Math.min(3, Math.max(1, keywords.length >= 3 ? 2 : keywords.length));

  return matched.length >= threshold;
}

function requirementKeywords(text: string): string[] {
  const stopWords = new Set([
    "add",
    "also",
    "and",
    "are",
    "canonical",
    "change",
    "changes",
    "must",
    "need",
    "needs",
    "not",
    "only",
    "required",
    "shall",
    "should",
    "task",
    "that",
    "the",
    "this",
    "update",
    "with",
    "without"
  ]);

  return uniqueStrings(
    text
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9_-]{2,}/gu)
      ?.filter((word) => !stopWords.has(word) && word.length >= 3) ?? []
  ).slice(0, 8);
}

function hasDependencyConflict(input: GenerateSessionReportInput, changedFiles: string[]): boolean {
  return (
    changedFiles.some(isDependencyPath) ||
    input.driftResult.findings.some((finding) => finding.category === "dependencies")
  );
}

function hasCiConflict(input: GenerateSessionReportInput, changedFiles: string[]): boolean {
  return (
    changedFiles.some(isCiPath) ||
    input.driftResult.findings.some((finding) => finding.category === "ci")
  );
}

function hasTestConflict(input: GenerateSessionReportInput): boolean {
  return input.driftResult.findings.some((finding) => finding.category === "tests");
}

function hasProhibitedActionEvidence(requirementText: string, evidenceText: string): boolean {
  if (evidenceText.trim().length === 0 || !hasRequirementKeywordEvidence(requirementText, evidenceText)) {
    return false;
  }

  return /\b(add|added|change|changed|connect|enable|enabled|implement|implemented|install|installed|modify|modified|remove|removed|skip|skipped|weaken|weakened)\b/iu.test(
    evidenceText
  );
}

function isReleasePath(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  const fileName = normalized.split("/").at(-1) ?? "";

  return (
    normalized.startsWith("docs/") ||
    normalized.startsWith("scripts/") ||
    ["changelog.md", "package.json", "readme.md"].includes(fileName)
  );
}

function isDependencyPath(path: string): boolean {
  const fileName = normalizePath(path).split("/").at(-1)?.toLowerCase() ?? "";

  return [
    "bun.lockb",
    "cargo.lock",
    "cargo.toml",
    "composer.json",
    "composer.lock",
    "gemfile",
    "gemfile.lock",
    "go.mod",
    "go.sum",
    "package-lock.json",
    "package.json",
    "pnpm-lock.yaml",
    "poetry.lock",
    "pyproject.toml",
    "requirements.txt",
    "yarn.lock"
  ].includes(fileName);
}

function isCiPath(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();

  return (
    normalized.startsWith(".github/workflows/") ||
    normalized.startsWith(".circleci/") ||
    normalized.startsWith(".buildkite/") ||
    normalized === ".gitlab-ci.yml" ||
    normalized === "azure-pipelines.yml" ||
    normalized === "buildkite.yml" ||
    normalized === "circle.yml" ||
    normalized === "jenkinsfile"
  );
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}

function diffCharactersForFiles(rawDiff: string, files: string[]): number {
  const included = new Set(files.map(normalizePath));
  let currentPath: string | undefined;
  let characterCount = 0;

  for (const line of rawDiff.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      currentPath = parseDiffPath(line);
    }

    if (currentPath !== undefined && included.has(currentPath)) {
      characterCount += line.length + 1;
    }
  }

  return characterCount;
}

function parseDiffPath(line: string): string {
  const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
  return normalizePath(match?.[2] ?? line.replace("diff --git ", ""));
}

function pathsOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizePath(left).replace(/\/$/, "");
  const normalizedRight = normalizePath(right).replace(/\/$/, "");

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}/`) ||
    normalizedRight.startsWith(`${normalizedLeft}/`)
  );
}

function plannedFilesForReport(validation: ReportPlanValidation | undefined): string[] {
  if (validation === undefined) {
    return [];
  }

  const rawText = validation.parsedPlan.rawText;
  const planned = [
    ...validation.parsedPlan.proposedFiles,
    ...(validation.parsedPlan.fileMentions ?? [])
      .filter(
        (mention) =>
          mention.role === "edit" ||
          (mention.role === "output" &&
            isCredibleEditablePlanPath(mention.path) &&
            hasEditIntentForPath(rawText, mention.path))
      )
      .map((mention) => mention.path),
    ...(validation.parsedPlan.outputFiles ?? []).filter(
      (path) => isCredibleEditablePlanPath(path) && hasEditIntentForPath(rawText, path)
    ),
    ...(validation.targetClassifications ?? [])
      .filter(
        (target) =>
          target.classification === "direct" || target.classification === "derived"
      )
      .map((target) => target.target)
  ];

  return mergePathLists(planned);
}

function mergePathLists(...pathLists: string[][]): string[] {
  return Array.from(
    new Set(
      pathLists
        .flat()
        .map(normalizePath)
        .filter((path) => path.length > 0)
    )
  ).sort();
}

function isCredibleEditablePlanPath(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  const fileName = normalized.split("/").at(-1) ?? "";

  return (
    isSourceLikePath(normalized) ||
    isTestPath(normalized) ||
    isDocumentationPath(normalized) ||
    /\.(?:css|html|json|scss|toml|ya?ml)$/iu.test(fileName)
  );
}

function isSourceLikePath(path: string): boolean {
  return /\.(?:cjs|cs|go|java|js|jsx|kt|mjs|php|py|rb|rs|svelte|ts|tsx|vue)$/iu.test(path);
}

function isTestPath(path: string): boolean {
  return (
    path.includes("/tests/") ||
    path.includes("/test/") ||
    path.includes("__tests__/") ||
    /\.(?:spec|test)\.[a-z0-9]+$/iu.test(path)
  );
}

function isDocumentationPath(path: string): boolean {
  const fileName = path.split("/").at(-1) ?? "";

  return (
    path.startsWith("docs/") ||
    [
      "agents.md",
      "architecture.md",
      "changelog.md",
      "contributing.md",
      "full_context.md",
      "notes.md",
      "project_context.md",
      "readme.md"
    ].includes(fileName)
  );
}

function hasEditIntentForPath(text: string, path: string): boolean {
  const normalizedText = normalizePath(text);
  const normalizedPath = normalizePath(path);
  const index = normalizedText.indexOf(normalizedPath);

  if (index < 0) {
    return false;
  }

  const prefix = normalizedText.slice(Math.max(0, index - 140), index);

  return /\b(?:add|change|connect|edit|extend|implement|migrate|modify|patch|refactor|synchronize|touch|update|wire)\b/iu.test(
    prefix
  );
}

function addWarning(warnings: ReportWarning[], warning: ReportWarning): void {
  warnings.push({
    ...warning,
    evidence: warning.evidence.length === 0 ? [warning.reason] : warning.evidence,
    files: [...new Set(warning.files.map(normalizePath))].sort()
  });
}

function orderWarnings(warnings: ReportWarning[]): ReportWarning[] {
  return [...warnings].sort((left, right) => {
    const severityDifference =
      warningSeverityRank(right.severity) - warningSeverityRank(left.severity);
    return severityDifference !== 0 ? severityDifference : left.id.localeCompare(right.id);
  });
}

function reportSeverity(severity: ReportDriftFinding["severity"]): ReportWarningSeverity {
  if (
    severity === "blocking" ||
    severity === "blocked" ||
    severity === "action_required" ||
    severity === "cleanup_required"
  ) {
    return "high";
  }

  if (severity === "fail" || severity === "approval_required") {
    return "high";
  }

  if (severity === "warn" || severity === "warning") {
    return "medium";
  }

  return "info";
}

function warningSeverityRank(severity: ReportWarningSeverity): number {
  if (severity === "high") {
    return 4;
  }

  if (severity === "medium") {
    return 3;
  }

  if (severity === "low") {
    return 2;
  }

  return 1;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function slug(value: string): string {
  return (
    value
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "unknown"
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function formatTokenEstimate(tokens: number): string {
  if (tokens < 1000) {
    return String(tokens);
  }

  return `${(tokens / 1000).toFixed(tokens >= 10_000 ? 0 : 1)}k`;
}

function formatTokenEstimateForReport(tokens: number): string {
  return tokens === 0 ? "unavailable" : `~${formatTokenEstimate(tokens)}`;
}

function renderCompactFinalResponse(input: {
  scores: SessionReport["scores"];
  driftRisk: ReportRiskLevel;
  repositoryHygieneRisk: ReportRiskLevel;
  requirements: ReportRequirementCompletion;
  efficiency: SessionReport["efficiency"];
  unresolvedWarnings: ReportWarning[];
}): string {
  const warningSummary =
    input.unresolvedWarnings.length === 0
      ? "None"
      : `${input.unresolvedWarnings.length} · ${input.unresolvedWarnings
          .slice(0, 2)
          .map((warning) => warning.id)
          .join(", ")}${input.unresolvedWarnings.length > 2 ? ", ..." : ""}`;

  return `### Gleip
- Scope adherence: ${input.scores.scopeAdherence}/100
- Drift risk: ${titleCase(input.driftRisk)}
- Repository hygiene: ${titleCase(input.repositoryHygieneRisk)}
- Output discipline: ${input.scores.outputDiscipline}/100
- Canonical requirements: ${formatCompactRequirementSummary(input.requirements)}
- Evidence-based token waste avoided: ${formatTokenEstimateForReport(input.efficiency.estimatedTokenWasteAvoided)} (${titleCase(input.efficiency.confidence)} confidence)
- Unresolved warnings: ${warningSummary}`;
}

function formatCompactRequirementSummary(report: ReportRequirementCompletion): string {
  if (report.summary.total === 0) {
    return "unavailable";
  }

  return `${report.summary.mandatorySatisfied}/${report.summary.mandatory} mandatory satisfied; ${report.summary.prohibitedViolated} prohibited conflict(s)`;
}

function outputDisciplineNote(report: SessionReport): string {
  const outputWarnings = report.warnings.filter((warning) => warning.type === "output");

  if (outputWarnings.length === 0) {
    return "Required output evidence is present and no avoidable narration was detected.";
  }

  return outputWarnings
    .slice(0, 3)
    .map((warning) => warning.message.replace(/\.$/, "").toLowerCase())
    .join("; ");
}

function isPlanAligned(status: ReportPlanValidation["status"]): boolean {
  return status === "aligned" || status === "advisory" || status === "approved";
}
