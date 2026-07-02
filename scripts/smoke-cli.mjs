import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = join(root, "packages", "cli", "dist", "index.js");

if (!existsSync(cliEntry)) {
  throw new Error("Built CLI entrypoint not found. Run `pnpm build` first.");
}

const repo = mkdtempSync(join(tmpdir(), "gleip-smoke-"));

run("git", ["init"], repo);
writeRepoFile(
  "src/checkout/calculateDiscount.ts",
  "export function calculateDiscount(total) { return total; }\n"
);
writeRepoFile(
  "src/checkout/calculateDiscount.test.ts",
  "describe('calculateDiscount', () => {});\n"
);
writeRepoFile(
  "plan.md",
  [
    "- Modify src/checkout/calculateDiscount.ts to fix the checkout discount calculation bug.",
    "- Add focused tests in src/checkout/calculateDiscount.test.ts.",
    "- Do not change payment provider integration or checkout routing.",
    ""
  ].join("\n")
);

run("node", [cliEntry, "--help"], repo);
const version = run("node", [cliEntry, "--version"], repo).trim();
run("node", [cliEntry, "--cwd", repo, "init"], repo);
run("node", [cliEntry, "--cwd", repo, "init", "claude"], repo);
run("node", [cliEntry, "--cwd", repo, "init", "gemini"], repo);
const doctorOutput = run("node", [cliEntry, "--cwd", repo, "doctor"], repo);
run(
  "node",
  [
    cliEntry,
    "--cwd",
    repo,
    "preflight",
    "Fix the checkout discount calculation bug without changing payment provider integration or checkout routing."
  ],
  repo
);
const validation = run(
  "node",
  [cliEntry, "--cwd", repo, "validate-plan", "--file", join(repo, "plan.md")],
  repo
);
run("node", [cliEntry, "--cwd", repo, "status"], repo);
const firstIncremental = JSON.parse(
  run("node", [cliEntry, "--cwd", repo, "check", "--incremental", "--json"], repo)
);
const reusedIncremental = JSON.parse(
  run("node", [cliEntry, "--cwd", repo, "check", "--incremental", "--json"], repo)
);
const compactStatus = run("node", [cliEntry, "--cwd", repo, "status", "--compact"], repo);
const reportJson = run("node", [cliEntry, "--cwd", repo, "report", "--json"], repo);

for (const path of [
  ".gitignore",
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "GLEIP.md",
  ".gleip.yml",
  ".gleip/canonical-task.json",
  ".gleip/session.json",
  ".gleip/brief.md",
  ".gleip/scope-budget.json",
  ".gleip/status.md",
  ".gleip/check-cache.json",
  ".gleip/report.json",
  ".gleip/report.md"
]) {
  assertFile(path);
}

if (
  !doctorOutput.includes("OK   Agent instructions present") ||
  !doctorOutput.includes("OK   Local artifacts ignored")
) {
  throw new Error(`Expected complete setup diagnostics, received:\n${doctorOutput}`);
}

run("git", ["check-ignore", "-q", ".gleip/session.json"], repo);

if (!validation.includes("Gleip plan check aligned with declared task scope")) {
  throw new Error(`Expected aligned plan validation, received:\n${validation}`);
}

if (
  firstIncremental.incremental?.execution !== "executed" ||
  reusedIncremental.incremental?.execution !== "reused" ||
  reusedIncremental.incremental?.efficiency?.checksReused !== 1
) {
  throw new Error("Expected the second identical incremental check to reuse its baseline.");
}

if (!compactStatus.includes("Check necessary: no")) {
  throw new Error(
    `Expected compact status to recognize the current check, received:\n${compactStatus}`
  );
}

const report = JSON.parse(reportJson);

if (version !== "0.8.4") {
  throw new Error(`Expected Gleip 0.8.4, received: ${version}`);
}

if (report.schemaVersion !== "1.3.0" || report.version !== "0.8.4") {
  throw new Error(`Expected Gleip 0.8.4 report schema 1.3.0, received:\n${reportJson}`);
}

if (!report.finalResponse?.markdown?.includes("### Gleip")) {
  throw new Error(`Expected compact final response block, received:\n${reportJson}`);
}

console.log(`CLI smoke test passed in ${repo}`);

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function writeRepoFile(path, content) {
  const absolutePath = join(repo, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function assertFile(path) {
  if (!existsSync(join(repo, path))) {
    throw new Error(`Expected ${path} to exist.`);
  }
}
