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
    "- Modify src/checkout/calculateDiscount.ts",
    "- Add focused tests in src/checkout/calculateDiscount.test.ts",
    ""
  ].join("\n")
);

run("node", [cliEntry, "--help"], repo);
const version = run("node", [cliEntry, "--version"], repo).trim();
run("node", [cliEntry, "--cwd", repo, "init", "--all-agents"], repo);
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
const reportJson = run("node", [cliEntry, "--cwd", repo, "report", "--json"], repo);

for (const path of [
  ".gitignore",
  "AGENTS.md",
  "CLAUDE.md",
  ".cursor/rules/gleip.mdc",
  "GLEIP.md",
  ".gleip.yml",
  ".gleip/session.json",
  ".gleip/brief.md",
  ".gleip/scope-budget.json",
  ".gleip/status.md",
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

if (!validation.includes("Gleip plan check passed · ready to implement within scope")) {
  throw new Error(`Expected approved plan validation, received:\n${validation}`);
}

const report = JSON.parse(reportJson);

if (version !== "0.7.0") {
  throw new Error(`Expected Gleip 0.7.0, received: ${version}`);
}

if (report.schemaVersion !== "1.0.0" || report.version !== "0.7.0") {
  throw new Error(`Expected Gleip 0.7.0 report schema 1.0.0, received:\n${reportJson}`);
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
