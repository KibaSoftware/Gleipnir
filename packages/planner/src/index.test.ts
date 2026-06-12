import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  classifyTask,
  createScopeBudget,
  discoverRepoContext,
  extractTaskTerms,
  generateImplementationBrief,
  packageName,
  parseAgentPlan,
  validateAgentPlan,
  type RepoContext,
  type ScopeBudget,
  type TaskClassification
} from "./index.js";

const tempRepos: string[] = [];

describe("packageName", () => {
  it("identifies the planner package", () => {
    expect(packageName).toBe("@gleip/planner");
  });
});

describe("classifyTask", () => {
  it.each([
    [
      "Change empty state copy on transfers page",
      {
        taskType: "copy_change",
        confidence: "high",
        riskLevel: "low",
        likelyRequiresTests: false,
        likelyAllowsNewDependencies: false
      }
    ],
    [
      "Update button color on the checkout page",
      {
        taskType: "ui_tweak",
        riskLevel: "low",
        likelyRequiresTests: false,
        likelyAllowsNewDependencies: false
      }
    ],
    [
      "Fix crash when user profile is missing avatar",
      {
        taskType: "bug_fix",
        confidence: "high",
        riskLevel: "medium",
        likelyRequiresTests: true,
        likelyAllowsNewDependencies: false
      }
    ],
    [
      "Add CSV export to users table",
      {
        taskType: "small_feature",
        riskLevel: "medium",
        likelyRequiresTests: true,
        likelyAllowsNewDependencies: false
      }
    ],
    [
      "Create GET /users/:id endpoint",
      {
        taskType: "api_endpoint",
        confidence: "high",
        riskLevel: "medium",
        likelyRequiresTests: true,
        likelyAllowsNewDependencies: false
      }
    ],
    [
      "Refactor checkout flow",
      {
        taskType: "refactor",
        confidence: "high",
        riskLevel: "medium",
        likelyRequiresTests: true,
        likelyAllowsNewDependencies: false
      }
    ],
    [
      "Upgrade React Router",
      {
        taskType: "dependency_upgrade",
        confidence: "high",
        riskLevel: "medium",
        likelyRequiresTests: true,
        likelyAllowsNewDependencies: true
      }
    ],
    [
      "Add database migration for subscriptions",
      {
        taskType: "migration",
        confidence: "high",
        riskLevel: "high",
        likelyRequiresTests: true,
        likelyAllowsNewDependencies: false
      }
    ],
    [
      "Add SSO login",
      {
        taskType: "auth_security_change",
        confidence: "high",
        riskLevel: "high",
        likelyRequiresTests: true,
        likelyAllowsNewDependencies: true
      }
    ],
    [
      "Update GitHub Actions workflow",
      {
        taskType: "infra_ci_change",
        confidence: "high",
        riskLevel: "high",
        likelyRequiresTests: true,
        likelyAllowsNewDependencies: false
      }
    ],
    [
      "Add tests for password validation",
      {
        taskType: "test_only",
        confidence: "high",
        riskLevel: "low",
        likelyRequiresTests: false,
        likelyAllowsNewDependencies: false
      }
    ]
  ] satisfies Array<[string, Partial<TaskClassification>]>)("classifies %s", (task, expected) => {
    expect(classifyTask(task)).toMatchObject(expected);
  });

  it("uses high-risk precedence when multiple signals overlap", () => {
    expect(classifyTask("Add Docker workflow for API deploy")).toMatchObject({
      taskType: "infra_ci_change",
      riskLevel: "high"
    });
    expect(classifyTask("Add auth database migration")).toMatchObject({
      taskType: "auth_security_change",
      riskLevel: "high"
    });
    expect(classifyTask("Add schema endpoint for users")).toMatchObject({
      taskType: "migration",
      riskLevel: "high"
    });
  });

  it("lets clear test-only tasks win over auth and security terms", () => {
    expect(classifyTask("Add tests for auth token validation")).toMatchObject({
      taskType: "test_only",
      riskLevel: "low"
    });
  });

  it("classifies empty or unsignaled tasks as unknown", () => {
    expect(classifyTask("")).toMatchObject({
      taskType: "unknown",
      confidence: "low",
      riskLevel: "medium"
    });
    expect(classifyTask("Make it better")).toMatchObject({
      taskType: "unknown",
      confidence: "low",
      riskLevel: "medium"
    });
  });
});

