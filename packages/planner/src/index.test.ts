import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  classifyTask,
  createScopeBudget,
  discoverRepoContext,
  analyzeBriefCoverage,
  extractRequirementLedger,
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

  it("classifies documentation-only context updates with low ceremony", () => {
    expect(classifyTask("Update FULL_CONTEXT.md to document the current runtime behavior.")).toMatchObject({
      taskType: "documentation_update",
      riskLevel: "low",
      likelyRequiresTests: false,
      workflowProfile: "documentation_only"
    });
  });

  it("classifies surgical runtime behavior tasks without brittle example matching", () => {
    expect(
      classifyTask(
        "Surgically optimize SMC Goblin Gaps runtime for stacked gap compounding and breakeven stop labeling."
      )
    ).toMatchObject({
      taskType: "local_behavior_change",
      confidence: "high",
      riskLevel: "medium",
      likelyRequiresTests: true,
      workflowProfile: "local_behavior_change"
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

  // C1: a single-line task carrying both an instruction and a trailing guardrail used to be read
  // as one prohibition, and the file the user asked to fix was filed as read-only context and
  // dropped from expected scope. Gleip then told the agent not to edit it.
  describe("a task with a trailing guardrail keeps its edit target in scope", () => {
    const task =
      "Fix the discount function in src/cart.ts so SAVE10 applies 10 percent off only once. Do not change persistence or the public contract.";

    const budgetFor = (taskText: string): ScopeBudget =>
      createScopeBudget({
        task: taskText,
        classification: classifyTask(taskText),
        repoContext: repoContextWith({
          likelyRelevantFiles: [{ path: "src/cart.ts", score: 10, reasons: ["match"] }]
        })
      });

    it("puts the named file in expected scope, not read-only context", () => {
      const budget = budgetFor(task);

      expect(budget.expectedPaths).toContain("src/cart.ts");
      expect(budget.readOnlyContextPaths ?? []).not.toContain("src/cart.ts");
    });

    it("keeps expected scope and read-only context disjoint", () => {
      // Structural invariant: requiring a change and forbidding one are contradictory, so a path
      // must never appear in both lists regardless of how the task was phrased.
      for (const phrasing of [
        task,
        task.replace(". Do not", ".\nDo not"),
        "Fix src/cart.ts but do not change the public contract."
      ]) {
        const budget = budgetFor(phrasing);
        const overlap = (budget.expectedPaths ?? []).filter((path) =>
          (budget.readOnlyContextPaths ?? []).includes(path)
        );

        expect(overlap).toEqual([]);
      }
    });
  });

  // S2: every checks.* key was read by no product code, so `secrets: false` was a silent no-op
  // and `secrets: true` guaranteed nothing. GLEIP.md calls configuration a user-facing API.
  it("wires the .gleip.yml checks toggles into the hard gates", () => {
    const task = "Add CSV export to users table";
    const enabled = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });

    expect(enabled.hardGates).toMatchObject({
      skippedTestsAllowed: false,
      deletedTestsAllowed: false,
      secretsAllowed: false
    });

    const disabled = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext(),
      config: {
        checks: {
          skipped_tests: false,
          deleted_tests: false,
          secrets: false,
          ci_weakening: false,
          dependency_bloat: false
        }
      }
    });

    expect(disabled.hardGates).toMatchObject({
      skippedTestsAllowed: true,
      deletedTestsAllowed: true,
      secretsAllowed: true,
      ciChangesAllowed: true,
      newDependenciesAllowed: true
    });
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

  it("uses documentation-only profile for a single editable context file", () => {
    const task = "Update FULL_CONTEXT.md to document the current runtime behavior.";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });

    expect(budget.workflowProfile).toBe("documentation_only");
    expect(budget.riskLevel).toBe("low");
    expect(budget.planRequired).toBe(false);
    expect(budget.requiredTests).toBe(false);
    expect(budget.allowedPaths).toEqual(["FULL_CONTEXT.md"]);
    expect(budget.contextDocsTouchAllowed).toBe(true);
    expect(budget.readOnlyContextPaths).not.toContain("FULL_CONTEXT.md");
  });

  it("does not treat policy-bearing markdown as documentation-only", () => {
    const task = "Update AGENTS.md with the repository working policy.";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: emptyRepoContext()
    });

    expect(budget.workflowProfile).not.toBe("documentation_only");
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

  it("drops inferred module paths that do not exist in the scanned repository", () => {
    // "an empty result set" in a verification sentence was parsed as a module named
    // "empty-result", inventing five path patterns for something that does not exist and
    // inflating expected scope until it excluded almost nothing.
    const task =
      "Add tests in tests/orders.test.ts covering the happy path, an empty result set, and an unauthenticated request.";
    const budget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext: repoContextWith({
        knownPaths: ["tests", "tests/orders.test.ts", "src", "src/api", "src/api/orders.ts"]
      })
    });

    for (const fabricated of [
      "empty-result",
      "src/empty-result",
      "packages/empty-result",
      "**/empty-result/**",
      "**/empty-result.*"
    ]) {
      expect(budget.allowedPaths).not.toContain(fabricated);
    }
  });

  it("does not let a forbidden area escalate the task into that area", () => {
    // Naming CI in order to forbid it used to classify the task as an infra/CI change, applying
    // the sensitive_change profile and high risk to a routine feature.
    const task =
      "Add a GET /orders/export endpoint that streams order history.\n\n## Out of scope\n- Do not touch CI configuration.\n- Do not modify the authentication middleware.";

    expect(classifyTask(task).taskType).not.toBe("infra_ci_change");
    expect(classifyTask(task).taskType).not.toBe("auth_security_change");
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

  it("carries edit intent across comma-separated target lists", () => {
    const plan = parseAgentPlan(
      "Update src/smc/runtime.ts, tests/smc-runtime.test.ts, and FULL_CONTEXT.md. Run the focused SMC runtime test."
    );

    expect(plan.contextFiles).not.toContain("FULL_CONTEXT.md");
    expect(plan.proposedFiles).toEqual([
      "FULL_CONTEXT.md",
      "src/smc/runtime.ts",
      "tests/smc-runtime.test.ts"
    ]);
  });

  it("keeps explicit edit targets from becoming output artifacts when clauses mention cache or reports", () => {
    const plan = parseAgentPlan(
      [
        "1. Edit src/analysis/engine.ts to add grouped scoring and update cache-key isolation.",
        "2. Edit src/api/repository.ts and src/api/handler.ts to pass the selected strategy and validate the response model.",
        "3. Edit src/api/contracts.ts and ui/lib/types.ts to add optional diagnostic fields.",
        "4. Edit tests/analysis-engine.test.ts and docs/context.md, then run focused tests and final checks."
      ].join("\n")
    );

    expect(plan.proposedFiles).toEqual([
      "docs/context.md",
      "src/analysis/engine.ts",
      "src/api/contracts.ts",
      "src/api/handler.ts",
      "src/api/repository.ts",
      "tests/analysis-engine.test.ts",
      "ui/lib/types.ts"
    ]);
    expect(plan.outputFiles).toEqual([]);
  });

  it("keeps genuine generated output artifacts separate from editable source targets", () => {
    const plan = parseAgentPlan(
      [
        "1. Update src/export/report.ts to generate artifacts/summary.json.",
        "2. Emit coverage/results.xml during the verification command.",
        "3. Write generated/api-schema.json from the contract build."
      ].join("\n")
    );

    expect(plan.proposedFiles).toEqual(["src/export/report.ts"]);
    expect(plan.outputFiles).toEqual([
      "artifacts/summary.json",
      "coverage/results.xml",
      "generated/api-schema.json"
    ]);
  });

  it("does not turn conceptual slash terms in implementation clauses into file paths", () => {
    const plan = parseAgentPlan(
      [
        "Edit src/analysis/engine.ts for opt-in baseline/strategy_v1 selection and grouped scoring.",
        "Edit src/api/contracts.ts for optional diagnostics/analog fields.",
        "Run focused tests."
      ].join("\n")
    );

    expect(plan.proposedFiles).toEqual(["src/analysis/engine.ts", "src/api/contracts.ts"]);
    const parsedTargets = JSON.stringify({
      proposedFiles: plan.proposedFiles,
      contextFiles: plan.contextFiles,
      outputFiles: plan.outputFiles,
      fileMentions: plan.fileMentions
    });

    expect(parsedTargets).not.toContain("baseline/strategy_v1");
    expect(parsedTargets).not.toContain("diagnostics/analog");
  });
});

