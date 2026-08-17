import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
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
      "approve",
      "brief",
      "check",
      "compress",
      "disable",
      "doctor",
      "enable",
      "finalize",
      "init",
      "migrate",
      "preflight",
      "recover",
      "repair-agents",
      "replay",
      "report",
      "retrieve",
      "revoke-approval",
      "run",
      "start",
      "state",
      "stats",
      "status",
      "stop",
      "uninstall",
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
      "report",
      "check",
      "compress",
      "retrieve",
      "run",
      "stats",
      "doctor",
      "stop",
      "enable",
      "disable",
      "state",
      "repair-agents",
      "uninstall"
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

  it("--version prints the package version", async () => {
    const output = (await runHelpCommand(["--version"])).join("\n");

    expect(output).toBe("1.2.0");
  });

  it("command help shows important flags and stdin support", async () => {
    const validatePlanHelp = (await runHelpCommand(["validate-plan", "--help"])).join("\n");
    const statusHelp = (await runHelpCommand(["status", "--help"])).join("\n");
    const reportHelp = (await runHelpCommand(["report", "--help"])).join("\n");
    const checkHelp = (await runHelpCommand(["check", "--help"])).join("\n");
    const initHelp = (await runHelpCommand(["init", "--help"])).join("\n");
    const doctorHelp = (await runHelpCommand(["doctor", "--help"])).join("\n");
    const repairHelp = (await runHelpCommand(["repair-agents", "--help"])).join("\n");
    const uninstallHelp = (await runHelpCommand(["uninstall", "--help"])).join("\n");

    expect(validatePlanHelp).toContain("--file <path>");
    expect(validatePlanHelp).toContain("--json");
    expect(validatePlanHelp).toContain("stdin");
    expect(statusHelp).toContain("--include-baseline");
    expect(statusHelp).toContain("--compact");
    expect(statusHelp).toContain("--json");
    expect(reportHelp).toContain("--json");
    expect(checkHelp).toContain("--include-baseline");
    expect(checkHelp).toContain("--ci");
    expect(checkHelp).toContain("--incremental");
    expect(checkHelp).toContain("--force");
    expect(checkHelp).toContain("--json");
    expect(initHelp).toContain("--agent <name>");
    expect(initHelp).toContain("--all-agents");
    expect(doctorHelp).toContain("--agents");
    expect(doctorHelp).toContain("--fix");
    expect(repairHelp).toContain("--all");
    expect(uninstallHelp).toContain("cleanup");
    expect(uninstallHelp).toContain("--dry-run");
    expect(uninstallHelp).toContain("--keep-agent-files");
    expect(uninstallHelp).toContain("--force");
    expect(uninstallHelp).toContain("npm uninstall gleip");

    const compressHelp = (await runHelpCommand(["compress", "--help"])).join("\n");
    const runHelp = (await runHelpCommand(["run", "--help"])).join("\n");
    const retrieveHelp = (await runHelpCommand(["retrieve", "--help"])).join("\n");
    const statsHelp = (await runHelpCommand(["stats", "--help"])).join("\n");

    expect(compressHelp).toContain("--audit");
    expect(compressHelp).toContain("--type <class>");
    expect(runHelp).toContain("Use `--` before commands with flags.");
    expect(retrieveHelp).toContain("<reference>");
    expect(statsHelp).toContain("--json");
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
    expect(packageJson.version).toBe("1.2.0");
    expect(packageJson.dependencies).toEqual({
      commander: "^12.0.0",
      yaml: "^2.0.0",
      zod: "^3.0.0"
    });
    expect(packageJson).not.toHaveProperty("bundledDependencies");
    expect(packageJson.keywords).toContain("agent-guardrails");
    for (const keyword of [
      "ai-agent",
      "coding-agent",
      "agentic-coding",
      "code-quality",
      "static-analysis",
      "repo-guardrails",
      "llm-tools",
      "vibe-coding"
    ]) {
      expect(packageJson.keywords).toContain(keyword);
    }
    expect(new Set(packageJson.keywords).size).toBe(packageJson.keywords.length);
  });

  it("root npm package exposes the built CLI executable", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      bin: { gleip: string };
      dependencies: Record<string, string>;
      files: string[];
      main: string;
      types: string;
    };

    expect(packageJson.bin.gleip).toBe("./packages/cli/dist/index.js");
    expect(packageJson.main).toBe("./packages/cli/dist/index.js");
    expect(packageJson.types).toBe("./packages/cli/dist/index.d.ts");
    expect(packageJson.files).toContain("packages/cli/dist");
    expect(packageJson.files).toContain("packages/cli/package.json");
    expect(packageJson.files).toContain("docs");
    expect(packageJson.dependencies).toEqual({
      commander: "^12.0.0",
      yaml: "^2.0.0",
      zod: "^3.0.0"
    });
  });

  it("release metadata uses version 1.2.0 across packages", () => {
    const packagePaths = [
      "package.json",
      "packages/cli/package.json",
      "packages/config/package.json",
      "packages/core/package.json",
      "packages/controller/package.json",
      "packages/planner/package.json",
      "packages/adapters/package.json",
      "packages/github-action/package.json"
    ];

    for (const packagePath of packagePaths) {
      const packageJson = JSON.parse(readFileSync(join(repoRoot, packagePath), "utf8")) as {
        version: string;
      };
      expect(packageJson.version).toBe("1.2.0");
    }

    const cliPackageJson = readFileSync(join(repoRoot, "packages", "cli", "package.json"), "utf8");

    expect(cliPackageJson).not.toContain("workspace:");
    expect(cliPackageJson).not.toContain("bundledDependencies");
  });

  it("README files position passive exact-state evidence as the primary workflow", () => {
    for (const readmePath of ["README.md", "packages/cli/README.md"]) {
      const readme = readFileSync(join(repoRoot, readmePath), "utf8");

      expect(readme).toContain("Passive-first local evidence");
      expect(readme).toContain("Codex / generic agents");
      expect(readme).toContain("Claude Code");
      expect(readme).toContain("Gemini CLI");
      expect(readme).toContain("npx --no-install gleip");
      expect(readme).toContain("## Quick Start");
      expect(readme).toContain("npm i -D gleip");
      expect(readme).toContain("npx gleip --version");
      expect(readme).toContain("pnpm exec gleip --version");
      expect(readme).toContain("./node_modules/.bin/gleip --version");
      expect(readme).toContain(".\\node_modules\\.bin\\gleip --version");
      expect(readme).toContain("`npm gleip --version` prints npm's version");
      expect(readme).toContain("## How Agents Should Use Gleip");
      expect(readme).toContain("npx --no-install gleip check");
      expect(readme).toContain("npx --no-install gleip finalize");
      expect(readme).toContain("## Commands for Developers");
      expect(readme).toContain("## Commands Used by Agents");
      expect(readme).toContain("## Reports and Metrics");
      expect(readme).toContain("## What Gets Committed?");
      expect(readme).toContain("not exact model billing");
      expect(readme).not.toContain("CSV export");
      expect(readme).not.toContain("Add CSV");
    }
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

  it("--cwd works with new init options", async () => {
    const processCwd = createTempRepo();
    const targetCwd = createTempRepo();

    await runCommand(processCwd, ["--cwd", targetCwd, "init", "claude"]);
    await runCommand(processCwd, ["--cwd", targetCwd, "repair-agents", "--all"]);
    const doctorOutput = await runCommand(processCwd, ["--cwd", targetCwd, "doctor", "--agents"]);

    expect(existsSync(join(targetCwd, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(targetCwd, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(targetCwd, "GEMINI.md"))).toBe(true);
    expect(doctorOutput.join("\n")).toContain("AGENTS.md: present; Gleip workflow: yes");
    expect(existsSync(join(processCwd, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(processCwd, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(processCwd, "GEMINI.md"))).toBe(false);
  });

  it("init creates the repo Gleip files", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init"]);

    expect(existsSync(join(repo, ".gleip.yml"))).toBe(true);
    expect(existsSync(join(repo, "GLEIP.md"))).toBe(true);
    expect(existsSync(join(repo, ".gleip"))).toBe(true);
    expect(existsSync(join(repo, ".gleip", "state.json"))).toBe(true);
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(true);
    expect(readFileSync(join(repo, ".gitignore"), "utf8")).toBe(
      "# Gleip local artifacts\n.gleip/\n# End Gleip local artifacts\n"
    );
    expect(readFileSync(join(repo, "GLEIP.md"), "utf8")).toContain("local-only");
    expect(readFileSync(join(repo, "GLEIP.md"), "utf8")).toContain("no external review");
  });

  it("init appends the Gleip block without changing unrelated .gitignore entries", async () => {
    const repo = createTempRepo();
    writeFileSync(join(repo, ".gitignore"), "node_modules/\ndist/\n");

    await runCommand(repo, ["init"]);

    expect(readFileSync(join(repo, ".gitignore"), "utf8")).toBe(
      [
        "node_modules/",
        "dist/",
        "",
        "# Gleip local artifacts",
        ".gleip/",
        "# End Gleip local artifacts",
        ""
      ].join("\n")
    );
  });

  it("running init twice does not duplicate the Gleip .gitignore block", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init"]);
    await runCommand(repo, ["init"]);

    const gitignore = readFileSync(join(repo, ".gitignore"), "utf8");
    expect(countOccurrences(gitignore, "# Gleip local artifacts")).toBe(1);
    expect(countOccurrences(gitignore, "# End Gleip local artifacts")).toBe(1);
    expect(countOccurrences(gitignore, ".gleip/")).toBe(1);
  });

  it("init preserves CRLF line endings in an existing .gitignore", async () => {
    const repo = createTempRepo();
    writeFileSync(join(repo, ".gitignore"), "node_modules/\r\ndist/\r\n");

    await runCommand(repo, ["init"]);

    const gitignore = readFileSync(join(repo, ".gitignore"), "utf8");
    expect(gitignore).toContain(
      "\r\n\r\n# Gleip local artifacts\r\n.gleip/\r\n# End Gleip local artifacts\r\n"
    );
    expect(gitignore.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("init ignores local artifacts without ignoring versioned Gleip files", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init"]);

    const gitignore = readFileSync(join(repo, ".gitignore"), "utf8");
    for (const localArtifact of [
      ".gleip/state.json",
      ".gleip/session.json",
      ".gleip/baseline.json",
      ".gleip/canonical-task.json",
      ".gleip/brief.md",
      ".gleip/scope-budget.json",
      ".gleip/status.md",
      ".gleip/report.json",
      ".gleip/report.md",
      ".gleip/session-2026-05-30T00-00-00-000Z.json"
    ]) {
      expect(localArtifact.startsWith(".gleip/")).toBe(true);
      expect(gitignore).toContain(".gleip/");
    }

    for (const versionedFile of [".gleip.yml", "GLEIP.md", "AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
      expect(gitignore).not.toContain(versionedFile);
    }
  });

  it("init protects runtime files before they can become tracked in a real git repo", async () => {
    const repo = createGitRepo();

    await runRealCommand(repo, ["init"]);

    expect(git(repo, ["ls-files", "--", ".gleip"])).toBe("");
    expect(gitSucceeds(repo, ["check-ignore", "--quiet", "--no-index", ".gleip/state.json"])).toBe(
      true
    );
  });

  it("real repeated init keeps one effective Gleip ignore block", async () => {
    const repo = createGitRepo();

    await runRealCommand(repo, ["init"]);
    await runRealCommand(repo, ["init"]);

    const gitignore = readFileSync(join(repo, ".gitignore"), "utf8");
    expect(countOccurrences(gitignore, "# Gleip local artifacts")).toBe(1);
    expect(countOccurrences(gitignore, "# End Gleip local artifacts")).toBe(1);
    expect(gitSucceeds(repo, ["check-ignore", "--quiet", "--no-index", ".gleip/state.json"])).toBe(
      true
    );
  });

  it("real init repairs a missing ignore rule after prior initialization", async () => {
    const repo = createGitRepo();

    await runRealCommand(repo, ["init"]);
    rmSync(join(repo, ".gitignore"), { force: true });
    await runRealCommand(repo, ["init"]);

    expect(readFileSync(join(repo, ".gitignore"), "utf8")).toContain(".gleip/");
    expect(gitSucceeds(repo, ["check-ignore", "--quiet", "--no-index", ".gleip/state.json"])).toBe(
      true
    );
  });

  it("real preflight repairs a missing ignore rule before writing runtime files", async () => {
    const repo = createGitRepo();

    await runRealCommand(repo, ["init"]);
    rmSync(join(repo, ".gitignore"), { force: true });
    await runRealCommand(repo, ["preflight", "Audit artifact lifecycle"]);

    expect(readFileSync(join(repo, ".gitignore"), "utf8")).toContain(".gleip/");
    expect(git(repo, ["ls-files", "--", ".gleip"])).toBe("");
    expect(
      gitSucceeds(repo, ["check-ignore", "--quiet", "--no-index", ".gleip/session.json"])
    ).toBe(true);
  });

  it("real report without prior init protects generated report files", async () => {
    const repo = createGitRepo();

    await runRealCommand(repo, ["report"]);

    expect(readFileSync(join(repo, ".gitignore"), "utf8")).toContain(".gleip/");
    expect(existsSync(join(repo, ".gleip", "report.json"))).toBe(true);
    expect(git(repo, ["ls-files", "--", ".gleip"])).toBe("");
    expect(gitSucceeds(repo, ["check-ignore", "--quiet", "--no-index", ".gleip/report.json"])).toBe(
      true
    );
  });

  it("real init reports already tracked Gleip runtime files without untracking them", async () => {
    const repo = createGitRepo();
    writeRepoFile(repo, ".gleip/session.json", "{}\n");
    git(repo, ["add", "-f", ".gleip/session.json"]);

    const result = await runRealCommandResult(repo, ["init"]);
    const ci = await runRealCommandResult(repo, ["check", "--ci"]);

    expect(result.exitCode).toBe(0);
    expect(result.output.join("\n")).toContain("Tracked Gleip runtime files detected");
    expect(git(repo, ["ls-files", "--", ".gleip/session.json"])).toBe(".gleip/session.json");
    expect(ci.exitCode).toBe(1);
    expect(ci.output.join("\n")).toContain("LOCAL_ARTIFACT_INCLUDED");
  });

  it("doctor --fix repairs ignore policy and untracks only recognized runtime files", async () => {
    const repo = createGitRepo();

    await runRealCommand(repo, ["init"]);
    git(repo, ["add", ".gitignore", ".gleip.yml", "GLEIP.md", "AGENTS.md"]);
    git(repo, ["commit", "-m", "init gleip"]);
    writeRepoFile(repo, ".gleip/session.json", "{}\n");
    writeRepoFile(repo, ".gleip/manual-note.txt", "manual\n");
    git(repo, ["add", "-f", ".gleip/session.json"]);
    const fix = await runRealCommandResult(repo, ["doctor", "--fix"]);

    expect(fix.exitCode).toBe(0);
    expect(fix.output.join("\n")).toContain("Removed from Git index: .gleip/session.json.");
    expect(existsSync(join(repo, ".gleip", "session.json"))).toBe(true);
    expect(existsSync(join(repo, ".gleip", "manual-note.txt"))).toBe(true);
    expect(git(repo, ["ls-files", "--", ".gleip"])).toBe("");

    const ci = await runRealCommandResult(repo, ["check", "--ci"]);
    expect(ci.exitCode).toBe(0);
    expect(ci.output.join("\n")).toContain("status: clean");
  });

  it("real report separates tracked runtime cleanup from task drift risk", async () => {
    const repo = createGitRepo();

    await runRealCommand(repo, ["init"]);
    git(repo, ["add", ".gitignore", ".gleip.yml", "GLEIP.md", "AGENTS.md"]);
    git(repo, ["commit", "-m", "init gleip"]);
    await runRealCommand(repo, ["preflight", "Audit artifact classification"]);
    git(repo, ["add", "-f", ".gleip/session.json"]);

    const ci = await runRealCommandResult(repo, ["check", "--ci"]);
    const output = await runRealCommand(repo, ["report", "--json"]);
    const report = JSON.parse(output.join("\n")) as {
      finalResponse: { markdown: string };
      risk: { drift: string; repositoryHygiene: string };
      scores: { scopeAdherence: number };
      warnings: Array<{ id: string; severity: string }>;
    };

    expect(ci.exitCode).toBe(1);
    expect(report.scores.scopeAdherence).toBe(100);
    expect(report.risk.drift).toBe("none");
    expect(report.risk.repositoryHygiene).toBe("high");
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        id: "LOCAL_ARTIFACT_INCLUDED",
        severity: "high"
      })
    );
    expect(report.finalResponse.markdown).toContain("Drift risk: None");
    expect(report.finalResponse.markdown).toContain("Repository hygiene: High");
    expect(report.finalResponse.markdown).toContain("LOCAL_ARTIFACT_INCLUDED");
  });

  it("doctor detects and fixes negated ignore rules that unignore .gleip", async () => {
    const repo = createGitRepo();

    await runRealCommand(repo, ["init"]);
    writeFileSync(
      join(repo, ".gitignore"),
      `${readFileSync(join(repo, ".gitignore"), "utf8")}!.gleip/\n!.gleip/**\n`
    );

    const doctor = await runRealCommand(repo, ["doctor"]);
    expect(doctor.join("\n")).toContain(
      "WARN Missing, incomplete, or overridden Gleip .gitignore block"
    );

    await runRealCommand(repo, ["doctor", "--fix"]);
    const gitignore = readFileSync(join(repo, ".gitignore"), "utf8");
    expect(countOccurrences(gitignore, "# Gleip local artifacts")).toBe(1);
    expect(gitSucceeds(repo, ["check-ignore", "--quiet", "--no-index", ".gleip/state.json"])).toBe(
      true
    );
  });

  it("init success output includes next normal flow", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["init"]);
    const initOutput = output.join("\n");

    expect(initOutput).toBe(
      ["Gleip initialized.", "Agent instructions created/updated: AGENTS.md."].join("\n")
    );
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
    expect(agents).toContain("local guidance");
    expect(agents).toContain("check `.gleip/state.json`");
    expect(agents).toContain('run `npx --no-install gleip preflight "<user task>"`');
    expect(agents).toContain("Read `.gleip/canonical-task.json` first");
    expect(agents).toContain("Read `.gleip/brief.md` as a derived navigation aid");
    expect(agents).toContain("npx --no-install gleip validate-plan");
    expect(agents).toContain("For broad or sensitive changes");
    expect(agents).toContain(
      "Before claiming completion, run `npx --no-install gleip check --incremental`"
    );
    expect(agents).toContain(
      "Run `npx --no-install gleip status --compact` whenever Gleip's expected next action is unclear"
    );
    expect(agents).toContain("Do not edit or commit files under `.gleip/`");
    expect(agents).toContain("Address cleanup and action-required findings");
    expect(agents).toContain("Keep changes minimal and scoped to the canonical task");
    expect(agents).toContain("needs_clarification");
    expect(agents).toContain("needs_approval");
    expect(agents).toContain("treat Gleip guidance as inactive");
    expect(agents).toContain("Gleip evidence is unavailable");
    // A read-only planning mode has to be told what it may run; without this the block instructs
    // an agent that cannot write to run two commands that write.
    expect(agents).toContain("In a read-only planning mode");
    expect(agents).toContain("gleip preflight --plan-mode");
    expect(agents).toContain("gleip validate-plan --plan-mode");
    expect(agents).toContain("are also safe to run without writing");
    expect(agents).toContain("re-run `preflight` and `validate-plan` without `--plan-mode`");
    expect(agents).not.toContain("Do you want me to continue without Gleip guidance");
    expect(agents).toContain(
      "Before the final response, run `npx --no-install gleip status --compact`"
    );
    expect(agents).toContain("Before the final response, run `npx --no-install gleip finalize`");
    expect(agents).toContain(
      "Report `advisory`, `needs_attention`, `needs_cleanup`, or `needs_approval`"
    );
    expect(agents).toContain("final evidence bundle");
    expect(agents).toContain("Gleip checklist for every coding task");
    expect(agents).toContain("approval-required");
    expect(agents).not.toContain("task blocked");
    expect(agents).toContain("<!-- GLEIP:END -->");
  });

  it("init creates AGENTS.md only", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["init"]);

    expect(output.join("\n")).toBe(
      ["Gleip initialized.", "Agent instructions created/updated: AGENTS.md."].join("\n")
    );
    assertOnlyInstructionFile(repo, "AGENTS.md");
    assertGleipWorkflowInstructions(readFileSync(join(repo, "AGENTS.md"), "utf8"));
  });

  it("init codex creates AGENTS.md only", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["init", "codex"]);

    expect(output.join("\n")).toBe(
      ["Gleip initialized.", "Agent instructions created/updated: AGENTS.md."].join("\n")
    );
    assertOnlyInstructionFile(repo, "AGENTS.md");
    expect(readFileSync(join(repo, "AGENTS.md"), "utf8")).toContain(
      "Codex-style and generic coding agents must run Gleip before editing code."
    );
  });

  it("init claude creates CLAUDE.md only", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["init", "claude"]);

    expect(output.join("\n")).toBe(
      ["Gleip initialized.", "Agent instructions created/updated: CLAUDE.md."].join("\n")
    );
    assertOnlyInstructionFile(repo, "CLAUDE.md");
    expect(readFileSync(join(repo, "CLAUDE.md"), "utf8")).toContain(
      "Claude Code must run Gleip before editing code."
    );
  });

  it("init gemini creates GEMINI.md only", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["init", "gemini"]);

    expect(output.join("\n")).toBe(
      ["Gleip initialized.", "Agent instructions created/updated: GEMINI.md."].join("\n")
    );
    assertOnlyInstructionFile(repo, "GEMINI.md");
    expect(readFileSync(join(repo, "GEMINI.md"), "utf8")).toContain(
      "Gemini CLI must run Gleip before editing code."
    );
  });

  it("init auto detects AGENTS.md", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "AGENTS.md", "# Existing agent file\n");

    const output = await runCommand(repo, ["init", "auto"]);

    expect(output.join("\n")).toBe(
      [
        "Gleip initialized.",
        "Detected agent target: generic.",
        "Agent instructions created/updated: AGENTS.md."
      ].join("\n")
    );
    assertGleipWorkflowInstructions(readFileSync(join(repo, "AGENTS.md"), "utf8"));
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(repo, "GEMINI.md"))).toBe(false);
  });

  it("init auto detects CLAUDE.md", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "CLAUDE.md", "# Existing Claude file\n");

    const output = await runCommand(repo, ["init", "auto"]);

    expect(output.join("\n")).toBe(
      [
        "Gleip initialized.",
        "Detected agent target: claude.",
        "Agent instructions created/updated: CLAUDE.md."
      ].join("\n")
    );
    assertGleipWorkflowInstructions(readFileSync(join(repo, "CLAUDE.md"), "utf8"));
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(repo, "GEMINI.md"))).toBe(false);
  });

  it("init auto detects GEMINI.md", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "GEMINI.md", "# Existing Gemini file\n");

    const output = await runCommand(repo, ["init", "auto"]);

    expect(output.join("\n")).toBe(
      [
        "Gleip initialized.",
        "Detected agent target: gemini.",
        "Agent instructions created/updated: GEMINI.md."
      ].join("\n")
    );
    assertGleipWorkflowInstructions(readFileSync(join(repo, "GEMINI.md"), "utf8"));
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(false);
  });

  it("init auto defaults to generic when no agent files exist", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["init", "auto"]);

    expect(output.join("\n")).toContain("Detected agent target: generic.");
    assertGleipWorkflowInstructions(readFileSync(join(repo, "AGENTS.md"), "utf8"));
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(repo, "GEMINI.md"))).toBe(false);
  });

  it("init auto falls back to AGENTS.md when detection is ambiguous", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "CLAUDE.md", "# Existing Claude file\n");
    writeRepoFile(repo, "GEMINI.md", "# Existing Gemini file\n");

    const output = await runCommand(repo, ["init", "auto"]);

    expect(output.join("\n")).toBe(
      [
        "Gleip initialized.",
        "Detected agent target: generic.",
        "Agent instructions created/updated: AGENTS.md."
      ].join("\n")
    );
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(true);
    expect(readFileSync(join(repo, "CLAUDE.md"), "utf8")).toBe("# Existing Claude file\n");
    expect(readFileSync(join(repo, "GEMINI.md"), "utf8")).toBe("# Existing Gemini file\n");
  });

  it("init --agent generic updates AGENTS.md", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init", "--agent", "generic"]);

    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    assertGleipWorkflowInstructions(agents);
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(repo, "GEMINI.md"))).toBe(false);
  });

  it("init --agent codex updates AGENTS.md", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init", "--agent", "codex"]);

    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    assertGleipWorkflowInstructions(agents);
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(repo, "GEMINI.md"))).toBe(false);
  });

  it("init --agent claude creates CLAUDE.md", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init", "--agent", "claude"]);

    const claude = readFileSync(join(repo, "CLAUDE.md"), "utf8");
    assertGleipWorkflowInstructions(claude);
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(repo, "GEMINI.md"))).toBe(false);
  });

  it("init --agent gemini creates GEMINI.md", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init", "--agent", "gemini"]);

    const gemini = readFileSync(join(repo, "GEMINI.md"), "utf8");
    assertGleipWorkflowInstructions(gemini);
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(false);
  });

  it("init --all-agents preserves the one-file init rule", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["init", "--all-agents"]);

    expect(output.join("\n")).toBe(
      ["Gleip initialized.", "Agent instructions created/updated: AGENTS.md."].join("\n")
    );
    assertOnlyInstructionFile(repo, "AGENTS.md");
    assertGleipWorkflowInstructions(readFileSync(join(repo, "AGENTS.md"), "utf8"));
    expect(existsSync(join(repo, ".gleip.yml"))).toBe(true);
    expect(existsSync(join(repo, "GLEIP.md"))).toBe(true);
    expect(readFileSync(join(repo, "GLEIP.md"), "utf8")).toContain(
      'npx --no-install gleip preflight "<task>"'
    );
    expect(existsSync(join(repo, ".gleip", "state.json"))).toBe(true);
  });

  it("separate init targets create all supported instruction files when needed", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init"]);
    await runCommand(repo, ["init", "claude"]);
    await runCommand(repo, ["init", "gemini"]);

    expect(existsSync(join(repo, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(repo, "GEMINI.md"))).toBe(true);
  });

  it("running init twice does not duplicate the Gleip-managed AGENTS section", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init"]);
    await runCommand(repo, ["init"]);

    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    expect(countOccurrences(agents, "<!-- GLEIP:START -->")).toBe(1);
    expect(countOccurrences(agents, "<!-- GLEIP:END -->")).toBe(1);
  });

  it("running each init target twice does not duplicate managed sections", async () => {
    const repo = createTempRepo();

    for (const target of ["codex", "claude", "gemini"]) {
      await runCommand(repo, ["init", target]);
      await runCommand(repo, ["init", target]);
    }

    for (const path of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
      const content = readFileSync(join(repo, path), "utf8");
      expect(countOccurrences(content, "<!-- GLEIP:START -->")).toBe(1);
      expect(countOccurrences(content, "<!-- GLEIP:END -->")).toBe(1);
    }
  });

  it("existing AGENTS.md content is preserved", async () => {
    const repo = createTempRepo();
    writeFileSync(join(repo, "AGENTS.md"), "# Agent Instructions\n\nKeep local rules.\n");

    await runCommand(repo, ["init"]);

    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    expect(agents).toContain("Keep local rules.");
    expect(agents).toContain("<!-- GLEIP:START -->");
  });

  it("existing managed AGENTS.md block is replaced without changing user content", async () => {
    const repo = createTempRepo();
    writeFileSync(
      join(repo, "AGENTS.md"),
      [
        "# Agent Instructions",
        "",
        "Keep local rules.",
        "",
        "<!-- GLEIP:START -->",
        "old managed block",
        "<!-- GLEIP:END -->",
        "",
        "Keep trailing rules.",
        ""
      ].join("\n")
    );

    await runCommand(repo, ["init"]);

    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    expect(agents).toContain("Keep local rules.");
    expect(agents).toContain("Keep trailing rules.");
    expect(agents).not.toContain("old managed block");
    expect(countOccurrences(agents, "<!-- GLEIP:START -->")).toBe(1);
    expect(agents).toContain("## Gleip working standard");
  });

  it("generated target files include the working principles but not long examples", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["init"]);
    await runCommand(repo, ["init", "claude"]);
    await runCommand(repo, ["init", "gemini"]);

    for (const path of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
      const content = readFileSync(join(repo, path), "utf8");
      for (const principle of [
        "Think before coding",
        "Simplicity first",
        "Surgical changes",
        "Goal-driven execution"
      ]) {
        expect(content).toContain(principle);
      }
      expect(content).not.toContain("Anti-pattern:");
      expect(content).not.toContain("over-abstraction");
      expect(content).not.toContain("speculative caching");
    }
  });

  it("agent standard docs exist", () => {
    expect(existsSync(join(repoRoot, "docs", "agent-standard.md"))).toBe(true);
    expect(existsSync(join(repoRoot, "docs", "agent-standard-examples.md"))).toBe(true);
  });

  it("doctor warns when legacy Argus files are present", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, ".argus.yml", "version: 1\n");
    writeRepoFile(repo, "AGENTS.md", "<!-- ARGUS:START -->\nlegacy\n<!-- ARGUS:END -->\n");

    const output = await runCommand(repo, ["doctor"]);

    expect(output.join("\n")).toContain("Legacy Argus files detected");
    expect(output.join("\n")).toContain("renamed to Gleip");
    expect(output.join("\n")).toContain("Re-run `npx gleip init`");
  });

  it("doctor reports incomplete repository setup with an actionable init command", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["doctor"]);
    const report = output.join("\n");

    expect(report).toContain("Setup:");
    expect(report).toContain("WARN Missing .gleip/state.json");
    expect(report).toContain("WARN Missing .gleip.yml or GLEIP.md");
    expect(report).toContain("WARN Missing Gleip-managed agent instructions");
    expect(report).toContain("WARN Missing, incomplete, or overridden Gleip .gitignore block");
    expect(report).toContain("OK   CLI version resolved (1.2.0)");
    expect(report).toContain("OK   Built-in init assets available");
    expect(report).toContain("Run: npx gleip init");
  });

  it("doctor reports complete setup after init", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["init"]);

    const output = await runCommand(repo, ["doctor"]);
    const report = output.join("\n");

    expect(report).toContain("OK   Gleip init state present");
    expect(report).toContain("OK   Versioned config and policy files present");
    expect(report).toContain("OK   Agent instructions present");
    expect(report).toContain("OK   Local artifacts ignored");
    expect(report).not.toContain("WARN Missing");
  });

  it("doctor detects an incomplete Gleip .gitignore block", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["init"]);
    writeFileSync(
      join(repo, ".gitignore"),
      "# Gleip local artifacts\n# End Gleip local artifacts\n"
    );

    const output = await runCommand(repo, ["doctor"]);

    expect(output.join("\n")).toContain(
      "WARN Missing, incomplete, or overridden Gleip .gitignore block"
    );
    expect(output.join("\n")).toContain("Run: npx gleip init");
  });

  it("doctor detects stale managed agent instructions", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["init"]);
    writeFileSync(
      join(repo, "AGENTS.md"),
      "<!-- GLEIP:START -->\ngleip preflight\ngleip validate-plan\ngleip status\n<!-- GLEIP:END -->\n"
    );

    const output = await runCommand(repo, ["doctor"]);

    expect(output.join("\n")).toContain("WARN Missing Gleip-managed agent instructions");
  });

  it("doctor --agents reports missing files", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["doctor", "--agents"]);
    const report = output.join("\n");

    expect(report).toContain("AGENTS.md: missing; Gleip workflow: no");
    expect(report).toContain("CLAUDE.md: missing; Gleip workflow: no");
    expect(report).toContain("GEMINI.md: missing; Gleip workflow: no");
    expect(report).toContain("npx gleip init");
    expect(report).toContain("npx gleip init <name>");
  });

  it("doctor --agents explains no agent files is valid", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["doctor", "--agents"]);

    expect(output.join("\n")).toContain(
      "No supported agent files exist yet. This is valid; `npx gleip init` prepares generic AGENTS.md."
    );
  });

  it("doctor --agents reports present Gleip workflow files", async () => {
    const repo = createTempRepo();
    await initAllTargets(repo);

    const output = await runCommand(repo, ["doctor", "--agents"]);
    const report = output.join("\n");

    expect(report).toContain("AGENTS.md: present; Gleip workflow: yes");
    expect(report).toContain("CLAUDE.md: present; Gleip workflow: yes");
    expect(report).toContain("GEMINI.md: present; Gleip workflow: yes");
  });

  it("repair-agents repairs existing files", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "AGENTS.md", "# Existing instructions\n\nKeep this.\n");
    writeRepoFile(repo, "CLAUDE.md", "# Claude\n");

    const output = await runCommand(repo, ["repair-agents"]);

    expect(output.join("\n")).toContain("Agent instructions repaired: AGENTS.md, CLAUDE.md.");
    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    expect(agents).toContain("Keep this.");
    assertGleipWorkflowInstructions(agents);
    assertGleipWorkflowInstructions(readFileSync(join(repo, "CLAUDE.md"), "utf8"));
    expect(existsSync(join(repo, "GEMINI.md"))).toBe(false);
  });

  it("repair-agents --all creates all supported files", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["repair-agents", "--all"]);

    expect(output.join("\n")).toContain(
      "Agent instructions repaired: AGENTS.md, CLAUDE.md, GEMINI.md."
    );
    assertGleipWorkflowInstructions(readFileSync(join(repo, "AGENTS.md"), "utf8"));
    assertGleipWorkflowInstructions(readFileSync(join(repo, "CLAUDE.md"), "utf8"));
    assertGleipWorkflowInstructions(readFileSync(join(repo, "GEMINI.md"), "utf8"));
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
    expect(output.join("\n")).toContain(
      "Passive guidance will remain inactive until explicitly enabled"
    );
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

    expect(output.join("\n")).toContain("Run `npx gleip init` first.");
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
    expect(existsSync(join(targetCwd, ".gleip", "canonical-task.json"))).toBe(true);
    expect(existsSync(join(targetCwd, ".gleip", "brief.md"))).toBe(true);
    expect(existsSync(join(targetCwd, ".gleip", "scope-budget.json"))).toBe(true);
    expect(existsSync(join(targetCwd, ".gleip", "status.md"))).toBe(true);
    expect(existsSync(join(processCwd, ".gleip"))).toBe(false);
    expect(readFileSync(join(targetCwd, ".gleip", "canonical-task.json"), "utf8")).toContain(
      "add a parser"
    );
  });

  it("preflight reads and persists the full task from --file", async () => {
    const repo = createTempRepo();
    const taskText = [
      "# Full task contract",
      "",
      "Modify only src/foo.ts.",
      "Run existing tests after the change."
    ].join("\n");
    writeRepoFile(repo, "FULL_TASK.md", taskText);
    writeRepoFile(repo, "src/foo.ts", "export const foo = true;");

    await runCommand(repo, ["preflight", "--file", "FULL_TASK.md"]);

    const session = JSON.parse(readFileSync(join(repo, ".gleip", "session.json"), "utf8")) as {
      task: string;
      taskFile: string;
      repoContext: {
        contextFiles: string[];
        likelyRelevantFiles: Array<{ path: string }>;
      };
    };
    const budget = JSON.parse(readFileSync(join(repo, ".gleip", "scope-budget.json"), "utf8")) as {
      allowedPaths: string[];
      expectedFilesChanged: { min: number; max: number };
    };

    expect(session.task).toBe(taskText);
    expect(session.taskFile).toBe("FULL_TASK.md");
    expect(session.repoContext.contextFiles).toContain("FULL_TASK.md");
    expect(session.repoContext.likelyRelevantFiles.map((file) => file.path)).not.toContain(
      "FULL_TASK.md"
    );
    expect(budget.allowedPaths).toEqual(["src/foo.ts"]);
    expect(budget.expectedFilesChanged).toEqual({ min: 1, max: 1 });
    const canonicalTask = JSON.parse(
      readFileSync(join(repo, ".gleip", "canonical-task.json"), "utf8")
    ) as {
      authority: string;
      byteCount: number;
      characterCount: number;
      contentHash: string;
      effectiveContent?: string;
      requirementLedger: { requirements: Array<{ sourceText?: string }> };
      revisions: Array<{ content: string; source: string }>;
    };
    const brief = readFileSync(join(repo, ".gleip", "brief.md"), "utf8");

    expect(canonicalTask.authority).toBe("canonical");
    // The agent is told to read this file first, so it must not store the task text twice.
    // `effectiveContent` is the revisions concatenated and is reconstructed on read.
    expect(canonicalTask.effectiveContent).toBeUndefined();
    expect(canonicalTask.revisions).toHaveLength(1);
    expect(canonicalTask.revisions[0]).toMatchObject({ content: taskText, source: "file" });
    expect(canonicalTask.byteCount).toBe(Buffer.byteLength(taskText, "utf8"));
    expect(canonicalTask.characterCount).toBe(Array.from(taskText).length);
    expect(canonicalTask.contentHash).toBe(
      `sha256:${createHash("sha256").update(taskText, "utf8").digest("hex")}`
    );
    expect(canonicalTask.requirementLedger.requirements.length).toBeGreaterThan(0);
    expect(brief).toContain("This brief is derived from the canonical user task.");
    expect(brief).not.toContain(taskText);
  });

  it("preflight --amend preserves ordered canonical task revisions without resetting baseline", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["preflight", "Must update src/runtime.ts."], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [{ path: "README.md", added: 1, deleted: 0 }],
          totalLinesAdded: 1
        })
    });
    const baselineBefore = readFileSync(join(repo, ".gleip", "baseline.json"), "utf8");

    const output = await runCommand(repo, [
      "preflight",
      "--amend",
      "Must preserve Windows compatibility."
    ]);
    const canonicalTask = JSON.parse(
      readFileSync(join(repo, ".gleip", "canonical-task.json"), "utf8")
    ) as {
      effectiveContent?: string;
      revisions: Array<{
        revisionId: string;
        content: string;
        previousRevisionId?: string;
        source: string;
      }>;
      requirementLedger: {
        requirements: Array<{
          sourceText?: string;
          canonicalRevisionId: string;
          sourceStart: number;
          sourceEnd: number;
        }>;
      };
    };

    expect(output.join("\n")).toContain("Gleip task amendment recorded");
    expect(canonicalTask.revisions).toHaveLength(2);
    expect(canonicalTask.revisions[0]?.content).toBe("Must update src/runtime.ts.");
    expect(canonicalTask.revisions[1]).toMatchObject({
      content: "Must preserve Windows compatibility.",
      source: "amendment"
    });
    expect(canonicalTask.revisions[1]?.previousRevisionId).toBeDefined();

    // The compact form stores neither the concatenated task text nor each requirement's text --
    // the revisions hold the content and the offsets locate it. Reconstructing here proves the
    // round-trip is exact rather than assuming it.
    expect(canonicalTask.effectiveContent).toBeUndefined();
    const contentByRevision = new Map(
      canonicalTask.revisions.map((revision) => [revision.revisionId, revision.content])
    );
    // Omitted fields default as the reader defines them: canonicalRevisionId defaults to the
    // latest revision, which is the common case and so is never written.
    const latestRevisionId = canonicalTask.revisions.at(-1)?.revisionId ?? "";
    const reconstructed = canonicalTask.requirementLedger.requirements.map(
      (item) =>
        item.sourceText ??
        (contentByRevision.get(item.canonicalRevisionId ?? latestRevisionId) ?? "")
          .slice(item.sourceStart, item.sourceEnd)
          .replace(/\s+/gu, " ")
          .trim()
    );

    expect(reconstructed).toEqual(
      expect.arrayContaining([
        "Must update src/runtime.ts.",
        "Must preserve Windows compatibility."
      ])
    );
    expect(readFileSync(join(repo, ".gleip", "baseline.json"), "utf8")).toBe(baselineBefore);
  });

  it("preflight rejects inline task text combined with --file", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "task.md", "Modify src/foo.ts");

    const result = await runCommandResult(repo, [
      "preflight",
      "Modify src/foo.ts",
      "--file",
      "task.md"
    ]);

    expect(result.output.join("\n")).toContain(
      "Provide either inline task text or --file, not both."
    );
    expect(result.exitCode).toBe(1);
    expect(existsSync(join(repo, ".gleip", "session.json"))).toBe(false);
  });

  it("inline preflight behavior remains supported", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["preflight", "Modify only src/foo.ts"]);

    const session = JSON.parse(readFileSync(join(repo, ".gleip", "session.json"), "utf8")) as {
      canonicalTask?: { authority: string };
      task: string;
      taskFile?: string;
    };
    expect(session.task).toBe("Modify only src/foo.ts");
    expect(session.taskFile).toBeUndefined();
    expect(session.canonicalTask?.authority).toBe("canonical");
  });

  it("preflight still runs when disabled and prints a concise note", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["disable", "--reason", "manual"]);

    const output = await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    expect(existsSync(join(repo, ".gleip", "session.json"))).toBe(true);
    expect(output.join("\n")).toContain("Gleip preflight complete · brief and scope budget ready");
    expect(output.join("\n")).toContain("Gleip is currently disabled");
    expect(output.join("\n")).toContain("Manual preflight still ran.");
  });

  it("preflight success output includes validate-plan step", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["preflight", "Add CSV export to users table"]);
    const preflightOutput = output.join("\n");

    expect(preflightOutput).toContain("Gleip preflight complete · brief and scope budget ready");
    expect(preflightOutput).toContain(
      "Artifacts: .gleip/canonical-task.json, .gleip/brief.md, .gleip/scope-budget.json"
    );
    expect(preflightOutput).toContain(
      "Next: implement the scoped change, run verification, then run status"
    );
    expect(preflightOutput.split("\n")).toHaveLength(3);
  });

  // Plan mode exists for agents that are not permitted to write yet. The whole guarantee is that
  // nothing is written, so these assert on the filesystem rather than on the printed wording.
  describe("plan mode", () => {
    it("preflight --plan-mode prints the brief and writes nothing", async () => {
      const repo = createGitRepo();
      const before = snapshotTree(repo);

      const output = await runCommand(repo, [
        "preflight",
        "--plan-mode",
        "Fix the cart total rounding bug in src/cart.ts"
      ]);
      const text = output.join("\n");

      expect(text).toContain("# Gleip Implementation Brief");
      expect(text).toContain("Gleip plan mode · nothing was written");
      expect(snapshotTree(repo)).toEqual(before);
      expect(existsSync(join(repo, ".gleip", "session.json"))).toBe(false);
      expect(existsSync(join(repo, ".gleip", "brief.md"))).toBe(false);
      expect(existsSync(join(repo, ".gleip", "runs"))).toBe(false);
    });

    it("preflight --plan-mode --json matches the scope budget the persisting run writes", async () => {
      const repo = createGitRepo();
      const task = "Fix the cart total rounding bug in src/cart.ts";

      const planModeOutput = await runCommand(repo, ["preflight", "--plan-mode", "--json", task]);
      const planMode = JSON.parse(planModeOutput.join("\n")) as {
        persisted: boolean;
        scopeBudget: Record<string, unknown>;
        canonicalTask: { contentHash: string };
      };

      await runCommand(repo, ["preflight", task]);
      const persisted = JSON.parse(
        readFileSync(join(repo, ".gleip", "scope-budget.json"), "utf8")
      ) as Record<string, unknown>;

      expect(planMode.persisted).toBe(false);

      // A plan-mode verdict that could differ from the recorded one would be worse than none.
      for (const [key, value] of Object.entries(planMode.scopeBudget)) {
        expect([key, value]).toEqual([key, persisted[key]]);
      }
    });

    it("preflight rejects --plan-mode with --amend", async () => {
      const repo = createGitRepo();

      const result = await runCommandResult(repo, [
        "preflight",
        "--plan-mode",
        "--amend",
        "Also preserve Windows compatibility."
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.output.join("\n")).toContain("cannot run with --plan-mode");
    });

    it("validate-plan --plan-mode validates against --task with no active session", async () => {
      const repo = createGitRepo();
      const before = snapshotTree(repo);

      const result = await runCommandResult(repo, [
        "validate-plan",
        "--plan-mode",
        "--task",
        "Fix the cart total rounding bug in src/cart.ts",
        "Files: src/cart.ts. Implementation: correct the rounding. Verification: run the focused cart tests."
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output.join("\n")).toContain("Gleip plan mode · nothing was written");
      expect(snapshotTree(repo)).toEqual(before);
    });

    it("validate-plan --plan-mode asks for the task when no session exists", async () => {
      const repo = createGitRepo();

      const result = await runCommandResult(repo, [
        "validate-plan",
        "--plan-mode",
        "Update src/cart.ts"
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.output.join("\n")).toContain("In plan mode, pass the task");
    });

    it("validate-plan --plan-mode leaves an existing session untouched", async () => {
      const repo = createGitRepo();
      await runCommand(repo, ["preflight", "Fix the cart total rounding bug in src/cart.ts"]);
      const before = snapshotTree(repo);

      await runCommand(repo, [
        "validate-plan",
        "--plan-mode",
        "Files: src/cart.ts. Implementation: correct the rounding. Verification: run the cart tests."
      ]);

      expect(snapshotTree(repo)).toEqual(before);
    });

    it("validate-plan rejects --task without --plan-mode", async () => {
      const repo = createGitRepo();

      const result = await runCommandResult(repo, [
        "validate-plan",
        "--task",
        "Fix the bug",
        "Update src/cart.ts"
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.output.join("\n")).toContain("--task and --task-file require --plan-mode");
    });

    it("check --plan-mode records no evidence and writes no cache", async () => {
      const repo = createGitRepo();
      await runCommand(repo, ["preflight", "Fix the cart total rounding bug in src/cart.ts"]);
      const before = snapshotTree(repo);

      await runCommand(repo, ["check", "--incremental", "--plan-mode"]);

      expect(snapshotTree(repo)).toEqual(before);
      expect(existsSync(join(repo, ".gleip", "check-cache.json"))).toBe(false);
    });
  });

  // A terse prompt naming no path is the ordinary case for a planning-mode agent, and nothing
  // covered it end to end: the closest existing tests stop at classification or at the brief.
  it("preflight produces a usable budget for a short prompt that names no path", async () => {
    const repo = createGitRepo();
    writeRepoFile(repo, "src/login.ts", "export function login() {}\n");

    await runCommand(repo, ["preflight", "fix the login bug"]);
    const budget = JSON.parse(readFileSync(join(repo, ".gleip", "scope-budget.json"), "utf8")) as {
      taskType: string;
      riskLevel: string;
      planRequired: boolean;
      allowedPaths: string[];
      expectedFilesChanged: { max: number };
    };

    expect(budget.taskType).toBe("auth_security_change");
    expect(budget.riskLevel).toBe("high");
    // Authentication work keeps the sensitive profile, so the plan check is not optional.
    expect(budget.planRequired).toBe(true);
    expect(budget.allowedPaths.length).toBeGreaterThan(0);
    expect(budget.expectedFilesChanged.max).toBeGreaterThanOrEqual(budget.allowedPaths.length > 0 ? 1 : 0);
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
          fileStats: [
            { path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }
          ],
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
    expect(brief).toContain("- Profile: local_behavior_change");
    expect(brief).toContain("- Risk: medium");
    expect(brief).toContain("## Verification expected");
    expect(brief).toContain("## Applicable protections");
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
    expect(brief).toContain("## Likely files");
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
    const result = await runCommandResult(repo, ["brief"]);

    expect(result.output.join("\n")).toContain("[NO_ACTIVE_SESSION] action_required");
    expect(result.output.join("\n")).toContain('Run: npx gleip preflight "<task>"');
    expect(result.exitCode).toBe(1);
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
    const result = await runCommandResult(repo, ["status"]);

    expect(result.output.join("\n")).toContain("[NO_ACTIVE_SESSION] action_required");
    expect(result.output.join("\n")).toContain('Run: npx gleip preflight "<task>"');
    expect(result.exitCode).toBe(1);
  });

  it("validate-plan exits non-zero without an active session", async () => {
    const repo = createTempRepo();
    const result = await runCommandResult(repo, ["validate-plan", "Update src/index.ts"]);

    expect(result.output.join("\n")).toContain("[NO_ACTIVE_SESSION] action_required");
    expect(result.exitCode).toBe(1);
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
    expect(status).toContain("- Status: clean");
    expect(existsSync(join(processCwd, ".gleip", "status.md"))).toBe(false);
  });

  it("status still runs when disabled and prints a concise note", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);
    await runCommand(repo, ["disable", "--reason", "manual"]);

    const output = await runCommand(repo, ["status"]);

    expect(output.join("\n")).toContain("Gleip status complete · status: clean");
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
        "Gleip status complete · status: clean",
        "Changes: 0 files, +0/-0",
        "Next: generate report"
      ].join("\n")
    );
  });

  it("status ignores unchanged pre-existing files", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [
            { path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }
          ],
          totalLinesAdded: 1
        })
    });

    const output = await runCommand(repo, ["status"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [
            { path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }
          ],
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
    expect(statusOutput).toContain("Changes: 0 files, +0/-0");
    expect(statusOutput).toContain("Baseline: 1 pre-existing file(s) ignored");
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

    expect(output.join("\n")).toContain("Changes: 1 files, +2/-0");
  });

  it("status includes pre-existing files whose stats changed after preflight", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [
            { path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }
          ],
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

    expect(output.join("\n")).toContain("Changes: 1 files, +2/-0");
    expect(output.join("\n")).toContain(
      "Baseline: 1 pre-existing file(s) changed after preflight; attribution is file-level"
    );
  });

  it("status --json includes ambiguous baseline files changed after preflight", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [
            { path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }
          ],
          totalLinesAdded: 1
        })
    });

    const output = await runCommand(repo, ["status", "--json"], {
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
    const json = JSON.parse(output.join("\n")) as {
      baseline: { possiblyPreExistingFiles: string[]; sessionFilesChanged: number };
      metrics: { filesChanged: number };
    };

    expect(json.metrics.filesChanged).toBe(1);
    expect(json.baseline.sessionFilesChanged).toBe(1);
    expect(json.baseline.possiblyPreExistingFiles).toEqual(["README.md"]);
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
    expect(statusOutput).toContain("Gleip status complete · status: clean");
    expect(statusOutput).toContain("Changes: 1 files, +3/-1");
    expect(statusOutput).not.toContain("Findings:");
    expect(statusOutput).toContain("Next: generate report");
    expect(statusOutput.split("\n")).toHaveLength(3);
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
    expect(brief).toContain("## Expected scope");
    expect(brief).toContain("## Applicable protections");
    expect(brief).toContain("Dependency and CI changes require approval if introduced.");
  });

  it("preflight writes the generated implementation brief", async () => {
    const repo = createTempRepo();

    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const brief = readFileSync(join(repo, ".gleip", "brief.md"), "utf8");
    expect(brief).toContain("# Gleip Implementation Brief");
    expect(brief).toContain("## Plan");
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
        "Modify src/features/users/UserTable.tsx to add CSV export to the users table",
        "Add tests in src/features/users/UserTable.test.tsx"
      ].join("\n")
    ]);

    const validationOutput = output.join("\n");
    expect(validationOutput).toContain("Gleip plan check aligned with declared task scope");
    expect(validationOutput).toContain(
      "Next: implement the plan, run verification, then run status"
    );
    expect(validationOutput.split("\n")).toHaveLength(2);
  });

  // §6.6: the tool correctly identified which mandatory requirement a plan omitted, then printed
  // only findings[0] and never any evidence -- so it reported "2 finding(s)" while showing one,
  // and said "a mandatory requirement is missing" without naming it. The --json contract dropped
  // requirementCoverage entirely, making the analysis unreachable there too.
  it("validate-plan names the requirements a plan misses", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "src/runtime.ts", "export const runtime = {};\n");
    await runCommand(repo, [
      "preflight",
      [
        "## Requirements",
        "- Must update src/runtime.ts.",
        "- Must preserve Windows compatibility.",
        "- Column order must be: order id, created date, status, total."
      ].join("\n")
    ]);

    const text = (
      await runCommand(repo, ["validate-plan", "Implementation: update src/runtime.ts."])
    ).join("\n");

    // Every printed finding count must correspond to a printed finding.
    const declaredCount = Number(/(\d+) finding\(s\)/u.exec(text)?.[1] ?? "0");
    expect(text.match(/^Finding: /gmu) ?? []).toHaveLength(declaredCount);
    // The specific unmet requirements are named, not merely counted.
    expect(text).toContain("REQ-");

    const json = JSON.parse(
      (
        await runCommand(repo, [
          "validate-plan",
          "--json",
          "Implementation: update src/runtime.ts."
        ])
      ).join("\n")
    ) as { requirementCoverage?: { missingRequired: unknown[] } };

    expect(json.requirementCoverage).toBeDefined();
    expect(json.requirementCoverage?.missingRequired.length).toBeGreaterThan(0);
  });

  it("validate-plan text output shows scope target classifications and next actions", async () => {
    const repo = createTempRepo();
    await runCommand(repo, [
      "preflight",
      "Make all routed surfaces responsive across shared layout primitives, reusable data presentation, relevant tests, and documentation."
    ]);

    const output = await runCommand(repo, [
      "validate-plan",
      [
        "Update src/routes/home.tsx for responsive routed surface behavior.",
        "Update scripts/release.ts.",
        "Run responsive tests."
      ].join("\n")
    ]);
    const validationOutput = output.join("\n");

    expect(validationOutput).toContain("Scope targets needing clarification:");
    expect(validationOutput).toContain("scripts/release.ts [unexplained]");
    expect(validationOutput).toContain("No credible structural or semantic relationship");
    expect(validationOutput).toContain("Next:");
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
        "Modify src/features/users/UserTable.tsx to add CSV export to the users table",
        "Add tests in src/features/users/UserTable.test.tsx"
      ].join("\n")
    ]);
    const json = JSON.parse(output.join("\n")) as {
      status: string;
      findings: unknown[];
      nextAction: string;
      parsedPlan: { proposedFiles: string[] };
    };

    expect(json.status).toBe("aligned");
    expect(json.findings).toEqual([]);
    expect(json.nextAction).toContain("Implement");
    expect(json.parsedPlan.proposedFiles).toContain("src/features/users/UserTable.tsx");
  });

  it("keeps local plan findings advisory when plan validation is not required", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Update src/index.ts and its focused test"]);
    const output = await runCommand(repo, ["validate-plan", "--json", "Update package.json"], {
      validateAgentPlan: () => ({
        status: "needs_approval",
        findings: [
          {
            code: "DEPENDENCY_CHANGE_NOT_ALLOWED",
            severity: "approval_required",
            title: "Dependency approval required",
            message: "The plan mentions package.json."
          }
        ],
        summary: "Approval guidance recorded.",
        nextAction: "Request approval.",
        parsedPlan: {
          rawText: "Update package.json",
          proposedFiles: ["package.json"],
          proposedDependencies: [],
          proposedTests: [],
          mentionedRiskyAreas: [],
          mentionsCiChanges: false,
          mentionsNewDependencies: false,
          mentionsTestWeakening: false,
          mentionsBroadRefactor: false
        }
      })
    });
    const result = JSON.parse(output.join("\n")) as { status: string; findings: unknown[] };

    expect(result.status).toBe("advisory");
    expect(result.findings).toHaveLength(1);
  });

  it("validate-plan persists the latest validation in session.json", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "src/features/users/UserTable.tsx", "export function UserTable() {}");
    writeRepoFile(repo, "src/features/users/UserTable.test.tsx", "describe('UserTable', () => {})");
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    await runCommand(repo, [
      "validate-plan",
      "Modify src/features/users/UserTable.tsx to add CSV export to the users table and add tests in src/features/users/UserTable.test.tsx"
    ]);

    const session = JSON.parse(readFileSync(join(repo, ".gleip", "session.json"), "utf8")) as {
      latestPlanValidation: {
        status: string;
        validatedAt: string;
      };
    };
    expect(session.latestPlanValidation.status).toBe("aligned");
    expect(session.latestPlanValidation.validatedAt).toBe("2026-05-30T00:00:00.000Z");
  });

  it("validate-plan --file works", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "src/features/users/UserTable.tsx", "export function UserTable() {}");
    writeRepoFile(repo, "src/features/users/UserTable.test.tsx", "describe('UserTable', () => {})");
    writeRepoFile(
      repo,
      "plan.md",
      [
        "- Modify src/features/users/UserTable.tsx to add CSV export to the users table",
        "- Add tests in src/features/users/UserTable.test.tsx"
      ].join("\n")
    );
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["validate-plan", "--file", "plan.md"]);
    const session = JSON.parse(readFileSync(join(repo, ".gleip", "session.json"), "utf8")) as {
      latestPlanValidation: {
        parsedPlan: {
          contextFiles: string[];
          proposedFiles: string[];
        };
      };
    };

    expect(session.latestPlanValidation.parsedPlan.contextFiles).toContain("plan.md");
    expect(session.latestPlanValidation.parsedPlan.proposedFiles).not.toContain("plan.md");

    expect(output.join("\n")).toContain("Gleip plan check aligned with declared task scope");
  });

  it("validate-plan reports a missing plan file with an actionable message", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const result = await runCommandResult(repo, ["validate-plan", "--file", "missing-plan.md"]);

    expect(result.output.join("\n")).toContain("Plan file not found: missing-plan.md.");
    expect(result.exitCode).toBe(1);
  });

  it("validate-plan exits non-zero when no plan is provided", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const result = await runCommandResult(repo, ["validate-plan"]);

    expect(result.output.join("\n")).toContain("No plan text provided.");
    expect(result.exitCode).toBe(1);
  });

  it("validate-plan rejects inline text combined with --file", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "plan.md", "Update src/foo.ts and run tests.");
    await runCommand(repo, ["preflight", "Modify only src/foo.ts"]);

    const result = await runCommandResult(repo, [
      "validate-plan",
      "Update src/foo.ts and run tests.",
      "--file",
      "plan.md"
    ]);

    expect(result.output.join("\n")).toContain(
      "Provide either inline plan text or --file, not both."
    );
    expect(result.exitCode).toBe(1);
  });

  it("inline validate-plan remains supported", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "src/foo.ts", "export const foo = true;");
    await runCommand(repo, ["preflight", "Modify only src/foo.ts and run tests"]);

    const output = await runCommand(repo, [
      "validate-plan",
      "Update src/foo.ts and run existing tests."
    ]);

    expect(output.join("\n")).toContain("Gleip plan check aligned");
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
            recommendation: "Request approval before changing dependency files.",
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
    expect(statusOutput).toContain("Gleip status complete · status: needs_approval");
    expect(statusOutput).toContain("Changes: 1 files, +1/-0");
    expect(statusOutput).toContain("Findings: 1");
    expect(statusOutput).toContain("Dependency files changed");
    expect(statusOutput).toContain("Review the listed findings");
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
    expect(status).toContain("- Status: needs_attention");
    expect(status).toContain("### Action required");
    expect(status).toContain("Skipped test added");
  });

  it("status summarizes multiple findings without printing the full report", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["status"], {
      detectScopeDrift: () => ({
        status: "blocked",
        findings: [
          {
            severity: "warning",
            title: "Files outside expected scope",
            message:
              "4 files changed outside the expected scope. Examples: src/a.ts, src/b.ts, src/c.ts.",
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
            recommendation: "Request approval.",
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
    expect(statusOutput).toContain("Gleip status complete · status: needs_approval");
    expect(statusOutput).toContain("Findings: 3");
    expect(statusOutput).toContain("highest: approval_required: Dependency files changed");
    expect(statusOutput).not.toContain("4 files changed outside the expected scope");
    expect(statusOutput.split("\n")).toHaveLength(4);
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
            title: "Files outside expected scope",
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

    expect(output.join("\n")).toContain("Gleip check complete · status: advisory");
    expect(readFileSync(join(repo, ".gleip", "status.md"), "utf8")).toBe(originalStatus);
  });

  it("reuses two identical incremental checks and preserves the complete CI exit code", async () => {
    const repo = createTempRepo();
    let analysisCalls = 0;
    const detectScopeDrift = () => {
      analysisCalls += 1;
      return {
        status: "blocked" as const,
        findings: [
          {
            code: "TEST_SKIPPED",
            severity: "blocking" as const,
            title: "Skipped test added",
            message: "The diff adds a skipped test.",
            category: "tests"
          }
        ],
        metrics: { filesChanged: 1, linesAdded: 1, linesDeleted: 0 },
        summary: "Blocking finding detected."
      };
    };
    await runCommand(repo, ["preflight", "Keep focused tests active"]);

    const first = await runCommandResult(repo, ["check", "--incremental", "--ci"], {
      detectScopeDrift
    });
    const second = await runCommandResult(repo, ["check", "--incremental", "--ci"], {
      detectScopeDrift
    });

    expect(first.output.join("\n")).toContain("incremental check executed | baseline");
    expect(first.output.join("\n")).toContain("[TEST_SKIPPED]");
    expect(second.output.join("\n")).toContain("incremental check reused | fingerprint unchanged");
    expect(second.output.join("\n")).toContain("Unchanged: 1");
    expect(first.exitCode).toBe(1);
    expect(second.exitCode).toBe(1);
    expect(analysisCalls).toBe(1);
  });

  it("force-recomputes an unchanged incremental check", async () => {
    const repo = createTempRepo();
    let analysisCalls = 0;
    const detectScopeDrift = () => {
      analysisCalls += 1;
      return {
        status: "within_scope" as const,
        findings: [],
        metrics: { filesChanged: 0, linesAdded: 0, linesDeleted: 0 },
        summary: "No changes."
      };
    };
    await runCommand(repo, ["preflight", "Verify deterministic output"]);
    await runCommand(repo, ["check", "--incremental"], { detectScopeDrift });
    const forced = await runCommand(repo, ["check", "--incremental", "--force"], {
      detectScopeDrift
    });

    expect(forced.join("\n")).toContain("incremental check executed | forced delta");
    expect(analysisCalls).toBe(2);
  });

  it("executes after implementation changes and emits finding resolution deltas", async () => {
    const repo = createTempRepo();
    let analysisCalls = 0;
    await runCommand(repo, ["preflight", "Keep changes inside src/feature.ts"]);

    await runCommand(repo, ["check", "--incremental"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["src/other.ts"],
          fileStats: [{ path: "src/other.ts", added: 1, deleted: 0, diffFingerprint: "outside" }],
          totalLinesAdded: 1,
          hasChanges: true
        }),
      detectScopeDrift: () => {
        analysisCalls += 1;
        return {
          status: "warning",
          findings: [
            {
              code: "SCOPE_EXPANSION_WARN",
              severity: "warning",
              title: "Files outside expected scope",
              message: "src/other.ts is outside expected scope.",
              file: "src\\other.ts",
              category: "allowed_scope"
            }
          ],
          metrics: { filesChanged: 1, linesAdded: 1, linesDeleted: 0 },
          summary: "Scope warning."
        };
      }
    });

    const updated = await runCommand(repo, ["check", "--incremental"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["src/other.ts"],
          fileStats: [
            { path: "src/other.ts", added: 2, deleted: 0, diffFingerprint: "outside-updated" }
          ],
          totalLinesAdded: 2,
          hasChanges: true
        }),
      detectScopeDrift: () => {
        analysisCalls += 1;
        return {
          status: "warning",
          findings: [
            {
              code: "SCOPE_EXPANSION_WARN",
              severity: "warning",
              title: "Files outside expected scope",
              message: "src/other.ts remains outside expected scope with two changed lines.",
              file: "src/other.ts",
              category: "allowed_scope"
            }
          ],
          metrics: { filesChanged: 1, linesAdded: 2, linesDeleted: 0 },
          summary: "Updated scope warning."
        };
      }
    });

    const resolved = await runCommand(repo, ["check", "--incremental"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["src/feature.ts"],
          fileStats: [{ path: "src/feature.ts", added: 1, deleted: 0, diffFingerprint: "inside" }],
          totalLinesAdded: 1,
          hasChanges: true
        }),
      detectScopeDrift: () => {
        analysisCalls += 1;
        return {
          status: "within_scope",
          findings: [],
          metrics: { filesChanged: 1, linesAdded: 1, linesDeleted: 0 },
          summary: "Within scope."
        };
      }
    });

    expect(updated.join("\n")).toContain("Updated: 1");
    expect(updated.join("\n")).toContain("remains outside expected scope");
    expect(resolved.join("\n")).toContain("incremental check executed | delta");
    expect(resolved.join("\n")).toContain("Resolved: 1");
    expect(resolved.join("\n")).toContain("src/other.ts remains outside expected scope");
    expect(analysisCalls).toBe(3);
  });

  it("invalidates incremental reuse for brief, plan, and configuration changes", async () => {
    const repo = createTempRepo();
    let analysisCalls = 0;
    const detectScopeDrift = () => {
      analysisCalls += 1;
      return {
        status: "within_scope" as const,
        findings: [],
        metrics: { filesChanged: 0, linesAdded: 0, linesDeleted: 0 },
        summary: "No changes."
      };
    };
    const defaultConfig = () => ({ mode: "advisory" });
    await runCommand(repo, ["preflight", "Update the focused implementation"]);
    await runCommand(repo, ["check", "--incremental"], {
      detectScopeDrift,
      loadConfig: defaultConfig
    });
    await runCommand(repo, ["check", "--incremental"], {
      detectScopeDrift,
      loadConfig: defaultConfig
    });
    expect(analysisCalls).toBe(1);

    writeFileSync(join(repo, ".gleip", "brief.md"), "changed brief\n");
    await runCommand(repo, ["check", "--incremental"], {
      detectScopeDrift,
      loadConfig: defaultConfig
    });

    const sessionPath = join(repo, ".gleip", "session.json");
    const session = JSON.parse(readFileSync(sessionPath, "utf8")) as Record<string, unknown>;
    writeFileSync(
      sessionPath,
      `${JSON.stringify({ ...session, latestValidationAttempt: { status: "needs_approval" } }, null, 2)}\n`
    );
    await runCommand(repo, ["check", "--incremental"], {
      detectScopeDrift,
      loadConfig: defaultConfig
    });
    await runCommand(repo, ["check", "--incremental"], {
      detectScopeDrift,
      loadConfig: () => ({ mode: "strict" })
    });

    expect(analysisCalls).toBe(4);
  });

  it("falls back to a full baseline for corrupted, deleted, and version-incompatible caches", async () => {
    const repo = createTempRepo();
    let analysisCalls = 0;
    const detectScopeDrift = () => {
      analysisCalls += 1;
      return {
        status: "within_scope" as const,
        findings: [],
        metrics: { filesChanged: 0, linesAdded: 0, linesDeleted: 0 },
        summary: "No changes."
      };
    };
    const cachePath = join(repo, ".gleip", "check-cache.json");
    await runCommand(repo, ["preflight", "Exercise cache recovery"]);
    await runCommand(repo, ["check", "--incremental"], { detectScopeDrift });

    writeFileSync(cachePath, "{broken\n");
    const corrupted = await runCommand(repo, ["check", "--incremental"], { detectScopeDrift });
    rmSync(cachePath);
    const deleted = await runCommand(repo, ["check", "--incremental"], { detectScopeDrift });
    const cache = JSON.parse(readFileSync(cachePath, "utf8")) as Record<string, unknown>;
    writeFileSync(cachePath, `${JSON.stringify({ ...cache, gleipVersion: "0.0.0" }, null, 2)}\n`);
    const incompatible = await runCommand(repo, ["check", "--incremental"], {
      detectScopeDrift
    });

    expect(corrupted.join("\n")).toContain("executed | baseline");
    expect(deleted.join("\n")).toContain("executed | baseline");
    expect(incompatible.join("\n")).toContain("executed | baseline");
    expect(analysisCalls).toBe(4);
  });

  it("reports directly observable incremental metrics in JSON", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Measure deterministic checks"]);
    await runCommand(repo, ["check", "--incremental", "--json"]);
    const output = await runCommand(repo, ["check", "--incremental", "--json"]);
    const result = JSON.parse(output.join("\n")) as {
      incremental: {
        execution: string;
        efficiency: Record<string, unknown>;
      };
    };

    expect(result.incremental.execution).toBe("reused");
    expect(result.incremental.efficiency).toMatchObject({
      checksRequested: 1,
      checksExecuted: 0,
      checksReused: 1,
      reuseRate: 1,
      fullFindingsEmitted: 0,
      deltaFindingsEmitted: 0,
      validationCycles: "unavailable",
      repeatedValidationCycles: "unavailable"
    });
  });

  it("status --compact reuses current incremental state and prints only iterative fields", async () => {
    const repo = createTempRepo();
    let analysisCalls = 0;
    const detectScopeDrift = () => {
      analysisCalls += 1;
      return {
        status: "within_scope" as const,
        findings: [],
        metrics: { filesChanged: 0, linesAdded: 0, linesDeleted: 0 },
        summary: "No changes."
      };
    };
    await runCommand(repo, ["preflight", "Measure compact status"]);
    await runCommand(repo, ["check", "--incremental"], { detectScopeDrift });
    const output = await runCommand(repo, ["status", "--compact"], { detectScopeDrift });
    const lines = output.join("\n").split("\n");

    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain("Task: Measure compact status");
    // Distinct from `check`'s baseline comparison, which reports the changed-file count.
    expect(lines[1]).toBe("Changed since last check: no");
    expect(lines[2]).toBe("Findings: 0 warning, 0 blocking");
    expect(lines[3]).toBe("Check necessary: no");
    expect(output.join("\n")).not.toContain("brief");
    expect(output.join("\n")).not.toContain("plan");
    expect(analysisCalls).toBe(1);
  });

  it("check --ci exits non-zero for documented action-required findings", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const result = await runCommandResult(repo, ["check", "--ci"], {
      detectScopeDrift: () => ({
        status: "blocked",
        findings: [
          {
            code: "TEST_SKIPPED",
            severity: "blocking",
            title: "Skipped test added",
            message: "The diff adds a skipped test.",
            category: "tests"
          }
        ],
        metrics: { filesChanged: 1, linesAdded: 1, linesDeleted: 0 },
        summary: "Blocking finding detected."
      })
    });

    expect(result.output.join("\n")).toContain(
      "[TEST_SKIPPED] action_required: Skipped test added"
    );
    expect(result.exitCode).toBe(1);
  });

  it("reports local artifacts as cleanup with a specific next action", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Update local documentation"]);

    const result = await runCommandResult(repo, ["check"], {
      detectScopeDrift: () => ({
        status: "blocked",
        findings: [
          {
            code: "LOCAL_ARTIFACT_INCLUDED",
            severity: "blocking",
            title: "Local Gleip artifact included",
            message: ".gleip/session.json is tracked.",
            category: "local_artifacts"
          }
        ],
        metrics: { filesChanged: 0, linesAdded: 0, linesDeleted: 0 },
        summary: "Local artifact detected."
      })
    });
    const output = result.output.join("\n");

    expect(output).toContain("status: needs_cleanup");
    expect(output).toContain(
      "Remove .gleip session artifacts from the change set or ensure .gleip/ is ignored, then rerun status."
    );
    expect(output).not.toContain("skipped");
    expect(output).not.toContain("secret");
    expect(output).not.toContain("task blocked");
    expect(result.exitCode).toBe(0);
  });

  it("check --ci exits zero for warning and non-blocking fail findings", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Update dependency documentation"]);

    const result = await runCommandResult(repo, ["check", "--ci"], {
      detectScopeDrift: () => ({
        status: "approval_required",
        findings: [
          {
            code: "DEPENDENCY_FILE_CHANGED",
            severity: "fail",
            title: "Dependency files changed",
            message: "package.json changed.",
            category: "dependencies"
          },
          {
            code: "SCOPE_EXPANSION_WARN",
            severity: "warn",
            title: "Files outside expected scope",
            message: "Multiple files changed.",
            category: "allowed_scope"
          }
        ],
        metrics: { filesChanged: 2, linesAdded: 2, linesDeleted: 0 },
        summary: "Non-blocking findings detected."
      })
    });

    expect(result.exitCode).toBe(0);
  });

  it("default check remains advisory for blocking findings", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const result = await runCommandResult(repo, ["check"], {
      detectScopeDrift: () => ({
        status: "blocked",
        findings: [
          {
            code: "TEST_DELETED",
            severity: "blocking",
            title: "Test file deleted",
            message: "A test file was deleted.",
            category: "tests"
          }
        ],
        metrics: { filesChanged: 1, linesAdded: 0, linesDeleted: 10 },
        summary: "Blocking finding detected."
      })
    });

    expect(result.exitCode).toBe(0);
  });

  it("check still runs when disabled and prints a concise note", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);
    await runCommand(repo, ["disable", "--reason", "manual"]);

    const output = await runCommand(repo, ["check"]);

    expect(output.join("\n")).toContain("Gleip check complete · status: clean");
    expect(output.join("\n")).toContain("Gleip is currently disabled");
    expect(output.join("\n")).toContain("Check can still be run manually.");
  });

  it("check uses baseline when active session exists", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [
            { path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }
          ],
          totalLinesAdded: 1
        })
    });

    const output = await runCommand(repo, ["check"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [
            { path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }
          ],
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

    expect(output.join("\n")).toContain("Baseline: 1 pre-existing file(s) ignored");
  });

  it("check --include-baseline analyzes the full working tree", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [
            { path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }
          ],
          totalLinesAdded: 1
        })
    });

    const output = await runCommand(repo, ["check", "--include-baseline"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [
            { path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }
          ],
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

    expect(output.join("\n")).toContain("Changes: 1 files, +1/-0");
    expect(output.join("\n").split("\n").length).toBeLessThanOrEqual(5);
  });

  it("status --include-baseline analyzes the full working tree", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [
            { path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }
          ],
          totalLinesAdded: 1
        })
    });

    const output = await runCommand(repo, ["status", "--include-baseline"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["README.md"],
          fileStats: [
            { path: "README.md", added: 1, deleted: 0, diffFingerprint: "readme-before" }
          ],
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

    expect(output.join("\n")).toContain("Changes: 1 files, +1/-0");
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
            title: "Files outside expected scope",
            message: "1 file changed outside the expected scope.",
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
      baseline: {
        hasBaseline: boolean;
        preExistingFilesIgnored: number;
        sessionFilesChanged: number;
      };
      findings: Array<{ severity: string; title: string }>;
      metrics: { filesChanged: number };
      nextAction: string;
      status: string;
    };
    expect(json.status).toBe("advisory");
    expect(json.metrics.filesChanged).toBe(1);
    expect(json.baseline).toMatchObject({
      hasBaseline: true,
      preExistingFilesIgnored: 0,
      sessionFilesChanged: 1
    });
    expect(json.findings[0]).toMatchObject({
      severity: "warn",
      title: "Files outside expected scope"
    });
    expect(json.nextAction).toContain("Review the listed findings");
  });

  it("status overwrites stale artifact cleanup after the artifact finding is resolved", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    await runCommand(repo, ["status"], {
      detectScopeDrift: () => ({
        status: "needs_cleanup",
        findings: [
          {
            code: "LOCAL_ARTIFACT_INCLUDED",
            severity: "cleanup_required",
            title: "Local Gleip artifact included",
            message: ".gleip/session.json is tracked by git.",
            category: "local_artifacts"
          }
        ],
        metrics: {
          filesChanged: 0,
          linesAdded: 0,
          linesDeleted: 0
        },
        summary: "Cleanup required."
      })
    });
    expect(readFileSync(join(repo, ".gleip", "status.md"), "utf8")).toContain(
      "Remove .gleip session artifacts"
    );

    const output = await runCommand(repo, ["status"], {
      detectScopeDrift: () => ({
        status: "clean",
        findings: [],
        metrics: {
          filesChanged: 0,
          linesAdded: 0,
          linesDeleted: 0
        },
        summary: "No working tree changes detected."
      })
    });
    const statusFile = readFileSync(join(repo, ".gleip", "status.md"), "utf8");

    expect(output.join("\n")).not.toContain("Remove .gleip session artifacts");
    expect(statusFile).not.toContain("Remove .gleip session artifacts");
    expect(statusFile).toContain(
      "Begin implementation or run npx --no-install gleip preflight if this is not the intended session."
    );
  });

  it("status passes accepted validate-plan targets into drift detection scope", async () => {
    const repo = createTempRepo();
    let observedScope:
      | { expectedPaths?: string[]; derivedScope?: string[]; explicitScope?: string[] }
      | undefined;
    await runCommand(repo, ["preflight", "Update the user table and shared formatter"]);
    await runCommand(
      repo,
      ["validate-plan", "Update src/users/table.ts and src/shared/format.ts"],
      {
        validateAgentPlan: (input) => ({
          status: "aligned",
          findings: [],
          summary: "Plan is aligned.",
          nextAction: "Implement the plan.",
          parsedPlan: {
            rawText: input.planText,
            proposedFiles: ["src/users/table.ts", "src/shared/format.ts"],
            contextFiles: [],
            outputFiles: [],
            proposedDependencies: [],
            proposedTests: [],
            mentionedRiskyAreas: [],
            mentionsCiChanges: false,
            mentionsNewDependencies: false,
            mentionsTestWeakening: false,
            mentionsBroadRefactor: false
          },
          targetClassifications: [
            {
              target: "src/users/table.ts",
              classification: "direct",
              reason: "Target matches explicit task scope.",
              evidence: "src/users/table.ts"
            },
            {
              target: "src/shared/format.ts",
              classification: "derived",
              reason: "Target is shared by the direct target.",
              evidence: "src/users/table.ts"
            }
          ]
        })
      }
    );

    await runCommand(repo, ["status"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["src/shared/format.ts"],
          fileStats: [
            { path: "src/shared/format.ts", added: 2, deleted: 0, diffFingerprint: "shared" }
          ],
          totalLinesAdded: 2
        }),
      detectScopeDrift: ({ scopeBudget }) => {
        observedScope = scopeBudget;

        return {
          status: "clean",
          findings: [],
          metrics: {
            filesChanged: 1,
            linesAdded: 2,
            linesDeleted: 0
          },
          summary: "Accepted plan target remains in scope."
        };
      }
    });

    expect(observedScope?.expectedPaths).toContain("src/shared/format.ts");
    expect(observedScope?.derivedScope).toContain("src/shared/format.ts");
    expect(observedScope?.explicitScope).toContain("src/users/table.ts");
  });

  it.each(["README.md", "docs/usage.md", "FULL_CONTEXT.md", "PROJECT_CONTEXT.md"])(
    "status passes accepted documentation/context target %s into drift detection scope",
    async (path) => {
      const repo = createTempRepo();
      let observedScope: { expectedPaths?: string[]; explicitScope?: string[] } | undefined;
      await runCommand(repo, ["preflight", `Update ${path} for the task`]);
      await runCommand(repo, ["validate-plan", `Update ${path}. Run documentation review.`], {
        validateAgentPlan: (input) => ({
          status: "aligned",
          findings: [],
          summary: "Plan is aligned.",
          nextAction: "Implement the plan.",
          parsedPlan: {
            rawText: input.planText,
            proposedFiles: [path],
            contextFiles: [],
            outputFiles: [],
            proposedDependencies: [],
            proposedTests: [],
            mentionedRiskyAreas: [],
            mentionsCiChanges: false,
            mentionsNewDependencies: false,
            mentionsTestWeakening: false,
            mentionsBroadRefactor: false
          },
          targetClassifications: [
            {
              target: path,
              classification: "direct",
              reason: "Target matches explicit task scope.",
              evidence: path
            }
          ]
        })
      });

      await runCommand(repo, ["status"], {
        collectWorkingTreeDiff: () =>
          diffContext({
            changedFiles: [path],
            fileStats: [{ path, added: 2, deleted: 0, diffFingerprint: "docs" }],
            totalLinesAdded: 2
          }),
        detectScopeDrift: ({ scopeBudget }) => {
          observedScope = scopeBudget;

          return {
            status: "clean",
            findings: [],
            metrics: {
              filesChanged: 1,
              linesAdded: 2,
              linesDeleted: 0
            },
            summary: "Accepted documentation target remains in scope."
          };
        }
      });

      expect(observedScope?.expectedPaths).toContain(path);
      expect(observedScope?.explicitScope).toContain(path);
    }
  );

  it("status removes documentation scope guidance after the documentation change is reverted", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Update src/foo.ts"]);

    await runCommand(repo, ["status"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["docs/unrelated.md"],
          fileStats: [{ path: "docs/unrelated.md", added: 2, deleted: 0, diffFingerprint: "docs" }],
          totalLinesAdded: 2
        }),
      detectScopeDrift: () => ({
        status: "advisory",
        findings: [
          {
            code: "SCOPE_EXPANSION_WARN",
            severity: "warn",
            title: "Files outside expected scope",
            message: "docs/unrelated.md changed outside expected scope.",
            examples: ["docs/unrelated.md"],
            category: "allowed_scope",
            recommendation:
              "Add rationale for adjacent targets and remove or justify unexplained targets."
          }
        ],
        metrics: {
          filesChanged: 1,
          linesAdded: 2,
          linesDeleted: 0
        },
        summary: "Documentation scope needs review."
      })
    });
    expect(readFileSync(join(repo, ".gleip", "status.md"), "utf8")).toContain(
      "docs/unrelated.md changed outside expected scope"
    );

    const output = await runCommand(repo, ["status", "--json"], {
      collectWorkingTreeDiff: () => diffContext(),
      detectScopeDrift: () => ({
        status: "clean",
        findings: [],
        metrics: {
          filesChanged: 0,
          linesAdded: 0,
          linesDeleted: 0
        },
        summary: "No working tree changes detected."
      })
    });
    const json = JSON.parse(output.join("\n")) as {
      findings: unknown[];
      nextAction: string;
      status: string;
    };
    const statusFile = readFileSync(join(repo, ".gleip", "status.md"), "utf8");

    expect(json.status).toBe("clean");
    expect(json.findings).toEqual([]);
    expect(json.nextAction).not.toContain("scope rationale");
    expect(statusFile).not.toContain("docs/unrelated.md changed outside expected scope");
  });

  it("status keeps the latest successful validate-plan scope after a failed plan attempt", async () => {
    const repo = createTempRepo();
    let observedScope:
      | { expectedPaths?: string[]; derivedScope?: string[]; explicitScope?: string[] }
      | undefined;
    await runCommand(repo, ["preflight", "Update the user table and shared formatter"]);
    await runCommand(
      repo,
      ["validate-plan", "Update src/users/table.ts and src/shared/format.ts"],
      {
        validateAgentPlan: (input) => ({
          status: "aligned",
          findings: [],
          summary: "Plan is aligned.",
          nextAction: "Implement the plan.",
          parsedPlan: {
            rawText: input.planText,
            proposedFiles: ["src/users/table.ts", "src/shared/format.ts"],
            contextFiles: [],
            outputFiles: [],
            proposedDependencies: [],
            proposedTests: [],
            mentionedRiskyAreas: [],
            mentionsCiChanges: false,
            mentionsNewDependencies: false,
            mentionsTestWeakening: false,
            mentionsBroadRefactor: false
          },
          targetClassifications: [
            {
              target: "src/users/table.ts",
              classification: "direct",
              reason: "Target matches explicit task scope.",
              evidence: "src/users/table.ts"
            },
            {
              target: "src/shared/format.ts",
              classification: "derived",
              reason: "Target is shared by the direct target.",
              evidence: "src/users/table.ts"
            }
          ]
        })
      }
    );
    await runCommand(repo, ["validate-plan", "Update package.json and scripts/release.ts"], {
      validateAgentPlan: (input) => ({
        status: "needs_approval",
        findings: [
          {
            severity: "approval_required",
            title: "Approval required",
            message: "Dependency and release changes need explicit approval."
          }
        ],
        summary: "Plan needs approval.",
        nextAction: "Request approval.",
        parsedPlan: {
          rawText: input.planText,
          proposedFiles: ["package.json", "scripts/release.ts"],
          contextFiles: [],
          outputFiles: [],
          proposedDependencies: [],
          proposedTests: [],
          mentionedRiskyAreas: [],
          mentionsCiChanges: false,
          mentionsNewDependencies: true,
          mentionsTestWeakening: false,
          mentionsBroadRefactor: false
        },
        targetClassifications: [
          {
            target: "scripts/release.ts",
            classification: "unexplained",
            reason: "No relationship to the active scope budget.",
            evidence: "scripts/release.ts"
          }
        ]
      })
    });

    await runCommand(repo, ["status"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["src/shared/format.ts"],
          fileStats: [
            { path: "src/shared/format.ts", added: 2, deleted: 0, diffFingerprint: "shared" }
          ],
          totalLinesAdded: 2
        }),
      detectScopeDrift: ({ scopeBudget }) => {
        observedScope = scopeBudget;

        return {
          status: "clean",
          findings: [],
          metrics: {
            filesChanged: 1,
            linesAdded: 2,
            linesDeleted: 0
          },
          summary: "Accepted plan target remains in scope."
        };
      }
    });

    const session = JSON.parse(readFileSync(join(repo, ".gleip", "session.json"), "utf8")) as {
      latestValidationAttempt: { status: string };
      latestSuccessfulValidation: { status: string };
      latestPlanValidation: { status: string };
      latestSuccessfulPlanValidation: { status: string };
    };
    expect(session.latestValidationAttempt.status).toBe("needs_approval");
    expect(session.latestSuccessfulValidation.status).toBe("aligned");
    expect(session.latestPlanValidation.status).toBe("needs_approval");
    expect(session.latestSuccessfulPlanValidation.status).toBe("aligned");
    expect(observedScope?.expectedPaths).toContain("src/shared/format.ts");
    expect(observedScope?.derivedScope).toContain("src/shared/format.ts");
    expect(observedScope?.explicitScope).toContain("src/users/table.ts");
  });

  it("report ignores stale status.md cleanup guidance after current drift is clean", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);
    writeFileSync(
      join(repo, ".gleip", "status.md"),
      [
        "# Gleip Status",
        "",
        "Remove .gleip session artifacts from the change set, then rerun status.",
        "[LOCAL_ARTIFACT_INCLUDED] cleanup_required: Local Gleip artifact included"
      ].join("\n")
    );

    const output = await runCommand(repo, ["report", "--json"], {
      detectScopeDrift: () => ({
        status: "clean",
        findings: [],
        metrics: {
          filesChanged: 0,
          linesAdded: 0,
          linesDeleted: 0
        },
        summary: "No working tree changes detected."
      })
    });
    const report = JSON.parse(output.join("\n")) as {
      risk: { drift: string };
      warnings: Array<{ id: string; message: string; suggestedAction: string | null }>;
    };

    expect(report.risk.drift).toBe("none");
    expect(report.warnings.map((warning) => warning.id)).not.toContain("LOCAL_ARTIFACT_INCLUDED");
    expect(report.warnings.map((warning) => warning.id)).not.toContain("output.tests-missing");
    expect(report.warnings.map((warning) => warning.id)).not.toContain("output.risks-missing");
    expect(JSON.stringify(report.warnings)).not.toContain("Remove .gleip session artifacts");
  });

  it("report uses accepted scope while latest failed validation remains workflow guidance", async () => {
    const repo = createTempRepo();
    let observedScope:
      | { expectedPaths?: string[]; derivedScope?: string[]; explicitScope?: string[] }
      | undefined;
    await runCommand(repo, ["preflight", "Update the user table and shared formatter"]);
    await runCommand(
      repo,
      ["validate-plan", "Update src/users/table.ts and src/shared/format.ts"],
      {
        validateAgentPlan: (input) => ({
          status: "aligned",
          findings: [],
          summary: "Plan is aligned.",
          nextAction: "Implement the plan.",
          parsedPlan: {
            rawText: input.planText,
            proposedFiles: ["src/users/table.ts", "src/shared/format.ts"],
            contextFiles: [],
            outputFiles: [],
            proposedDependencies: [],
            proposedTests: [],
            mentionedRiskyAreas: [],
            mentionsCiChanges: false,
            mentionsNewDependencies: false,
            mentionsTestWeakening: false,
            mentionsBroadRefactor: false
          },
          targetClassifications: [
            {
              target: "src/users/table.ts",
              classification: "direct",
              reason: "Target matches explicit task scope.",
              evidence: "src/users/table.ts"
            },
            {
              target: "src/shared/format.ts",
              classification: "derived",
              reason: "Target is shared by the direct target.",
              evidence: "src/users/table.ts"
            }
          ]
        })
      }
    );
    await runCommand(repo, ["validate-plan", "Update package.json and scripts/release.ts"], {
      validateAgentPlan: (input) => ({
        status: "needs_approval",
        findings: [
          {
            severity: "approval_required",
            title: "Approval required",
            message: "Dependency and release changes need explicit approval."
          }
        ],
        summary: "Plan needs approval.",
        nextAction: "Request approval.",
        parsedPlan: {
          rawText: input.planText,
          proposedFiles: ["package.json", "scripts/release.ts"],
          contextFiles: [],
          outputFiles: [],
          proposedDependencies: [],
          proposedTests: [],
          mentionedRiskyAreas: [],
          mentionsCiChanges: false,
          mentionsNewDependencies: true,
          mentionsTestWeakening: false,
          mentionsBroadRefactor: false
        }
      })
    });

    const output = await runCommand(repo, ["report", "--json"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["src/shared/format.ts"],
          fileStats: [
            { path: "src/shared/format.ts", added: 2, deleted: 0, diffFingerprint: "shared" }
          ],
          totalLinesAdded: 2
        }),
      detectScopeDrift: ({ scopeBudget }) => {
        observedScope = scopeBudget;

        return {
          status: "clean",
          findings: [],
          metrics: {
            filesChanged: 1,
            linesAdded: 2,
            linesDeleted: 0
          },
          summary: "Accepted plan target remains in scope."
        };
      }
    });
    const report = JSON.parse(output.join("\n")) as {
      summary: { unplannedFiles: number };
      warnings: Array<{ id: string; message: string; reason: string }>;
    };

    expect(observedScope?.expectedPaths).toContain("src/shared/format.ts");
    expect(observedScope?.derivedScope).toContain("src/shared/format.ts");
    expect(report.summary.unplannedFiles).toBe(0);
    expect(report.warnings.map((warning) => warning.id)).toContain("plan.guidance");
    expect(report.warnings.find((warning) => warning.id === "plan.guidance")?.message).toContain(
      "Latest validation attempt is needs_approval"
    );
    expect(report.warnings.find((warning) => warning.id === "plan.guidance")?.reason).toContain(
      "accepted implementation scope"
    );
    expect(report.warnings.map((warning) => warning.id)).not.toContain("plan.unplanned-files");
  });

  it("report drops stale failed-validation guidance after a later successful plan", async () => {
    const repo = createTempRepo();
    let observedScope: { expectedPaths?: string[]; explicitScope?: string[] } | undefined;
    await runCommand(repo, ["preflight", "Update the user table and shared formatter"]);
    await runCommand(
      repo,
      ["validate-plan", "Update src/users/table.ts and src/shared/format.ts"],
      {
        validateAgentPlan: (input) => ({
          status: "aligned",
          findings: [],
          summary: "Plan is aligned.",
          nextAction: "Implement the plan.",
          parsedPlan: {
            rawText: input.planText,
            proposedFiles: ["src/users/table.ts", "src/shared/format.ts"],
            contextFiles: [],
            outputFiles: [],
            proposedDependencies: [],
            proposedTests: [],
            mentionedRiskyAreas: [],
            mentionsCiChanges: false,
            mentionsNewDependencies: false,
            mentionsTestWeakening: false,
            mentionsBroadRefactor: false
          }
        })
      }
    );
    await runCommand(repo, ["validate-plan", "Update package.json"], {
      validateAgentPlan: (input) => ({
        status: "needs_approval",
        findings: [
          {
            severity: "approval_required",
            title: "Approval required",
            message: "Dependency metadata needs explicit approval."
          }
        ],
        summary: "Plan needs approval.",
        nextAction: "Request approval.",
        parsedPlan: {
          rawText: input.planText,
          proposedFiles: ["package.json"],
          contextFiles: [],
          outputFiles: [],
          proposedDependencies: [],
          proposedTests: [],
          mentionedRiskyAreas: [],
          mentionsCiChanges: false,
          mentionsNewDependencies: true,
          mentionsTestWeakening: false,
          mentionsBroadRefactor: false
        }
      })
    });
    await runCommand(repo, ["validate-plan", "Update docs/release-notes.md"], {
      validateAgentPlan: (input) => ({
        status: "aligned",
        findings: [],
        summary: "Replacement plan is aligned.",
        nextAction: "Implement the replacement plan.",
        parsedPlan: {
          rawText: input.planText,
          proposedFiles: ["docs/release-notes.md"],
          contextFiles: [],
          outputFiles: [],
          proposedDependencies: [],
          proposedTests: [],
          mentionedRiskyAreas: [],
          mentionsCiChanges: false,
          mentionsNewDependencies: false,
          mentionsTestWeakening: false,
          mentionsBroadRefactor: false
        },
        targetClassifications: [
          {
            target: "docs/release-notes.md",
            classification: "direct",
            reason: "Target matches explicit replacement scope.",
            evidence: "docs/release-notes.md"
          }
        ]
      })
    });

    const output = await runCommand(repo, ["report", "--json"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["docs/release-notes.md"],
          fileStats: [
            { path: "docs/release-notes.md", added: 2, deleted: 0, diffFingerprint: "docs" }
          ],
          totalLinesAdded: 2
        }),
      detectScopeDrift: ({ scopeBudget }) => {
        observedScope = scopeBudget;

        return {
          status: "clean",
          findings: [],
          metrics: {
            filesChanged: 1,
            linesAdded: 2,
            linesDeleted: 0
          },
          summary: "Replacement plan target remains in scope."
        };
      }
    });
    const report = JSON.parse(output.join("\n")) as {
      warnings: Array<{ id: string; message: string }>;
    };

    expect(report.warnings.map((warning) => warning.id)).not.toContain("plan.guidance");
    expect(JSON.stringify(report.warnings)).not.toContain("needs_approval");
    expect(observedScope?.expectedPaths).toContain("docs/release-notes.md");
    expect(observedScope?.expectedPaths).not.toContain("src/shared/format.ts");
  });

  it("report generates report.json and report.md", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["report"]);
    const report = JSON.parse(readFileSync(join(repo, ".gleip", "report.json"), "utf8")) as {
      finalResponse: { markdown: string; unresolvedWarnings: number };
      schemaVersion: string;
      scores: { scopeAdherence: number };
      warnings: Array<{ message: string; reason: string; evidence: string[]; severity: string }>;
    };
    const markdown = readFileSync(join(repo, ".gleip", "report.md"), "utf8");

    expect(output.join("\n")).toContain("Gleip report ready · output discipline:");
    expect(output.join("\n")).toContain("Report: .gleip/report.md");
    expect(output.join("\n").split("\n")).toHaveLength(3);
    expect(report.schemaVersion).toBe("1.3.0");
    expect(report.scores.scopeAdherence).toBeGreaterThanOrEqual(0);
    expect(report.finalResponse.markdown).toContain("### Gleip");
    expect(report.finalResponse.markdown).toContain("Canonical requirements:");
    expect(report.finalResponse.markdown.split("\n")).toHaveLength(8);
    expect(markdown).toContain("# Gleipnir Session Report");
    expect(markdown).toContain("Estimated removable text:");
    expect(markdown).toContain("## Canonical requirements");
    expect(markdown).toContain("## Recommended final response");
    expect(markdown).toContain("do not paste the full report");
    for (const warning of report.warnings) {
      expect(warning.message.length).toBeGreaterThan(0);
      expect(warning.reason.length).toBeGreaterThan(0);
      expect(warning.evidence.length).toBeGreaterThan(0);
      expect(["info", "low", "medium", "high"]).toContain(warning.severity);
    }
  });

  it("report --json prints stable JSON and writes both artifacts", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add CSV export to users table"]);

    const output = await runCommand(repo, ["report", "--json"]);
    const report = JSON.parse(output.join("\n")) as {
      version: string;
      generatedAt: string;
      summary: { filesChanged: number };
    };

    expect(output).toHaveLength(1);
    expect(output[0]?.trimStart().startsWith("{")).toBe(true);
    expect(output.join("\n")).not.toContain("Gleip report ready");
    expect(report.version).toBe("1.2.0");
    expect(report.generatedAt).toBe("2026-05-30T00:00:00.000Z");
    expect(report.summary.filesChanged).toBe(0);
    expect(existsSync(join(repo, ".gleip", "report.json"))).toBe(true);
    expect(existsSync(join(repo, ".gleip", "report.md"))).toBe(true);
  });

  it("report handles missing .gleip artifacts without crashing", async () => {
    const repo = createTempRepo();

    const output = await runCommand(repo, ["report", "--json"]);
    const report = JSON.parse(output.join("\n")) as {
      sessionId: string | null;
      warnings: Array<{ id: string }>;
      summary: { filesChanged: number };
    };

    expect(report.sessionId).toBeNull();
    expect(report.summary.filesChanged).toBe(0);
    expect(report.warnings.map((warning) => warning.id)).toContain("artifact.missing.session-json");
    expect(existsSync(join(repo, ".gleip", "report.json"))).toBe(true);
  });

  it("report handles a clean repository with no diff", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Document a label change"]);

    const output = await runCommand(repo, ["report", "--json"], {
      collectWorkingTreeDiff: () => diffContext()
    });
    const report = JSON.parse(output.join("\n")) as {
      risk: { drift: string; overEdit: string };
      summary: { filesChanged: number };
    };

    expect(report.summary.filesChanged).toBe(0);
    expect(report.risk.drift).toBe("none");
    expect(report.risk.overEdit).toBe("none");
  });

  it("report identifies unplanned file changes", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Add a focused parser"]);
    await runCommand(repo, ["validate-plan", "Update src/planned.ts"], {
      validateAgentPlan: (input) => ({
        status: "approved",
        findings: [],
        summary: "Plan is approved.",
        nextAction: "Proceed.",
        parsedPlan: {
          rawText: input.planText,
          proposedFiles: ["src/planned.ts"],
          contextFiles: [],
          proposedDependencies: [],
          proposedTests: [],
          mentionedRiskyAreas: [],
          mentionsCiChanges: false,
          mentionsNewDependencies: false,
          mentionsTestWeakening: false,
          mentionsBroadRefactor: false
        }
      })
    });

    const output = await runCommand(repo, ["report", "--json"], {
      collectWorkingTreeDiff: () =>
        diffContext({
          changedFiles: ["src/unplanned.ts"],
          fileStats: [{ path: "src/unplanned.ts", added: 1, deleted: 0 }],
          rawDiff:
            "diff --git a/src/unplanned.ts b/src/unplanned.ts\n--- a/src/unplanned.ts\n+++ b/src/unplanned.ts\n+change\n",
          totalLinesAdded: 1,
          hasChanges: true
        })
    });
    const report = JSON.parse(output.join("\n")) as {
      summary: { unplannedFiles: number };
      warnings: Array<{ id: string }>;
    };

    expect(report.summary.unplannedFiles).toBe(1);
    expect(report.warnings.map((warning) => warning.id)).toContain("plan.unplanned-files");
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
    expect(json.status).toBe("clean");
    expect(json.baseline.hasBaseline).toBe(true);
    expect(json.baseline.sessionFilesChanged).toBe(0);
    expect(json.metrics.linesAdded).toBe(2);
    expect(json.findings).toEqual([]);
    expect(json.nextAction).toContain("focused verification");
  });

  it("compress, retrieve, and stats handle execution evidence locally", async () => {
    const repo = createTempRepo();
    const original = [
      ...Array.from({ length: 150 }, (_, index) => `PASS tests/example-${index % 5}.test.ts`),
      "FAIL tests/parser.test.ts > keeps the failure visible",
      "AssertionError: expected true to be false"
    ].join("\n");

    const compressOutput = await runCommand(repo, ["compress", "--type", "test_output"], {
      readStdin: () => original
    });
    const rendered = compressOutput.join("\n");
    const reference = /sha256:[0-9a-f]{64}/u.exec(rendered)?.[0];

    expect(rendered).toContain("[Gleip compressed test_output");
    expect(rendered).toContain("FAIL tests/parser.test.ts");
    expect(reference).toBeDefined();

    const retrieved = await runCommand(repo, ["retrieve", reference!]);
    expect(retrieved.join("\n")).toBe(original);

    const statsOutput = await runCommand(repo, ["stats", "--json"]);
    const stats = JSON.parse(statsOutput.join("\n")) as {
      objectCount: number;
      retrievalCalls: number;
      grossEstimatedTokensRemoved: number;
    };
    expect(stats.objectCount).toBe(1);
    expect(stats.retrievalCalls).toBe(1);
    expect(stats.grossEstimatedTokensRemoved).toBeGreaterThan(0);
  });

  it("compression audit keeps active task-contract artifacts as passthrough", async () => {
    const repo = createTempRepo();
    const output = await runCommand(
      repo,
      ["compress", "--artifact-type", "canonical_task", "--audit", "--json"],
      {
        readStdin: () =>
          JSON.stringify({ authority: "canonical", effectiveContent: "Keep the task exact." })
      }
    );
    const audit = JSON.parse(output.join("\n")) as {
      auditOnly: boolean;
      classification: { contentClass: string };
      passthroughReasons: string[];
      output?: string;
    };

    expect(audit.auditOnly).toBe(true);
    expect(audit.classification.contentClass).toBe("canonical_task");
    expect(audit.passthroughReasons).toContain("protected_authority_passthrough");
    expect(audit.output).toBeUndefined();
  });

  // M3: audit mode marked content as passthrough before metrics were computed, so it reported
  // zero savings even for output that compresses by ~86 %. Audit mode exists to answer "what
  // would this save?", so it has to measure.
  it("compression audit reports the savings compression would achieve", async () => {
    const repo = createTempRepo();
    const lines = Array.from(
      { length: 120 },
      (_unused, index) => ` ✓ src/suite-${index}.test.ts (4 tests) 12ms`
    );
    lines.push(" FAIL src/cart.test.ts > applies SAVE10 once");
    lines.push("AssertionError: expected 90 to be 81");
    lines.push("    at src/cart.test.ts:12:20");
    lines.push("      Tests  1 failed | 480 passed (481)");
    const payload = lines.join("\n");

    const readMetrics = async (args: string[]): Promise<Record<string, number>> => {
      const output = await runCommand(repo, args, { readStdin: () => payload });
      const parsed = JSON.parse(output.join("\n")) as {
        metrics: Record<string, number>;
        passthroughReasons?: string[];
        compressed?: boolean;
      };
      return parsed.metrics;
    };

    const audited = await readMetrics(["compress", "--type", "test_output", "--audit", "--json"]);
    const compressed = await readMetrics(["compress", "--type", "test_output", "--json"]);

    expect(audited.netEstimatedTokensSaved).toBeGreaterThan(0);
    expect(audited.grossEstimatedTokensRemoved).toBeGreaterThan(0);
    // A projection, so it need only be close to what compression actually achieves.
    expect(
      Math.abs(
        (audited.netEstimatedTokensSaved ?? 0) - (compressed.netEstimatedTokensSaved ?? 0)
      ) / (compressed.netEstimatedTokensSaved ?? 1)
    ).toBeLessThan(0.1);
  });

  it("run wraps local command output and preserves the child exit code", async () => {
    const repo = createTempRepo();
    const script = [
      "for (let index = 0; index < 150; index += 1) console.log(`PASS wrapped-${index % 4}.test.ts`);",
      "console.log('FAIL wrapped.test.ts > keeps diagnostics');",
      "process.exit(7);"
    ].join(" ");
    const result = await runCommandResult(repo, [
      "run",
      "--type",
      "test_output",
      "--",
      process.execPath,
      "-e",
      script
    ]);

    expect(result.exitCode).toBe(7);
    expect(result.output.join("\n")).toContain("[Gleip compressed test_output");
    expect(result.output.join("\n")).toContain("FAIL wrapped.test.ts");
    const activeRun = JSON.parse(readFileSync(join(repo, ".gleip", "active-run.json"), "utf8")) as {
      runId: string;
    };
    const events = readFileSync(
      join(repo, ".gleip", "runs", activeRun.runId, "events.jsonl"),
      "utf8"
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; payload: Record<string, unknown> });
    const command = events.find((event) => event.type === "command_completed")?.payload
      .evidence as {
      payload: { exitCode: number; fullOutputStored: boolean; stdoutDigest: string };
    };

    expect(command.payload.exitCode).toBe(7);
    expect(command.payload.fullOutputStored).toBe(true);
    expect(command.payload.stdoutDigest).toMatch(/^sha256:/u);
  });

  it("resolves bare command names through PATH", async () => {
    const repo = createTempRepo();
    const result = await runCommandResult(repo, ["run", "--", "git", "--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.output.join("\n")).toContain("git version");
  });

  it("runs npm-family shims that are .cmd files on Windows", async () => {
    // C2 regression: `npm`/`npx`/`pnpm` are .cmd shims on Windows. A bare spawnSync cannot find
    // them (ENOENT), and spawning the resolved .cmd with shell:false is refused outright
    // (EINVAL, the CVE-2024-27980 mitigation). Both failures disabled context compression and
    // command attestation on the project's primary development platform.
    const repo = createTempRepo();
    const result = await runCommandResult(repo, ["run", "--", "npm", "--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.output.join("\n")).toMatch(/\d+\.\d+\.\d+/u);
  });

  it("preserves argument boundaries and metacharacters through a batch shim", async () => {
    const repo = createTempRepo();
    const isWindows = process.platform === "win32";
    const shimPath = join(repo, isWindows ? "echo-args.cmd" : "echo-args.sh");
    const printer = "console.log(process.argv.slice(1).join('~'))";

    writeFileSync(
      shimPath,
      isWindows
        ? `@echo off\r\n"${process.execPath}" -e "${printer}" %*\r\n`
        : `#!/bin/sh\n"${process.execPath}" -e "${printer}" "$@"\n`,
      { mode: 0o755 }
    );

    const result = await runCommandResult(repo, [
      "run",
      "--",
      shimPath,
      "hello world",
      "a&b",
      "%PATH%"
    ]);

    // Spaces stay inside one argument and shell metacharacters stay inert and unexpanded --
    // the guarantee `shell: true` would not provide.
    expect(result.exitCode).toBe(0);
    expect(result.output.join("\n")).toContain("hello world~a&b~%PATH%");
  });

  it("attests repository changes that occur during a wrapped command", async () => {
    const repo = createTempRepo();
    let inspection = 0;
    await runCommand(repo, ["run", "--", process.execPath, "-e", "process.stdout.write('ok')"], {
      collectWorkingTreeDiff: () => {
        inspection += 1;
        return inspection === 1
          ? diffContext()
          : diffContext({
              changedFiles: ["src/changed.ts"],
              fileStats: [{ path: "src/changed.ts", added: 1, deleted: 0 }],
              rawDiff: "+change\n",
              totalLinesAdded: 1,
              hasChanges: true
            });
      }
    });
    const activeRun = JSON.parse(readFileSync(join(repo, ".gleip", "active-run.json"), "utf8")) as {
      runId: string;
    };
    const events = readFileSync(
      join(repo, ".gleip", "runs", activeRun.runId, "events.jsonl"),
      "utf8"
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; payload: Record<string, unknown> });
    const command = events.find((event) => event.type === "command_completed")?.payload
      .evidence as {
      payload: { repositoryFingerprintBefore: string; repositoryFingerprintAfter: string };
    };

    expect(command.payload.repositoryFingerprintAfter).not.toBe(
      command.payload.repositoryFingerprintBefore
    );
  });

  it("records, replays, revokes, and invalidates explicit approvals", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Update src/index.ts and its focused test"]);
    const approvalOutput = await runCommand(repo, [
      "approve",
      "--actor",
      "reviewer@example.test",
      "--reason",
      "Reviewed protected change",
      "--scope",
      "PROTECTED_PATH_CHANGED",
      "--path",
      "src/index.ts",
      "--json"
    ]);
    const approval = JSON.parse(approvalOutput.join("\n")) as { id: string; state: string };

    expect(approval.state).toBe("active");
    const replayOutput = await runCommand(repo, ["replay", "--json"]);
    const replay = JSON.parse(replayOutput.join("\n")) as { approvals: Array<{ id: string }> };
    expect(replay.approvals.map((item) => item.id)).toContain(approval.id);

    const revokedOutput = await runCommand(repo, ["revoke-approval", approval.id, "--json"]);
    expect(JSON.parse(revokedOutput.join("\n"))).toMatchObject({
      id: approval.id,
      state: "revoked"
    });
  });

  it("creates one exact-state final evidence bundle as the primary completion artifact", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Update src/index.ts and its focused test"]);
    const output = await runCommand(repo, ["finalize", "--json"]);
    const result = JSON.parse(output.join("\n")) as {
      bundle: {
        id: string;
        runId: string;
        completionStatus: string;
        repository: { fingerprint: string };
      };
    };
    const stored = JSON.parse(
      readFileSync(
        join(repo, ".gleip", "runs", result.bundle.runId, "final", "latest.json"),
        "utf8"
      )
    ) as typeof result.bundle;

    expect(result.bundle.completionStatus).toBe("complete");
    expect(stored).toEqual(result.bundle);
    expect(stored.repository.fingerprint).toMatch(/^[0-9a-f]{64}$/u);
  });

  // C3: `finalize` is the designated completion authority but derived hazards from a fixed list
  // of drift codes only, so it reported "complete, 0 hazards, exit 0" on the same state where
  // `report` found a HIGH prohibited violation. The two surfaces must not be able to disagree.
  it("blocks completion when a prohibited path was changed", async () => {
    const repo = createGitRepo();
    writeRepoFile(repo, "src/cart.ts", "export const discount = (total: number) => total;\n");
    writeRepoFile(repo, "src/persistence.ts", "export const save = () => {};\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-m", "base"]);

    await runRealCommand(repo, [
      "preflight",
      "Fix the discount function in src/cart.ts. Do not change src/persistence.ts."
    ]);
    writeRepoFile(repo, "src/cart.ts", "export const discount = (total: number) => total * 0.9;\n");
    writeRepoFile(repo, "src/persistence.ts", "export const save = () => ({ ok: true });\n");

    const checkResult = await runRealCommandResult(repo, ["check"]);
    const checkOutput = checkResult.output.join("\n");

    expect(checkOutput).toContain("CANONICAL_PROHIBITION_CONFLICT");
    expect(checkOutput).toContain("src/persistence.ts");

    const finalizeResult = await runRealCommandResult(repo, ["finalize", "--json"]);
    const bundle = (
      JSON.parse(finalizeResult.output.join("\n")) as {
        bundle: { completionStatus: string; unresolvedHazards: unknown[] };
      }
    ).bundle;

    expect(bundle.completionStatus).not.toBe("complete");
    expect(bundle.unresolvedHazards.length).toBeGreaterThan(0);
    expect(finalizeResult.exitCode).toBe(1);
  });

  // `gleip run` records an exact-state attestation with an exit code, but the completion gate read
  // `.gleip/status.md` prose instead -- and `finalize` never passed that prose at all, so a passing
  // attested test run left completion blocked on "Required verification evidence is missing".
  describe("verification evidence at completion", () => {
    const setupVerifiableChange = async (repo: string): Promise<void> => {
      writeRepoFile(repo, "src/cart.ts", "export const discount = (total: number) => total;\n");
      writeRepoFile(repo, "src/cart.test.ts", "export const covered = true;\n");
      // Offline scripts, so the attested command's exit code is the only variable under test.
      writeRepoFile(
        repo,
        "package.json",
        `${JSON.stringify(
          {
            name: "fixture",
            private: true,
            version: "1.0.0",
            scripts: {
              test: "node -e \"process.exit(0)\"",
              lint: "node -e \"process.exit(1)\""
            }
          },
          null,
          2
        )}\n`
      );
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-m", "base"]);
      await runRealCommand(repo, ["preflight", "Fix the discount function in src/cart.ts."]);
      writeRepoFile(
        repo,
        "src/cart.ts",
        "export const discount = (total: number) => total * 0.9;\n"
      );
    };

    const finalizeBundle = async (
      repo: string
    ): Promise<{ completionStatus: string; unresolvedHazards: Array<{ code: string }> }> => {
      const result = await runRealCommandResult(repo, ["finalize", "--json"]);

      return (
        JSON.parse(result.output.join("\n")) as {
          bundle: { completionStatus: string; unresolvedHazards: Array<{ code: string }> };
        }
      ).bundle;
    };

    it("accepts a passing attested verification command", async () => {
      const repo = createGitRepo();
      await setupVerifiableChange(repo);

      await runRealCommand(repo, ["run", "--", "node", "-e", "process.exit(0)"]);
      expect(
        (await finalizeBundle(repo)).unresolvedHazards.map((hazard) => hazard.code)
      ).toContain("MISSING_TEST_STRATEGY");

      // A verification command, unlike the bare node invocation above.
      await runRealCommand(repo, ["run", "--", "npm", "test"]);
      const bundle = await finalizeBundle(repo);

      expect(bundle.unresolvedHazards.map((hazard) => hazard.code)).not.toContain(
        "MISSING_TEST_STRATEGY"
      );
    });

    it("does not accept a failing attested verification command", async () => {
      const repo = createGitRepo();
      await setupVerifiableChange(repo);

      await runRealCommandResult(repo, ["run", "--", "npm", "run", "lint"]);
      const bundle = await finalizeBundle(repo);

      expect(bundle.unresolvedHazards.map((hazard) => hazard.code)).toContain(
        "MISSING_TEST_STRATEGY"
      );
    });

    it("does not accept verification that ran before the current changes", async () => {
      const repo = createGitRepo();
      await setupVerifiableChange(repo);

      await runRealCommand(repo, ["run", "--", "npm", "test"]);
      // Change the repository after the attested run; the evidence no longer describes this state.
      writeRepoFile(repo, "src/cart.ts", "export const discount = (total: number) => total * 0.8;\n");
      const bundle = await finalizeBundle(repo);

      expect(bundle.unresolvedHazards.map((hazard) => hazard.code)).toContain(
        "MISSING_TEST_STRATEGY"
      );
    });
  });

  // C4: passive mode rewrote a rejected plan's status to "advisory", which then promoted the
  // plan's targets into accepted scope and stripped them out of readOnlyContextPaths -- so
  // running validate-plan twice changed its own verdict.
  it("does not let plan validation mutate the scope budget it validates against", async () => {
    const repo = createGitRepo();
    writeRepoFile(repo, "src/cart.ts", "export const discount = (total: number) => total;\n");
    writeRepoFile(repo, "src/persistence.ts", "export const save = () => {};\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-m", "base"]);

    await runRealCommand(repo, [
      "preflight",
      "Fix the discount function in src/cart.ts. Do not change src/persistence.ts."
    ]);

    const readBudget = (): string =>
      readFileSync(join(repo, ".gleip", "scope-budget.json"), "utf8");
    const plan =
      "Implementation: update src/cart.ts discount handling and adjust src/persistence.ts storage.\nVerification: run the test suite.\nRisks: low.";

    const budgetBefore = readBudget();
    const first = (await runRealCommandResult(repo, ["validate-plan", plan])).output.join("\n");
    const budgetAfterFirst = readBudget();
    const second = (await runRealCommandResult(repo, ["validate-plan", plan])).output.join("\n");

    expect(budgetAfterFirst).toBe(budgetBefore);
    expect(readBudget()).toBe(budgetBefore);
    expect(second).toBe(first);
  });

  it("keeps long-spec authority, scope, and readiness equivalent after compression activity", async () => {
    const repo = createTempRepo();
    writeRepoFile(
      repo,
      "src/parser.ts",
      "export function parse(value: string) { return value; }\n"
    );
    writeRepoFile(repo, "tests/parser.test.ts", "describe('parser', () => {});\n");
    writeRepoFile(repo, "CHANGELOG.md", "# Changelog\n");
    writeRepoFile(
      repo,
      "task.md",
      [
        "Implement local parser retry evidence for invalid configuration input.",
        "Must modify src/parser.ts.",
        "Must update tests/parser.test.ts.",
        "Must preserve Windows PowerShell path behavior.",
        "Do not add dependencies.",
        "Do not change CI configuration.",
        "Acceptance criteria: invalid parse output includes the retry count and original path.",
        "Release instructions: update CHANGELOG.md with a concise local parser note.",
        "Platform requirements: behavior must remain deterministic on Windows and POSIX paths.",
        "Compatibility requirements: existing JSON configuration remains valid.",
        "Verification: run the focused parser tests and report the result."
      ].join("\n")
    );
    writeRepoFile(
      repo,
      "plan.md",
      [
        "## Files",
        "- src/parser.ts",
        "- tests/parser.test.ts",
        "- CHANGELOG.md",
        "## Implementation",
        "- Add deterministic retry-count evidence to invalid parse output while preserving the original path.",
        "- Keep JSON configuration compatibility and avoid dependency or CI changes.",
        "- Add the concise release note requested by the task.",
        "## Verification",
        "- Run focused parser tests on the final state and report the result."
      ].join("\n")
    );

    await runCommand(repo, ["preflight", "--file", "task.md"]);
    await runCommand(repo, ["validate-plan", "--file", "plan.md"]);

    const canonicalBefore = JSON.parse(
      readFileSync(join(repo, ".gleip", "canonical-task.json"), "utf8")
    );
    const scopeBefore = JSON.parse(readFileSync(join(repo, ".gleip", "scope-budget.json"), "utf8"));
    const sessionBefore = JSON.parse(
      readFileSync(join(repo, ".gleip", "session.json"), "utf8")
    ) as {
      latestPlanValidation: unknown;
    };
    const reportBefore = JSON.parse((await runCommand(repo, ["report", "--json"])).join("\n")) as {
      requirements: unknown;
      risk: unknown;
      scores: unknown;
      summary: unknown;
    };
    const largeOutput = [
      ...Array.from({ length: 160 }, (_, index) => `PASS parser-${index % 4}.test.ts`),
      "FAIL parser.test.ts > invalid input includes retry count",
      "AssertionError: expected retry count evidence"
    ].join("\n");
    const compressed = (
      await runCommand(repo, ["compress", "--type", "test_output"], {
        readStdin: () => largeOutput
      })
    ).join("\n");
    const reference = /sha256:[0-9a-f]{64}/u.exec(compressed)?.[0];

    expect(reference).toBeDefined();
    expect((await runCommand(repo, ["retrieve", reference!])).join("\n")).toBe(largeOutput);

    const canonicalAfter = JSON.parse(
      readFileSync(join(repo, ".gleip", "canonical-task.json"), "utf8")
    );
    const scopeAfter = JSON.parse(readFileSync(join(repo, ".gleip", "scope-budget.json"), "utf8"));
    const sessionAfter = JSON.parse(readFileSync(join(repo, ".gleip", "session.json"), "utf8")) as {
      latestPlanValidation: unknown;
    };
    const reportAfter = JSON.parse((await runCommand(repo, ["report", "--json"])).join("\n")) as {
      requirements: unknown;
      risk: unknown;
      scores: unknown;
      summary: unknown;
    };

    expect(canonicalAfter.contentHash).toBe(canonicalBefore.contentHash);
    expect(canonicalAfter.effectiveContent).toBe(canonicalBefore.effectiveContent);
    expect(canonicalAfter.revisions).toEqual(canonicalBefore.revisions);
    expect(canonicalAfter.requirementLedger.requirements).toEqual(
      canonicalBefore.requirementLedger.requirements
    );
    expect(scopeAfter).toEqual(scopeBefore);
    expect(sessionAfter.latestPlanValidation).toEqual(sessionBefore.latestPlanValidation);
    expect(reportAfter.scores).toEqual(reportBefore.scores);
    expect(reportAfter.risk).toEqual(reportBefore.risk);
    expect(reportAfter.requirements).toEqual(reportBefore.requirements);
    expect(reportAfter.summary).toEqual(reportBefore.summary);
  });

  it("status artifacts include phase metadata", async () => {
    const repo = createTempRepo();
    await runCommand(repo, ["preflight", "Update README.md"]);

    const status = readFileSync(join(repo, ".gleip", "status.md"), "utf8");
    const jsonOutput = await runCommand(repo, ["status", "--json"]);
    const json = JSON.parse(jsonOutput.join("\n")) as {
      artifact: { phase: string; currentArtifact: string };
    };

    expect(status).toContain("- Phase: preflight");
    expect(json.artifact.phase).toBe("verification");
    expect(json.artifact.currentArtifact).toBe(".gleip/status.md");
  });

  it("loads old sessions without profile metadata and writes current report metadata", async () => {
    const repo = createTempRepo();
    mkdirSync(join(repo, ".gleip"), { recursive: true });
    writeRepoFile(
      repo,
      ".gleip/session.json",
      JSON.stringify(
        {
          version: 1,
          sessionId: "session-old",
          task: "Fix runtime behavior",
          classification: {
            taskType: "bug_fix",
            confidence: "high",
            riskLevel: "medium",
            reasons: [],
            likelyRequiresTests: true,
            likelyAllowsNewDependencies: false
          },
          scopeBudgetSummary: {
            expectedFilesChanged: { min: 1, max: 4 },
            softLimits: { maxFilesChanged: 5, maxLinesAdded: 100, maxLinesDeleted: 100 },
            hardGates: {
              newDependenciesAllowed: false,
              ciChangesAllowed: false,
              skippedTestsAllowed: false,
              deletedTestsAllowed: false,
              secretsAllowed: false
            },
            approvalRequiredCount: 0,
            blockedWithoutApprovalCount: 0,
            requiredTests: true,
            stopConditionsCount: 0
          },
          created_at: "2026-05-30T00:00:00.000Z",
          updated_at: "2026-05-30T00:00:00.000Z"
        },
        null,
        2
      ) + "\n"
    );

    const output = await runCommand(repo, ["report", "--json"]);
    const report = JSON.parse(output.join("\n")) as {
      artifact: { phase: string; currentArtifact: string };
      sessionId: string;
    };

    expect(report.sessionId).toBe("session-old");
    expect(report.artifact.phase).toBe("final");
    expect(report.artifact.currentArtifact).toBe(".gleip/report.json");
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

  it("uninstall removes Gleip-owned repository files and generated agent files", async () => {
    const repo = createTempRepo();
    await initAllTargets(repo);

    const output = await runCommand(repo, ["uninstall"]);

    expect(existsSync(join(repo, ".gleip"))).toBe(false);
    expect(existsSync(join(repo, ".gleip.yml"))).toBe(false);
    expect(existsSync(join(repo, "GLEIP.md"))).toBe(false);
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(repo, "GEMINI.md"))).toBe(false);
    expect(output.join("\n")).toContain(
      "Next: run `npm uninstall gleip` to remove the package dependency."
    );
  });

  it("real uninstall preserves unknown .gleip files and removes the managed ignore block", async () => {
    const repo = createGitRepo();
    writeRepoFile(repo, ".gitignore", "node_modules/\n");
    await runRealCommand(repo, ["init"]);
    writeRepoFile(repo, ".gleip/manual-note.txt", "manual\n");

    const output = await runRealCommand(repo, ["uninstall"]);

    expect(output.join("\n")).toContain("Gleip repository cleanup complete.");
    expect(existsSync(join(repo, ".gleip", "manual-note.txt"))).toBe(true);
    expect(existsSync(join(repo, ".gleip", "state.json"))).toBe(false);
    expect(readFileSync(join(repo, ".gitignore"), "utf8")).toBe("node_modules/\n");
  });

  it("real reinstall through init restores a clean repository lifecycle after uninstall", async () => {
    const repo = createGitRepo();

    await runRealCommand(repo, ["init"]);
    await runRealCommand(repo, ["uninstall"]);
    await runRealCommand(repo, ["init"]);

    expect(existsSync(join(repo, ".gleip", "state.json"))).toBe(true);
    expect(git(repo, ["ls-files", "--", ".gleip"])).toBe("");
    expect(gitSucceeds(repo, ["check-ignore", "--quiet", "--no-index", ".gleip/state.json"])).toBe(
      true
    );
  });

  it("uninstall removes managed sections while preserving unrelated agent instructions", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "AGENTS.md", "# Existing Agent Rules\n\nKeep agent content.\n");
    writeRepoFile(repo, "CLAUDE.md", "# Existing Claude Rules\n\nKeep Claude content.\n");
    writeRepoFile(repo, "GEMINI.md", "# Existing Gemini Rules\n\nKeep Gemini content.\n");
    await initAllTargets(repo);

    await runCommand(repo, ["uninstall"]);

    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    const claude = readFileSync(join(repo, "CLAUDE.md"), "utf8");
    const gemini = readFileSync(join(repo, "GEMINI.md"), "utf8");
    expect(agents).toContain("Keep agent content.");
    expect(agents).not.toContain("<!-- GLEIP:START -->");
    expect(claude).toContain("Keep Claude content.");
    expect(claude).not.toContain("<!-- GLEIP:START -->");
    expect(gemini).toContain("Keep Gemini content.");
    expect(gemini).not.toContain("<!-- GLEIP:START -->");
  });

  it("uninstall removes the managed block from a Gemini file with unrelated content", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "GEMINI.md", "# Existing Gemini Rules\n\nKeep this rule.\n");
    await runCommand(repo, ["init", "gemini"]);

    const output = await runCommand(repo, ["uninstall"]);

    expect(readFileSync(join(repo, "GEMINI.md"), "utf8")).toContain("Keep this rule.");
    expect(output.join("\n")).toContain("Files whose Gleip section would be removed:");
    expect(output.join("\n")).toContain("- GEMINI.md");
  });

  it("uninstall --keep-agent-files preserves all agent files", async () => {
    const repo = createTempRepo();
    await initAllTargets(repo);
    const agentsBefore = readFileSync(join(repo, "AGENTS.md"), "utf8");
    const claudeBefore = readFileSync(join(repo, "CLAUDE.md"), "utf8");
    const geminiBefore = readFileSync(join(repo, "GEMINI.md"), "utf8");

    await runCommand(repo, ["uninstall", "--keep-agent-files"]);

    expect(existsSync(join(repo, ".gleip"))).toBe(false);
    expect(existsSync(join(repo, ".gleip.yml"))).toBe(false);
    expect(existsSync(join(repo, "GLEIP.md"))).toBe(false);
    expect(readFileSync(join(repo, "AGENTS.md"), "utf8")).toBe(agentsBefore);
    expect(readFileSync(join(repo, "CLAUDE.md"), "utf8")).toBe(claudeBefore);
    expect(readFileSync(join(repo, "GEMINI.md"), "utf8")).toBe(geminiBefore);
  });

  it("uninstall --dry-run reports actions without changing files", async () => {
    const repo = createTempRepo();
    writeRepoFile(repo, "AGENTS.md", "# Existing Rules\n\nKeep this.\n");
    await initAllTargets(repo);
    const agentsBefore = readFileSync(join(repo, "AGENTS.md"), "utf8");

    const output = await runCommand(repo, ["uninstall", "--dry-run"]);
    const report = output.join("\n");

    expect(report).toContain("Gleip uninstall dry run. No files changed.");
    expect(report).toContain("Files/directories to remove:");
    expect(report).toContain("Files whose Gleip section would be removed:");
    expect(report).toContain("Files skipped/preserved:");
    expect(report).toContain("- .gleip");
    expect(report).toContain("- AGENTS.md");
    expect(existsSync(join(repo, ".gleip"))).toBe(true);
    expect(existsSync(join(repo, ".gleip.yml"))).toBe(true);
    expect(existsSync(join(repo, "GLEIP.md"))).toBe(true);
    expect(readFileSync(join(repo, "AGENTS.md"), "utf8")).toBe(agentsBefore);
    expect(existsSync(join(repo, "GEMINI.md"))).toBe(true);
  });

  it("uninstall respects --cwd", async () => {
    const processCwd = createTempRepo();
    const targetCwd = createTempRepo();
    await runCommand(processCwd, ["--cwd", targetCwd, "init"]);
    await runCommand(processCwd, ["--cwd", targetCwd, "init", "claude"]);
    await runCommand(processCwd, ["--cwd", targetCwd, "init", "gemini"]);

    await runCommand(processCwd, ["--cwd", targetCwd, "uninstall"]);

    expect(existsSync(join(targetCwd, ".gleip"))).toBe(false);
    expect(existsSync(join(targetCwd, ".gleip.yml"))).toBe(false);
    expect(existsSync(join(targetCwd, "GLEIP.md"))).toBe(false);
    expect(existsSync(join(processCwd, ".gleip"))).toBe(false);
  });

  it("uninstall is idempotent when Gleip files are already absent", async () => {
    const repo = createTempRepo();

    const firstOutput = await runCommand(repo, ["uninstall"]);
    const secondOutput = await runCommand(repo, ["uninstall", "--force"]);

    expect(firstOutput.join("\n")).toContain(".gleip (not found)");
    expect(secondOutput.join("\n")).toContain("Gleip repository cleanup complete.");
    expect(secondOutput.join("\n")).toContain(
      "Next: run `npm uninstall gleip` to remove the package dependency."
    );
  });
});

function createTempRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "gleip-cli-"));
  tempRepos.push(repo);
  return repo;
}

function createGitRepo(): string {
  const repo = createTempRepo();
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "gleip@example.com"]);
  git(repo, ["config", "user.name", "Gleip Test"]);
  writeRepoFile(repo, "README.md", "base\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "initial"]);
  return repo;
}

function writeRepoFile(repo: string, path: string, content: string): void {
  const filePath = join(repo, path);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

/**
 * Every file under the repo, excluding `.git`, as path -> content hash.
 *
 * Plan mode's guarantee is "no write", not "no write to `.gleip/`": `ensureGleipGitignore` edits
 * the tracked `.gitignore`, and the evidence ledger lives in its own tree. Comparing the whole
 * repository is the only assertion that covers all of it.
 */
function snapshotTree(repo: string): Record<string, string> {
  const snapshot: Record<string, string> = {};

  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    )) {
      if (entry.name === ".git") {
        continue;
      }

      const absolute = join(directory, entry.name);
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;

      if (entry.isDirectory()) {
        walk(absolute, relative);
        continue;
      }

      snapshot[relative] = createHash("sha256").update(readFileSync(absolute)).digest("hex");
    }
  };

  walk(repo, "");

  return snapshot;
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

async function initAllTargets(repo: string): Promise<void> {
  await runCommand(repo, ["init"]);
  await runCommand(repo, ["init", "claude"]);
  await runCommand(repo, ["init", "gemini"]);
}

