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

afterEach(() => {
  for (const tempRepo of tempRepos.splice(0)) {
    rmSync(tempRepo, { recursive: true, force: true });
  }
});

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

  it("excludes dependency, virtualenv, vendor, generated, and binary artifacts", () => {
    const repo = createTempRepo({
      "src/tool.py": "def tool(): pass",
      "tests/test_tool.py": "def test_tool(): pass",
      "venv/lib/python/site-packages/tool.py": "def tool(): pass",
      ".venv/lib/python/site-packages/test_tool.py": "def test_tool(): pass",
      "vendor/tool.ts": "export const tool = true",
      "generated/tool.ts": "export const tool = true",
      "build/tool.js": "export const tool = true",
      "coverage/tool.test.ts": "describe('tool', () => {})",
      "tmp/tool.ts": "export const tool = true",
      "logs/tool.log": "tool",
      "cache/tool.ts": "export const tool = true",
      "outputs/tool.json": "{}",
      "__pycache__/tool.pyc": "generated",
      "src/tool.pyc": "generated",
      "src/tool.js.map": "{}"
    });

    const context = discoverRepoContext({
      cwd: repo,
      task: "Update tool behavior"
    });
    const allEvidencePaths = [
      ...context.likelyRelevantFiles.map((file) => file.path),
      ...context.likelyTestFiles.map((file) => file.path),
      ...context.existingPatternMatches.map((match) => match.path)
    ];

    expect(allEvidencePaths).toContain("src/tool.py");
    expect(allEvidencePaths).toContain("tests/test_tool.py");
    expect(allEvidencePaths).not.toEqual(
      expect.arrayContaining([
        "venv/lib/python/site-packages/tool.py",
        ".venv/lib/python/site-packages/test_tool.py",
        "vendor/tool.ts",
        "generated/tool.ts",
        "build/tool.js",
        "coverage/tool.test.ts",
        "tmp/tool.ts",
        "logs/tool.log",
        "cache/tool.ts",
        "outputs/tool.json",
        "__pycache__/tool.pyc",
        "src/tool.pyc",
        "src/tool.js.map"
      ])
    );

    const budget = createScopeBudget({
      task: "Update tool behavior",
      classification: classifyTask("Update tool behavior"),
      repoContext: context
    });
    expect(budget.allowedPaths.join("\n")).not.toMatch(
      /(?:^|\/)(?:venv|\.venv|vendor|generated|build|coverage|tmp|logs|cache|outputs|__pycache__)(?:\/|$)/u
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

  it("narrows modify-only tasks to the explicit file", () => {
    const task = "Modify only src/foo.ts";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: repoContextWith({
        likelyRelevantFiles: [
          { path: "src/foo.ts", score: 10, reasons: ["match"] },
          { path: "src/unrelated.ts", score: 9, reasons: ["match"] }
        ],
        likelyTestFiles: [{ path: "src/foo.test.ts", score: 8, reasons: ["match"] }]
      })
    });

    expect(budget.expectedFilesChanged).toEqual({ min: 1, max: 1 });
    expect(budget.softLimits.maxFilesChanged).toBe(1);
    expect(budget.allowedPaths).toEqual(["src/foo.ts"]);
  });

  it("keeps dependency files protected for explicit-only tasks", () => {
    const task = "Edit only scripts/tool.py and do not change dependencies";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: repoContextWith({
        dependencyFiles: ["package.json", "pnpm-lock.yaml"],
        likelyRelevantFiles: [
          { path: "scripts/tool.py", score: 10, reasons: ["match"] },
          { path: "package.json", score: 9, reasons: ["match"] }
        ]
      })
    });

    expect(budget.allowedPaths).toEqual(["scripts/tool.py"]);
    expect(budget.expectedFilesChanged).toEqual({ min: 1, max: 1 });
    expect(budget.hardGates.newDependenciesAllowed).toBe(false);
    expect(budget.blockedWithoutApproval).toContain(
      "Dependency files: package.json, pnpm-lock.yaml"
    );
  });

  it("allows an explicitly requested test file with an explicit-only implementation file", () => {
    const task = "Modify only src/foo.ts and update tests/foo.test.ts";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });

    expect(budget.expectedFilesChanged).toEqual({ min: 2, max: 2 });
    expect(budget.allowedPaths).toEqual(["src/foo.ts", "tests/foo.test.ts"]);
  });

  it("does not add test files when an explicit-only task only runs existing tests", () => {
    const task = "Modify only src/foo.ts and run existing tests";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: repoContextWith({
        likelyTestFiles: [{ path: "tests/foo.test.ts", score: 8, reasons: ["match"] }]
      })
    });

    expect(budget.expectedFilesChanged).toEqual({ min: 1, max: 1 });
    expect(budget.allowedPaths).toEqual(["src/foo.ts"]);
  });

  it("allows explicitly targeted generated paths only as suspicious exact targets", () => {
    const task = "Modify only vendor/tool.ts";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });

    expect(budget.allowedPaths).toEqual(["vendor/tool.ts"]);
    expect(budget.suspiciousPaths).toContain("vendor/tool.ts");
  });

  it("keeps context files out of allowed paths", () => {
    const task = "Use FULL_CONTEXT.md as context and modify src/foo.ts";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: repoContextWith({
        contextFiles: ["FULL_CONTEXT.md"],
        likelyRelevantFiles: [
          { path: "FULL_CONTEXT.md", score: 20, reasons: ["match"] },
          { path: "src/foo.ts", score: 10, reasons: ["match"] }
        ]
      })
    });

    expect(budget.allowedPaths).toContain("src/foo.ts");
    expect(budget.allowedPaths).not.toContain("FULL_CONTEXT.md");
  });

  it("keeps a declared narrow bugfix to one implementation file and an optional focused test", () => {
    const task =
      "Modify only src/foo.ts to fix the null input bug. Do not change dependencies, CI, config, or unrelated modules. Add or run focused tests.";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: repoContextWith({
        dependencyFiles: ["package.json"],
        ciFiles: [".github/workflows/ci.yml"]
      })
    });

    expect(budget.expectedFilesChanged).toEqual({ min: 1, max: 2 });
    expect(budget.softLimits.maxFilesChanged).toBe(2);
    expect(budget.allowedPaths).toContain("src/foo.ts");
    expect(budget.allowedPaths).toContain("tests");
    expect(budget.allowedPaths).not.toContain("src/unrelated.ts");
    expect(budget.hardGates.newDependenciesAllowed).toBe(false);
    expect(budget.hardGates.ciChangesAllowed).toBe(false);
  });

  it("scales budget and allowed paths for a generic feature spanning declared areas", () => {
    const task =
      "Implement a new local CLI feature spanning planner, CLI, tests, docs, and smoke coverage.";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });

    expect(budget.taskType).not.toBe("test_only");
    expect(budget.requiredTests).toBe(true);
    expect(budget.expectedFilesChanged.max).toBeGreaterThanOrEqual(15);
    expect(budget.softLimits.maxFilesChanged).toBeGreaterThan(6);
    expect(budget.allowedPaths).toEqual(
      expect.arrayContaining([
        "packages/cli",
        "packages/planner",
        "tests",
        "docs",
        "scripts/*smoke*"
      ])
    );
    expect(budget.hardGates.newDependenciesAllowed).toBe(false);
    expect(budget.hardGates.dependencyMetadataChangesAllowed).toBe(false);
    expect(budget.hardGates.ciChangesAllowed).toBe(false);
  });

  it("scales advisory limits for a new script, focused test, and output artifact", () => {
    const task =
      "Broad patch: create a new scripts/analyze.ts tool, add focused tests, and generate output/report.json.";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });

    expect(budget.softLimits.maxFilesChanged).toBeGreaterThan(8);
    expect(budget.softLimits.maxLinesAdded).toBeGreaterThan(300);
    expect(budget.hardGates.newDependenciesAllowed).toBe(false);
    expect(budget.hardGates.ciChangesAllowed).toBe(false);
  });

  it("scales advisory limits for evaluation work with a generated result", () => {
    const task =
      "Implement a multi-area ablation evaluation, add focused verification, and write results/ablation.json.";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });

    expect(budget.softLimits.maxFilesChanged).toBeGreaterThan(8);
    expect(budget.softLimits.maxLinesAdded).toBeGreaterThan(300);
  });

  it("accepts an explicitly declared output artifact narrowly", () => {
    const task =
      "Run a local evaluation and create the generated result artifact outputs/result.json. Do not change source implementation.";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });

    expect(budget.expectedPaths).toContain("outputs/result.json");
    expect(budget.expectedPaths).not.toContain("src");
    expect(budget.expectedPaths).not.toContain("outputs");
  });

  it("emits guidance-first compatibility aliases", () => {
    const budget = createScopeBudget({
      task: "Fix src/foo.ts and run existing tests",
      classification: classifyTask("Fix src/foo.ts and run existing tests"),
      repoContext: emptyRepoContext()
    });

    expect(budget.expectedPaths).toEqual(budget.allowedPaths);
    expect(budget.protectedChecks).toEqual(budget.hardGates);
    expect(budget.verificationExpected).toBe(budget.requiredTests);
    expect(budget.approvalRequiredChanges).toEqual(budget.blockedWithoutApproval);
    expect(budget.pauseAndClarifyConditions).toEqual(budget.stopConditions);
  });

  it("keeps specifically named source and test files exact", () => {
    const task = "Update src/foo.ts and tests/foo.test.ts to cover the null input fix.";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });

    expect(budget.allowedPaths).toEqual(["src/foo.ts", "tests/foo.test.ts"]);
    expect(budget.allowedPaths).not.toContain("tests");
    expect(budget.allowedPaths).not.toContain("**/*.test.*");
  });

  it("extracts generic named subsystem lists without relying on release wording", () => {
    const task = "Update parser, formatter, and renderer with shared tests.";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });

    expect(budget.allowedPaths).toEqual(
      expect.arrayContaining([
        "src/parser",
        "src/formatter",
        "src/renderer",
        "tests"
      ])
    );
    expect(budget.softLimits.maxFilesChanged).toBeGreaterThan(6);
  });

  it("does not treat release wording alone as package metadata scope", () => {
    const task = "Update docs for a release.";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: repoContextWith({ dependencyFiles: ["package.json"] })
    });

    expect(budget.allowedPaths).toContain("docs");
    expect(budget.allowedPaths).not.toContain("package.json");
    expect(budget.hardGates.dependencyMetadataChangesAllowed).toBe(false);
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

  it("distinguishes context references from proposed edits", () => {
    const plan = parseAgentPlan(
      "Read FULL_CONTEXT.md for reference, then modify src/features/users/UserTable.tsx."
    );

    expect(plan.contextFiles).toContain("FULL_CONTEXT.md");
    expect(plan.proposedFiles).toEqual(["src/features/users/UserTable.tsx"]);
  });

  it("recognizes read-only context phrases for neutral filenames", () => {
    const plan = parseAgentPlan(
      "Read from README.md for reference and modify src/features/users/UserTable.tsx."
    );

    expect(plan.contextFiles).toContain("README.md");
    expect(plan.proposedFiles).toEqual(["src/features/users/UserTable.tsx"]);
  });

  it("keeps based-on files read-only while retaining the edit target", () => {
    const plan = parseAgentPlan("Update src/foo.ts based on README.md and run tests.");

    expect(plan.contextFiles).toContain("README.md");
    expect(plan.proposedFiles).toEqual(["src/foo.ts"]);
  });

  it("treats an explicit context-file edit as a proposed edit", () => {
    const plan = parseAgentPlan("Modify FULL_CONTEXT.md to correct the requirements.");

    expect(plan.contextFiles).not.toContain("FULL_CONTEXT.md");
    expect(plan.proposedFiles).toContain("FULL_CONTEXT.md");
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

    expect(result.status).toBe("aligned");
    expect(result.findings).toEqual([]);
  });

  it("needs clarification when verification is expected but missing", () => {
    const result = validateAgentPlan({
      planText: "- Modify src/features/users/UserTable.tsx",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/features/users"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "MISSING_TEST_STRATEGY",
        severity: "warn",
        title: "Verification expectation missing"
      })
    );
  });

  it("needs approval for a dependency when not requested", () => {
    const result = validateAgentPlan({
      planText: "Add papaparse dependency and modify package.json for CSV export.",
      scopeBudget: sampleScopeBudget({
        requiredTests: false,
        hardGates: sampleHardGates({ newDependenciesAllowed: false })
      })
    });

    expect(result.status).toBe("needs_approval");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "DEPENDENCY_CHANGE_INTENT",
        severity: "approval_required",
        title: "New dependency intent"
      })
    );
  });

  it("needs approval for CI when not requested", () => {
    const result = validateAgentPlan({
      planText: "Update GitHub Actions workflow in .github/workflows/ci.yml.",
      scopeBudget: sampleScopeBudget({
        requiredTests: false,
        hardGates: sampleHardGates({ ciChangesAllowed: false })
      })
    });

    expect(result.status).toBe("needs_approval");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "CI_CHANGE_INTENT",
        severity: "approval_required",
        title: "CI change intent"
      })
    );
  });

  it("does not treat explicit dependency and CI exclusions as change intent", () => {
    const result = validateAgentPlan({
      planText: [
        "## Files",
        "- Create src/evaluate.ts.",
        "## Implementation",
        "- Implement the local evaluation tool.",
        "- Do not add dependencies or change CI.",
        "## Verification",
        "- Run focused tests and typecheck."
      ].join("\n"),
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/evaluate.ts"],
        requiredTests: true,
        hardGates: sampleHardGates({
          newDependenciesAllowed: false,
          ciChangesAllowed: false
        })
      })
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "DEPENDENCY_CHANGE_INTENT" })
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "CI_CHANGE_INTENT" })
    );
  });

  it("needs clarification for test weakening", () => {
    const result = validateAgentPlan({
      planText: "Modify src/users.ts and skip test coverage for the failing case.",
      scopeBudget: sampleScopeBudget({ requiredTests: false })
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "TEST_WEAKENED",
        severity: "action_required",
        title: "Test weakening intent"
      })
    );
  });

  it("detects proposed test deletion", () => {
    const result = validateAgentPlan({
      planText: "Update src/users.ts and delete tests for the legacy behavior.",
      scopeBudget: sampleScopeBudget({ requiredTests: false })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "TEST_WEAKENED",
        severity: "action_required"
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

    expect(result.status).toBe("needs_clarification");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "SCOPE_EXPANSION_WARN",
        severity: "warn",
        title: "Files outside expected scope",
        evidence: expect.arrayContaining([
          expect.stringContaining("src/admin/AdminTable.tsx [unexplained]")
        ])
      })
    );
  });

  it.each([
    "Modify src/foo.ts and run existing tests",
    "Modify src/foo.ts and run focused pytest",
    "Modify src/foo.ts and run CLI smoke test",
    "Modify src/foo.ts and run typecheck"
  ])("recognizes structural verification in: %s", (planText) => {
    const result = validateAgentPlan({
      planText,
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "MISSING_TEST_STRATEGY" })
    );
  });

  it("does not treat a context reference as an out-of-scope edit", () => {
    const result = validateAgentPlan({
      planText: "Read FULL_CONTEXT.md for reference, then modify src/foo.ts and run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("aligned");
    expect(result.parsedPlan.contextFiles).toContain("FULL_CONTEXT.md");
  });

  it("checks a proposed context-file edit normally", () => {
    const result = validateAgentPlan({
      planText: "Modify FULL_CONTEXT.md and run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "SCOPE_EXPANSION_WARN",
        evidence: expect.arrayContaining([
          expect.stringContaining("FULL_CONTEXT.md [unexplained]")
        ])
      })
    );
  });

  it.each(["FULL_CONTEXT.md", "PROJECT_CONTEXT.md", "ARCHITECTURE.md"])(
    "accepts %s as a small context-doc touch for broad patch work",
    (path) => {
      const task = "Implement a broad patch across source, tests, and project context docs.";
      const scopeBudget = createScopeBudget({
        task,
        classification: classifyTask(task),
        repoContext: emptyRepoContext()
      });
      const result = validateAgentPlan({
        taskText: task,
        planText: `Update src/foo.ts and ${path}, then run existing tests.`,
        scopeBudget
      });

      expect(result.findings).not.toContainEqual(
        expect.objectContaining({
          code: "SCOPE_EXPANSION_WARN",
          evidence: expect.arrayContaining([path])
        })
      );
    }
  );

  it("keeps a task contract file read-only even during broad patch work", () => {
    const task = "Implement a broad patch across source, tests, and docs.";
    const scopeBudget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: repoContextWith({ contextFiles: ["FULL_CONTEXT.md"] })
    });
    const result = validateAgentPlan({
      taskText: task,
      planText: "Modify FULL_CONTEXT.md and src/foo.ts, then run existing tests.",
      scopeBudget
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "SCOPE_EXPANSION_WARN",
        evidence: expect.arrayContaining([
          expect.stringContaining("FULL_CONTEXT.md [unexplained]")
        ])
      })
    );
  });

  it("passes a well-structured plan", () => {
    const result = validateAgentPlan({
      planText: [
        "## Files",
        "- src/foo.ts",
        "## Implementation",
        "- Update src/foo.ts with the requested behavior.",
        "## Verification",
        "- Run focused tests and typecheck."
      ].join("\n"),
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("aligned");
    expect(result.findings).toEqual([]);
  });

  it("warns when implementation structure is missing", () => {
    const result = validateAgentPlan({
      planText: ["Files:", "- src/foo.ts", "Verification:", "- Run tests."].join("\n"),
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "PLAN_REQUIRED_SECTION_MISSING", severity: "warn" })
    );
  });

  it("warns when a code plan has no file or module scope", () => {
    const result = validateAgentPlan({
      planText: ["Implementation: Update the normalization behavior.", "Verification: Run tests."].join(
        "\n"
      ),
      scopeBudget: sampleScopeBudget({ requiredTests: true })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "PLAN_NO_FILES_MENTIONED", severity: "warn" })
    );
  });

  it("accepts free-form plans with clear structural signals", () => {
    const result = validateAgentPlan({
      planText: "Update src/foo.ts to normalize input, then run focused tests and typecheck.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("aligned");
  });

  it("keeps the existing missing-test warning and adds a structural verification code", () => {
    const result = validateAgentPlan({
      planText: "Update src/foo.ts with the requested behavior.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["MISSING_TEST_STRATEGY", "PLAN_NO_VERIFICATION"])
    );
  });

  it("accepts existing mentioned files", () => {
    const repo = createTempRepo({ "src/foo.ts": "export const foo = true;" });
    const result = validateAgentPlan({
      cwd: repo,
      planText: "Update src/foo.ts and run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "PLAN_MENTIONED_FILE_MISSING" })
    );
  });

  it("accepts missing files explicitly marked for creation", () => {
    const repo = createTempRepo({});
    const result = validateAgentPlan({
      cwd: repo,
      planText: "Create src/new-tool.ts and run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/new-tool.ts"],
        requiredTests: true
      })
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "PLAN_MENTIONED_FILE_MISSING" })
    );
  });

  it("warns for missing unmarked edit targets", () => {
    const repo = createTempRepo({});
    const result = validateAgentPlan({
      cwd: repo,
      planText: "Update src/missing.ts and run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/missing.ts"],
        requiredTests: true
      })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "PLAN_MENTIONED_FILE_MISSING",
        evidence: ["src/missing.ts"]
      })
    );
  });

  it("keeps context references out of missing edit-target findings", () => {
    const repo = createTempRepo({ "src/foo.ts": "export const foo = true;" });
    const result = validateAgentPlan({
      cwd: repo,
      planText: "Read TASK.md for reference, update src/foo.ts, and run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.parsedPlan.contextFiles).toContain("TASK.md");
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "PLAN_MENTIONED_FILE_MISSING", evidence: ["TASK.md"] })
    );
  });

  it.each([
    "vendor/tool.ts",
    "venv/lib/tool.py",
    "node_modules/pkg/index.js"
  ])("warns when excluded path %s is an edit target", (path) => {
    const result = validateAgentPlan({
      planText: `Update ${path} and run tests.`,
      scopeBudget: sampleScopeBudget({
        allowedPaths: [path],
        requiredTests: true
      })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "PLAN_VENDOR_EDIT_TARGET", evidence: [path] })
    );
  });

  it("treats generated output artifacts as output rather than implementation scope", () => {
    const result = validateAgentPlan({
      planText: [
        "Implementation: Update src/foo.ts.",
        "Output: emit generated artifact dist/report.json.",
        "Verification: Run tests."
      ].join("\n"),
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.parsedPlan.proposedFiles).toEqual(["src/foo.ts"]);
    expect(result.parsedPlan.outputFiles).toEqual(["dist/report.json"]);
  });

  it.each([
    ["Output: write outputs/report.json as a generated report.", "outputs/report.json"],
    ["Fixture: create fixtures/session_state.json as a fixture.", "fixtures/session_state.json"],
    ["State file: emit state/run_state.json as a state file.", "state/run_state.json"]
  ])("accepts an explicitly declared narrow artifact: %s", (outputLine, path) => {
    const result = validateAgentPlan({
      planText: [
        "Implementation: Update src/foo.ts.",
        outputLine,
        "Verification: Run existing focused tests."
      ].join("\n"),
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.parsedPlan.outputFiles).toContain(path);
    expect(result.parsedPlan.proposedFiles).toEqual(["src/foo.ts"]);
  });

  it("requires scope rationale for ordinary source expansion without hard blocking it", () => {
    const result = validateAgentPlan({
      planText: "Update src/foo.ts and src/extra.ts, then run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "SCOPE_EXPANSION_RATIONALE_REQUIRED",
        severity: "warn",
        evidence: ["src/extra.ts"]
      })
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "PLAN_HARD_GATE_VIOLATION", evidence: ["src/extra.ts"] })
    );
  });

  it("accepts a specific scope expansion rationale structurally", () => {
    const result = validateAgentPlan({
      planText: [
        "Update src/foo.ts.",
        "src/billing/invoice.ts is included because ownership changes affect invoices; verify with billing invoice tests."
      ].join("\n"),
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "SCOPE_EXPANSION_RATIONALE_REQUIRED" })
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "SCOPE_EXPANSION_RATIONALE_VAGUE" })
    );
  });

  it("warns when scope expansion rationale is vague", () => {
    const result = validateAgentPlan({
      planText: "Update src/foo.ts and src/extra.ts because it is needed for implementation. Run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "SCOPE_EXPANSION_RATIONALE_VAGUE",
        evidence: ["src/extra.ts"]
      })
    );
  });

  it("detects a required missing Python dependency when additions are blocked", () => {
    const repo = createTempRepo({ "pyproject.toml": "[project]\ndependencies = []\n" });
    const result = validateAgentPlan({
      cwd: repo,
      taskText: "Build the CLI with Typer.",
      planText: "Implementation: use Typer in src/cli.py. Verification: run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/cli.py"],
        hardGates: sampleHardGates({ newDependenciesAllowed: false })
      })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "DEPENDENCY_REQUIREMENT_CONFLICT",
        severity: "warn",
        evidence: ["typer"]
      })
    );
  });

  it("does not report a declared Python dependency conflict", () => {
    const repo = createTempRepo({
      "pyproject.toml": '[project]\ndependencies = ["typer>=0.12"]\n'
    });
    const result = validateAgentPlan({
      cwd: repo,
      taskText: "Build the CLI with Typer.",
      planText: "Update src/cli.py using Typer and run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/cli.py"],
        hardGates: sampleHardGates({ newDependenciesAllowed: false })
      })
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "DEPENDENCY_REQUIREMENT_CONFLICT" })
    );
  });

  it("does not treat a preferred dependency as required", () => {
    const repo = createTempRepo({ "pyproject.toml": "[project]\ndependencies = []\n" });
    const result = validateAgentPlan({
      cwd: repo,
      taskText: "Prefer Typer if available.",
      planText: "Update src/cli.py and run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/cli.py"],
        hardGates: sampleHardGates({ newDependenciesAllowed: false })
      })
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "DEPENDENCY_REQUIREMENT_CONFLICT" })
    );
  });

  it("requires approval for substituting a required dependency", () => {
    const result = validateAgentPlan({
      taskText: "Build the CLI with Typer.",
      planText: "Use argparse instead of Typer in src/cli.py and run pytest.",
      scopeBudget: sampleScopeBudget({ allowedPaths: ["src/cli.py"] })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "DEPENDENCY_SUBSTITUTION_REQUIRES_APPROVAL",
        severity: "approval_required",
        evidence: ["typer -> argparse"]
      })
    );
  });

  it("detects a required missing Node dependency", () => {
    const repo = createTempRepo({ "package.json": '{"dependencies":{}}' });
    const result = validateAgentPlan({
      cwd: repo,
      taskText: "Validate payloads with Zod.",
      planText: "Update src/schema.ts using Zod and run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/schema.ts"],
        hardGates: sampleHardGates({ newDependenciesAllowed: false })
      })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "DEPENDENCY_REQUIREMENT_CONFLICT",
        evidence: ["zod"]
      })
    );
  });

  it("does not report a declared Node test dependency conflict", () => {
    const repo = createTempRepo({
      "package.json": '{"devDependencies":{"vitest":"^2.0.0"}}'
    });
    const result = validateAgentPlan({
      cwd: repo,
      taskText: "Use Vitest for verification.",
      planText: "Update src/foo.ts and run Vitest.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        hardGates: sampleHardGates({ newDependenciesAllowed: false })
      })
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "DEPENDENCY_REQUIREMENT_CONFLICT" })
    );
  });

  it("uses the task request as package.json rationale", () => {
    const result = validateAgentPlan({
      taskText: "Update package.json to expose the CLI bin entry.",
      planText: "Update package.json and verify with npm pack smoke test.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["package.json"],
        requiredTests: true
      })
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "RISKY_CHANGE_RATIONALE_REQUIRED" })
    );
  });

  it("requires rationale for an unrequested package.json change", () => {
    const result = validateAgentPlan({
      taskText: "Update the CLI output.",
      planText: "Update package.json and run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["package.json"],
        requiredTests: true
      })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "RISKY_CHANGE_RATIONALE_REQUIRED",
        severity: "approval_required",
        evidence: ["package.json"]
      })
    );
  });

  it("requires approval and rationale for a lockfile change caused by dependency addition", () => {
    const result = validateAgentPlan({
      taskText: "Update the CLI output.",
      planText:
        "Add Zod dependency and update package-lock.json because dependency resolution changes; verify with npm test.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src"],
        hardGates: sampleHardGates({ newDependenciesAllowed: false })
      })
    });

    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "DEPENDENCY_CHANGE_INTENT",
        "PLAN_HARD_GATE_VIOLATION",
        "PLAN_RISKY_FILE_MENTIONED"
      ])
    );
  });

  it("requires rationale for an unrequested CI change", () => {
    const result = validateAgentPlan({
      taskText: "Update the CLI output.",
      planText: "Update .github/workflows/ci.yml and run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: [".github/workflows/ci.yml"],
        hardGates: sampleHardGates({ ciChangesAllowed: true })
      })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "RISKY_CHANGE_RATIONALE_REQUIRED",
        evidence: [".github/workflows/ci.yml"]
      })
    );
  });

  it("keeps specifically explained ordinary config changes advisory", () => {
    const result = validateAgentPlan({
      taskText: "Update the CLI output.",
      planText:
        "Update tsconfig.json because the CLI declaration output needs NodeNext resolution; verify with typecheck and build.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["tsconfig.json"],
        requiredTests: true
      })
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "RISKY_CHANGE_RATIONALE_REQUIRED" })
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "PLAN_RISKY_FILE_MENTIONED", severity: "warn" })
    );
  });

  it("warns when proposed file count exceeds the soft maximum", () => {
    const result = validateAgentPlan({
      planText: "Update src/a.ts, src/b.ts, and src/c.ts, then run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src"],
        softLimits: { maxFilesChanged: 2, maxLinesAdded: 200, maxLinesDeleted: 120 }
      })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "PLAN_SCOPE_EXCEEDS_BUDGET", severity: "warn" })
    );
  });

  it("emits a stable hard-gate finding for blocked dependency paths", () => {
    const result = validateAgentPlan({
      planText: "Update package.json because a new Zod dependency is required; verify with tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src"],
        hardGates: sampleHardGates({ newDependenciesAllowed: false })
      })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "PLAN_HARD_GATE_VIOLATION",
        severity: "approval_required"
      })
    );
  });

  it("keeps every structural finding machine-readable", () => {
    const result = validateAgentPlan({
      planText: "Update src/missing.ts.",
      cwd: createTempRepo({}),
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    for (const finding of result.findings) {
      expect(finding.code).toEqual(expect.any(String));
      expect(finding.severity).toEqual(expect.any(String));
      expect(finding.title).toEqual(expect.any(String));
      expect(finding.message).toEqual(expect.any(String));
      expect(finding.recommendation).toEqual(expect.any(String));
    }
  });

  it("accepts a narrow bugfix and focused test while flagging unrelated and risky expansion", () => {
    const task =
      "Modify only src/foo.ts to fix the null input bug. Do not change dependencies, CI, config, or unrelated modules. Add or run focused tests.";
    const scopeBudget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: repoContextWith({
        dependencyFiles: ["package.json"],
        ciFiles: [".github/workflows/ci.yml"]
      })
    });
    const aligned = validateAgentPlan({
      taskText: task,
      planText: "Update src/foo.ts, add tests/foo.test.ts, and run focused tests.",
      scopeBudget
    });
    const expanded = validateAgentPlan({
      taskText: task,
      planText: [
        "Update src/foo.ts and src/unrelated.ts.",
        "Update package.json, tsconfig.json, and .github/workflows/ci.yml.",
        "Run focused tests."
      ].join("\n"),
      scopeBudget
    });

    expect(aligned.findings).not.toContainEqual(
      expect.objectContaining({ code: "PLAN_SCOPE_OUTSIDE_BUDGET" })
    );
    expect(expanded.findings).toContainEqual(
      expect.objectContaining({
        code: "SCOPE_EXPANSION_RATIONALE_REQUIRED",
        evidence: expect.arrayContaining(["src/unrelated.ts"])
      })
    );
    expect(expanded.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "PLAN_RISKY_FILE_MENTIONED",
        "PLAN_HARD_GATE_VIOLATION"
      ])
    );
  });

  it("accepts a generic broad feature aligned with every declared area", () => {
    const task =
      "Implement a new local CLI feature spanning planner, CLI, tests, docs, and smoke coverage.";
    const scopeBudget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });
    const result = validateAgentPlan({
      taskText: task,
      planText: [
        "## Files",
        "- Add packages/planner/src/local-feature.ts",
        "- Add packages/cli/src/local-feature.ts",
        "- Add tests/local-feature.test.ts",
        "- Add docs/local-feature.md",
        "- Add scripts/local-feature-smoke.mjs",
        "## Implementation",
        "- Implement the feature across the declared planner and CLI areas.",
        "## Verification",
        "- Run tests and smoke coverage."
      ].join("\n"),
      scopeBudget
    });

    expect(result.status).toBe("aligned");
    expect(result.summary).toContain("aligned with declared task scope");
    expect(result.findings).toEqual([]);
  });

  it("accepts a generic subsystem's declared source, config, tests, docs, and output", () => {
    const task =
      "Add a new report exporter with source files, config, tests, README updates, and sample output.";
    const scopeBudget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });
    const result = validateAgentPlan({
      taskText: task,
      planText: [
        "## Files",
        "- Add src/report-exporter.ts",
        "- Add report-exporter.config.ts",
        "- Add tests/report-exporter.test.ts",
        "- Update README.md",
        "- The exporter emits samples/report.json as a sample output artifact.",
        "## Implementation",
        "- Implement the report exporter and its declared config.",
        "## Verification",
        "- Run report exporter tests and verify the sample output."
      ].join("\n"),
      scopeBudget
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "PLAN_SCOPE_OUTSIDE_BUDGET" })
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "RISKY_CHANGE_RATIONALE_REQUIRED" })
    );
    expect(result.parsedPlan.outputFiles).toContain("samples/report.json");
  });

  it("keeps dependency additions gated inside a generic broad task", () => {
    const task =
      "Implement a new local CLI feature spanning planner, CLI, tests, docs, and smoke coverage.";
    const scopeBudget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: repoContextWith({ dependencyFiles: ["package.json"] })
    });
    const result = validateAgentPlan({
      taskText: task,
      planText: [
        "Update packages/planner/src/index.ts and package.json.",
        "Add Zod dependency for validation.",
        "Run tests and smoke coverage."
      ].join("\n"),
      scopeBudget
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "DEPENDENCY_CHANGE_INTENT",
        severity: "approval_required"
      })
    );
  });

  it("requires clarification when a narrow task proposes a broad plan", () => {
    const task = "Fix typo in CLI help text.";
    const scopeBudget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });
    const result = validateAgentPlan({
      taskText: task,
      planText: [
        "Update packages/cli/src/index.ts and packages/planner/src/index.ts.",
        "Add Zod dependency in package.json.",
        "Update .github/workflows/ci.yml.",
        "Run tests."
      ].join("\n"),
      scopeBudget
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "SCOPE_EXPANSION_RATIONALE_REQUIRED",
        severity: "warn"
      })
    );
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "DEPENDENCY_CHANGE_INTENT",
        "CI_CHANGE_INTENT",
        "PLAN_HARD_GATE_VIOLATION"
      ])
    );
  });

  it("accepts package metadata and changelog only when explicitly requested", () => {
    const task = "Update package version and changelog for a release.";
    const scopeBudget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: repoContextWith({ dependencyFiles: ["package.json"] })
    });
    const result = validateAgentPlan({
      taskText: task,
      planText: [
        "## Files",
        "- Update package.json.",
        "- Update CHANGELOG.md.",
        "## Implementation",
        "- Update the declared package version and changelog.",
        "## Verification",
        "- Run npm pack."
      ].join("\n"),
      scopeBudget
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "PLAN_SCOPE_OUTSIDE_BUDGET" })
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "RISKY_CHANGE_RATIONALE_REQUIRED" })
    );
  });

  it("does not broaden one named test file to every test path", () => {
    const task = "Update src/foo.ts and tests/foo.test.ts for the null input fix.";
    const scopeBudget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });
    const result = validateAgentPlan({
      taskText: task,
      planText: [
        "Update src/foo.ts, tests/foo.test.ts, and tests/unrelated.test.ts.",
        "Run tests/foo.test.ts."
      ].join("\n"),
      scopeBudget
    });

    expect(scopeBudget.allowedPaths).toEqual(["src/foo.ts", "tests/foo.test.ts"]);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "SCOPE_EXPANSION_RATIONALE_REQUIRED",
        evidence: ["tests/unrelated.test.ts"]
      })
    );
  });

  it("keeps unrelated CI changes outside a broad declared task", () => {
    const task = "Implement a feature spanning planner, CLI, tests, and docs.";
    const scopeBudget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: repoContextWith({ ciFiles: [".github/workflows/ci.yml"] })
    });
    const result = validateAgentPlan({
      taskText: task,
      planText: [
        "Update packages/planner/src/index.ts and packages/cli/src/index.ts.",
        "Update .github/workflows/ci.yml.",
        "Run tests."
      ].join("\n"),
      scopeBudget
    });

    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "CI_CHANGE_INTENT",
        "RISKY_CHANGE_RATIONALE_REQUIRED",
        "PLAN_HARD_GATE_VIOLATION"
      ])
    );
  });

  it("accepts broad semantic scope without warning solely on file count", () => {
    const task =
      "Make all routed surfaces responsive across shared layout primitives, reusable data presentation, relevant tests, and documentation.";
    const scopeBudget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });
    const result = validateAgentPlan({
      taskText: task,
      planText: [
        "## Files",
        "- Update src/routes/home.tsx for responsive routed surface behavior.",
        "- Update src/routes/accounts.tsx for responsive routed surface behavior.",
        "- Update src/layout/shell.tsx for shared layout primitives.",
        "- Update src/table/data-grid.tsx for reusable data presentation.",
        "- Update tests/responsive-surfaces.test.tsx.",
        "- Update docs/responsive-surfaces.md.",
        "## Implementation",
        "- Apply the responsive layout behavior across the declared surfaces.",
        "## Verification",
        "- Run responsive surface tests and typecheck."
      ].join("\n"),
      scopeBudget
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "PLAN_SCOPE_EXCEEDS_BUDGET" })
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "SCOPE_EXPANSION_WARN" })
    );
    expect(result.targetClassifications?.map((target) => target.classification)).toEqual(
      expect.arrayContaining(["derived"])
    );
  });

  it("reports unrelated targets in broad semantic scope with classifications and reasons", () => {
    const task =
      "Make all routed surfaces responsive across shared layout primitives, reusable data presentation, relevant tests, and documentation.";
    const scopeBudget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });
    const result = validateAgentPlan({
      taskText: task,
      planText: [
        "Update src/routes/home.tsx for responsive routed surface behavior.",
        "Update scripts/release.ts.",
        "Run responsive tests."
      ].join("\n"),
      scopeBudget
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "SCOPE_EXPANSION_WARN",
        evidence: expect.arrayContaining([
          expect.stringContaining("scripts/release.ts [unexplained]")
        ])
      })
    );
    expect(result.targetClassifications).toContainEqual(
      expect.objectContaining({
        target: "scripts/release.ts",
        classification: "unexplained",
        reason: expect.stringContaining("No credible")
      })
    );
  });

  it("does not treat slash-separated prose as repository paths", () => {
    const result = parseAgentPlan(
      [
        "Improve cards/tables/headers behavior.",
        "Review breakpoint/nav behavior.",
        "Handle loading/empty/error states.",
        "Update src/surfaces/home.tsx."
      ].join("\n")
    );

    expect(result.proposedFiles).toEqual(["src/surfaces/home.tsx"]);
  });

  it("normalizes Windows and POSIX path separators for identical classification", () => {
    const scopeBudget = sampleScopeBudget({
      allowedPaths: ["src/surfaces/home.tsx"],
      expectedPaths: ["src/surfaces/home.tsx"],
      explicitScope: ["src/surfaces/home.tsx"],
      softLimits: { maxFilesChanged: 5, maxLinesAdded: 200, maxLinesDeleted: 120 }
    });
    const posix = validateAgentPlan({
      taskText: "Update src/surfaces/home.tsx.",
      planText: "Update src/surfaces/home.tsx and run tests.",
      scopeBudget
    });
    const windows = validateAgentPlan({
      taskText: "Update src/surfaces/home.tsx.",
      planText: "Update src\\surfaces\\home.tsx and run tests.",
      scopeBudget
    });

    expect(posix.parsedPlan.proposedFiles).toEqual(["src/surfaces/home.tsx"]);
    expect(windows.parsedPlan.proposedFiles).toEqual(["src/surfaces/home.tsx"]);
    expect(windows.targetClassifications).toEqual(posix.targetClassifications);
    expect(windows.findings.map((finding) => finding.code)).toEqual(
      posix.findings.map((finding) => finding.code)
    );
  });

  it("classifies a shared dependency imported by explicit consumers as derived", () => {
    const repo = createTempRepo({
      "src/one.ts": "import { table } from './shared/table';\nexport const one = table;",
      "src/two.ts": "import { table } from './shared/table';\nexport const two = table;",
      "src/shared/table.ts": "export const table = 1;"
    });
    const task = "Update src/one.ts and src/two.ts for the presentation fix.";
    const scopeBudget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });
    const result = validateAgentPlan({
      cwd: repo,
      taskText: task,
      planText:
        "Update src/one.ts, src/two.ts, and src/shared/table.ts. Run focused tests.",
      scopeBudget
    });

    expect(result.targetClassifications).toContainEqual(
      expect.objectContaining({
        target: "src/shared/table.ts",
        classification: "derived",
        reason: "Target is imported by an explicitly scoped target."
      })
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "SCOPE_EXPANSION_WARN" })
    );
  });

  it("keeps protected semantic boundaries enforceable even for direct files", () => {
    const scopeBudget = sampleScopeBudget({
      allowedPaths: ["src/card.tsx"],
      expectedPaths: ["src/card.tsx"],
      explicitScope: ["src/card.tsx"]
    });
    const result = validateAgentPlan({
      taskText:
        "Make a presentation-only responsive layout update in src/card.tsx. Do not change calculation behavior.",
      planText:
        "Update src/card.tsx and alter discount calculation behavior. Run focused tests.",
      scopeBudget
    });

    expect(result.targetClassifications).toContainEqual(
      expect.objectContaining({ target: "src/card.tsx", classification: "direct" })
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "PLAN_HARD_GATE_VIOLATION",
        title: "Protected semantic boundary crossed"
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
    expect(brief).toContain("Implement the smallest clear change that satisfies the task.");
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

  it("includes scope budget summary and expected scope", () => {
    const brief = generateImplementationBrief(sampleBriefInput());

    expect(brief).toContain("## Scope budget");
    expect(brief).toContain("- Expected files changed: 2-6");
    expect(brief).toContain("- Expected lines added: 30-220");
    expect(brief).toContain("- Soft max files: 8");
    expect(brief).toContain("## Expected scope");
    expect(brief).toContain("src/features/users/UserTable.tsx");
  });

  it("includes protected checks with approval guidance", () => {
    const brief = generateImplementationBrief(sampleBriefInput());

    expect(brief).toContain("## Protected checks");
    expect(brief).toContain("- Preserve test integrity.");
    expect(brief).toContain("New dependencies require approval");
    expect(brief).toContain("CI changes require approval");
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

  it("includes verification guidance when verification is expected", () => {
    const brief = generateImplementationBrief(sampleBriefInput());

    expect(brief).toContain("## Verification expected");
    expect(brief).toContain("- Run focused verification appropriate to the change.");
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
      "- No precise expected paths were identified. Keep changes aligned with the task and explain necessary expansion."
    );
  });

  it("includes before-final-response instructions", () => {
    const brief = generateImplementationBrief(sampleBriefInput());

    expect(brief).toContain("## Before final response");
    expect(brief).toContain("1. Run `npx --no-install gleip status`.");
    expect(brief).toContain("2. Run relevant tests if available.");
    expect(brief).toContain("3. Report files changed.");
    expect(brief).toContain("4. Report tests run.");
    expect(brief).toContain("5. Report whether Gleip status is clean");
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
    contextFiles: [],
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