describe("extractTaskTerms", () => {
  it("extracts useful normalized task terms", () => {
    expect(extractTaskTerms("Add CSV export to users table")).toEqual([
      "csv",
      "export",
      "table",
      "user",
      "users"
    ]);
    expect(extractTaskTerms("Fix crash when user profile is missing avatar")).toEqual([
      "avatar",
      "crash",
      "missing",
      "profile",
      "user"
    ]);
  });
});

describe("discoverRepoContext", () => {
  afterEach(() => {
    for (const tempRepo of tempRepos.splice(0)) {
      rmSync(tempRepo, { recursive: true, force: true });
    }
  });

  it("skips ignored directories", () => {
    const repo = createTempRepo({
      "src/features/users/UserTable.tsx": "export function UserTable() {}",
      "node_modules/pkg/index.ts": "user table",
      ".gleip/brief.md": "user table"
    });

    const context = discoverRepoContext({
      cwd: repo,
      task: "Add CSV export to users table"
    });

    expect(context.skippedDirectoryCount).toBe(2);
    expect(context.likelyRelevantFiles.map((file) => file.path)).toContain(
      "src/features/users/UserTable.tsx"
    );
    expect(context.likelyRelevantFiles.map((file) => file.path)).not.toContain(
      "node_modules/pkg/index.ts"
    );
  });

  it("detects likely relevant files from filenames and paths", () => {
    const repo = createTempRepo({
      "src/features/users/UserTable.tsx": "import { toCsv } from '../../utils/csv';",
      "src/utils/csv.ts": "export function toCsv() {}",
      "src/features/billing/Billing.tsx": "export function Billing() {}"
    });

    const context = discoverRepoContext({
      cwd: repo,
      task: "Add CSV export to users table"
    });
    const paths = context.likelyRelevantFiles.map((file) => file.path);

    expect(paths[0]).toBe("src/features/users/UserTable.tsx");
    expect(paths).toContain("src/utils/csv.ts");
  });

  it("detects likely test files", () => {
    const repo = createTempRepo({
      "src/features/users/UserTable.tsx": "export function UserTable() {}",
      "src/features/users/UserTable.test.tsx": "describe('UserTable', () => {})",
      "tests/csv.spec.ts": "describe('csv export', () => {})"
    });

    const context = discoverRepoContext({
      cwd: repo,
      task: "Add CSV export to users table"
    });
    const paths = context.likelyTestFiles.map((file) => file.path);

    expect(paths).toContain("src/features/users/UserTable.test.tsx");
    expect(paths).toContain("tests/csv.spec.ts");
  });

  it("detects dependency files", () => {
    const repo = createTempRepo({
      "package.json": "{}",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'",
      "src/index.ts": "export {}"
    });

    const context = discoverRepoContext({
      cwd: repo,
      task: "Upgrade React Router"
    });

    expect(context.dependencyFiles).toEqual(["package.json", "pnpm-lock.yaml"]);
  });

  it("detects CI files", () => {
    const repo = createTempRepo({
      ".github/workflows/ci.yml": "name: ci",
      ".circleci/config.yml": "version: 2.1",
      "src/index.ts": "export {}"
    });

    const context = discoverRepoContext({
      cwd: repo,
      task: "Update GitHub Actions workflow"
    });

    expect(context.ciFiles).toEqual([".circleci/config.yml", ".github/workflows/ci.yml"]);
  });

  it("matches risky paths from config globs", () => {
    const repo = createTempRepo({
      ".github/workflows/ci.yml": "name: ci",
      "package.json": "{}",
      "src/secret-token.ts": "export const token = ''"
    });

    const context = discoverRepoContext({
      cwd: repo,
      task: "Update package",
      config: {
        risky_files: ["package.json", ".github/**", "**/*secret*"],
        protected_paths: ["LICENSE"]
      }
    });

    expect(context.riskyMatchedPaths).toEqual([
      ".github/workflows/ci.yml",
      "package.json",
      "src/secret-token.ts"
    ]);
  });

  it("bounds the file scan", () => {
    const repo = createTempRepo({
      "a.ts": "user",
      "b.ts": "user",
      "c.ts": "user"
    });

    const context = discoverRepoContext({
      cwd: repo,
      task: "Add user export",
      maxFiles: 2
    });

    expect(context.scannedFileCount).toBe(2);
  });
});

