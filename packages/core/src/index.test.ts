import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  collectWorkingTreeDiff,
  createSessionBaseline,
  fingerprintRepositoryState,
  filterDiffSinceBaseline,
  packageName
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

function writeRepoFile(repo: string, path: string, content: string): void {
  const filePath = join(repo, path);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}