async function runCommand(
  cwd: string,
  args: string[],
  options: CommandOptions = {}
): Promise<string[]> {
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
    readStdin: () => "",
    setExitCode: () => {},
    stdout: (message) => output.push(message),
    stderr: (message) => output.push(message),
    ...options
  });

  program.exitOverride();
  await program.parseAsync(["node", "gleip", ...args], { from: "node" });
  return output;
}

async function runCommandResult(
  cwd: string,
  args: string[],
  options: CommandOptions = {}
): Promise<{ exitCode: number; output: string[] }> {
  let exitCode = 0;
  const output = await runCommand(cwd, args, {
    ...options,
    setExitCode: (code) => {
      exitCode = code;
    }
  });

  return { exitCode, output };
}

async function runRealCommand(cwd: string, args: string[]): Promise<string[]> {
  return (await runRealCommandResult(cwd, args)).output;
}

async function runRealCommandResult(
  cwd: string,
  args: string[]
): Promise<{ exitCode: number; output: string[] }> {
  let exitCode = 0;
  const output: string[] = [];
  const program = createGleipCommand({
    cwd,
    now: () => new Date("2026-05-30T00:00:00.000Z"),
    readStdin: () => "",
    setExitCode: (code) => {
      exitCode = code;
    },
    stdout: (message) => output.push(message),
    stderr: (message) => output.push(message)
  });

  program.exitOverride();
  await program.parseAsync(["node", "gleip", ...args], { from: "node" });
  return { exitCode, output };
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function gitSucceeds(cwd: string, args: string[]): boolean {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
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
    if (
      !["commander.helpDisplayed", "commander.version"].includes(
        (error as { code?: string }).code ?? ""
      )
    ) {
      throw error;
    }
  }

  return output;
}