describe("createScopeBudget", () => {
  it.each([
    ["Change empty state copy on transfers page", "copy_change", false, false, false, 3],
    ["Update button color on the checkout page", "ui_tweak", false, false, false, 5],
    ["Fix crash when user profile is missing avatar", "bug_fix", true, false, false, 7],
    ["Add CSV export to users table", "small_feature", true, false, false, 8],
    ["Create GET /users/:id endpoint", "api_endpoint", true, false, false, 10],
    ["Refactor checkout flow", "refactor", true, false, false, 12],
    ["Upgrade React Router", "dependency_upgrade", true, true, false, 6],
    ["Add database migration for subscriptions", "migration", true, false, false, 10],
    ["Add SSO login", "auth_security_change", true, true, false, 10],
    ["Update GitHub Actions workflow", "infra_ci_change", true, false, true, 7],
    ["Add tests for password validation", "test_only", false, false, false, 7],
    ["Make it better", "unknown", true, false, false, 8]
  ] satisfies Array<[string, ScopeBudget["taskType"], boolean, boolean, boolean, number]>)(
    "creates defaults for %s",
    (task, taskType, requiredTests, newDependenciesAllowed, ciChangesAllowed, maxFilesChanged) => {
      const budget = createScopeBudget({
        task,
        classification: classifyTask(task),
        repoContext: emptyRepoContext()
      });

      expect(budget).toMatchObject({
        taskType,
        requiredTests,
        hardGates: {
          newDependenciesAllowed,
          ciChangesAllowed,
          skippedTestsAllowed: false,
          deletedTestsAllowed: false,
          secretsAllowed: false
        },
        softLimits: {
          maxFilesChanged
        }
      });
      expect(budget.expectedFilesChanged.min).toBeGreaterThanOrEqual(1);
      expect(budget.stopConditions.length).toBeGreaterThan(0);
    }
  );

  it("includes likely relevant paths from repo context", () => {
    const budget = createScopeBudget({
      task: "Add CSV export to users table",
      classification: classifyTask("Add CSV export to users table"),
      repoContext: repoContextWith({
        likelyRelevantFiles: [
          {
            path: "src/features/users/UserTable.tsx",
            score: 10,
            reasons: ["match"]
          }
        ]
      })
    });

    expect(budget.allowedPaths).toContain("src/features/users/UserTable.tsx");
    expect(budget.allowedPaths).toContain("src/features/users");
  });

  it("includes likely test files when tests are relevant", () => {
    const budget = createScopeBudget({
      task: "Add CSV export to users table",
      classification: classifyTask("Add CSV export to users table"),
      repoContext: repoContextWith({
        likelyTestFiles: [
          {
            path: "src/features/users/UserTable.test.tsx",
            score: 10,
            reasons: ["match"]
          }
        ]
      })
    });

    expect(budget.requiredTests).toBe(true);
    expect(budget.allowedPaths).toContain("src/features/users/UserTable.test.tsx");
  });

  it("blocks dependency files when dependencies are not allowed", () => {
    const budget = createScopeBudget({
      task: "Add CSV export to users table",
      classification: classifyTask("Add CSV export to users table"),
      repoContext: repoContextWith({
        dependencyFiles: ["package.json", "pnpm-lock.yaml"]
      })
    });

    expect(budget.hardGates.newDependenciesAllowed).toBe(false);
    expect(budget.blockedWithoutApproval).toContain(
      "Dependency files: package.json, pnpm-lock.yaml"
    );
  });

  it("blocks CI files when CI changes are not allowed", () => {
    const budget = createScopeBudget({
      task: "Add CSV export to users table",
      classification: classifyTask("Add CSV export to users table"),
      repoContext: repoContextWith({
        ciFiles: [".github/workflows/ci.yml"]
      })
    });

    expect(budget.hardGates.ciChangesAllowed).toBe(false);
    expect(budget.blockedWithoutApproval).toContain("CI files: .github/workflows/ci.yml");
  });

  it("keeps skipped/deleted tests and secrets hard gates false", () => {
    const budget = createScopeBudget({
      task: "Fix crash when user profile is missing avatar",
      classification: classifyTask("Fix crash when user profile is missing avatar"),
      repoContext: emptyRepoContext()
    });

    expect(budget.hardGates.skippedTestsAllowed).toBe(false);
    expect(budget.hardGates.deletedTestsAllowed).toBe(false);
    expect(budget.hardGates.secretsAllowed).toBe(false);
  });
});

