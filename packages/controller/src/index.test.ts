import { describe, expect, it } from "vitest";

import {
  clampScore,
  deriveNextAction,
  detectScopeDrift,
  estimateTokens,
  generateSessionReport,
  normalizeDriftFindings,
  packageName,
  renderSessionReportMarkdown,
  type GitDiffContextLike,
  type ReportDiff,
  type ScopeBudgetLike
} from "./index.js";

describe("packageName", () => {
  it("identifies the controller package", () => {
    expect(packageName).toBe("@gleip/controller");
  });
});

describe("detectScopeDrift", () => {
  it("returns clean for no changes", () => {
    const result = detectScopeDrift({
      scopeBudget: budget(),
      gitDiffContext: diff()
    });

    expect(result.status).toBe("clean");
    expect(result.summary).toBe("No working tree changes detected.");
  });

  it("warns when file count exceeds the soft limit", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({
        softLimits: { maxFilesChanged: 1, maxLinesAdded: 100, maxLinesDeleted: 100 }
      }),
      gitDiffContext: diff({
        changedFiles: ["src/a.ts", "src/b.ts"],
        fileStats: [
          { path: "src/a.ts", added: 1, deleted: 0 },
          { path: "src/b.ts", added: 1, deleted: 0 }
        ],
        totalLinesAdded: 2
      })
    });

    expect(result.status).toBe("advisory");
    expect(result.findings[0]).toMatchObject({
      code: "SCOPE_LIMIT_EXCEEDED",
      severity: "warn",
      title: "File count exceeds scope budget"
    });
  });

  it("warns when added lines exceed the soft limit", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({
        softLimits: { maxFilesChanged: 5, maxLinesAdded: 1, maxLinesDeleted: 100 }
      }),
      gitDiffContext: diff({
        changedFiles: ["src/a.ts"],
        fileStats: [{ path: "src/a.ts", added: 2, deleted: 0 }],
        totalLinesAdded: 2
      })
    });

    expect(result.status).toBe("advisory");
    expect(result.findings.map((finding) => finding.title)).toContain(
      "Added lines exceed scope budget"
    );
  });

  it("requires approval when dependency files change but dependencies are not allowed", () => {
    const result = detectScopeDrift({
      scopeBudget: budget(),
      gitDiffContext: diff({
        changedFiles: ["package.json"],
        fileStats: [{ path: "package.json", added: 1, deleted: 0 }],
        totalLinesAdded: 1
      })
    });

    expect(result.status).toBe("needs_approval");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "DEPENDENCY_FILE_CHANGED",
        severity: "approval_required",
        title: "Dependency files changed"
      })
    );
  });

  it("reports lockfile changes separately without making them CI-blocking", () => {
    const result = detectScopeDrift({
      scopeBudget: budget(),
      gitDiffContext: diff({
        changedFiles: ["pnpm-lock.yaml"],
        fileStats: [{ path: "pnpm-lock.yaml", added: 1, deleted: 0 }],
        totalLinesAdded: 1
      })
    });

    expect(result.status).toBe("needs_approval");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "LOCKFILE_CHANGED",
        severity: "approval_required",
        title: "Lockfile changed"
      })
    );
  });

  it("allows declared package metadata edits without allowing dependency additions", () => {
    const metadataBudget = budget({
      allowedPaths: ["package.json", "**/package.json"],
      hardGates: {
        ...budget().hardGates,
        dependencyMetadataChangesAllowed: true
      }
    });
    const versionOnly = detectScopeDrift({
      scopeBudget: metadataBudget,
      gitDiffContext: diff({
        changedFiles: ["package.json"],
        fileStats: [{ path: "package.json", added: 1, deleted: 1 }],
        rawDiff: [
          "diff --git a/package.json b/package.json",
          "--- a/package.json",
          "+++ b/package.json",
          '@@ -2 +2 @@',
          '-  "version": "0.6.0",',
          '+  "version": "0.7.0",'
        ].join("\n"),
        totalLinesAdded: 1,
        totalLinesDeleted: 1
      })
    });
    const dependencyAddition = detectScopeDrift({
      scopeBudget: metadataBudget,
      gitDiffContext: diff({
        changedFiles: ["package.json"],
        fileStats: [{ path: "package.json", added: 1, deleted: 0 }],
        rawDiff: [
          "diff --git a/package.json b/package.json",
          "--- a/package.json",
          "+++ b/package.json",
          '@@ -10,2 +10,3 @@',
          '   "dependencies": {',
          '+    "zod": "^3.0.0",',
          '     "yaml": "^2.0.0"'
        ].join("\n"),
        totalLinesAdded: 1
      })
    });

    expect(versionOnly.findings).not.toContainEqual(
      expect.objectContaining({ code: "DEPENDENCY_FILE_CHANGED" })
    );
    expect(dependencyAddition.findings).toContainEqual(
      expect.objectContaining({
        code: "DEPENDENCY_FILE_CHANGED",
        severity: "approval_required"
      })
    );
  });

  it("requires approval when CI files change but CI is not allowed", () => {
    const result = detectScopeDrift({
      scopeBudget: budget(),
      gitDiffContext: diff({
        changedFiles: [".github/workflows/ci.yml"],
        fileStats: [{ path: ".github/workflows/ci.yml", added: 1, deleted: 0 }],
        totalLinesAdded: 1
      })
    });

    expect(result.status).toBe("needs_approval");
    expect(result.findings.map((finding) => finding.title)).toContain("CI configuration changed");
  });

  it("advises when changed files are outside expected paths", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({ allowedPaths: ["src/users/UserTable.tsx"] }),
      gitDiffContext: diff({
        changedFiles: ["src/payments/Checkout.tsx"],
        fileStats: [{ path: "src/payments/Checkout.tsx", added: 1, deleted: 0 }],
        totalLinesAdded: 1
      })
    });

    expect(result.status).toBe("advisory");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "SCOPE_EXPANSION_WARN",
        severity: "warn",
        title: "Files outside expected scope"
      })
    );
  });

  it("treats declared glob paths as allowed scope", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({
        allowedPaths: ["**/planner/**", "**/*.test.*", "docs", "**/README.md"]
      }),
      gitDiffContext: diff({
        changedFiles: [
          "packages/planner/src/index.ts",
          "packages/planner/src/index.test.ts",
          "docs/plan-validation.md"
        ],
        fileStats: [
          { path: "packages/planner/src/index.ts", added: 1, deleted: 0 },
          { path: "packages/planner/src/index.test.ts", added: 1, deleted: 0 },
          { path: "docs/plan-validation.md", added: 1, deleted: 0 }
        ],
        totalLinesAdded: 3
      })
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "SCOPE_EXPANSION_WARN" })
    );
  });

  it("requires approval when approvalRequiredFor paths change", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({ approvalRequiredFor: ["src/auth/**"] }),
      gitDiffContext: diff({
        changedFiles: ["src/auth/session.ts"],
        fileStats: [{ path: "src/auth/session.ts", added: 1, deleted: 0 }],
        totalLinesAdded: 1
      })
    });

    expect(result.status).toBe("needs_approval");
    expect(result.findings.map((finding) => finding.title)).toContain(
      "Approval-required paths changed"
    );
  });

  it("requires attention when skipped tests are added", () => {
    const result = detectScopeDrift({
      scopeBudget: budget(),
      gitDiffContext: diff({
        changedFiles: ["src/users/UserTable.test.tsx"],
        fileStats: [{ path: "src/users/UserTable.test.tsx", added: 1, deleted: 0 }],
        rawDiff: "+it.skip('handles csv export', () => {})\n",
        totalLinesAdded: 1
      })
    });

    expect(result.status).toBe("needs_attention");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "TEST_SKIPPED",
        severity: "action_required",
        title: "Skipped test added"
      })
    );
  });

  it("requires cleanup when env files change", () => {
    const result = detectScopeDrift({
      scopeBudget: budget(),
      gitDiffContext: diff({
        changedFiles: [".env"],
        fileStats: [{ path: ".env", added: 1, deleted: 0 }],
        totalLinesAdded: 1
      })
    });

    expect(result.status).toBe("needs_cleanup");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "SECRET_FILE_CHANGED",
        severity: "cleanup_required",
        title: "Secret or env file changed"
      })
    );
  });

  it("requires attention when a test file is deleted", () => {
    const result = detectScopeDrift({
      scopeBudget: budget(),
      gitDiffContext: diff({
        changedFiles: ["src/users/UserTable.test.tsx"],
        fileStats: [
          { path: "src/users/UserTable.test.tsx", added: 0, deleted: 20, isDeleted: true }
        ],
        totalLinesDeleted: 20
      })
    });

    expect(result.status).toBe("needs_attention");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "TEST_DELETED",
        severity: "action_required",
        title: "Test file deleted"
      })
    );
  });

  it("requires cleanup for tracked local Gleip artifacts", () => {
    const result = detectScopeDrift({
      scopeBudget: budget(),
      gitDiffContext: diff({
        trackedLocalArtifacts: [".gleip/session.json"]
      })
    });

    expect(result.status).toBe("needs_cleanup");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "LOCAL_ARTIFACT_INCLUDED",
        severity: "cleanup_required",
        title: "Local Gleip artifact included"
      })
    );
  });

  it("groups repeated outside-scope findings", () => {
    const findings = normalizeDriftFindings([
      outsideFinding("src/a.ts"),
      outsideFinding("src/b.ts"),
      outsideFinding("src/c.ts"),
      outsideFinding("src/d.ts")
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "SCOPE_EXPANSION_WARN",
      severity: "warn",
      title: "Files outside expected scope",
      message: "4 files changed outside the expected scope. Examples: src/a.ts, src/b.ts, src/c.ts."
    });
  });

  it("groups repeated dependency findings", () => {
    const findings = normalizeDriftFindings([
      dependencyFinding("package.json"),
      dependencyFinding("pnpm-lock.yaml")
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      code: "DEPENDENCY_FILE_CHANGED",
      severity: "approval_required",
      title: "Dependency files changed",
      message:
        "2 dependency files changed and requires approval. Examples: package.json, pnpm-lock.yaml."
    });
  });

  it("orders findings by severity", () => {
    const findings = normalizeDriftFindings([
      {
        code: "SCOPE_EXPANSION_WARN",
        severity: "warn",
        title: "Warning",
        message: "Warning.",
        category: "warning"
      },
      {
        code: "TEST_SKIPPED",
        severity: "cleanup_required",
        title: "Cleanup",
        message: "Cleanup.",
        category: "cleanup"
      },
      {
        code: "DEPENDENCY_FILE_CHANGED",
        severity: "approval_required",
        title: "Approval",
        message: "Approval.",
        category: "approval"
      }
    ]);

    expect(findings.map((finding) => finding.severity)).toEqual([
      "cleanup_required",
      "approval_required",
      "warn"
    ]);
  });

  it("derives cleanup-specific next action", () => {
    expect(
      deriveNextAction([{ code: "LOCAL_ARTIFACT_INCLUDED" }])
    ).toBe(
      "Remove .gleip session artifacts from the change set or ensure .gleip/ is ignored, then rerun status."
    );
  });

  it("derives dependency-specific next action", () => {
    expect(deriveNextAction([{ code: "DEPENDENCY_FILE_CHANGED" }])).toBe(
      "Request approval for the dependency/metadata change or remove it from the change set."
    );
  });

  it("derives scope-specific next action", () => {
    expect(deriveNextAction([{ code: "SCOPE_LIMIT_EXCEEDED" }])).toBe(
      "Review whether the added scope is declared by the task. Add a scope rationale if needed."
    );
  });

  it("mentions only actual categories in mixed next actions", () => {
    const action = deriveNextAction([
      { code: "LOCAL_ARTIFACT_INCLUDED" },
      { code: "CI_FILE_CHANGED" }
    ]);

    expect(action).toContain(".gleip session artifacts");
    expect(action).toContain("CI change");
    expect(action).not.toContain("skipped");
    expect(action).not.toContain("secret");
  });

  it("accepts small context-doc touches for broad work", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({
        allowedPaths: ["src"],
        contextDocsTouchAllowed: true
      }),
      gitDiffContext: diff({
        changedFiles: ["FULL_CONTEXT.md"],
        fileStats: [{ path: "FULL_CONTEXT.md", added: 12, deleted: 3 }],
        totalLinesAdded: 12,
        totalLinesDeleted: 3
      })
    });

    expect(result.status).toBe("clean");
  });

  it("advises on a large unrelated context-doc rewrite", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({
        allowedPaths: ["src"],
        contextDocsTouchAllowed: true
      }),
      gitDiffContext: diff({
        changedFiles: ["ARCHITECTURE.md"],
        fileStats: [{ path: "ARCHITECTURE.md", added: 180, deleted: 40 }],
        totalLinesAdded: 180,
        totalLinesDeleted: 40
      })
    });

    expect(result.status).toBe("advisory");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "SCOPE_EXPANSION_WARN" })
    );
  });

  it("does not warn on broad-task file count alone", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({
        taskBreadth: "cross_cutting",
        softLimits: { maxFilesChanged: 1, maxLinesAdded: 100, maxLinesDeleted: 100 },
        allowedPaths: ["src"]
      }),
      gitDiffContext: diff({
        changedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
        fileStats: [
          { path: "src/a.ts", added: 1, deleted: 0 },
          { path: "src/b.ts", added: 1, deleted: 0 },
          { path: "src/c.ts", added: 1, deleted: 0 }
        ],
        totalLinesAdded: 3
      })
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "SCOPE_LIMIT_EXCEEDED" })
    );
  });

  it("includes target classifications and reasons for unrelated final diff files", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({
        taskBreadth: "cross_cutting",
        allowedPaths: ["src/routes"],
        explicitScope: ["src/routes"]
      }),
      gitDiffContext: diff({
        changedFiles: ["scripts/release.ts"],
        fileStats: [{ path: "scripts/release.ts", added: 1, deleted: 0 }],
        totalLinesAdded: 1
      })
    });
    const finding = result.findings.find(
      (candidate) => candidate.code === "SCOPE_EXPANSION_WARN"
    );

    expect(finding).toMatchObject({
      code: "SCOPE_EXPANSION_WARN",
      targetClassifications: [
        expect.objectContaining({
          target: "scripts/release.ts",
          classification: "unexplained",
          reason: expect.stringContaining("No relationship")
        })
      ]
    });
    expect(finding?.message).toContain("scripts/release.ts [unexplained]");
    expect(finding?.message).toContain("Next:");
  });
});

