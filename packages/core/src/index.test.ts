import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  collectWorkingTreeDiff,
  cleanupCompressionStore,
  compressContext,
  createSessionBaseline,
  fingerprintRepositoryState,
  filterDiffSinceBaseline,
  packageName,
  readCompressionStats,
  retrieveContextOriginal
} from "./index.js";

const tempRepos: string[] = [];

describe("packageName", () => {
  it("identifies the core package", () => {
    expect(packageName).toBe("@gleip/core");
  });
});

describe("collectWorkingTreeDiff", () => {
  afterEach(() => {
    for (const tempRepo of tempRepos.splice(0)) {
      rmSync(tempRepo, { recursive: true, force: true });
    }
  });

  it("handles no changes", () => {
    const repo = createCommittedRepo();

    const diff = collectWorkingTreeDiff({ cwd: repo });

    expect(diff.isGitRepo).toBe(true);
    expect(diff.hasChanges).toBe(false);
    expect(diff.changedFiles).toEqual([]);
    expect(diff.totalLinesAdded).toBe(0);
    expect(diff.totalLinesDeleted).toBe(0);
    expect(diff.head).toMatch(/^[0-9a-f]{40}$/u);
  });

  it("fingerprints equivalent Windows and POSIX paths identically", () => {
    const base = {
      changedFiles: ["src/index.ts"],
      fileStats: [
        {
          path: "src/index.ts",
          added: 1,
          deleted: 0,
          diffFingerprint: "content"
        }
      ],
      rawDiff: "",
      totalLinesAdded: 1,
      totalLinesDeleted: 0,
      isGitRepo: true,
      hasChanges: true,
      head: "abc123",
      trackedLocalArtifacts: [".gleip/session.json"]
    };

    expect(fingerprintRepositoryState(base)).toBe(
      fingerprintRepositoryState({
        ...base,
        changedFiles: ["src\\index.ts"],
        fileStats: [{ ...base.fileStats[0]!, path: "src\\index.ts" }],
        trackedLocalArtifacts: [".gleip\\session.json"]
      })
    );
  });

  it("includes HEAD in the repository-state fingerprint", () => {
    const repo = createCommittedRepo();
    const before = collectWorkingTreeDiff({ cwd: repo });
    writeRepoFile(repo, "README.md", "next\n");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "next"]);
    const after = collectWorkingTreeDiff({ cwd: repo });

    expect(before.changedFiles).toEqual([]);
    expect(after.changedFiles).toEqual([]);
    expect(fingerprintRepositoryState(before)).not.toBe(fingerprintRepositoryState(after));
  });

  it("distinguishes staged and unstaged state with the same working-tree content", () => {
    const repo = createCommittedRepo();
    writeRepoFile(repo, "src/index.ts", "export const value = 2;\n");
    const unstaged = collectWorkingTreeDiff({ cwd: repo });
    git(repo, ["add", "src/index.ts"]);
    const staged = collectWorkingTreeDiff({ cwd: repo });

    expect(unstaged.rawDiff).toBe(staged.rawDiff);
    expect(fingerprintRepositoryState(unstaged)).not.toBe(fingerprintRepositoryState(staged));
  });

  it("detects changed files and line counts", () => {
    const repo = createCommittedRepo();
    writeRepoFile(repo, "src/index.ts", "export const value = 2;\nexport const next = 3;\n");

    const diff = collectWorkingTreeDiff({ cwd: repo });

    expect(diff.hasChanges).toBe(true);
    expect(diff.changedFiles).toEqual(["src/index.ts"]);
    expect(diff.fileStats).toEqual([
      {
        path: "src/index.ts",
        added: 2,
        deleted: 1,
        diffFingerprint: expect.any(String) as string
      }
    ]);
    expect(diff.rawDiff).toContain("+export const next = 3;");
  });

  it("ignores ephemeral Gleip runtime files in task metrics", () => {
    const repo = createCommittedRepo();
    writeRepoFile(repo, ".gleip/status.md", "# Gleip Status\n");

    const diff = collectWorkingTreeDiff({ cwd: repo });

    expect(diff.changedFiles).toEqual([]);
    expect(diff.hasChanges).toBe(false);
  });

  it("does not ignore durable tracked files under .gleip", () => {
    const repo = createCommittedRepo();
    writeRepoFile(repo, ".gleip/policy.md", "# Durable policy\n");
    git(repo, ["add", "-f", ".gleip/policy.md"]);
    git(repo, ["commit", "-m", "add durable gleip policy"]);
    writeRepoFile(repo, ".gleip/policy.md", "# Durable policy\n\nUpdate.\n");

    const diff = collectWorkingTreeDiff({ cwd: repo });

    expect(diff.changedFiles).toEqual([".gleip/policy.md"]);
    expect(diff.fileStats).toEqual([
      {
        path: ".gleip/policy.md",
        added: 2,
        deleted: 0,
        diffFingerprint: expect.any(String) as string
      }
    ]);
  });

  it("reports tracked Gleip sidecar artifacts separately", () => {
    const repo = createCommittedRepo();
    writeRepoFile(repo, ".gleip/session.json", "{}\n");
    writeRepoFile(repo, ".gleip/canonical-task.json", "{}\n");
    git(repo, ["add", "-f", ".gleip/session.json", ".gleip/canonical-task.json"]);

    const diff = collectWorkingTreeDiff({ cwd: repo });

    expect(diff.changedFiles).toEqual([]);
    expect(diff.trackedLocalArtifacts).toEqual([
      ".gleip/canonical-task.json",
      ".gleip/session.json"
    ]);
  });

  it("drops the tracked artifact report after the artifact is removed", () => {
    const repo = createCommittedRepo();
    writeRepoFile(repo, ".gleip/session.json", "{}\n");
    git(repo, ["add", "-f", ".gleip/session.json"]);
    rmSync(join(repo, ".gleip", "session.json"));

    const diff = collectWorkingTreeDiff({ cwd: repo });

    expect(diff.changedFiles).toEqual([]);
    expect(diff.trackedLocalArtifacts).toEqual([]);
  });

  it("filters unchanged pre-existing files from a baseline", () => {
    const baseline = createSessionBaseline(
      {
        changedFiles: ["README.md"],
        fileStats: [
          {
            path: "README.md",
            added: 1,
            deleted: 0,
            diffFingerprint: "before"
          }
        ],
        rawDiff: "",
        totalLinesAdded: 1,
        totalLinesDeleted: 0,
        isGitRepo: true,
        hasChanges: true
      },
      "2026-05-30T00:00:00.000Z"
    );

    const filtered = filterDiffSinceBaseline(
      {
        changedFiles: ["README.md", "src/index.ts"],
        fileStats: [
          {
            path: "README.md",
            added: 1,
            deleted: 0,
            diffFingerprint: "before"
          },
          {
            path: "src/index.ts",
            added: 2,
            deleted: 0,
            diffFingerprint: "new"
          }
        ],
        rawDiff: "",
        totalLinesAdded: 3,
        totalLinesDeleted: 0,
        isGitRepo: true,
        hasChanges: true
      },
      baseline
    );

    expect(filtered.diff.changedFiles).toEqual(["src/index.ts"]);
    expect(filtered.baseline.preExistingFilesIgnored).toBe(1);
    expect(filtered.baseline.sessionFilesChanged).toBe(1);
    expect(filtered.baseline.possiblyPreExistingFiles).toEqual([]);
  });

  it("keeps an unchanged one-file baseline ignored after another file changes", () => {
    const repo = createCommittedRepo();
    writeRepoFile(repo, "README.md", "base\n");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "add readme"]);
    writeRepoFile(repo, "README.md", "base\npre-existing\n");

    const baseline = createSessionBaseline(
      collectWorkingTreeDiff({ cwd: repo }),
      "2026-05-30T00:00:00.000Z"
    );

    writeRepoFile(repo, "src/index.ts", "export const value = 2;\n");

    const filtered = filterDiffSinceBaseline(collectWorkingTreeDiff({ cwd: repo }), baseline);

    expect(filtered.diff.changedFiles).toEqual(["src/index.ts"]);
    expect(filtered.baseline.preExistingFilesIgnored).toBe(1);
    expect(filtered.baseline.sessionFilesChanged).toBe(1);
    expect(filtered.baseline.possiblyPreExistingFiles).toEqual([]);
  });

  it("includes pre-existing files whose stats changed after baseline", () => {
    const baseline = createSessionBaseline(
      {
        changedFiles: ["README.md"],
        fileStats: [
          {
            path: "README.md",
            added: 1,
            deleted: 0,
            diffFingerprint: "before"
          }
        ],
        rawDiff: "",
        totalLinesAdded: 1,
        totalLinesDeleted: 0,
        isGitRepo: true,
        hasChanges: true
      },
      "2026-05-30T00:00:00.000Z"
    );

    const filtered = filterDiffSinceBaseline(
      {
        changedFiles: ["README.md"],
        fileStats: [
          {
            path: "README.md",
            added: 2,
            deleted: 0,
            diffFingerprint: "after"
          }
        ],
        rawDiff: "",
        totalLinesAdded: 2,
        totalLinesDeleted: 0,
        isGitRepo: true,
        hasChanges: true
      },
      baseline
    );

    expect(filtered.diff.changedFiles).toEqual(["README.md"]);
    expect(filtered.baseline.preExistingFilesIgnored).toBe(0);
    expect(filtered.baseline.possiblyPreExistingFiles).toEqual(["README.md"]);
  });

  it("returns a helpful result outside a git repository", () => {
    const repo = mkdtempSync(join(tmpdir(), "gleip-core-"));
    tempRepos.push(repo);

    const diff = collectWorkingTreeDiff({ cwd: repo });

    expect(diff.isGitRepo).toBe(false);
    expect(diff.hasChanges).toBe(false);
    expect(diff.error).toContain("not a git repository");
  });
});

