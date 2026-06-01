import { describe, expect, it } from "vitest";

import {
  deriveNextAction,
  detectScopeDrift,
  normalizeDriftFindings,
  packageName,
  type GitDiffContextLike,
  type ScopeBudgetLike
} from "./index.js";

describe("packageName", () => {
  it("identifies the controller package", () => {
    expect(packageName).toBe("@gleip/controller");
  });
});

describe("detectScopeDrift", () => {
  it("returns within_scope for no changes", () => {
    const result = detectScopeDrift({
      scopeBudget: budget(),
      gitDiffContext: diff()
    });

    expect(result.status).toBe("within_scope");
    expect(result.summary).toBe("No working tree changes detected.");
  });

  it("warns when file count exceeds the soft limit", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({ softLimits: { maxFilesChanged: 1, maxLinesAdded: 100, maxLinesDeleted: 100 } }),
      gitDiffContext: diff({
        changedFiles: ["src/a.ts", "src/b.ts"],
        fileStats: [
          { path: "src/a.ts", added: 1, deleted: 0 },
          { path: "src/b.ts", added: 1, deleted: 0 }
        ],
        totalLinesAdded: 2
      })
    });

    expect(result.status).toBe("warning");
    expect(result.findings[0]?.title).toBe("File count exceeds scope budget");
  });

  it("warns when added lines exceed the soft limit", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({ softLimits: { maxFilesChanged: 5, maxLinesAdded: 1, maxLinesDeleted: 100 } }),
      gitDiffContext: diff({
        changedFiles: ["src/a.ts"],
        fileStats: [{ path: "src/a.ts", added: 2, deleted: 0 }],
        totalLinesAdded: 2
      })
    });

    expect(result.status).toBe("warning");
    expect(result.findings.map((finding) => finding.title)).toContain("Added lines exceed scope budget");
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

    expect(result.status).toBe("approval_required");
    expect(result.findings.map((finding) => finding.title)).toContain("Dependency files changed");
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

    expect(result.status).toBe("approval_required");
    expect(result.findings.map((finding) => finding.title)).toContain("CI configuration changed");
  });

  it("warns when changed files are outside allowed paths", () => {
    const result = detectScopeDrift({
      scopeBudget: budget({ allowedPaths: ["src/users/UserTable.tsx"] }),
      gitDiffContext: diff({
        changedFiles: ["src/payments/Checkout.tsx"],
        fileStats: [{ path: "src/payments/Checkout.tsx", added: 1, deleted: 0 }],
        totalLinesAdded: 1
      })
    });

    expect(result.status).toBe("warning");
    expect(result.findings.map((finding) => finding.title)).toContain("Files outside allowed scope");
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

    expect(result.status).toBe("approval_required");
    expect(result.findings.map((finding) => finding.title)).toContain("Approval-required paths changed");
  });

  it("blocks when skipped tests are added", () => {
    const result = detectScopeDrift({
      scopeBudget: budget(),
      gitDiffContext: diff({
        changedFiles: ["src/users/UserTable.test.tsx"],
        fileStats: [{ path: "src/users/UserTable.test.tsx", added: 1, deleted: 0 }],
        rawDiff: "+it.skip('handles csv export', () => {})\n",
        totalLinesAdded: 1
      })
    });

    expect(result.status).toBe("blocked");
    expect(result.findings.map((finding) => finding.title)).toContain("Skipped test added");
  });

  it("blocks when env files change", () => {
    const result = detectScopeDrift({
      scopeBudget: budget(),
      gitDiffContext: diff({
        changedFiles: [".env"],
        fileStats: [{ path: ".env", added: 1, deleted: 0 }],
        totalLinesAdded: 1
      })
    });

    expect(result.status).toBe("blocked");
    expect(result.findings.map((finding) => finding.title)).toContain("Secret or env file changed");
  });

  it("blocks when a test file is deleted", () => {
    const result = detectScopeDrift({
      scopeBudget: budget(),
      gitDiffContext: diff({
        changedFiles: ["src/users/UserTable.test.tsx"],
        fileStats: [{ path: "src/users/UserTable.test.tsx", added: 0, deleted: 20, isDeleted: true }],
        totalLinesDeleted: 20
      })
    });

    expect(result.status).toBe("blocked");
    expect(result.findings.map((finding) => finding.title)).toContain("Test file deleted");
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
      severity: "warning",
      title: "Files outside allowed scope",
      message: "4 files changed outside the approved scope. Examples: src/a.ts, src/b.ts, src/c.ts."
    });
  });

  it("groups repeated dependency findings", () => {
    const findings = normalizeDriftFindings([
      dependencyFinding("package.json"),
      dependencyFinding("pnpm-lock.yaml")
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: "approval_required",
      title: "Dependency files changed",
      message:
        "2 dependency files changed, but dependency changes are not allowed by the budget. Examples: package.json, pnpm-lock.yaml."
    });
  });

  it("orders findings by severity", () => {
    const findings = normalizeDriftFindings([
      {
        severity: "warning",
        title: "Warning",
        message: "Warning.",
        category: "warning"
      },
      {
        severity: "blocked",
        title: "Blocked",
        message: "Blocked.",
        category: "blocked"
      },
      {
        severity: "approval_required",
        title: "Approval",
        message: "Approval.",
        category: "approval"
      }
    ]);

    expect(findings.map((finding) => finding.severity)).toEqual([
      "blocked",
      "approval_required",
      "warning"
    ]);
  });

  it("derives blocked next action", () => {
    expect(deriveNextAction("blocked")).toBe(
      "Fix blocked issues before continuing. Do not proceed until skipped/deleted tests or secret changes are resolved."
    );
  });

  it("derives approval_required next action", () => {
    expect(deriveNextAction("approval_required")).toBe(
      "Stop and ask for approval before continuing, or revise the implementation to stay within budget."
    );
  });

  it("derives warning next action", () => {
    expect(deriveNextAction("warning")).toBe(
      "Review warnings and reduce scope if practical. Continue only if the expanded scope is justified."
    );
  });

  it("derives within_scope next action", () => {
    expect(deriveNextAction("within_scope")).toBe("Continue. Run relevant tests before final response.");
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

function outsideFinding(file: string) {
  return {
    severity: "warning" as const,
    title: "Files outside allowed scope",
    message: `${file} changed outside the approved scope.`,
    file,
    recommendation: "Confirm this is required or reduce the change.",
    category: "allowed_scope"
  };
}

function dependencyFinding(file: string) {
  return {
    severity: "approval_required" as const,
    title: "Dependency files changed",
    message: `${file} changed, but dependency changes are not allowed by the budget.`,
    file,
    recommendation: "Stop and ask for approval before changing dependency files.",
    category: "dependencies"
  };
}
