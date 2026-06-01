import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createGleipCommand } from "./index.js";

const tempRepos: string[] = [];
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("createGleipCommand", () => {
  afterEach(() => {
    for (const tempRepo of tempRepos.splice(0)) {
      rmSync(tempRepo, { recursive: true, force: true });
    }
  });

  it("registers the Gleip commands", () => {
    const commandNames = createGleipCommand()
      .commands.map((command) => command.name())
      .sort();

    expect(commandNames).toEqual([
      "brief",
      "check",
      "disable",
      "doctor",
      "enable",
      "init",
      "preflight",
      "start",
      "state",
      "status",
      "stop",
      "validate-plan"
    ]);
  });

  it("help output includes core command names and local-only wording", async () => {
    const output = (await runHelpCommand(["--help"])).join("\n");

    for (const commandName of [
      "init",
      "preflight",
      "start",
      "brief",
      "validate-plan",
      "status",
      "check",
      "doctor",
      "stop",
      "enable",
      "disable",
      "state"
    ]) {
      expect(output).toContain(commandName);
    }

    expect(output).toContain("--cwd <path>");
    expect(output).toContain("local-only");
    expect(output.toLowerCase()).not.toContain("cloud");
    expect(output.toLowerCase()).not.toContain("llm");
    expect(output.toLowerCase()).not.toContain("telemetry");
    expect(output.toLowerCase()).not.toContain("dashboard");
  });

  it("command help shows important flags and stdin support", async () => {
    const validatePlanHelp = (await runHelpCommand(["validate-plan", "--help"])).join("\n");
    const statusHelp = (await runHelpCommand(["status", "--help"])).join("\n");
    const checkHelp = (await runHelpCommand(["check", "--help"])).join("\n");

    expect(validatePlanHelp).toContain("--file <path>");
    expect(validatePlanHelp).toContain("--json");
    expect(validatePlanHelp).toContain("stdin");
    expect(statusHelp).toContain("--include-baseline");
    expect(statusHelp).toContain("--json");
    expect(checkHelp).toContain("--include-baseline");
    expect(checkHelp).toContain("--json");
  });

  it("release checklist doc exists", () => {
    expect(existsSync(join(repoRoot, "docs", "release-checklist.md"))).toBe(true);
  });

  it("package bin points to the built entrypoint", () => {
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, "packages", "cli", "package.json"), "utf8")
    ) as {
      bin: { gleip: string };
      dependencies: Record<string, string>;
      exports: { ".": { import: string; types: string } };
      keywords: string[];
      main: string;
      name: string;
      types: string;
      version: string;
    };

    expect(packageJson.bin.gleip).toBe("./dist/index.js");
    expect(packageJson.main).toBe("./dist/index.js");
    expect(packageJson.types).toBe("./dist/index.d.ts");
    expect(packageJson.exports["."].import).toBe("./dist/index.js");
    expect(packageJson.exports["."].types).toBe("./dist/index.d.ts");
    expect(packageJson.name).toBe("gleip");
    expect(packageJson.version).toBe("0.1.0");
    expect(packageJson.dependencies["@gleip/planner"]).toBe("workspace:0.1.0");
    expect(packageJson.keywords).toContain("agent-guardrails");
  });

  it("internal package exports point to built outputs", () => {
    for (const packageName of ["config", "planner", "core", "controller"]) {
      const packageJson = JSON.parse(
        readFileSync(join(repoRoot, "packages", packageName, "package.json"), "utf8")
      ) as {
        exports: { ".": { import: string; types: string } };
        main: string;
        types: string;
      };

      expect(packageJson.main).toBe("./dist/index.js");
      expect(packageJson.types).toBe("./dist/index.d.ts");
      expect(packageJson.exports["."].import).toBe("./dist/index.js");
      expect(packageJson.exports["."].types).toBe("./dist/index.d.ts");
    }
  });

  it("source entrypoint has a node shebang for built CLI output", () => {
    const source = readFileSync(join(repoRoot, "packages", "cli", "src", "index.ts"), "utf8");

    expect(source.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("--cwd writes files to the target directory, not the process cwd", async () => {
    const processCwd = createTempRepo();
    const targetCwd = createTempRepo();

    await runCommand(processCwd, ["--cwd", targetCwd, "init"]);

    expect(existsSync(join(targetCwd, ".gleip.yml"))).toBe(true);
    expect(existsSync(join(targetCwd, "GLEIP.md"))).toBe(true);
    expect(existsSync(join(targetCwd, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(targetCwd, ".gleip"))).toBe(true);
    expect(existsSync(join(targetCwd, ".gleip", "state.json"))).toBe(true);
    expect(existsSync(join(processCwd, ".gleip.yml"))).toBe(false);
    expect(existsSync(join(processCwd, "GLEIP.md"))).toBe(false);
    expect(existsSync(join(processCwd, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(processCwd, ".gleip"))).toBe(false);
  });

  it("init creates the repo Gleip files", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init"]);

    expect(existsSync(join(repo, ".gleip.yml"))).toBe(true);
    expect(existsSync(join(repo, "GLEIP.md"))).toBe(true);
    expect(existsSync(join(repo, ".gleip"))).toBe(true);
    expect(existsSync(join(repo, ".gleip", "state.json"))).toBe(true);
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(true);
    expect(readFileSync(join(repo, "GLEIP.md"), "utf8")).toContain("local-only");
    expect(readFileSync(join(repo, "GLEIP.md"), "utf8")).toContain("no external review");
  });

  it("init success output includes next normal flow", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["init"]);
    const initOutput = output.join("\n");

    expect(initOutput).toContain("Gleip initialized.");
    expect(initOutput).toContain("Coding agents should now follow AGENTS.md.");
    expect(initOutput).toContain('Agent runs `gleip preflight "<task>"`');
    expect(initOutput).toContain("Agent validates its plan with `gleip validate-plan`");
    expect(initOutput).toContain("Agent runs `gleip status` before final response");
  });

  it("init creates .gleip/state.json enabled true", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init"]);

    const state = readState(repo);
    expect(state).toMatchObject({
      enabled: true,
      updatedAt: "2026-05-30T00:00:00.000Z",
      updatedBy: "local-cli",
      reason: null
    });
  });

  it("init preserves existing state", async () => {
    const repo = createTempRepo();
    mkdirSync(join(repo, ".gleip"));
    writeFileSync(
      join(repo, ".gleip", "state.json"),
      JSON.stringify({
        enabled: false,
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedBy: "local-cli",
        reason: "custom"
      })
    );

    await runCommand(repo, ["init"]);

    expect(readState(repo)).toMatchObject({
      enabled: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
      reason: "custom"
    });
  });

  it("init --force resets state", async () => {
    const repo = createTempRepo();
    mkdirSync(join(repo, ".gleip"));
    writeFileSync(
      join(repo, ".gleip", "state.json"),
      JSON.stringify({
        enabled: false,
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedBy: "local-cli",
        reason: "custom"
      })
    );

    await runCommand(repo, ["init", "--force"]);

    expect(readState(repo)).toMatchObject({
      enabled: true,
      updatedAt: "2026-05-30T00:00:00.000Z",
      reason: null
    });
  });

  it("init does not overwrite existing generated files", async () => {
    const repo = createTempRepo();
    writeFileSync(join(repo, ".gleip.yml"), "custom config\n");
    writeFileSync(join(repo, "GLEIP.md"), "custom Gleip readme\n");
    writeFileSync(join(repo, "AGENTS.md"), "# Existing instructions\n\nKeep this.\n");

    await runCommand(repo, ["init"]);

    expect(readFileSync(join(repo, ".gleip.yml"), "utf8")).toBe("custom config\n");
    expect(readFileSync(join(repo, "GLEIP.md"), "utf8")).toBe("custom Gleip readme\n");
    expect(readFileSync(join(repo, "AGENTS.md"), "utf8")).toContain("Keep this.");
  });

  it("init writes Gleip agent workflow instructions", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init"]);

    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    expect(agents).toContain("<!-- GLEIP:START -->");
    expect(agents).toContain("This repository uses Gleip");
    expect(agents).toContain("Gleip is local-only");
    expect(agents).toContain("Gleip performs no external review");
    expect(agents).toContain("check `.gleip/state.json`");
    expect(agents).toContain('run `gleip preflight "<task>"`');
    expect(agents).toContain("Read `.gleip/brief.md`");
    expect(agents).toContain("Follow `.gleip/scope-budget.json`");
    expect(agents).toContain("gleip validate-plan");
    expect(agents).toContain("needs_revision");
    expect(agents).toContain("requires_approval");
    expect(agents).toContain("Gleip is currently inactive");
    expect(agents).toContain("no Gleip validation was performed");
    expect(agents).toContain("Run `gleip status` before the final response");
    expect(agents).toContain("approval_required");
    expect(agents).toContain("blocked");
    expect(agents).toContain("<!-- GLEIP:END -->");
  });

  it("running init twice does not duplicate the Gleip-managed AGENTS section", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init"]);
    await runCommand(repo, ["init"]);

    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    expect(countOccurrences(agents, "<!-- GLEIP:START -->")).toBe(1);
    expect(countOccurrences(agents, "<!-- GLEIP:END -->")).toBe(1);
  });

  it("existing AGENTS.md content is preserved", async () => {
    const repo = createTempRepo();
    writeFileSync(join(repo, "AGENTS.md"), "# Agent Instructions\n\nKeep local rules.\n");

    await runCommand(repo, ["init"]);

    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    expect(agents).toContain("Keep local rules.");
    expect(agents).toContain("<!-- GLEIP:START -->");
  });

  it("doctor warns when legacy Argus files are present", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, ".argus.yml", "version: 1\n");
    writeRepoFile(repo, "AGENTS.md", "<!-- ARGUS:START -->\nlegacy\n<!-- ARGUS:END -->\n");

    const output = await runCommand(repo, ["doctor"]);

    expect(output.join("\n")).toContain("Legacy Argus files detected");
    expect(output.join("\n")).toContain("renamed to Gleip");
    expect(output.join("\n")).toContain("Re-run `gleip init`");
  });

  it("enable sets enabled true and stores reason", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["disable", "--reason", "pause"]);
    await runCommand(repo, ["enable", "--reason", "resume"]);

    expect(readState(repo)).toMatchObject({
      enabled: true,
      updatedAt: "2026-05-30T00:00:00.000Z",
      updatedBy: "local-cli",
      reason: "resume"
    });
  });

  it("disable sets enabled false and stores reason", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["disable", "--reason", "manual test"]);

    expect(readState(repo)).toMatchObject({
      enabled: false,
      updatedAt: "2026-05-30T00:00:00.000Z",
      updatedBy: "local-cli",
      reason: "manual test"
    });
    expect(output.join("\n")).toContain("Agents should ask before proceeding");
  });

  it("state prints enabled and disabled state", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["init"]);

    const enabledOutput = await runCommand(repo, ["state"]);
    await runCommand(repo, ["disable", "--reason", "manual test"]);
    const disabledOutput = await runCommand(repo, ["state"]);

    expect(enabledOutput.join("\n")).toContain("Status: enabled");
    expect(disabledOutput.join("\n")).toContain("Status: disabled");
    expect(disabledOutput.join("\n")).toContain("Reason: manual test");
  });

  it("state explains missing state", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["state"]);

    expect(output.join("\n")).toContain("Run `gleip init` first.");
  });

  it("enable and disable respect --cwd", async () => {
    const processCwd = createTempRepo();
    const targetCwd = createTempRepo();

    await runCommand(processCwd, ["--cwd", targetCwd, "disable", "--reason", "target"]);

    expect(readState(targetCwd)).toMatchObject({
      enabled: false,
      reason: "target"
    });
    expect(existsSync(join(processCwd, ".gleip", "state.json"))).toBe(false);
  });

  it("preflight creates session files in the target cwd", async () => {
    const processCwd = createTempRepo();
    const targetCwd = createTempRepo();

    await runCommand(processCwd, ["--cwd", targetCwd, "preflight", "add a parser"]);

    expect(existsSync(join(targetCwd, ".gleip", "session.json"))).toBe(true);
    expect(existsSync(join(targetCwd, ".gleip", "brief.md"))).toBe(true);
    expect(existsSync(join(targetCwd, ".gleip", "scope-budget.json"))).toBe(true);
    expect(existsSync(join(targetCwd, ".gleip", "status.md"))).toBe(true);
    expect(existsSync(join(processCwd, ".gleip"))).toBe(false);
    expect(readFileSync(join(targetCwd, ".gleip", "brief.md"), "utf8")).toContain("add a parser");
  });

  it("preflight still runs when disabled and prints a concise note", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["disable", "--reason", "manual"]);

    const output = await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    expect(existsSync(join(repo, ".gleip", "session.json"))).toBe(true);
    expect(output.join("\n")).toContain("Gleip preflight is ready.");
    expect(output.join("\n")).toContain("Gleip is currently disabled");
    expect(output.join("\n")).toContain("Manual preflight still ran.");
  });

  it("preflight success output includes validate-plan step", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["preflight", "Add CSV export to users table"]);
    const preflightOutput = output.join("\n");

    expect(preflightOutput).toContain("Gleip preflight is ready.");
    expect(preflightOutput).toContain("Read `.gleip/brief.md`.");
    expect(preflightOutput).toContain("Validate the plan with `gleip validate-plan`.");
    expect(preflightOutput).toContain("Implement within `.gleip/scope-budget.json`.");
    expect(preflightOutput).toContain("Run `gleip status` before the final response.");
  });

  it("preflight stores baseline when no existing changes are present", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () => diffContext()
    });

    const session = JSON.parse(readFileSync(join(repo, ".gleip", "session.json"), "utf8")) as {
      baseline: { changedFilesCount: number };
    };
    const baseline = JSON.parse(readFileSync(join(repo, ".gleip", "baseline.json"), "utf8")) as {
      changedFiles: string[];
    };
    expect(session.baseline.changedFilesCount).toBe(0);
    expect(baseline.changedFiles).toEqual([]);
  });

  it("preflight stores baseline and brief note when existing changes are present", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [{ path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }],
          totalLinesAdded: 1
        })
    });

    const baseline = JSON.parse(readFileSync(join(repo, ".gleip", "baseline.json"), "utf8")) as {
      changedFiles: string[];
      note?: string;
    };
    const brief = readFileSync(join(repo, ".gleip", "brief.md"), "utf8");
    expect(baseline.changedFiles).toEqual(["README.md"]);
    expect(baseline.note).toContain("Pre-existing working-tree changes");
    expect(brief).toContain("Pre-existing changes detected.");
  });

  it("preflight writes classification into session.json", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const session = JSON.parse(readFileSync(join(repo, ".gleip", "session.json"), "utf8")) as {
      classification: {
        likelyAllowsNewDependencies: boolean;
        likelyRequiresTests: boolean;
        riskLevel: string;
        taskType: string;
      };
    };
    expect(session.classification).toMatchObject({
      taskType: "small_feature",
      riskLevel: "medium",
      likelyRequiresTests: true,
      likelyAllowsNewDependencies: false
    });
  });

  it("preflight writes classification into brief.md", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const brief = readFileSync(join(repo, ".gleip", "brief.md"), "utf8");
    expect(brief).toContain("# Gleip Implementation Brief");
    expect(brief).toContain("- Type: small_feature");
    expect(brief).toContain("- Risk: medium");
    expect(brief).toContain("- Tests likely required: yes");
    expect(brief).toContain("- New dependencies likely allowed: no");
  });

  it("preflight writes repo context into session.json", async () => {
    const repo = createTempRepo();
    writeRepoFile(
      repo,
      "src/features/users/UserTable.tsx",
      "import { toCsv } from '../../utils/csv';"
    );
    writeRepoFile(repo, "src/features/users/UserTable.test.tsx", "describe('UserTable', () => {})");
    writeRepoFile(repo, "src/utils/csv.ts", "export function toCsv() {}");
    writeRepoFile(repo, "package.json", "{}");
    writeRepoFile(repo, ".github/workflows/ci.yml", "name: ci");

    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const session = JSON.parse(readFileSync(join(repo, ".gleip", "session.json"), "utf8")) as {
      repoContext: {
        ciFiles: string[];
        dependencyFiles: string[];
        likelyRelevantFiles: Array<{ path: string }>;
        likelyTestFiles: Array<{ path: string }>;
      };
    };
    expect(session.repoContext.likelyRelevantFiles.map((file) => file.path)).toContain(
      "src/features/users/UserTable.tsx"
    );
    expect(session.repoContext.likelyRelevantFiles.map((file) => file.path)).toContain(
      "src/utils/csv.ts"
    );
    expect(session.repoContext.likelyTestFiles.map((file) => file.path)).toContain(
      "src/features/users/UserTable.test.tsx"
    );
    expect(session.repoContext.dependencyFiles).toContain("package.json");
    expect(session.repoContext.ciFiles).toContain(".github/workflows/ci.yml");
  });

  it("preflight writes repo context summary into brief.md", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "src/features/users/UserTable.tsx", "export function UserTable() {}");
    writeRepoFile(repo, "src/features/users/UserTable.test.tsx", "describe('UserTable', () => {})");

    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const brief = readFileSync(join(repo, ".gleip", "brief.md"), "utf8");
    expect(brief).toContain("## Repo context");
    expect(brief).toContain("src/features/users/UserTable.tsx");
    expect(brief).toContain("src/features/users/UserTable.test.tsx");
  });

  it("start aliases preflight", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["start", "wire a command"]);

    const session = JSON.parse(readFileSync(join(repo, ".gleip", "session.json"), "utf8")) as {
      task: string;
    };
    expect(session.task).toBe("wire a command");
    expect(readFileSync(join(repo, ".gleip", "scope-budget.json"), "utf8")).toContain("taskType");
  });

  it("brief handles a missing session", async () => {
    const repo = createTempRepo();
    const output = await runCommand(repo, ["brief"]);

    expect(output.join("\n")).toContain('Run `gleip preflight "<task>"` first.');
  });

  it("brief reads from the target cwd", async () => {
    const processCwd = createTempRepo();
    const targetCwd = createTempRepo();
    mkdirSync(join(targetCwd, ".gleip"));
    writeFileSync(join(targetCwd, ".gleip", "brief.md"), "# Target Brief\n");

    const output = await runCommand(processCwd, ["--cwd", targetCwd, "brief"]);

    expect(output.join("\n")).toBe("# Target Brief");
  });

  it("status handles a missing session", async () => {
    const repo = createTempRepo();
    const output = await runCommand(repo, ["status"]);

    expect(output.join("\n")).toContain(
      'No active Gleip session found. Run `gleip preflight "<task>"` first.'
    );
  });

  it("preflight reports a non-git directory with an actionable message", async () => {
    const repo = createTempRepo();
    const output = await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () => diffContext({ isGitRepo: false })
    });

    expect(output.join("\n")).toContain(
      "This directory is not a git repository. Run Gleip inside a repo or pass --cwd."
    );
  });

  it("status updates .gleip/status.md in the target cwd", async () => {
    const processCwd = createTempRepo();
    const targetCwd = createTempRepo();
    await runCommand(processCwd, ["--cwd", targetCwd, "preflight", "sync reports"]);
    writeFileSync(join(targetCwd, ".gleip", "status.md"), "stale status\n");

    await runCommand(processCwd, ["--cwd", targetCwd, "status"]);

    const status = readFileSync(join(targetCwd, ".gleip", "status.md"), "utf8");
    expect(status).toContain("# Gleip Status");
    expect(status).toContain("- Status: within_scope");
    expect(existsSync(join(processCwd, ".gleip", "status.md"))).toBe(false);
  });

  it("status still runs when disabled and prints a concise note", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);
    await runCommand(repo, ["disable", "--reason", "manual"]);

    const output = await runCommand(repo, ["status"]);

    expect(output.join("\n")).toContain("Gleip Status");
    expect(output.join("\n")).toContain("Gleip is currently disabled");
    expect(output.join("\n")).toContain("Status can still be checked manually.");
  });

  it("status prints compact success output when no changes exist", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["status"]);
    const statusOutput = output.join("\n");

    expect(statusOutput).toBe(
      [
        "Gleip Status",
        "Status: within_scope",
        "",
        "No working tree changes detected.",
        "",
        "Next action:",
        "Begin implementation or run gleip preflight if this is not the intended session."
      ].join("\n")
    );
  });

  it("status ignores unchanged pre-existing files", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [{ path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }],
          totalLinesAdded: 1
        })
    });

    const output = await runCommand(repo, ["status"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [{ path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }],
          totalLinesAdded: 1
        }),
      detectScopeDrift: ({ gitDiffContext }) => ({
        status: "within_scope",
        findings: [],
        metrics: {
          filesChanged: gitDiffContext.changedFiles.length,
          linesAdded: gitDiffContext.totalLinesAdded,
          linesDeleted: gitDiffContext.totalLinesDeleted
        },
        summary: "No session changes detected."
      })
    });

    const statusOutput = output.join("\n");
    expect(statusOutput).toContain("No working tree changes detected.");
    expect(statusOutput).toContain("Pre-existing changes ignored: 1 files.");
  });

  it("status includes files changed after preflight", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["status"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["src/features/users/UserTable.tsx"],
          fileStats: [
            {
              path: "src/features/users/UserTable.tsx",
              added: 2,
              deleted: 0,
              diffFingerprint: "user-table-after"
            }
          ],
          totalLinesAdded: 2
        }),
      detectScopeDrift: ({ gitDiffContext }) => ({
        status: "within_scope",
        findings: [],
        metrics: {
          filesChanged: gitDiffContext.changedFiles.length,
          linesAdded: gitDiffContext.totalLinesAdded,
          linesDeleted: gitDiffContext.totalLinesDeleted
        },
        summary: "Session change is within scope."
      })
    });

    expect(output.join("\n")).toContain("- Session changes: 1 files, +2/-0");
  });

  it("status includes pre-existing files whose stats changed after preflight", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [{ path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }],
          totalLinesAdded: 1
        })
    });

    const output = await runCommand(repo, ["status"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [{ path: "README.md", added: 2, deleted: 0, diffFingerprint: "readme-after" }],
          totalLinesAdded: 2
        }),
      detectScopeDrift: ({ gitDiffContext }) => ({
        status: "warning",
        findings: [],
        metrics: {
          filesChanged: gitDiffContext.changedFiles.length,
          linesAdded: gitDiffContext.totalLinesAdded,
          linesDeleted: gitDiffContext.totalLinesDeleted
        },
        summary: "Pre-existing file changed after baseline."
      })
    });

    expect(output.join("\n")).toContain("- Session changes: 1 files, +2/-0");
  });

  it("status prints concise summary when changes have no findings", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["status"], {
      collectWorkingTreeDiff: () => ({
        changedFiles: ["src/features/users/UserTable.tsx"],
        fileStats: [{ path: "src/features/users/UserTable.tsx", added: 3, deleted: 1 }],
        rawDiff: "",
        totalLinesAdded: 3,
        totalLinesDeleted: 1,
        isGitRepo: true,
        hasChanges: true
      }),
      detectScopeDrift: () => ({
        status: "within_scope",
        findings: [],
        metrics: {
          filesChanged: 1,
          linesAdded: 3,
          linesDeleted: 1
        },
        summary: "1 changed file is within scope."
      })
    });

    const statusOutput = output.join("\n");
    expect(statusOutput).toContain("Summary:");
    expect(statusOutput).toContain("- Session changes: 1 files, +3/-1");
    expect(statusOutput).not.toContain("Findings:");
    expect(statusOutput).toContain("Continue. Run relevant tests before final response.");
  });

  it("preflight writes real scope-budget.json", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "src/features/users/UserTable.tsx", "export function UserTable() {}");
    writeRepoFile(repo, "src/features/users/UserTable.test.tsx", "describe('UserTable', () => {})");
    writeRepoFile(repo, "package.json", "{}");
    writeRepoFile(repo, ".github/workflows/ci.yml", "name: ci");

    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const budget = JSON.parse(readFileSync(join(repo, ".gleip", "scope-budget.json"), "utf8")) as {
      allowedPaths: string[];
      blockedWithoutApproval: string[];
      hardGates: {
        ciChangesAllowed: boolean;
        newDependenciesAllowed: boolean;
      };
      requiredTests: boolean;
      taskType: string;
    };
    expect(budget.taskType).toBe("small_feature");
    expect(budget.requiredTests).toBe(true);
    expect(budget.hardGates.newDependenciesAllowed).toBe(false);
    expect(budget.hardGates.ciChangesAllowed).toBe(false);
    expect(budget.allowedPaths).toContain("src/features/users/UserTable.tsx");
    expect(budget.allowedPaths).toContain("src/features/users/UserTable.test.tsx");
    expect(budget.blockedWithoutApproval).toContain("Dependency files: package.json");
    expect(budget.blockedWithoutApproval).toContain("CI files: .github/workflows/ci.yml");
  });

  it("preflight stores budget summary in session.json", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const session = JSON.parse(readFileSync(join(repo, ".gleip", "session.json"), "utf8")) as {
      scopeBudgetSummary: {
        requiredTests: boolean;
        softLimits: {
          maxFilesChanged: number;
        };
      };
    };
    expect(session.scopeBudgetSummary.requiredTests).toBe(true);
    expect(session.scopeBudgetSummary.softLimits.maxFilesChanged).toBe(8);
  });

  it("preflight writes budget summary into brief.md", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const brief = readFileSync(join(repo, ".gleip", "brief.md"), "utf8");
    expect(brief).toContain("## Scope budget");
    expect(brief).toContain("- Expected files changed: 2-6");
    expect(brief).toContain("## Hard gates");
    expect(brief).toContain("## Stop conditions");
  });

  it("preflight writes the generated implementation brief", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const brief = readFileSync(join(repo, ".gleip", "brief.md"), "utf8");
    expect(brief).toContain("# Gleip Implementation Brief");
    expect(brief).toContain("## Working rule");
    expect(brief).toContain("## Before final response");
  });

  it("brief command prints the generated brief", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["brief"]);

    expect(output.join("\n")).toContain("# Gleip Implementation Brief");
    expect(output.join("\n")).toContain("## Before final response");
  });

  it("validate-plan loads active budget and prints status", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "src/features/users/UserTable.tsx", "export function UserTable() {}");
    writeRepoFile(repo, "src/features/users/UserTable.test.tsx", "describe('UserTable', () => {})");
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, [
      "validate-plan",
      [
        "Modify src/features/users/UserTable.tsx",
        "Add tests in src/features/users/UserTable.test.tsx"
      ].join("\n")
    ]);

    const validationOutput = output.join("\n");
    expect(validationOutput).toContain("Gleip Plan Validation");
    expect(validationOutput).toContain("Status: approved");
    expect(validationOutput).toContain("Proceed with implementation");
  });

  it("validate-plan --json returns valid JSON", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "src/features/users/UserTable.tsx", "export function UserTable() {}");
    writeRepoFile(repo, "src/features/users/UserTable.test.tsx", "describe('UserTable', () => {})");
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, [
      "validate-plan",
      "--json",
      [
        "Modify src/features/users/UserTable.tsx",
        "Add tests in src/features/users/UserTable.test.tsx"
      ].join("\n")
    ]);
    const json = JSON.parse(output.join("\n")) as {
      status: string;
      findings: unknown[];
      nextAction: string;
      parsedPlan: { proposedFiles: string[] };
    };

    expect(json.status).toBe("approved");
    expect(json.findings).toEqual([]);
    expect(json.nextAction).toContain("Proceed");
    expect(json.parsedPlan.proposedFiles).toContain("src/features/users/UserTable.tsx");
  });

  it("validate-plan --file works", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "src/features/users/UserTable.tsx", "export function UserTable() {}");
    writeRepoFile(repo, "src/features/users/UserTable.test.tsx", "describe('UserTable', () => {})");
    writeRepoFile(
      repo,
      "plan.md",
      [
        "- Modify src/features/users/UserTable.tsx",
        "- Add tests in src/features/users/UserTable.test.tsx"
      ].join("\n")
    );
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["validate-plan", "--file", "plan.md"]);

    expect(output.join("\n")).toContain("Status: approved");
  });

  it("validate-plan reports a missing plan file with an actionable message", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["validate-plan", "--file", "missing-plan.md"]);

    expect(output.join("\n")).toContain("Plan file not found: missing-plan.md.");
  });

  it("status command prints drift result", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["status"], {
      collectWorkingTreeDiff: () => ({
        changedFiles: ["package.json"],
        fileStats: [{ path: "package.json", added: 1, deleted: 0 }],
        rawDiff: "",
        totalLinesAdded: 1,
        totalLinesDeleted: 0,
        isGitRepo: true,
        hasChanges: true
      }),
      detectScopeDrift: () => ({
        status: "approval_required",
        findings: [
          {
            severity: "approval_required",
            title: "Dependency files changed",
            message: "package.json changed, but dependency changes are not allowed.",
            recommendation: "Stop and ask for approval before changing dependency files.",
            category: "dependencies"
          }
        ],
        metrics: {
          filesChanged: 1,
          linesAdded: 1,
          linesDeleted: 0
        },
        summary: "1 changed file includes approval-required scope."
      })
    });

    const statusOutput = output.join("\n");
    expect(statusOutput).toContain("Status: approval_required");
    expect(statusOutput).toContain("Session changes: 1 files, +1/-0");
    expect(statusOutput).toContain("[APPROVAL REQUIRED]");
    expect(statusOutput).toContain("Dependency files changed");
    expect(statusOutput).toContain(
      "Stop and ask for approval before continuing, or revise the implementation to stay within budget."
    );
  });

  it("status command writes drift result to .gleip/status.md", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    await runCommand(repo, ["status"], {
      collectWorkingTreeDiff: () => ({
        changedFiles: ["src/features/users/UserTable.test.tsx"],
        fileStats: [{ path: "src/features/users/UserTable.test.tsx", added: 1, deleted: 0 }],
        rawDiff: "+it.skip('exports csv', () => {})\n",
        totalLinesAdded: 1,
        totalLinesDeleted: 0,
        isGitRepo: true,
        hasChanges: true
      }),
      detectScopeDrift: () => ({
        status: "blocked",
        findings: [
          {
            severity: "blocked",
            title: "Skipped test added",
            message: "The diff adds a skipped or pending test.",
            recommendation: "Remove the skipped test or ask for explicit approval.",
            category: "tests"
          }
        ],
        metrics: {
          filesChanged: 1,
          linesAdded: 1,
          linesDeleted: 0
        },
        summary: "1 changed file includes blocked changes."
      })
    });

    const status = readFileSync(join(repo, ".gleip", "status.md"), "utf8");
    expect(status).toContain("- Status: blocked");
    expect(status).toContain("### Blocked");
    expect(status).toContain("Skipped test added");
  });

  it("status prints grouped report when multiple findings exist", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["status"], {
      detectScopeDrift: () => ({
        status: "blocked",
        findings: [
          {
            severity: "warning",
            title: "Files outside allowed scope",
            message: "4 files changed outside the approved scope. Examples: src/a.ts, src/b.ts, src/c.ts.",
            recommendation: "Confirm this is required or reduce the change.",
            category: "allowed_scope"
          },
          {
            severity: "blocked",
            title: "Skipped test added",
            message: "The diff adds a skipped or pending test.",
            recommendation: "Remove the skipped test.",
            category: "tests"
          },
          {
            severity: "approval_required",
            title: "Dependency files changed",
            message: "2 dependency files changed. Examples: package.json, pnpm-lock.yaml.",
            recommendation: "Stop and ask for approval.",
            category: "dependencies"
          }
        ],
        metrics: {
          filesChanged: 6,
          linesAdded: 20,
          linesDeleted: 1
        },
        summary: "6 changed files include blocked changes."
      })
    });

    const statusOutput = output.join("\n");
    expect(statusOutput.indexOf("[BLOCKED]")).toBeLessThan(statusOutput.indexOf("[APPROVAL REQUIRED]"));
    expect(statusOutput.indexOf("[APPROVAL REQUIRED]")).toBeLessThan(statusOutput.indexOf("[WARNING]"));
    expect(statusOutput).toContain("4 files changed outside the approved scope");
  });

  it("check command prints drift result without writing status.md", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);
    const originalStatus = readFileSync(join(repo, ".gleip", "status.md"), "utf8");

    const output = await runCommand(repo, ["check"], {
      collectWorkingTreeDiff: () => ({
        changedFiles: ["src/other.ts"],
        fileStats: [{ path: "src/other.ts", added: 1, deleted: 0 }],
        rawDiff: "",
        totalLinesAdded: 1,
        totalLinesDeleted: 0,
        isGitRepo: true,
        hasChanges: true
      }),
      detectScopeDrift: () => ({
        status: "warning",
        findings: [
          {
            severity: "warning",
            title: "Files outside allowed scope",
            message: "1 file changed outside the allowed paths: src/other.ts.",
            recommendation: "Confirm this file is necessary for the task.",
            category: "allowed_scope"
          }
        ],
        metrics: {
          filesChanged: 1,
          linesAdded: 1,
          linesDeleted: 0
        },
        summary: "1 changed file needs review against soft scope limits."
      })
    });

    expect(output.join("\n")).toContain("Status: warning");
    expect(readFileSync(join(repo, ".gleip", "status.md"), "utf8")).toBe(originalStatus);
  });

  it("check still runs when disabled and prints a concise note", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);
    await runCommand(repo, ["disable", "--reason", "manual"]);

    const output = await runCommand(repo, ["check"]);

    expect(output.join("\n")).toContain("Gleip Status");
    expect(output.join("\n")).toContain("Gleip is currently disabled");
    expect(output.join("\n")).toContain("Check can still be run manually.");
  });

  it("check uses baseline when active session exists", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [{ path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }],
          totalLinesAdded: 1
        })
    });

    const output = await runCommand(repo, ["check"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [{ path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }],
          totalLinesAdded: 1
        }),
      detectScopeDrift: ({ gitDiffContext }) => ({
        status: "within_scope",
        findings: [],
        metrics: {
          filesChanged: gitDiffContext.changedFiles.length,
          linesAdded: gitDiffContext.totalLinesAdded,
          linesDeleted: gitDiffContext.totalLinesDeleted
        },
        summary: "No session changes detected."
      })
    });

    expect(output.join("\n")).toContain("Pre-existing changes ignored: 1 files.");
  });

  it("check --include-baseline analyzes the full working tree", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [{ path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }],
          totalLinesAdded: 1
        })
    });

    const output = await runCommand(repo, ["check", "--include-baseline"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [{ path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }],
          totalLinesAdded: 1
        }),
      detectScopeDrift: ({ gitDiffContext }) => ({
        status: "within_scope",
        findings: [],
        metrics: {
          filesChanged: gitDiffContext.changedFiles.length,
          linesAdded: gitDiffContext.totalLinesAdded,
          linesDeleted: gitDiffContext.totalLinesDeleted
        },
        summary: "Full working tree analyzed."
      })
    });

    expect(output.join("\n")).toContain("- Session changes: 1 files, +1/-0");
    expect(output.join("\n")).toContain("- Pre-existing changes ignored: 0 files");
  });

  it("status --include-baseline analyzes the full working tree", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [{ path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }],
          totalLinesAdded: 1
        })
    });

    const output = await runCommand(repo, ["status", "--include-baseline"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [{ path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }],
          totalLinesAdded: 1
        }),
      detectScopeDrift: ({ gitDiffContext }) => ({
        status: "within_scope",
        findings: [],
        metrics: {
          filesChanged: gitDiffContext.changedFiles.length,
          linesAdded: gitDiffContext.totalLinesAdded,
          linesDeleted: gitDiffContext.totalLinesDeleted
        },
        summary: "Full working tree analyzed."
      })
    });

    expect(output.join("\n")).toContain("- Session changes: 1 files, +1/-0");
  });

  it("status --json returns valid JSON", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["status", "--json"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["src/other.ts"],
          fileStats: [{ path: "src/other.ts", added: 2, deleted: 0, diffFingerprint: "other" }],
          totalLinesAdded: 2
        }),
      detectScopeDrift: () => ({
        status: "warning",
        findings: [
          {
            severity: "warning",
            title: "Files outside allowed scope",
            message: "1 file changed outside the approved scope.",
            category: "allowed_scope"
          }
        ],
        metrics: {
          filesChanged: 1,
          linesAdded: 2,
          linesDeleted: 0
        },
        summary: "1 changed file needs review."
      })
    });

    const json = JSON.parse(output.join("\n")) as {
      baseline: { hasBaseline: boolean; preExistingFilesIgnored: number; sessionFilesChanged: number };
      findings: Array<{ severity: string; title: string }>;
      metrics: { filesChanged: number };
      nextAction: string;
      status: string;
    };
    expect(json.status).toBe("warning");
    expect(json.metrics.filesChanged).toBe(1);
    expect(json.baseline).toMatchObject({
      hasBaseline: true,
      preExistingFilesIgnored: 0,
      sessionFilesChanged: 1
    });
    expect(json.findings[0]).toMatchObject({
      severity: "warning",
      title: "Files outside allowed scope"
    });
    expect(json.nextAction).toContain("Review warnings");
  });

  it("check --json returns valid JSON", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["check", "--json"], {
      detectScopeDrift: () => ({
        status: "within_scope",
        findings: [],
        metrics: {
          filesChanged: 1,
          linesAdded: 2,
          linesDeleted: 0
        },
        summary: "1 changed file is within scope."
      })
    });

    const json = JSON.parse(output.join("\n")) as {
      baseline: { hasBaseline: boolean; sessionFilesChanged: number };
      findings: unknown[];
      metrics: { linesAdded: number };
      nextAction: string;
      status: string;
    };
    expect(json.status).toBe("within_scope");
    expect(json.baseline.hasBaseline).toBe(true);
    expect(json.baseline.sessionFilesChanged).toBe(0);
    expect(json.metrics.linesAdded).toBe(2);
    expect(json.findings).toEqual([]);
    expect(json.nextAction).toBe("Continue. Run relevant tests before final response.");
  });

  it("stop archives the active session in the target cwd", async () => {
    const processCwd = createTempRepo();
    const targetCwd = createTempRepo();
    await runCommand(processCwd, ["--cwd", targetCwd, "preflight", "close session"]);

    await runCommand(processCwd, ["--cwd", targetCwd, "stop"]);

    expect(existsSync(join(targetCwd, ".gleip", "session.json"))).toBe(false);
    expect(existsSync(join(targetCwd, ".gleip", "session-2026-05-30T00-00-00-000Z.json"))).toBe(
      true
    );
    expect(existsSync(join(processCwd, ".gleip"))).toBe(false);
  });
});

function createTempRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "gleip-cli-"));
  tempRepos.push(repo);
  return repo;
}

function writeRepoFile(repo: string, path: string, content: string): void {
  const filePath = join(repo, path);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function readState(repo: string): {
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
  reason: string | null;
} {
  return JSON.parse(readFileSync(join(repo, ".gleip", "state.json"), "utf8")) as {
    enabled: boolean;
    updatedAt: string;
    updatedBy: string;
    reason: string | null;
  };
}

type CommandOptions = Parameters<typeof createGleipCommand>[0];

interface TestDiffContext {
  changedFiles: string[];
  fileStats: Array<{
    path: string;
    added: number;
    deleted: number;
    isDeleted?: boolean;
    isUntracked?: boolean;
    diffFingerprint?: string;
  }>;
  rawDiff: string;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  isGitRepo: boolean;
  hasChanges: boolean;
  error?: string;
}

function diffContext(overrides: Partial<TestDiffContext> = {}): TestDiffContext {
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

async function runCommand(cwd: string, args: string[], options: CommandOptions = {}): Promise<string[]> {
  const output: string[] = [];
  const program = createGleipCommand({
    collectWorkingTreeDiff: () => diffContext(),
    cwd,
    detectScopeDrift: () => ({
      status: "within_scope",
      findings: [],
      metrics: {
        filesChanged: 0,
        linesAdded: 0,
        linesDeleted: 0
      },
      summary: "No working tree changes detected."
    }),
    loadConfig: () => ({
      mode: "advisory",
      limits: {
        max_files_changed_warning: 12,
        max_lines_added_warning: 500,
        max_lines_deleted_warning: 250
      }
    }),
    now: () => new Date("2026-05-30T00:00:00.000Z"),
    stdout: (message) => output.push(message),
    stderr: (message) => output.push(message),
    ...options
  });

  program.exitOverride();
  await program.parseAsync(["node", "gleip", ...args], { from: "node" });
  return output;
}

async function runHelpCommand(args: string[]): Promise<string[]> {
  const output: string[] = [];
  const program = createGleipCommand({ cwd: createTempRepo() });

  program.configureOutput({
    writeOut: (message) => output.push(message.trimEnd()),
    writeErr: (message) => output.push(message.trimEnd())
  });
  program.exitOverride();
  for (const command of program.commands) {
    command.exitOverride();
  }

  try {
    await program.parseAsync(["node", "gleip", ...args], { from: "node" });
  } catch (error) {
    if ((error as { code?: string }).code !== "commander.helpDisplayed") {
      throw error;
    }
  }

  return output;
}

function countOccurrences(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}
