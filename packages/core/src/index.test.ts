import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  collectWorkingTreeDiff,
  createSessionBaseline,
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

  it("ignores Gleip sidecar files", () => {
    const repo = createCommittedRepo();
    writeRepoFile(repo, ".gleip/status.md", "# Gleip Status\n");

    const diff = collectWorkingTreeDiff({ cwd: repo });

    expect(diff.changedFiles).toEqual([]);
    expect(diff.hasChanges).toBe(false);
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
