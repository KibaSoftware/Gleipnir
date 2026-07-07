import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tarball = join(root, "dist-pack", "gleip-0.9.0.tgz");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

if (!existsSync(tarball)) {
  throw new Error(`Packed tarball not found: ${tarball}`);
}

const repo = mkdtempSync(join(tmpdir(), "gleip-packed-"));

run("git", ["init"], repo);
run(npmCommand, ["init", "-y"], repo);
run(npmCommand, ["install", "--save-dev", tarball], repo);

writeRepoFile(".gitignore", "node_modules/\n");
writeRepoFile("src/foo.ts", "export const foo = true;\n");
writeRepoFile("tests/foo.test.ts", "describe('foo', () => {});\n");
writeRepoFile("src/extra.ts", "export const extra = true;\n");
writeRepoFile("vendor/foo.ts", "export const vendorFoo = true;\n");
writeRepoFile("generated/foo.ts", "export const generatedFoo = true;\n");
writeRepoFile(
  "task.md",
  [
    "# Task contract",
    "",
    "Modify only src/foo.ts and tests/foo.test.ts.",
    "Use Typer for CLI parsing.",
    "Do not add new dependencies.",
    "Run existing tests."
  ].join("\n")
);
writeRepoFile(
  "plan.md",
  [
    "## Files",
    "- src/foo.ts",
    "- tests/foo.test.ts",
    "## Implementation",
    "- Update src/foo.ts using Typer.",
    "## Verification",
    "- Run existing tests."
  ].join("\n")
);
writeRepoFile(
  "expanded-plan.md",
  [
    "## Files",
    "- src/foo.ts",
    "- src/extra.ts",
    "## Implementation",
    "- Update src/foo.ts.",
    "- src/extra.ts is included because it covers the shared behavior; verify with focused tests.",
    "## Verification",
    "- Run focused tests."
  ].join("\n")
);
writeRepoFile("packages/planner/src/index.ts", "export const planner = true;\n");
writeRepoFile("packages/cli/src/index.ts", "export const cli = true;\n");
writeRepoFile("packages/planner/src/index.test.ts", "describe('planner', () => {});\n");
writeRepoFile("packages/cli/package.json", '{"name":"fixture-cli","version":"0.6.0"}\n');
writeRepoFile("docs/release.md", "# Release\n");
writeRepoFile("README.md", "# Fixture\n");
writeRepoFile("CHANGELOG.md", "# Changelog\n");
writeRepoFile("scripts/smoke-cli.mjs", "console.log('smoke');\n");
writeRepoFile("src/routes/home.tsx", "export function Home() { return null; }\n");
writeRepoFile("src/routes/accounts.tsx", "export function Accounts() { return null; }\n");
writeRepoFile("src/layout/shell.tsx", "export function Shell() { return null; }\n");
writeRepoFile("src/table/data-grid.tsx", "export function DataGrid() { return null; }\n");
writeRepoFile("tests/responsive-surfaces.test.tsx", "describe('responsive surfaces', () => {});\n");
writeRepoFile("docs/responsive-surfaces.md", "# Responsive surfaces\n");
writeRepoFile("scripts/release.ts", "export const release = true;\n");
writeRepoFile(
  "broad-task.md",
  [
    "Implement a new local CLI feature spanning planner, CLI, tests, docs, and smoke coverage.",
    "Do not add dependencies, change CI, or publish."
  ].join("\n")
);
writeRepoFile(
  "broad-plan.md",
  [
    "## Files",
    "- packages/planner/src/index.ts",
    "- packages/cli/src/index.ts",
    "- packages/planner/src/index.test.ts",
    "- docs/release.md",
    "- scripts/smoke-cli.mjs",
    "## Implementation",
    "- Implement the feature across the declared planner and CLI areas.",
    "## Verification",
    "- Run lint, typecheck, tests, build, pack, and smoke coverage."
  ].join("\n")
);
writeRepoFile(
  "semantic-task.md",
  [
    "Make all routed surfaces responsive across shared layout primitives, reusable data presentation, relevant tests, and documentation.",
    "Do not alter authentication, persistence, public contracts, calculations, dependencies, CI, or generated files."
  ].join("\n")
);
writeRepoFile(
  "semantic-plan.md",
  [
    "## Files",
    "- src/routes/home.tsx for responsive routed surface behavior.",
    "- src/routes/accounts.tsx for responsive routed surface behavior.",
    "- src/layout/shell.tsx for shared layout primitives.",
    "- src/table/data-grid.tsx for reusable data presentation.",
    "- tests/responsive-surfaces.test.tsx for responsive tests.",
    "- docs/responsive-surfaces.md for documentation.",
    "## Implementation",
    "- Apply the responsive layout behavior across the declared surfaces.",
    "## Verification",
    "- Run responsive surface tests and typecheck."
  ].join("\n")
);
writeRepoFile(
  "semantic-bad-plan.md",
  [
    "Update src/routes/home.tsx for responsive routed surface behavior.",
    "Update scripts/release.ts.",
    "Run responsive tests."
  ].join("\n")
);
writeRepoFile(
  "slash-prose-plan.md",
  [
    "Improve cards/tables/headers behavior.",
    "Review breakpoint/nav behavior.",
    "Handle loading/empty/error states.",
    "Update src/routes/home.tsx for responsive routed surface behavior.",
    "Run responsive tests."
  ].join("\n")
);