describe("session reports", () => {
  it("calculates token estimates with ceil(chars / 4)", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(4)).toBe(1);
    expect(estimateTokens(5)).toBe(2);
  });

  it("clamps scores to the 0-100 range", () => {
    expect(clampScore(-20)).toBe(0);
    expect(clampScore(42.4)).toBe(42);
    expect(clampScore(140)).toBe(100);
  });

  it("generates stable warnings with required evidence fields", () => {
    const report = generateSessionReport({
      version: "0.3.0",
      schemaVersion: "1.0.0",
      generatedAt: "2026-06-09T00:00:00.000Z",
      diff: reportDiff(),
      driftResult: {
        status: "within_scope",
        findings: []
      },
      missingArtifacts: ["session.json", "status.md"]
    });

    expect(report.warnings.length).toBeGreaterThan(0);
    for (const warning of report.warnings) {
      expect(warning.message.length).toBeGreaterThan(0);
      expect(warning.reason.length).toBeGreaterThan(0);
      expect(warning.evidence.length).toBeGreaterThan(0);
      expect(["info", "low", "medium", "high"]).toContain(warning.severity);
    }
  });

  it("penalizes unplanned file changes and estimates flagged diff size", () => {
    const report = generateSessionReport({
      version: "0.3.0",
      schemaVersion: "1.0.0",
      sessionId: "session-1",
      generatedAt: "2026-06-09T00:00:00.000Z",
      scopeBudget: {
        softLimits: {
          maxFilesChanged: 5,
          maxLinesAdded: 100,
          maxLinesDeleted: 100
        },
        allowedPaths: ["src/planned.ts"],
        requiredTests: true
      },
      planValidation: {
        status: "approved",
        findings: [],
        parsedPlan: {
          rawText: "Update src/planned.ts",
          proposedFiles: ["src/planned.ts"]
        }
      },
      diff: reportDiff({
        changedFiles: ["src/unplanned.ts"],
        fileStats: [{ path: "src/unplanned.ts", added: 1, deleted: 0 }],
        rawDiff:
          "diff --git a/src/unplanned.ts b/src/unplanned.ts\n--- a/src/unplanned.ts\n+++ b/src/unplanned.ts\n+change\n",
        totalLinesAdded: 1
      }),
      driftResult: {
        status: "warning",
        findings: []
      },
      statusContent:
        "# Gleip Status\n\n## Tests\n- pnpm test: pass\n\n## Risks\n- None identified.\n"
    });

    expect(report.summary.unplannedFiles).toBe(1);
    expect(report.scores.scopeAdherence).toBeLessThan(100);
    expect(report.scores.planAlignment).toBeLessThan(100);
    expect(report.risk.overEdit).toBe("low");
    expect(report.efficiency.breakdown.scopeWasteAvoided).toBeGreaterThan(0);
  });

  it("detects missing output evidence and repeated narration", () => {
    const repeated =
      "This is repeated narration that is long enough to be treated as review noise.";
    const report = generateSessionReport({
      version: "0.3.0",
      schemaVersion: "1.0.0",
      generatedAt: "2026-06-09T00:00:00.000Z",
      scopeBudget: {
        softLimits: {
          maxFilesChanged: 5,
          maxLinesAdded: 100,
          maxLinesDeleted: 100
        },
        allowedPaths: [],
        requiredTests: true
      },
      diff: reportDiff(),
      driftResult: {
        status: "within_scope",
        findings: []
      },
      statusContent: `# Gleip Status\n\n${repeated}\n${repeated}\n`
    });

    expect(report.scores.outputDiscipline).toBeLessThan(100);
    expect(report.summary.testsMentioned).toBe(false);
    expect(report.summary.risksMentioned).toBe(false);
    expect(report.warnings.map((warning) => warning.id)).toContain("output.repeated-narration");
    expect(report.efficiency.breakdown.outputWasteAvoided).toBeGreaterThan(0);
  });

  it("detects repeated plan narration and excessive output deterministically", () => {
    const planLine = "Update src/report.ts and keep the final response focused on report outcomes.";
    const statusContent = [
      "# Gleip Status",
      "- Session files changed: 1",
      "",
      planLine,
      "x".repeat(6100),
      "",
      "## Tests",
      "- pnpm test: pass",
      "",
      "## Risks",
      "- None identified."
    ].join("\n");
    const input = {
      version: "0.3.0",
      schemaVersion: "1.0.0",
      generatedAt: "2026-06-09T00:00:00.000Z",
      scopeBudget: {
        softLimits: {
          maxFilesChanged: 5,
          maxLinesAdded: 100,
          maxLinesDeleted: 100
        },
        allowedPaths: [],
        requiredTests: true
      },
      planValidation: {
        status: "approved" as const,
        findings: [],
        parsedPlan: {
          rawText: planLine,
          proposedFiles: ["src/report.ts"]
        }
      },
      diff: reportDiff(),
      driftResult: {
        status: "within_scope" as const,
        findings: []
      },
      statusContent
    };

    const first = generateSessionReport(input);
    const second = generateSessionReport(input);

    expect(first.scores.outputDiscipline).toBe(second.scores.outputDiscipline);
    expect(first.scores.outputDiscipline).toBeGreaterThanOrEqual(0);
    expect(first.warnings.map((warning) => warning.id)).toContain("output.repeated-plan-narration");
    expect(first.warnings.map((warning) => warning.id)).toContain("output.excessive-verbosity");
  });

  it("generates a compact final response block", () => {
    const report = generateSessionReport({
      version: "0.3.0",
      schemaVersion: "1.0.0",
      generatedAt: "2026-06-09T00:00:00.000Z",
      diff: reportDiff(),
      driftResult: {
        status: "within_scope",
        findings: []
      }
    });

    expect(report.finalResponse.markdown).toContain("### Gleip");
    expect(report.finalResponse.markdown).toContain("Scope adherence:");
    expect(report.finalResponse.markdown).toContain("Output discipline:");
    expect(report.finalResponse.markdown.split("\n")).toHaveLength(6);
  });

  it("renders a concise markdown report", () => {
    const report = generateSessionReport({
      version: "0.3.0",
      schemaVersion: "1.0.0",
      sessionId: "session-1",
      generatedAt: "2026-06-09T00:00:00.000Z",
      diff: reportDiff(),
      driftResult: {
        status: "within_scope",
        findings: []
      }
    });
    const markdown = renderSessionReportMarkdown(report);

    expect(markdown).toContain("# Gleipnir Session Report");
    expect(markdown).toContain("Scope adherence:");
    expect(markdown).toContain("Estimated token waste avoided:");
    expect(markdown).toContain("## Recommended final response");
    expect(markdown).toContain("It is not exact model billing or API usage data.");
  });
});