describe("canonical requirement ledger", () => {
  it("extracts mandatory and prohibited requirements from a long task without losing late requirements", () => {
    const middlePadding = "Background context. ".repeat(250);
    const task = [
      "# Requirements",
      "- Must update src/runtime.ts.",
      middlePadding,
      "## Acceptance criteria",
      "- Preserve Windows compatibility.",
      "More context. ".repeat(220),
      "## Must not",
      "- Add dependencies.",
      "## Release instructions",
      "- Run package smoke tests before completion."
    ].join("\n");
    const ledger = extractRequirementLedger({ taskText: task, canonicalTaskHash: "sha256:test" });

    expect(task.length).toBeGreaterThan(8000);
    expect(ledger.canonicalTaskHash).toBe("sha256:test");
    expect(ledger.offsetEncoding).toBe("utf16");
    expect(ledger.requirements.map((requirement) => requirement.sourceText)).toEqual(
      expect.arrayContaining([
        "Must update src/runtime.ts.",
        "Preserve Windows compatibility.",
        "Add dependencies.",
        "Run package smoke tests before completion."
      ])
    );
    expect(
      ledger.requirements.find((requirement) => requirement.sourceText === "Add dependencies.")
        ?.obligation
    ).toBe("prohibited");
  });

  // The same task expressed three ways must produce the same obligations. Requirement
  // extraction used to segment on newlines only, so phrasing decided meaning: two sentences on
  // one line merged into a single inverted prohibition, and one sentence hard-wrapped across two
  // lines split into fragments.
  describe("requirement segmentation is independent of line breaks", () => {
    const oneLine =
      "Fix the discount function in src/cart.ts so SAVE10 applies 10 percent off only once. Do not change persistence or the public contract.";
    const twoLines =
      "Fix the discount function in src/cart.ts so SAVE10 applies 10 percent off only once.\nDo not change persistence or the public contract.";
    const hardWrapped =
      "Fix the discount function in src/cart.ts so SAVE10 applies 10 percent\noff only once. Do not change persistence or the public\ncontract.";

    const obligationsOf = (task: string): string[] =>
      extractRequirementLedger(task).requirements.map((requirement) => requirement.obligation);

    it("keeps an instruction and its guardrail as separate requirements on one line", () => {
      const ledger = extractRequirementLedger(oneLine);

      expect(ledger.requirements).toHaveLength(2);
      expect(ledger.requirements[0]?.obligation).toBe("required");
      expect(ledger.requirements[0]?.relatedPaths).toContain("src/cart.ts");
      expect(ledger.requirements[1]?.obligation).toBe("prohibited");
    });

    it("produces identical obligations for one-line, multi-line, and hard-wrapped forms", () => {
      expect(obligationsOf(oneLine)).toEqual(["required", "prohibited"]);
      expect(obligationsOf(twoLines)).toEqual(["required", "prohibited"]);
      expect(obligationsOf(hardWrapped)).toEqual(["required", "prohibited"]);
    });

    it("does not split a hard-wrapped sentence into fragments", () => {
      for (const requirement of extractRequirementLedger(hardWrapped).requirements) {
        // A fragment is a requirement that does not start a sentence.
        expect(requirement.sourceText).toMatch(/^[A-Z]/u);
        expect(requirement.sourceText).toMatch(/[.!?]$/u);
      }
    });
  });

  describe("obligation classification on ordinary English", () => {
    const obligationOf = (text: string): string | undefined =>
      extractRequirementLedger(text).requirements[0]?.obligation;

    it("does not treat a bare 'no' as a prohibition", () => {
      // A verification step, not a prohibition.
      expect(obligationOf("Run the existing test suite and confirm no regressions.")).toBe(
        "required"
      );
    });

    it("treats 'may not' as a prohibition rather than a permission", () => {
      const ledger = extractRequirementLedger(
        "The response must stream rows; it may not buffer the whole result set."
      );

      expect(ledger.requirements[0]?.obligation).toBe("required");
      expect(ledger.requirements.at(-1)?.obligation).toBe("prohibited");
    });

    it("lets an acceptance-criteria heading outrank a leading 'No'", () => {
      const ledger = extractRequirementLedger(
        ["## Acceptance criteria", "- No other customer's data is reachable."].join("\n")
      );

      expect(ledger.requirements[0]?.obligation).toBe("required");
    });

    it("never emits a Markdown heading as a requirement", () => {
      const ledger = extractRequirementLedger(
        ["## Verification", "- Run the suite.", "## Notes", "- Ordering is unspecified."].join("\n")
      );

      expect(ledger.requirements.map((requirement) => requirement.sourceText)).not.toContain(
        "## Notes"
      );
      // An unrecognised heading must also reset section context rather than leaking the
      // previous section's category onto everything beneath it.
      expect(
        ledger.requirements.find((requirement) =>
          requirement.sourceText.startsWith("Ordering")
        )?.category
      ).not.toBe("verification");
    });

    it("keeps both clauses of a semicolon-joined list item", () => {
      // The clause loses its terminal punctuation when split, which must not let the
      // "short line without punctuation" heading heuristic swallow it as a section marker.
      const requirements = extractRequirementLedger(
        ["## Out of scope", "- Do not add new dependencies; use the standard library only."].join(
          "\n"
        )
      ).requirements;

      expect(requirements.map((requirement) => requirement.sourceText)).toEqual([
        "Do not add new dependencies",
        "use the standard library only."
      ]);
      expect(requirements.every((requirement) => requirement.obligation === "prohibited")).toBe(
        true
      );
    });

    it("does not treat nouns as instruction verbs", () => {
      // Background narration, not obligations -- "document" and "support" here are nouns.
      expect(extractRequirementLedger("This document is the full task contract.").requirements)
        .toHaveLength(0);
      expect(
        extractRequirementLedger("Support has asked for a way to export order history.")
          .requirements
      ).toHaveLength(0);
      // The same words in imperative position are instructions.
      expect(
        extractRequirementLedger("Document the new endpoint in `docs/api.md`.").requirements[0]
          ?.obligation
      ).toBe("required");
    });

    it("never reduces a task to prohibitions alone", () => {
      // Instruction verbs are a closed vocabulary, so a task phrased outside it -- "Resolve ..."
      // rather than "Fix ..." -- could contribute nothing but its guardrail, leaving a ledger
      // that says only what not to do. Caught by running Gleip on its own audit task.
      const ledger = extractRequirementLedger(
        "Resolve the audit findings in `packages/planner/src/index.ts`. Do not weaken existing tests."
      );
      const required = ledger.requirements.filter(
        (requirement) => requirement.obligation === "required"
      );

      expect(required.length).toBeGreaterThan(0);
      expect(required[0]?.sourceText).toContain("Resolve the audit findings");
      expect(required[0]?.relatedPaths).toContain("packages/planner/src/index.ts");
      expect(
        ledger.requirements.some((requirement) => requirement.obligation === "prohibited")
      ).toBe(true);
    });

    it("marks a positionally inferred requirement as low confidence", () => {
      const ledger = extractRequirementLedger(
        "Sort out the flaky suite somehow. Do not disable it."
      );
      const required = ledger.requirements.find(
        (requirement) => requirement.obligation === "required"
      );

      // Inferred from position, not stated, so it must not carry the weight of an explicit one.
      expect(required?.confidence).toBe("low");
      expect(required?.explicit).toBe(false);
    });

    it("rejects non-path tokens as related paths", () => {
      const ledger = extractRequirementLedger(
        "Return the report as text/csv from the /orders/export route."
      );
      const paths = ledger.requirements.flatMap((requirement) => requirement.relatedPaths);

      expect(paths).not.toContain("text/csv");
      expect(paths).not.toContain("/orders/export");
    });
  });

  it("detects brief omissions without treating the brief as canonical", () => {
    const ledger = extractRequirementLedger(
      [
        "Requirements:",
        "- Must update src/runtime.ts.",
        "- Must preserve Windows compatibility.",
        "- Must update docs/compatibility.md."
      ].join("\n")
    );
    const coverage = analyzeBriefCoverage("Update src/runtime.ts.", ledger);

    expect(coverage.coverageStatus).toBe("omissions_visible");
    expect(coverage.omittedRequirementCount).toBeGreaterThanOrEqual(1);
  });

  it("blocks an aligned plan when a mandatory canonical requirement is missing", () => {
    const ledger = extractRequirementLedger(
      [
        "Requirements:",
        "- Must update src/runtime.ts.",
        "- Must preserve Windows compatibility."
      ].join("\n")
    );
    const result = validateAgentPlan({
      planText: "Update src/runtime.ts and run tests.",
      requirementLedger: ledger,
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/runtime.ts"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "CANONICAL_REQUIREMENT_MISSING",
        title: "Mandatory canonical requirement missing"
      })
    );
    expect(result.requirementCoverage?.missingRequired.length).toBeGreaterThan(0);
  });

  it("treats prohibited dependency requirements as canonical conflicts", () => {
    const ledger = extractRequirementLedger("Do not add dependencies.");
    const result = validateAgentPlan({
      planText: "Add zod dependency and update package.json.",
      requirementLedger: ledger,
      scopeBudget: sampleScopeBudget({
        requiredTests: false,
        hardGates: sampleHardGates({ newDependenciesAllowed: true })
      })
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "CANONICAL_PROHIBITION_CONFLICT"
      })
    );
  });

  it("preserves amendments and marks explicit supersession", () => {
    const ledger = extractRequirementLedger({
      taskText: "",
      revisions: [
        {
          revisionId: "rev-1",
          revisionNumber: 1,
          content: "Must output JSON."
        },
        {
          revisionId: "rev-2",
          revisionNumber: 2,
          content: "Replace the output format with CSV instead."
        }
      ]
    });

    expect(ledger.requirements[0]).toMatchObject({
      canonicalRevisionId: "rev-1",
      status: "superseded",
      supersededBy: "REQ-002"
    });
    expect(ledger.requirements[1]).toMatchObject({
      canonicalRevisionId: "rev-2",
      status: "active"
    });
  });

  it("keeps optional suggestions advisory and source spans exact with Unicode text", () => {
    const task = "Requirements:\n- Must preserve café output.\nOptional:\n- Could add extra charts.";
    const ledger = extractRequirementLedger(task);
    const required = ledger.requirements.find((requirement) =>
      requirement.sourceText.includes("café")
    );
    const optional = ledger.requirements.find((requirement) =>
      requirement.sourceText.includes("extra charts")
    );

    expect(required).toBeDefined();
    // The span locates the requirement text exactly -- it no longer includes the list marker
    // that sourceText strips. Offsets are the authoritative locator, so they must round-trip.
    expect(task.slice(required?.sourceStart, required?.sourceEnd)).toBe(required?.sourceText);
    expect(task.slice(required?.sourceStart, required?.sourceEnd)).toBe(
      "Must preserve café output."
    );
    expect(optional?.obligation).toBe("optional");
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

  it.each([
    [
      "read-only audit",
      "Read the four source files and inspect their runtime behavior. Compare each finding against the observed implementation. Use the available historical data for a non-writing event study where reliable, state exact limitations where it is not, and confirm the worktree remains unchanged."
    ],
    [
      "financial review",
      "Review the financial model, reconcile calculated totals against the source sheets, identify unsupported assumptions, and report any values that cannot be independently validated."
    ],
    [
      "API investigation",
      "Inspect the request logs, reproduce the failing request where possible, compare the response with the documented API contract, and record the remaining uncertainty."
    ],
    [
      "UI implementation",
      "Update the responsive navigation, build the frontend, inspect the result at mobile and desktop widths, and verify that keyboard navigation still works."
    ],
    [
      "documentation",
      "Revise the migration guide, validate each command against the current CLI, check internal references, and review the rendered Markdown for formatting problems."
    ],
    [
      "operational task",
      "Publish the package, confirm the registry exposes the expected version, run the installed CLI against the fixture repository, and verify that the working tree is clean."
    ],
    [
      "distributed evidence",
      [
        "1. Inspect the parser implementation.",
        "2. Compare its output with the documented schema.",
        "3. Reproduce malformed-input cases.",
        "4. Record any behavior that cannot be confirmed."
      ].join("\n")
    ],
    [
      "constraint-driven alternative",
      "Inspect the production configuration without executing it. Compare it with the documented deployment contract and report any aspects that cannot be safely verified in the current environment."
    ]
  ])("accepts task-appropriate approach and verification evidence for %s", (_name, planText) => {
    const result = validateAgentPlan({
      planText,
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["*"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("aligned");
    expect(result.findings).toEqual([]);
  });

  it("keeps warning when no actionable approach is present", () => {
    const result = validateAgentPlan({
      planText: "Complete the requested work.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["*"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "PLAN_REQUIRED_SECTION_MISSING" })
    );
  });

  it("keeps warning when implementation vocabulary has no verification method", () => {
    const result = validateAgentPlan({
      planText: "Add the new parser option and update the affected files.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["*"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "MISSING_TEST_STRATEGY" })
    );
  });

  it("keeps warning when review wording has no validation method", () => {
    const result = validateAgentPlan({
      planText: "Review the repository and provide recommendations.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["*"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "MISSING_TEST_STRATEGY" })
    );
  });

  it("does not accept isolated verification keywords as a strategy", () => {
    const result = validateAgentPlan({
      planText: "Implement the feature. Tests are important.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["*"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "MISSING_TEST_STRATEGY" })
    );
  });

  it("does not count negated verification as verification evidence", () => {
    const result = validateAgentPlan({
      planText:
        "Implement the feature but do not run tests, builds, manual verification, or any other validation.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["*"],
        requiredTests: true
      })
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.parsedPlan.proposedTests).toEqual([]);
    expect(result.findings).toContainEqual(
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

  it("does not warn that a concise concrete plan is vague", () => {
    const result = validateAgentPlan({
      planText: "Update src/foo.ts. Run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "PLAN_TOO_VAGUE" })
    );
  });

  it("still warns when a plan only names a file without an action", () => {
    const result = validateAgentPlan({
      planText: "src/foo.ts",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: false
      })
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "PLAN_TOO_VAGUE" })
    );
  });

  it("does not turn generic documentation context wording into edit scope", () => {
    const result = validateAgentPlan({
      planText: "Use README.md for context, update src/foo.ts, and run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["src/foo.ts"],
        requiredTests: true
      })
    });

    expect(result.parsedPlan.contextFiles).toContain("README.md");
    expect(result.parsedPlan.proposedFiles).not.toContain("README.md");
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

  it("does not mark an existing file as new when adding tests in it", () => {
    const repo = createTempRepo({
      "tests/example.test.ts": "describe('example', () => {});\n"
    });
    const result = validateAgentPlan({
      cwd: repo,
      planText: "Add tests in tests/example.test.ts and run tests.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["tests/example.test.ts"],
        requiredTests: false
      })
    });

    expect(result.parsedPlan.fileMentions).toContainEqual(
      expect.objectContaining({
        path: "tests/example.test.ts",
        role: "edit",
        markedNew: false
      })
    );
    expect(result.findings).not.toContainEqual(
      expect.objectContaining({ code: "PLAN_MENTIONED_FILE_MISSING" })
    );
  });

  it("does not mark an existing documentation file as new when adding content in it", () => {
    const repo = createTempRepo({
      "docs/example.md": "# Existing docs\n",
      "FULL_CONTEXT.md": "# Existing context\n"
    });
    const result = validateAgentPlan({
      cwd: repo,
      planText: "Add documentation in docs/example.md and add context in FULL_CONTEXT.md.",
      scopeBudget: sampleScopeBudget({
        allowedPaths: ["docs/example.md", "FULL_CONTEXT.md"],
        requiredTests: false
      })
    });

    expect(result.parsedPlan.fileMentions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "docs/example.md",
          role: "edit",
          markedNew: false
        }),
        expect.objectContaining({
          path: "FULL_CONTEXT.md",
          role: "edit",
          markedNew: false
        })
      ])
    );
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

  it("accepts focused SMC runtime, test, and context-document targets without dormant policy flood", () => {
    const task =
      "Surgically optimize SMC Goblin Gaps runtime for stacked gap compounding and breakeven stop labeling.";
    const repoContext = repoContextWith({
      likelyRelevantFiles: [
        {
          path: "src/smc/runtime.ts",
          score: 24,
          reasons: ["runtime and compounding match"]
        },
        {
          path: "src/goblin/dashboard.ts",
          score: 3,
          reasons: ["weak Goblin path match"]
        }
      ],
      likelyTestFiles: [
        {
          path: "src/smc/runtime.test.ts",
          score: 18,
          reasons: ["nearby runtime test"]
        }
      ]
    });
    const scopeBudget = createScopeBudget({
      task,
      classification: classifyTask(task),
      repoContext
    });
    const result = validateAgentPlan({
      taskText: task,
      planText: [
        "Update src/smc/runtime.ts for stacked gap compounding and breakeven stop labeling.",
        "Update src/smc/runtime.test.ts with focused runtime tests.",
        "Update FULL_CONTEXT.md to document the runtime behavior.",
        "Run focused runtime tests."
      ].join("\n"),
      scopeBudget
    });

    expect(scopeBudget.workflowProfile).toBe("local_behavior_change");
    expect(repoContext.likelyRelevantFiles[0]?.path).toBe("src/smc/runtime.ts");
    expect(result.status).toBe("aligned");
    expect(result.findings.map((finding) => finding.code)).not.toEqual(
      expect.arrayContaining(["DEPENDENCY_CHANGE_INTENT", "CI_CHANGE_INTENT"])
    );
    expect(result.targetClassifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "src/smc/runtime.ts", classification: "derived" }),
        expect.objectContaining({ target: "src/smc/runtime.test.ts", classification: "derived" })
      ])
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
    expect(brief).toContain("## Task\nTask preview: Add CSV export to users table");
    expect(brief).toContain("## Authority");
    expect(brief).toContain("This brief is derived from the canonical user task.");
    expect(brief).toContain("- Type: small_feature");
    expect(brief).toContain("- Risk: medium");
    expect(brief).toContain("- Confidence: high");
    expect(brief).toContain("- Profile: local_behavior_change");
    expect(brief).toContain("Draft a short plan naming the implementation file(s)");
  });

  it("includes top relevant files but limits count", () => {
    const brief = generateImplementationBrief(
      sampleBriefInput({
        repoContext: repoContextWith({
          likelyRelevantFiles: numberedFileMatches("src/file", ".ts", 7)
        })
      })
    );

    const relevantSection = sectionBetween(brief, "Implementation:", "Tests:");
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

    const testSection = sectionBetween(brief, "Tests:", "## Expected scope");
    expect(testSection).toContain("src/file1.test.ts");
    expect(testSection).toContain("src/file5.test.ts");
    expect(testSection).not.toContain("src/file6.test.ts");
  });

  it("includes scope budget summary and expected scope", () => {
    const brief = generateImplementationBrief(sampleBriefInput());

    expect(brief).toContain("## Expected scope");
    expect(brief).toContain("src/features/users/UserTable.tsx");
  });

  it("includes protected checks with approval guidance", () => {
    const brief = generateImplementationBrief(sampleBriefInput());

    expect(brief).toContain("## Active risks");
    expect(brief).toContain("## Applicable protections");
    expect(brief).toContain("Dependency and CI changes require approval if introduced.");
    expect(brief).toContain("Tests may not be skipped, deleted, or weakened.");
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
    expect(brief).toContain("Run focused verification");
    expect(brief).toContain("npx --no-install gleip check --incremental");
    expect(brief).toContain("npx --no-install gleip status --compact");
    expect(brief).toContain("Report files changed, tests run, and residual risks.");
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
