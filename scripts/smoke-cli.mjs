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
writeRepoFile("src/features/users/UserTable.tsx", "export function UserTable() { return null; }\n");
writeRepoFile("src/features/users/UserTable.test.tsx", "describe('UserTable', () => {});\n");
writeRepoFile("src/utils/csv.ts", "export function toCsv() { return ''; }\n");
writeRepoFile(
  "plan.md",
  [
    "- Modify src/features/users/UserTable.tsx",
    "- Reuse src/utils/csv.ts",
    "- Add tests in src/features/users/UserTable.test.tsx",
    ""
  ].join("\n")
);

run("node", [cliEntry, "--help"], repo);
run("node", [cliEntry, "--cwd", repo, "init", "--all-agents"], repo);
run("node", [cliEntry, "--cwd", repo, "preflight", "Add CSV export to users table"], repo);
const validation = run("node", [cliEntry, "--cwd", repo, "validate-plan", "--file", join(repo, "plan.md")], repo);
run("node", [cliEntry, "--cwd", repo, "status"], repo);

for (const path of [
  "AGENTS.md",
  "CLAUDE.md",
  ".cursor/rules/gleip.mdc",
  "GLEIP.md",
  ".gleip.yml",
  ".gleip/session.json",
  ".gleip/brief.md",
  ".gleip/scope-budget.json",
  ".gleip/status.md"
]) {
  assertFile(path);
}

if (!validation.includes("Status: approved")) {
  throw new Error(`Expected approved plan validation, received:\n${validation}`);
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