assertEqual(runGleip(["--version"], repo).trim(), "0.9.0", "packed version");
runGleip(["init"], repo);
const largeOutput = [
  ...Array.from({ length: 180 }, (_, index) => `PASS packed-${index % 5}.test.ts`),
  "FAIL packed.test.ts > keeps diagnostics",
  "AssertionError: expected packed diagnostics"
].join("\n");
const compressionAudit = JSON.parse(
  runGleip(["compress", "--audit", "--json", "--type", "test_output"], repo, largeOutput)
);
assertEqual(compressionAudit.classification.contentClass, "test_output", "compression audit class");
const compressedOutput = runGleip(["compress", "--type", "test_output"], repo, largeOutput);
const compressionReference = /sha256:[0-9a-f]{64}/u.exec(compressedOutput)?.[0];

if (compressionReference === undefined) {
  throw new Error(`compression output did not include a reference:\n${compressedOutput}`);
}

assertIncludes(compressedOutput, "FAIL packed.test.ts", "compressed diagnostic preservation");
assertEqual(runGleip(["retrieve", compressionReference], repo), largeOutput, "exact retrieval");
writeRepoFile(
  "wrapped-output.mjs",
  [
    "for (let index = 0; index < 160; index += 1) {",
    "  console.log('PASS wrapped-packed.test.ts');",
    "}",
    "console.log('FAIL wrapped-packed.test.ts');"
  ].join("\n")
);
const wrappedOutput = runGleip(
  [
    "run",
    "--type",
    "test_output",
    "--",
    "node",
    "wrapped-output.mjs"
  ],
  repo
);
assertIncludes(wrappedOutput, "[Gleip compressed test_output", "wrapped compression");
const compressionStats = JSON.parse(runGleip(["stats", "--json"], repo));

if (compressionStats.objectCount < 1 || compressionStats.retrievalCalls < 1) {
  throw new Error(`unexpected compression stats: ${JSON.stringify(compressionStats)}`);
}

runGleip(["preflight", "--file", "task.md"], repo);

const canonicalTask = readJson(".gleip/canonical-task.json");
const session = readJson(".gleip/session.json");
const allowedPaths = readJson(".gleip/scope-budget.json").allowedPaths;
const evidencePaths = [
  ...session.repoContext.likelyRelevantFiles.map((entry) => entry.path),
  ...session.repoContext.likelyTestFiles.map((entry) => entry.path),
  ...session.repoContext.existingPatternMatches.map((entry) => entry.path)
];

assertIncludes(canonicalTask.effectiveContent, "Use Typer", "canonical task content");
assertIncludes(session.repoContext.contextFiles, "task.md", "task file context");
assertNotIncludes(allowedPaths, "task.md", "task file editable scope");
assertNotIncludes(evidencePaths, "vendor/foo.ts", "vendor relevance exclusion");
assertNotIncludes(evidencePaths, "generated/foo.ts", "generated relevance exclusion");

const planResult = JSON.parse(runGleip(["validate-plan", "--json", "--file", "plan.md"], repo));
const planCodes = planResult.findings.map((finding) => finding.code);

assertIncludes(planResult.parsedPlan.contextFiles, "plan.md", "plan file context");
assertNotIncludes(planResult.parsedPlan.proposedFiles, "plan.md", "plan file editable scope");
assertIncludes(planCodes, "DEPENDENCY_REQUIREMENT_CONFLICT", "missing dependency conflict");