function countOccurrences(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}

function assertOnlyInstructionFile(
  repo: string,
  expectedPath: "AGENTS.md" | "CLAUDE.md" | "GEMINI.md"
): void {
  for (const path of ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "CODEX.md"]) {
    expect(existsSync(join(repo, path))).toBe(path === expectedPath);
  }
}

function assertGleipWorkflowInstructions(content: string): void {
  expect(content).toContain("<!-- GLEIP:START -->");
  expect(content).toContain('npx --no-install gleip preflight "<task>"');
  expect(content).toContain('npx --no-install gleip preflight "<user task>"');
  expect(content).toContain("npx --no-install gleip validate-plan");
  expect(content).toContain("npx --no-install gleip check");
  expect(content).toContain("npx --no-install gleip status");
  expect(content).toContain("npx --no-install gleip check --incremental");
  expect(content).toContain("npx --no-install gleip status --compact");
  expect(content).toContain("narrowest existing validation");
  expect(content).toContain("Do not rerun a full validation suite");
  expect(content).toContain("npx --no-install gleip finalize");
  expect(content).toContain("needs_clarification");
  expect(content).toContain("needs_approval");
  expect(content).toContain("treat Gleip guidance as inactive");
  expect(content).toContain("Gleip evidence is unavailable");
  expect(content).not.toContain("Do you want me to continue without Gleip guidance");
  expect(content).toContain("Gleip checklist for every coding task");
  expect(content).toContain("Check `.gleip/state.json`");
  expect(content).toContain(
    "Validate broad or sensitive plans with `npx --no-install gleip validate-plan`"
  );
  expect(content).toContain("Do not edit or commit files under `.gleip/`");
  expect(content).toContain("Address cleanup and action-required findings");
  expect(content).toContain("Keep changes minimal and scoped to the canonical task");
  expect(content).toContain("final evidence bundle");
  expect(content).toContain("## Gleip working standard");
  expect(content).toContain("Think before coding");
  expect(content).toContain("Simplicity first");
  expect(content).toContain("Surgical changes");
  expect(content).toContain("Goal-driven execution");
  expect(content).toContain(
    "Do not assume, hide confusion, or silently choose between ambiguous interpretations."
  );
  expect(content).toContain("<!-- GLEIP:END -->");
}