describe("context compression", () => {
  afterEach(() => {
    for (const tempRepo of tempRepos.splice(0)) {
      rmSync(tempRepo, { recursive: true, force: true });
    }
  });

  it("compresses large test output while retaining unique failure evidence and exact retrieval", () => {
    const repo = createTempDirectory();
    const original = [
      ...Array.from({ length: 140 }, (_, index) => `PASS tests/unit/example-${index % 7}.test.ts`),
      "FAIL tests/unit/parser.test.ts > parseConfig reports invalid YAML",
      "AssertionError: expected 'ok' to equal 'error'",
      "at tests/unit/parser.test.ts:42:7"
    ].join("\n");

    const result = compressContext(
      {
        rawContent: original,
        sourceCommand: "pnpm test",
        authority: "evidence",
        lifecycle: "active"
      },
      {
        cwd: repo,
        now: () => new Date("2026-07-07T00:00:00.000Z"),
        policy: { minInputBytes: 100, minEstimatedTokensSaved: 10 }
      }
    );

    expect(result.compressed).toBe(true);
    expect(result.output).toContain("FAIL tests/unit/parser.test.ts");
    expect(result.output).toContain("AssertionError");
    expect(result.reference).toMatch(/^sha256:[0-9a-f]{64}$/u);

    const retrieved = retrieveContextOriginal({ cwd: repo, reference: result.reference! });
    expect(retrieved.ok).toBe(true);
    expect(retrieved.content).toBe(original);

    const stats = readCompressionStats(repo);
    expect(stats.objectCount).toBe(1);
    expect(stats.classificationByType.test_output).toBe(1);
    expect(stats.retrievalCalls).toBe(1);
    expect(stats.grossEstimatedTokensRemoved).toBeGreaterThan(0);
    expect(stats.netEstimatedTokensSaved).toBeGreaterThanOrEqual(0);
  });

  it("passes through active canonical task-contract artifacts regardless of text shape", () => {
    const repo = createTempDirectory();
    const original = JSON.stringify({
      authority: "canonical",
      effectiveContent: "Implement the feature and preserve every requirement."
    });

    const result = compressContext(
      {
        rawContent: original.repeat(80),
        artifactType: "canonical_task",
        authority: "canonical",
        lifecycle: "active"
      },
      { cwd: repo, policy: { minInputBytes: 1, minEstimatedTokensSaved: 1 } }
    );

    expect(result.compressed).toBe(false);
    expect(result.output).toBe(original.repeat(80));
    expect(result.passthroughReasons).toContain("protected_authority_passthrough");
  });

  it("passes through source code and sensitive-looking output", () => {
    const repo = createTempDirectory();
    const source = "export function run() {\n  return 42;\n}\n".repeat(80);
    const secretLike = "token = abcdefghijklmnopqrstuvwxyz123456\n".repeat(80);

    expect(
      compressContext(
        { rawContent: source, contentType: "source_code", authority: "evidence" },
        { cwd: repo, policy: { minInputBytes: 1, minEstimatedTokensSaved: 1 } }
      ).passthroughReasons
    ).toContain("protected_content_class");
    expect(
      compressContext(
        { rawContent: secretLike, sourceCommand: "tool logs", authority: "evidence" },
        { cwd: repo, policy: { minInputBytes: 1, minEstimatedTokensSaved: 1 } }
      ).passthroughReasons
    ).toContain("sensitive_content");
  });

  it("compresses structured JSON without storing the original in metadata", () => {
    const repo = createTempDirectory();
    const original = JSON.stringify(
      Array.from({ length: 120 }, (_, index) => ({
        id: index,
        status: index === 41 ? "failed" : "passed",
        durationMs: 10 + index
      })),
      null,
      2
    );

    const result = compressContext(
      { rawContent: original, contentType: "structured_json", authority: "evidence" },
      { cwd: repo, policy: { minInputBytes: 100, minEstimatedTokensSaved: 10 } }
    );

    expect(result.compressed).toBe(true);
    expect(result.output).toContain("Compressed JSON array");
    expect(result.output).not.toContain('"id": 41');
    expect(readCompressionStats(repo).originalBytes).toBe(Buffer.byteLength(original, "utf8"));
  });

  it("compresses git diffs without dropping added or deleted lines", () => {
    const repo = createTempDirectory();
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 0000000..1111111 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,80 +1,80 @@",
      ...Array.from({ length: 3000 }, (_, index) => ` context ${index}`),
      "-export const oldValue = 1;",
      "+export const newValue = 2;"
    ].join("\n");

    const result = compressContext(
      { rawContent: diff, contentType: "git_diff", authority: "evidence" },
      { cwd: repo, policy: { minInputBytes: 100, minEstimatedTokensSaved: 10 } }
    );

    expect(result.compressed).toBe(true);
    expect(result.output).toContain("-export const oldValue = 1;");
    expect(result.output).toContain("+export const newValue = 2;");
    expect(result.output).toContain("unchanged context line(s) omitted");
  });

  it("deduplicates repeated originals and rejects malicious references", () => {
    const repo = createTempDirectory();
    const original = Array.from({ length: 120 }, () => "PASS repeated.test.ts").join("\n");

    compressContext(
      { rawContent: original, sourceCommand: "vitest run", authority: "evidence" },
      { cwd: repo, policy: { minInputBytes: 100, minEstimatedTokensSaved: 10 } }
    );
    compressContext(
      { rawContent: original, sourceCommand: "vitest run", authority: "evidence" },
      { cwd: repo, policy: { minInputBytes: 100, minEstimatedTokensSaved: 10 } }
    );

    expect(readCompressionStats(repo).storageDedupHits).toBe(1);
    expect(retrieveContextOriginal({ cwd: repo, reference: "../secret" })).toMatchObject({
      ok: false,
      error: "Invalid compression reference."
    });
  });

  it("cleans only compression objects and preserves authority state", () => {
    const repo = createTempDirectory();
    mkdirSync(join(repo, ".gleip"), { recursive: true });
    writeFileSync(join(repo, ".gleip", "canonical-task.json"), "{}\n");

    compressContext(
      {
        rawContent: Array.from({ length: 120 }, () => "PASS cleanup.test.ts").join("\n"),
        sourceCommand: "vitest run",
        authority: "evidence"
      },
      { cwd: repo, policy: { minInputBytes: 100, minEstimatedTokensSaved: 10 } }
    );

    const cleanup = cleanupCompressionStore(repo);

    expect(cleanup.removedObjects).toBe(1);
    expect(cleanup.preservedAuthorityState).toBe(true);
    expect(existsSync(join(repo, ".gleip", "canonical-task.json"))).toBe(true);
    expect(readCompressionStats(repo).objectCount).toBe(0);
  });
});

function createCommittedRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "gleip-core-"));
  tempRepos.push(repo);
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "Gleip@example.com"]);
  git(repo, ["config", "user.name", "Gleip Test"]);
  writeRepoFile(repo, "src/index.ts", "export const value = 1;\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "initial"]);

  return repo;
}

function createTempDirectory(): string {
  const repo = mkdtempSync(join(tmpdir(), "gleip-core-"));
  tempRepos.push(repo);
  return repo;
}

function writeRepoFile(repo: string, path: string, content: string): void {
  const filePath = join(repo, path);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}