const expandedResult = JSON.parse(
  runGleip(["validate-plan", "--json", "--file", "expanded-plan.md"], repo)
);
const expandedCodes = expandedResult.findings.map((finding) => finding.code);

assertNotIncludes(
  expandedCodes,
  "SCOPE_EXPANSION_RATIONALE_REQUIRED",
  "specific expansion rationale"
);
assertNotIncludes(expandedCodes, "SCOPE_EXPANSION_RATIONALE_VAGUE", "specific expansion rationale");

runGleip(["preflight", "--file", "broad-task.md"], repo);
const broadBudget = readJson(".gleip/scope-budget.json");
const broadResult = JSON.parse(
  runGleip(["validate-plan", "--json", "--file", "broad-plan.md"], repo)
);
const broadCodes = broadResult.findings.map((finding) => finding.code);

if (broadBudget.softLimits.maxFilesChanged <= 8) {
  throw new Error(
    `declared broad task did not scale the file budget: ${broadBudget.softLimits.maxFilesChanged}`
  );
}
if (broadBudget.hardGates.newDependenciesAllowed !== false) {
  throw new Error("declared task breadth unexpectedly allowed new dependencies");
}
for (const code of [
  "PLAN_SCOPE_OUTSIDE_BUDGET",
  "SCOPE_EXPANSION_RATIONALE_REQUIRED",
  "SCOPE_EXPANSION_RATIONALE_VAGUE",
  "RISKY_CHANGE_RATIONALE_REQUIRED"
]) {
  assertNotIncludes(broadCodes, code, "declared broad task alignment");
}

runGleip(["preflight", "--file", "semantic-task.md"], repo);
const semanticResult = JSON.parse(
  runGleip(["validate-plan", "--json", "--file", "semantic-plan.md"], repo)
);
const semanticCodes = semanticResult.findings.map((finding) => finding.code);
assertNotIncludes(semanticCodes, "SCOPE_EXPANSION_WARN", "semantic broad task alignment");
assertNotIncludes(semanticCodes, "PLAN_SCOPE_EXCEEDS_BUDGET", "semantic broad task file count");

const semanticBadResult = JSON.parse(
  runGleip(["validate-plan", "--json", "--file", "semantic-bad-plan.md"], repo)
);
const semanticBadFindingText = JSON.stringify(semanticBadResult.findings);
if (!semanticBadFindingText.includes("scripts/release.ts [unexplained]")) {
  throw new Error("semantic bad plan did not report the unrelated target classification");
}

const slashProseResult = JSON.parse(
  runGleip(["validate-plan", "--json", "--file", "slash-prose-plan.md"], repo)
);
for (const fakePath of ["cards/tables/headers", "breakpoint/nav", "loading/empty/error"]) {
  assertNotIncludes(
    slashProseResult.parsedPlan.proposedFiles,
    fakePath,
    "slash-separated prose path extraction"
  );
}

const firstIncremental = JSON.parse(runGleip(["check", "--incremental", "--json"], repo));
const reusedIncremental = JSON.parse(runGleip(["check", "--incremental", "--json"], repo));
assertEqual(firstIncremental.incremental.execution, "executed", "incremental baseline");
assertEqual(reusedIncremental.incremental.execution, "reused", "incremental reuse");
assertIncludes(
  runGleip(["status", "--compact"], repo),
  "Check necessary: no",
  "compact current status"
);
runGleip(["check"], repo);
runGleip(["check", "--ci"], repo);
runGleip(["doctor"], repo);

console.log(`Packed Gleip 0.9.0 smoke test passed in ${repo}`);

function runGleip(args, cwd, input) {
  return run(npxCommand, ["--no-install", "gleip", ...args], cwd, input);
}

function run(command, args, cwd, input) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    input,
    shell: process.platform === "win32" && command.endsWith(".cmd"),
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
  });
}

function writeRepoFile(path, content) {
  const absolutePath = join(repo, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function readJson(path) {
  return JSON.parse(readFileSync(join(repo, path), "utf8"));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function assertIncludes(values, expected, label) {
  if (!values.includes(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(values)} to include ${expected}`);
  }
}

function assertNotIncludes(values, unexpected, label) {
  if (values.includes(unexpected)) {
    throw new Error(`${label}: did not expect ${unexpected} in ${JSON.stringify(values)}`);
  }
}