describe("parseAgentPlan", () => {
  it("extracts backticked file paths", () => {
    const plan = parseAgentPlan("Modify `src/features/users/UserTable.tsx` and run tests.");

    expect(plan.proposedFiles).toContain("src/features/users/UserTable.tsx");
  });

  it("extracts bullet file paths", () => {
    const plan = parseAgentPlan("- Modify src/features/users/UserTable.tsx\n- Add tests");

    expect(plan.proposedFiles).toContain("src/features/users/UserTable.tsx");
  });

  it("detects dependency intent", () => {
    const plan = parseAgentPlan("Run pnpm add papaparse and update package.json.");

    expect(plan.mentionsNewDependencies).toBe(true);
    expect(plan.proposedDependencies).toContain("papaparse");
    expect(plan.proposedDependencies).toContain("package.json");
  });

  it("detects CI intent", () => {
    const plan = parseAgentPlan("Update GitHub Actions workflow in .github/workflows/ci.yml.");

    expect(plan.mentionsCiChanges).toBe(true);
  });

  it("detects test weakening", () => {
    const plan = parseAgentPlan("Skip test coverage by adding test.skip for the flaky case.");

    expect(plan.mentionsTestWeakening).toBe(true);
  });

  it("detects broad refactor wording", () => {
    const plan = parseAgentPlan("Rewrite the users feature across the app.");

    expect(plan.mentionsBroadRefactor).toBe(true);
  });
});

describe("validateAgentPlan", () => {
  it("approves a scoped plan", () => {
    const result = validateAgentPlan({
      planText: [
        "- Modify src/features/users/UserTable.tsx",
        "- Reuse src/utils/csv.ts",
        "- Add tests in src/features/users/UserTable.test.tsx"
      ].join("\n"),
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/features/users", "src/utils/csv.ts"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("approved");
    expect(result.findings).toEqual([]);
  });

  it("needs_revision when tests are required but missing", () => {
    const result = validateAgentPlan({
      planText: "- Modify src/features/users/UserTable.tsx",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/features/users"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("needs_revision");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "MISSING_TEST_STRATEGY",
        severity: "warn",
        title: "Missing test plan"
      })
    );
  });

  it("requires_approval for dependency when disallowed", () => {
    const result = validateAgentPlan({
      planText: "Add papaparse dependency and modify package.json for CSV export.",
      scopeBudget: sampleScopeBudget({
        requiredTests: false,
        hardGates: sampleHardGates({ newDependenciesAllowed: false })
      })
    });

    expect(result.status).toBe("requires_approval");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "DEPENDENCY_CHANGE_INTENT",
        severity: "fail",
        title: "New dependency intent"
      })
    );
  });

  it("requires_approval for CI when disallowed", () => {
    const result = validateAgentPlan({
      planText: "Update GitHub Actions workflow in .github/workflows/ci.yml.",
      scopeBudget: sampleScopeBudget({
        requiredTests: false,
        hardGates: sampleHardGates({ ciChangesAllowed: false })
      })
    });

    expect(result.status).toBe("requires_approval");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "CI_CHANGE_INTENT",
        severity: "fail",
        title: "CI change intent"
      })
    );
  });

  it("requires_approval for test weakening", () => {
    const result = validateAgentPlan({
      planText: "Modify src/users.ts and skip test coverage for the failing case.",
      scopeBudget: sampleScopeBudget({ requiredTests: false })
    });

    expect(result.status).toBe("requires_approval");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "TEST_WEAKENED",
        severity: "fail",
        title: "Test weakening intent"
      })
    );
  });

  it("warns for files outside allowed paths", () => {
    const result = validateAgentPlan({
      planText: "Modify src/admin/AdminTable.tsx for the focused behavior.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/features/users"],
        requiredTests: false
      })
    });

    expect(result.status).toBe("needs_revision");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "SCOPE_EXPANSION_WARN",
        severity: "warn",
        title: "Files outside allowed scope",
        evidence: ["src/admin/AdminTable.tsx"]
      })
    );
  });
});