function budget(overrides: Partial<ScopeBudgetLike> = {}): ScopeBudgetLike {
  return {
    softLimits: {
      maxFilesChanged: 5,
      maxLinesAdded: 100,
      maxLinesDeleted: 100
    },
    hardGates: {
      newDependenciesAllowed: false,
      ciChangesAllowed: false,
      skippedTestsAllowed: false,
      deletedTestsAllowed: false,
      secretsAllowed: false
    },
    allowedPaths: [],
    approvalRequiredFor: [],
    blockedWithoutApproval: [],
    ...overrides
  };
}

function diff(overrides: Partial<GitDiffContextLike> = {}): GitDiffContextLike {
  return {
    changedFiles: [],
    fileStats: [],
    rawDiff: "",
    totalLinesAdded: 0,
    totalLinesDeleted: 0,
    isGitRepo: true,
    hasChanges: false,
    ...overrides
  };
}

function reportDiff(overrides: Partial<ReportDiff> = {}): ReportDiff {
  return {
    changedFiles: [],
    fileStats: [],
    rawDiff: "",
    totalLinesAdded: 0,
    totalLinesDeleted: 0,
    isGitRepo: true,
    ...overrides
  };
}

function outsideFinding(file: string) {
  return {
    code: "SCOPE_EXPANSION_WARN" as const,
    severity: "warn" as const,
    title: "Files outside expected scope",
    message: `${file} changed outside the expected scope.`,
    file,
    recommendation: "Confirm this is required or reduce the change.",
    category: "allowed_scope"
  };
}

function dependencyFinding(file: string) {
  return {
    code: "DEPENDENCY_FILE_CHANGED" as const,
    severity: "approval_required" as const,
    title: "Dependency files changed",
    message: `${file} changed and requires approval.`,
    file,
    recommendation: "Request approval for the dependency change or remove it.",
    category: "dependencies"
  };
}
