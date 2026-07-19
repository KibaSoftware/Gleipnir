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
  type ReportRequirementLedger,
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

  it("keeps numeric file budgets silent", () => {
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

    expect(result.status).toBe("clean");
    expect(result.findings).toEqual([]);
    expect(result.metrics.filesChanged).toBe(2);
  });

  it("keeps numeric line budgets silent while retaining metrics", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({
        allowedPaths: ["src/a.ts"],
        expectedPaths: ["src/a.ts"],
        softLimits: { maxFilesChanged: 5, maxLinesAdded: 1, maxLinesDeleted: 100 }
      }),
      gitDiffContext: diff({
        changedFiles: ["src/a.ts"],
        fileStats: [{ path: "src/a.ts", added: 2, deleted: 0 }],
        totalLinesAdded: 2
      })
    });

    expect(result.status).toBe("clean");
    expect(result.findings).toEqual([]);
    expect(result.metrics.linesAdded).toBe(2);
  });

  it("scales line-count advisories for broad accepted work", () => {
    const changedFiles = Array.from({ length: 8 }, (_, index) => `src/area${index + 1}.ts`);
    const result = detectScopeDrift({
      scopeBudget: budget({
        taskBreadth: "subsystem",
        allowedPaths: changedFiles,
        expectedPaths: changedFiles,
        softLimits: { maxFilesChanged: 16, maxLinesAdded: 600, maxLinesDeleted: 360 }
      }),
      gitDiffContext: diff({
        changedFiles,
        fileStats: changedFiles.map((path, index) => ({
          path,
          added: index === 0 ? 110 : 110,
          deleted: 0
        })),
        totalLinesAdded: 880
      })
    });

    expect(result.findings.map((finding) => finding.title)).not.toContain(
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
          "@@ -2 +2 @@",
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
          "@@ -10,2 +10,3 @@",
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

  it("does not count ephemeral Gleip runtime artifacts as task changes", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({
        allowedPaths: ["src/a.ts"],
        expectedPaths: ["src/a.ts"],
        softLimits: { maxFilesChanged: 1, maxLinesAdded: 5, maxLinesDeleted: 5 }
      }),
      gitDiffContext: diff({
        changedFiles: ["src/a.ts", ".gleip/status.md", ".gleip/report.json"],
        fileStats: [
          { path: "src/a.ts", added: 2, deleted: 0 },
          { path: ".gleip/status.md", added: 40, deleted: 0 },
          { path: ".gleip/report.json", added: 100, deleted: 0 }
        ],
        totalLinesAdded: 142
      })
    });

    expect(result.status).toBe("clean");
    expect(result.metrics).toEqual({
      filesChanged: 1,
      linesAdded: 2,
      linesDeleted: 0
    });
    expect(result.findings).toEqual([]);
  });

  it("does not ignore durable .gleip files", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({
        allowedPaths: ["src"],
        expectedPaths: ["src"]
      }),
      gitDiffContext: diff({
        changedFiles: [".gleip/policy.md"],
        fileStats: [{ path: ".gleip/policy.md", added: 1, deleted: 0 }],
        totalLinesAdded: 1
      })
    });

    expect(result.status).toBe("advisory");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "SCOPE_EXPANSION_WARN",
        severity: "warn",
        examples: [".gleip/policy.md"]
      })
    );
  });

  it("keeps real unexplained scope visible", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({
        allowedPaths: ["src/users"],
        expectedPaths: ["src/users"],
        explicitScope: ["src/users"]
      }),
      gitDiffContext: diff({
        changedFiles: ["scripts/release.ts"],
        fileStats: [{ path: "scripts/release.ts", added: 1, deleted: 0 }],
        totalLinesAdded: 1
      })
    });

    expect(result.status).toBe("advisory");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "SCOPE_EXPANSION_WARN",
        targetClassifications: [
          expect.objectContaining({
            target: "scripts/release.ts",
            classification: "unexplained"
          })
        ]
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
    expect(deriveNextAction([{ code: "LOCAL_ARTIFACT_INCLUDED" }])).toBe(
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

  it.each(["README.md", "docs/usage.md", "FULL_CONTEXT.md", "PROJECT_CONTEXT.md"])(
    "accepts explicitly expected documentation/context target %s",
    (path) => {
      const result = detectScopeDrift({
        scopeBudget: budget({
          allowedPaths: [path],
          expectedPaths: [path],
          explicitScope: [path],
          softLimits: { maxFilesChanged: 5, maxLinesAdded: 1, maxLinesDeleted: 100 }
        }),
        gitDiffContext: diff({
          changedFiles: [path],
          fileStats: [{ path, added: 2, deleted: 0 }],
          totalLinesAdded: 2
        })
      });

      expect(result.status).toBe("clean");
      expect(result.findings).toEqual([]);
      expect(result.findings).not.toContainEqual(
        expect.objectContaining({ code: "SCOPE_EXPANSION_WARN" })
      );
      expect(result.status).not.toBe("needs_cleanup");
    }
  );

  it("warns for unrelated documentation without treating it as cleanup", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({
        allowedPaths: ["src/foo.ts"],
        expectedPaths: ["src/foo.ts"]
      }),
      gitDiffContext: diff({
        changedFiles: ["docs/unrelated.md"],
        fileStats: [{ path: "docs/unrelated.md", added: 2, deleted: 0 }],
        totalLinesAdded: 2
      })
    });

    expect(result.status).toBe("advisory");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "SCOPE_EXPANSION_WARN", severity: "warn" })
    );
    expect(result.status).not.toBe("needs_cleanup");
  });

  it("keeps durable .gleip documentation visible but not suspicious when declared", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({
        allowedPaths: [".gleip/policy.md"],
        expectedPaths: [".gleip/policy.md"],
        explicitScope: [".gleip/policy.md"]
      }),
      gitDiffContext: diff({
        changedFiles: [".gleip/policy.md"],
        fileStats: [{ path: ".gleip/policy.md", added: 2, deleted: 0 }],
        totalLinesAdded: 2
      })
    });

    expect(result.status).toBe("clean");
    expect(result.findings).toEqual([]);
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
    const finding = result.findings.find((candidate) => candidate.code === "SCOPE_EXPANSION_WARN");

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
      schemaVersion: "1.1.0",
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
      schemaVersion: "1.1.0",
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

  it("does not claim scope savings from discovery-only outside-scope evidence", () => {
    const report = generateSessionReport({
      version: "0.8.3",
      schemaVersion: "1.2.0",
      sessionId: "session-1",
      generatedAt: "2026-06-09T00:00:00.000Z",
      scopeBudget: {
        softLimits: {
          maxFilesChanged: 5,
          maxLinesAdded: 100,
          maxLinesDeleted: 100
        },
        allowedPaths: ["src/discovered.ts"],
        expectedPaths: ["src/discovered.ts"],
        requiredTests: true
      },
      diff: reportDiff({
        changedFiles: ["src/adjacent.ts"],
        fileStats: [{ path: "src/adjacent.ts", added: 1, deleted: 0 }],
        rawDiff:
          "diff --git a/src/adjacent.ts b/src/adjacent.ts\n--- a/src/adjacent.ts\n+++ b/src/adjacent.ts\n+change\n",
        totalLinesAdded: 1
      }),
      driftResult: {
        status: "advisory",
        findings: []
      },
      statusContent:
        "# Gleip Status\n\n## Tests\n- pnpm test: pass\n\n## Risks\n- None identified.\n"
    });

    expect(report.warnings.map((warning) => warning.id)).toContain("scope.outside-budget");
    expect(report.efficiency.breakdown.scopeWasteAvoided).toBe(0);
    expect(report.efficiency.basis.map((item) => item.source)).not.toContain("avoided_diff");
  });

  it("uses accepted plan validation for unplanned-file analysis", () => {
    const report = generateSessionReport({
      version: "0.7.5",
      schemaVersion: "1.1.0",
      sessionId: "session-1",
      generatedAt: "2026-06-09T00:00:00.000Z",
      scopeBudget: {
        softLimits: {
          maxFilesChanged: 5,
          maxLinesAdded: 100,
          maxLinesDeleted: 100
        },
        allowedPaths: ["src/accepted.ts"],
        expectedPaths: ["src/accepted.ts"],
        requiredTests: true
      },
      acceptedPlanValidation: {
        status: "aligned",
        findings: [],
        parsedPlan: {
          rawText: "Update src/accepted.ts and run tests.",
          proposedFiles: ["src/accepted.ts"]
        }
      },
      planValidation: {
        status: "needs_approval",
        findings: [
          {
            title: "Approval required",
            message: "Dependency metadata needs approval."
          }
        ],
        parsedPlan: {
          rawText: "Update package.json.",
          proposedFiles: ["package.json"]
        }
      },
      diff: reportDiff({
        changedFiles: ["src/accepted.ts"],
        fileStats: [{ path: "src/accepted.ts", added: 2, deleted: 0 }],
        totalLinesAdded: 2
      }),
      driftResult: {
        status: "clean",
        findings: []
      }
    });

    expect(report.summary.unplannedFiles).toBe(0);
    expect(report.warnings.map((warning) => warning.id)).toContain("plan.guidance");
    expect(report.warnings.map((warning) => warning.id)).not.toContain("plan.unplanned-files");
    expect(report.warnings.find((warning) => warning.id === "plan.guidance")?.reason).toContain(
      "accepted implementation scope"
    );
  });

  it("uses credible edit mentions when old artifacts misbucket planned files as output", () => {
    const report = generateSessionReport({
      version: "0.8.3",
      schemaVersion: "1.2.0",
      sessionId: "session-1",
      generatedAt: "2026-06-09T00:00:00.000Z",
      scopeBudget: {
        softLimits: {
          maxFilesChanged: 8,
          maxLinesAdded: 200,
          maxLinesDeleted: 100
        },
        allowedPaths: ["src/analysis/engine.ts"],
        expectedPaths: ["src/analysis/engine.ts"],
        requiredTests: true,
        verificationExpected: true
      },
      acceptedPlanValidation: {
        status: "advisory",
        findings: [],
        parsedPlan: {
          rawText:
            "Edit src/analysis/engine.ts and src/api/contracts.ts to update cache-key isolation, then run focused tests.",
          proposedFiles: ["src/analysis/engine.ts"],
          outputFiles: ["src/api/contracts.ts"],
          fileMentions: [
            { path: "src/analysis/engine.ts", role: "edit", markedNew: false },
            { path: "src/api/contracts.ts", role: "output", markedNew: false }
          ]
        }
      },
      planValidation: {
        status: "advisory",
        findings: [],
        parsedPlan: {
          rawText:
            "Edit src/analysis/engine.ts and src/api/contracts.ts to update cache-key isolation, then run focused tests.",
          proposedFiles: ["src/analysis/engine.ts"],
          outputFiles: ["src/api/contracts.ts"],
          fileMentions: [
            { path: "src/analysis/engine.ts", role: "edit", markedNew: false },
            { path: "src/api/contracts.ts", role: "output", markedNew: false }
          ]
        }
      },
      diff: reportDiff({
        changedFiles: ["src/api/contracts.ts"],
        fileStats: [{ path: "src/api/contracts.ts", added: 3, deleted: 0 }],
        totalLinesAdded: 3
      }),
      driftResult: {
        status: "clean",
        findings: []
      },
      statusContent:
        "# Gleip Status\n\n- Session files changed: 1\n\nValidation: pnpm vitest passed\n\n## Risks\n- None identified.\n"
    });

    expect(report.summary.unplannedFiles).toBe(0);
    expect(report.summary.testsMentioned).toBe(true);
    expect(report.warnings.map((warning) => warning.id)).not.toContain("plan.unplanned-files");
    expect(report.warnings.map((warning) => warning.id)).not.toContain("scope.outside-budget");
    expect(report.warnings.map((warning) => warning.id)).not.toContain("plan.guidance");
  });

  it("reports dirty baseline attribution without changing drift risk", () => {
    const report = generateSessionReport({
      version: "0.7.5",
      schemaVersion: "1.1.0",
      sessionId: "session-1",
      generatedAt: "2026-06-09T00:00:00.000Z",
      scopeBudget: {
        softLimits: {
          maxFilesChanged: 5,
          maxLinesAdded: 100,
          maxLinesDeleted: 100
        },
        allowedPaths: ["README.md"],
        expectedPaths: ["README.md"],
        requiredTests: false
      },
      baseline: {
        possiblyPreExistingFiles: ["README.md"]
      },
      diff: reportDiff({
        changedFiles: ["README.md"],
        fileStats: [{ path: "README.md", added: 2, deleted: 0 }],
        totalLinesAdded: 2
      }),
      driftResult: {
        status: "clean",
        findings: []
      }
    });

    expect(report.risk.drift).toBe("none");
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        id: "baseline.ambiguous-attribution",
        severity: "info",
        files: ["README.md"]
      })
    );
  });

  it("reports tracked Gleip runtime files as repository hygiene without task drift", () => {
    const report = generateSessionReport({
      version: "0.7.5",
      schemaVersion: "1.1.0",
      sessionId: "session-1",
      generatedAt: "2026-06-09T00:00:00.000Z",
      scopeBudget: {
        softLimits: {
          maxFilesChanged: 5,
          maxLinesAdded: 100,
          maxLinesDeleted: 100
        },
        allowedPaths: [],
        requiredTests: false
      },
      diff: reportDiff(),
      driftResult: {
        status: "needs_cleanup",
        findings: [
          {
            code: "LOCAL_ARTIFACT_INCLUDED",
            severity: "cleanup_required",
            title: "Local Gleip artifact included",
            message: ".gleip/session.json are tracked by git.",
            examples: [".gleip/session.json"],
            recommendation:
              "Remove .gleip session artifacts from version control and keep .gleip/ ignored.",
            category: "local_artifacts"
          }
        ]
      }
    });

    expect(report.scores.scopeAdherence).toBe(100);
    expect(report.risk.drift).toBe("none");
    expect(report.risk.repositoryHygiene).toBe("high");
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        id: "LOCAL_ARTIFACT_INCLUDED",
        severity: "high",
        files: [".gleip/session.json"]
      })
    );
    expect(report.finalResponse.markdown).toContain("Drift risk: None");
    expect(report.finalResponse.markdown).toContain("Repository hygiene: High");
    expect(report.finalResponse.markdown).toContain("LOCAL_ARTIFACT_INCLUDED");
  });

  it("detects missing output evidence and repeated narration", () => {
    const repeated =
      "This is repeated narration that is long enough to be treated as review noise.";
    const report = generateSessionReport({
      version: "0.3.0",
      schemaVersion: "1.1.0",
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

  it("keeps review readiness below 100 when required verification evidence is missing", () => {
    const report = generateSessionReport({
      version: "0.8.2",
      schemaVersion: "1.2.0",
      generatedAt: "2026-06-09T00:00:00.000Z",
      scopeBudget: {
        softLimits: {
          maxFilesChanged: 5,
          maxLinesAdded: 100,
          maxLinesDeleted: 100
        },
        allowedPaths: ["src/runtime.ts"],
        expectedPaths: ["src/runtime.ts"],
        requiredTests: true,
        verificationExpected: true,
        workflowProfile: "local_behavior_change",
        planRequired: true
      },
      planValidation: {
        status: "approved",
        findings: [],
        parsedPlan: {
          rawText: "Update src/runtime.ts and run tests.",
          proposedFiles: ["src/runtime.ts"]
        }
      },
      diff: reportDiff({
        changedFiles: ["src/runtime.ts"],
        fileStats: [{ path: "src/runtime.ts", added: 2, deleted: 0 }],
        totalLinesAdded: 2
      }),
      driftResult: {
        status: "clean",
        findings: []
      },
      statusContent: "# Gleip Status\n\n- Session files changed: 1\n"
    });

    expect(report.scores.reviewReadiness).toBeLessThan(100);
    expect(report.warnings.map((warning) => warning.id)).toContain("output.tests-missing");
  });

  it("does not penalize documentation-only work for omitting an unnecessary plan", () => {
    const report = generateSessionReport({
      version: "0.8.2",
      schemaVersion: "1.2.0",
      generatedAt: "2026-06-09T00:00:00.000Z",
      scopeBudget: {
        softLimits: {
          maxFilesChanged: 2,
          maxLinesAdded: 120,
          maxLinesDeleted: 120
        },
        allowedPaths: ["FULL_CONTEXT.md"],
        expectedPaths: ["FULL_CONTEXT.md"],
        requiredTests: false,
        verificationExpected: false,
        workflowProfile: "documentation_only",
        planRequired: false
      },
      diff: reportDiff({
        changedFiles: ["FULL_CONTEXT.md"],
        fileStats: [{ path: "FULL_CONTEXT.md", added: 4, deleted: 1 }],
        totalLinesAdded: 4,
        totalLinesDeleted: 1
      }),
      driftResult: {
        status: "clean",
        findings: []
      },
      statusContent: "# Gleip Status\n\n- Session files changed: 1\n\n## Findings\n- None\n"
    });

    expect(report.scores.planAlignment).toBe(100);
    expect(report.warnings.map((warning) => warning.id)).not.toContain("plan.missing");
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
      schemaVersion: "1.1.0",
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

  it("keeps review readiness below 100 when mandatory canonical requirements lack evidence", () => {
    const report = generateSessionReport({
      version: "0.8.4",
      schemaVersion: "1.3.0",
      generatedAt: "2026-06-09T00:00:00.000Z",
      diff: reportDiff(),
      driftResult: {
        status: "clean",
        findings: []
      },
      requirementLedger: requirementLedger([
        {
          id: "req-1",
          sourceText: "Must add CSV export to the users table.",
          obligation: "required",
          category: "behavior",
          status: "active",
          relatedPaths: ["src/features/users/UserTable.tsx"]
        }
      ])
    });

    expect(report.requirements.summary.mandatory).toBe(1);
    expect(report.requirements.summary.mandatoryUnresolved).toBe(1);
    expect(report.scores.reviewReadiness).toBeLessThan(100);
    expect(report.scores.planAlignment).toBeLessThan(100);
    expect(report.warnings.map((warning) => warning.id)).toContain("requirement.unresolved");
    expect(report.finalResponse.markdown).toContain("0/1 mandatory satisfied");
  });

  it("marks mandatory requirements complete from local changed-path and verification evidence", () => {
    const report = generateSessionReport({
      version: "0.8.4",
      schemaVersion: "1.3.0",
      generatedAt: "2026-06-09T00:00:00.000Z",
      scopeBudget: {
        softLimits: {
          maxFilesChanged: 5,
          maxLinesAdded: 100,
          maxLinesDeleted: 100
        },
        allowedPaths: ["src/features/users/UserTable.tsx"],
        expectedPaths: ["src/features/users/UserTable.tsx"],
        requiredTests: true,
        verificationExpected: true,
        planRequired: true
      },
      acceptedPlanValidation: {
        status: "aligned",
        findings: [],
        parsedPlan: {
          rawText: "Update src/features/users/UserTable.tsx and run focused tests.",
          proposedFiles: ["src/features/users/UserTable.tsx"]
        }
      },
      planValidation: {
        status: "aligned",
        findings: [],
        parsedPlan: {
          rawText: "Update src/features/users/UserTable.tsx and run focused tests.",
          proposedFiles: ["src/features/users/UserTable.tsx"]
        }
      },
      diff: reportDiff({
        changedFiles: ["src/features/users/UserTable.tsx"],
        fileStats: [{ path: "src/features/users/UserTable.tsx", added: 4, deleted: 0 }],
        totalLinesAdded: 4
      }),
      driftResult: {
        status: "clean",
        findings: []
      },
      statusContent:
        "# Gleip Status\n\n- Session files changed: 1\n\n## Tests\n- pnpm test: pass\n\n## Risks\n- None identified.\n",
      requirementLedger: requirementLedger([
        {
          id: "req-1",
          sourceText: "Must add CSV export to the users table.",
          obligation: "required",
          category: "behavior",
          status: "active",
          relatedPaths: ["src/features/users/UserTable.tsx"]
        },
        {
          id: "req-2",
          sourceText: "Run focused tests.",
          obligation: "required",
          category: "verification",
          status: "active",
          relatedVerification: "pnpm test"
        }
      ])
    });

    expect(report.requirements.summary.mandatorySatisfied).toBe(2);
    expect(report.requirements.summary.mandatoryUnresolved).toBe(0);
    expect(report.warnings.map((warning) => warning.id)).not.toContain("requirement.unresolved");
  });

  it("reports prohibited canonical requirement conflicts", () => {
    const report = generateSessionReport({
      version: "0.8.4",
      schemaVersion: "1.3.0",
      generatedAt: "2026-06-09T00:00:00.000Z",
      diff: reportDiff({
        changedFiles: ["package.json"],
        fileStats: [{ path: "package.json", added: 1, deleted: 0 }],
        totalLinesAdded: 1
      }),
      driftResult: {
        status: "needs_approval",
        findings: [
          {
            code: "DEPENDENCY_FILE_CHANGED",
            severity: "approval_required",
            title: "Dependency files changed",
            message: "package.json changed and requires approval.",
            examples: ["package.json"],
            category: "dependencies"
          }
        ]
      },
      requirementLedger: requirementLedger([
        {
          id: "req-1",
          sourceText: "Do not add dependencies.",
          obligation: "prohibited",
          category: "dependency",
          status: "active"
        }
      ])
    });

    expect(report.requirements.summary.prohibitedViolated).toBe(1);
    expect(report.scores.reviewReadiness).toBeLessThan(100);
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        id: "requirement.prohibited-conflict",
        severity: "high"
      })
    );
  });

  it("keeps optional canonical requirements advisory and unpenalized", () => {
    const report = generateSessionReport({
      version: "0.8.4",
      schemaVersion: "1.3.0",
      generatedAt: "2026-06-09T00:00:00.000Z",
      diff: reportDiff(),
      driftResult: {
        status: "clean",
        findings: []
      },
      requirementLedger: requirementLedger([
        {
          id: "req-1",
          sourceText: "Consider adding extra documentation.",
          obligation: "optional",
          category: "documentation",
          status: "active"
        }
      ])
    });

    expect(report.requirements.summary.advisory).toBe(1);
    expect(report.scores.planAlignment).toBe(100);
    expect(report.scores.reviewReadiness).toBe(100);
    expect(report.warnings.map((warning) => warning.id)).not.toContain("requirement.unresolved");
  });

  it("generates a compact final response block", () => {
    const report = generateSessionReport({
      version: "0.3.0",
      schemaVersion: "1.1.0",
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
    expect(report.finalResponse.markdown).toContain("Canonical requirements:");
    expect(report.finalResponse.markdown.split("\n")).toHaveLength(8);
  });

  it("renders a concise markdown report", () => {
    const report = generateSessionReport({
      version: "0.3.0",
      schemaVersion: "1.1.0",
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
    expect(markdown).toContain("Repository hygiene:");
    expect(markdown).toContain("Estimated removable text:");
    expect(markdown).toContain("## Canonical requirements");
    expect(markdown).toContain("## Recommended final response");
    expect(markdown).toContain("Token-waste reporting is deterministic and evidence-based.");
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

function requirementLedger(
  requirements: ReportRequirementLedger["requirements"]
): ReportRequirementLedger {
  return {
    schemaVersion: "1.0.0",
    authority: "derived",
    requirements,
    conflicts: []
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