describe("generateImplementationBrief", () => {
  it("includes the task, classification, and working rule", () => {
    const brief = generateImplementationBrief(sampleBriefInput());

    expect(brief).toContain("# Gleip Implementation Brief");
    expect(brief).toContain("## Task\nAdd CSV export to users table");
    expect(brief).toContain("- Type: small_feature");
    expect(brief).toContain("- Risk: medium");
    expect(brief).toContain("- Confidence: high");
    expect(brief).toContain("Implement the smallest safe change that satisfies the task.");
  });

  it("includes top relevant files but limits count", () => {
    const brief = generateImplementationBrief(
      sampleBriefInput({
        repoContext: repoContextWith({
          likelyRelevantFiles: numberedFileMatches("src/file", ".ts", 7)
        })
      })
    );

    const relevantSection = sectionBetween(brief, "Likely relevant files:", "Likely test files:");
    expect(relevantSection).toContain("src/file1.ts");
    expect(relevantSection).toContain("src/file5.ts");
    expect(relevantSection).not.toContain("src/file6.ts");
  });

  it("includes top test files but limits count", () => {
    const brief = generateImplementationBrief(
      sampleBriefInput({
        repoContext: repoContextWith({
          likelyTestFiles: numberedFileMatches("src/file", ".test.ts", 7)
        })
      })
    );

    const testSection = sectionBetween(brief, "Likely test files:", "Existing pattern matches:");
    expect(testSection).toContain("src/file1.test.ts");
    expect(testSection).toContain("src/file5.test.ts");
    expect(testSection).not.toContain("src/file6.test.ts");
  });

  it("includes scope budget summary and allowed scope", () => {
    const brief = generateImplementationBrief(sampleBriefInput());

    expect(brief).toContain("## Scope budget");
    expect(brief).toContain("- Expected files changed: 2-6");
    expect(brief).toContain("- Expected lines added: 30-220");
    expect(brief).toContain("- Soft max files: 8");
    expect(brief).toContain("## Allowed scope");
    expect(brief).toContain("src/features/users/UserTable.tsx");
  });

  it("includes hard gates with dependencies and CI disallowed", () => {
    const brief = generateImplementationBrief(sampleBriefInput());

    expect(brief).toContain("## Hard gates");
    expect(brief).toContain("- Do not skip tests.");
    expect(brief).toContain("- Do not delete tests.");
    expect(brief).toContain("- Do not weaken CI.");
    expect(brief).toContain("- Do not expose or modify secrets.");
    expect(brief).toContain("- Do not add dependencies.");
    expect(brief).toContain("- Do not change CI configuration.");
  });

  it("reflects dependencies allowed", () => {
    const input = sampleBriefInput({
      task: "Upgrade React Router",
      classification: classifyTask("Upgrade React Router")
    });
    const budget = createScopeBudget({
      task: input.task,
      classification: input.classification,
      repoContext: input.repoContext
    });
    const brief = generateImplementationBrief({ ...input, scopeBudget: budget });

    expect(brief).toContain(
      "- Dependencies may be changed only when directly required by the task and justified."
    );
  });

  it("reflects CI changes allowed", () => {
    const input = sampleBriefInput({
      task: "Update GitHub Actions workflow",
      classification: classifyTask("Update GitHub Actions workflow")
    });
    const budget = createScopeBudget({
      task: input.task,
      classification: input.classification,
      repoContext: input.repoContext
    });
    const brief = generateImplementationBrief({ ...input, scopeBudget: budget });

    expect(brief).toContain("- CI changes are allowed only within the task scope.");
  });

  it("includes required test guidance when tests are required", () => {
    const brief = generateImplementationBrief(sampleBriefInput());

    expect(brief).toContain("## Required tests");
    expect(brief).toContain("- Add or update focused tests.");
    expect(brief).toContain("Add or update tests for the new behavior and at least one edge case.");
  });

  it("handles no repo context gracefully", () => {
    const input = sampleBriefInput({
      repoContext: emptyRepoContext()
    });
    const budget = createScopeBudget({
      task: input.task,
      classification: input.classification,
      repoContext: input.repoContext
    });
    const brief = generateImplementationBrief({ ...input, scopeBudget: budget });

    expect(brief).toContain("- None detected.");
    expect(brief).toContain(
      "- No precise allowed paths were identified. Keep changes tightly aligned with the task and existing nearby patterns."
    );
  });

  it("includes before-final-response instructions", () => {
    const brief = generateImplementationBrief(sampleBriefInput());

    expect(brief).toContain("## Before final response");
    expect(brief).toContain("1. Run `npx --no-install gleip status`.");
    expect(brief).toContain("2. Run relevant tests if available.");
    expect(brief).toContain("3. Report files changed.");
    expect(brief).toContain("4. Report tests run.");
    expect(brief).toContain("5. Report whether Gleip status is within scope");
  });
});

function createTempRepo(files: Record<string, string>): string {
  const repo = mkdtempSync(join(tmpdir(), "gleip-planner-"));
  tempRepos.push(repo);

  for (const [path, content] of Object.entries(files)) {
    const filePath = join(repo, path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }

  return repo;
}

function emptyRepoContext(): RepoContext {
  return repoContextWith({});
}

function repoContextWith(overrides: Partial<RepoContext>): RepoContext {
  return {
    taskTerms: [],
    likelyRelevantFiles: [],
    likelyTestFiles: [],
    existingPatternMatches: [],
    dependencyFiles: [],
    ciFiles: [],
    riskyMatchedPaths: [],
    scannedFileCount: 0,
    skippedDirectoryCount: 0,
    ...overrides
  };
}

function sampleBriefInput(
  overrides: Partial<{
    task: string;
    classification: TaskClassification;
    repoContext: RepoContext;
    scopeBudget: ScopeBudget;
  }> = {}
): {
  task: string;
  classification: TaskClassification;
  repoContext: RepoContext;
  scopeBudget: ScopeBudget;
} {
  const task = overrides.task ?? "Add CSV export to users table";
  const classification = overrides.classification ?? classifyTask(task);
  const repoContext =
    overrides.repoContext ??
    repoContextWith({
      likelyRelevantFiles: [
        { path: "src/features/users/UserTable.tsx", score: 20, reasons: ["match"] },
        { path: "src/utils/csv.ts", score: 12, reasons: ["match"] }
      ],
      likelyTestFiles: [
        { path: "src/features/users/UserTable.test.tsx", score: 18, reasons: ["match"] }
      ],
      existingPatternMatches: [
        { pattern: "utility:csv", path: "src/utils/csv.ts", score: 10, reasons: ["match"] }
      ],
      dependencyFiles: ["package.json"],
      ciFiles: [".github/workflows/ci.yml"],
      riskyMatchedPaths: ["package.json"],
      scannedFileCount: 5
    });
  const scopeBudget =
    overrides.scopeBudget ??
    createScopeBudget({
      task,
      classification,
      repoContext
    });

  return {
    task,
    classification,
    repoContext,
    scopeBudget
  };
}

function sampleScopeBudget(overrides: Partial<ScopeBudget> = {}): ScopeBudget {
  return {
    taskType: "small_feature",
    confidence: "high",
    riskLevel: "medium",
    expectedFilesChanged: { min: 1, max: 4 },
    expectedLinesAdded: { min: 0, max: 100 },
    expectedLinesDeleted: { min: 0, max: 80 },
    softLimits: {
      maxFilesChanged: 6,
      maxLinesAdded: 200,
      maxLinesDeleted: 120
    },
    hardGates: sampleHardGates(),
    allowedPaths: [],
    suspiciousPaths: [],
    approvalRequiredFor: [],
    blockedWithoutApproval: [],
    requiredTests: true,
    testGuidance: [],
    stopConditions: [],
    reasons: [],
    ...overrides
  };
}

function sampleHardGates(
  overrides: Partial<ScopeBudget["hardGates"]> = {}
): ScopeBudget["hardGates"] {
  return {
    newDependenciesAllowed: false,
    ciChangesAllowed: false,
    skippedTestsAllowed: false,
    deletedTestsAllowed: false,
    secretsAllowed: false,
    ...overrides
  };
}

function numberedFileMatches(
  prefix: string,
  suffix: string,
  count: number
): RepoContext["likelyRelevantFiles"] {
  return Array.from({ length: count }, (_, index) => ({
    path: `${prefix}${index + 1}${suffix}`,
    score: count - index,
    reasons: ["match"]
  }));
}

function sectionBetween(value: string, start: string, end: string): string {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end);
  return value.slice(startIndex, endIndex);
}
