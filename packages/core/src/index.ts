import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

export const packageName = "@gleip/core";

export type { FindingCode, FindingSeverity } from "../findings.js";

export interface CollectWorkingTreeDiffOptions {
  cwd: string;
  base?: string;
}

export interface GitFileStat {
  path: string;
  added: number;
  deleted: number;
  isDeleted?: boolean;
  isUntracked?: boolean;
  diffFingerprint?: string;
}

export interface GitDiffContext {
  changedFiles: string[];
  fileStats: GitFileStat[];
  rawDiff: string;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  isGitRepo: boolean;
  hasChanges: boolean;
  trackedLocalArtifacts?: string[];
  error?: string;
}

export interface SessionBaseline {
  createdAt: string;
  changedFiles: string[];
  fileStats: GitFileStat[];
  totalLinesAdded: number;
  totalLinesDeleted: number;
  diffFingerprint: string;
  note?: string;
}

export interface BaselineContext {
  hasBaseline: boolean;
  preExistingFilesIgnored: number;
  sessionFilesChanged: number;
  baselineCreatedAt?: string;
  includeBaseline: boolean;
  possiblyPreExistingFiles: string[];
}

export interface BaselineFilteredDiff {
  diff: GitDiffContext;
  baseline: BaselineContext;
}

export const EPHEMERAL_GLEIP_ARTIFACTS = [
  ".gleip/state.json",
  ".gleip/session.json",
  ".gleip/baseline.json",
  ".gleip/brief.md",
  ".gleip/scope-budget.json",
  ".gleip/status.md",
  ".gleip/report.md",
  ".gleip/report.json"
] as const;

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function collectWorkingTreeDiff(options: CollectWorkingTreeDiffOptions): GitDiffContext {
  const repoCheck = runGit(options.cwd, ["rev-parse", "--is-inside-work-tree"]);

  if (!repoCheck.ok || repoCheck.stdout.trim() !== "true") {
    return emptyDiff(false, "Current directory is not a git repository.");
  }

  const hasHead = runGit(options.cwd, ["rev-parse", "--verify", "HEAD"]).ok;
  const diffContexts =
    options.base !== undefined
      ? [collectDiffForBase(options.cwd, options.base)]
      : hasHead
        ? [collectDiffForBase(options.cwd, "HEAD")]
        : [collectDiff(options.cwd, ["--cached", "--", "."]), collectDiff(options.cwd, ["--", "."])];

  const changedFiles = new Set<string>();
  const deletedFiles = new Set<string>();
  const statsByPath = new Map<string, { added: number; deleted: number }>();
  const rawDiffParts: string[] = [];

  for (const diffContext of diffContexts) {
    if (!diffContext.ok) {
      return emptyDiff(true, diffContext.error);
    }

    for (const path of diffContext.changedFiles) {
      changedFiles.add(path);
    }

    for (const path of diffContext.deletedFiles) {
      deletedFiles.add(path);
    }

    for (const stat of diffContext.fileStats) {
      const current = statsByPath.get(stat.path) ?? { added: 0, deleted: 0 };
      statsByPath.set(stat.path, {
        added: current.added + stat.added,
        deleted: current.deleted + stat.deleted
      });
    }

    if (diffContext.rawDiff.length > 0) {
      rawDiffParts.push(diffContext.rawDiff);
    }
  }

  for (const untrackedFile of listUntrackedFiles(options.cwd)) {
    changedFiles.add(untrackedFile);

    if (!statsByPath.has(untrackedFile)) {
      statsByPath.set(untrackedFile, { added: countTextFileLines(options.cwd, untrackedFile), deleted: 0 });
    }
  }

  const sortedChangedFiles = Array.from(changedFiles)
    .filter((path) => !isEphemeralGleipArtifactPath(path))
    .sort();
  const rawDiff = rawDiffParts.join("\n");
  const fingerprintByPath = fingerprintRawDiffSections(rawDiff);
  const untrackedFiles = new Set(listUntrackedFiles(options.cwd));
  const fileStats = sortedChangedFiles.map((path) => {
    const stat = statsByPath.get(path) ?? { added: 0, deleted: 0 };
    const baseStat = {
      path,
      added: stat.added,
      deleted: stat.deleted,
      diffFingerprint: fingerprintByPath.get(path) ?? fingerprintUntrackedFile(options.cwd, path)
    };

    if (deletedFiles.has(path)) {
      return { ...baseStat, isDeleted: true };
    }

    if (untrackedFiles.has(path)) {
      return { ...baseStat, isUntracked: true };
    }

    return baseStat;
  });
  const totalLinesAdded = fileStats.reduce((total, stat) => total + stat.added, 0);
  const totalLinesDeleted = fileStats.reduce((total, stat) => total + stat.deleted, 0);
  const filteredRawDiff = filterRawDiffSections(rawDiff, sortedChangedFiles);
  const trackedLocalArtifacts = listTrackedLocalArtifacts(options.cwd);

  return {
    changedFiles: sortedChangedFiles,
    fileStats,
    rawDiff: filteredRawDiff,
    totalLinesAdded,
    totalLinesDeleted,
    isGitRepo: true,
    hasChanges: sortedChangedFiles.length > 0,
    trackedLocalArtifacts
  };
}

export function createSessionBaseline(diff: GitDiffContext, createdAt: string): SessionBaseline {
  const base = {
    createdAt,
    changedFiles: [...diff.changedFiles].sort(),
    fileStats: diff.fileStats.map((stat) => ({ ...stat })),
    totalLinesAdded: diff.totalLinesAdded,
    totalLinesDeleted: diff.totalLinesDeleted,
    diffFingerprint: fingerprintDiff(diff)
  };

  if (diff.changedFiles.length === 0) {
    return base;
  }

  return {
    ...base,
    note:
      "Pre-existing working-tree changes were detected before this Gleip session. npx --no-install gleip status will focus on changes introduced after preflight."
  };
}

export function filterDiffSinceBaseline(
  currentDiff: GitDiffContext,
  baseline: SessionBaseline | undefined,
  options: { includeBaseline?: boolean } = {}
): BaselineFilteredDiff {
  if (baseline === undefined || options.includeBaseline === true) {
    return {
      diff: currentDiff,
      baseline: {
        hasBaseline: baseline !== undefined,
        preExistingFilesIgnored: 0,
        sessionFilesChanged: currentDiff.changedFiles.length,
        ...(baseline === undefined ? {} : { baselineCreatedAt: baseline.createdAt }),
        includeBaseline: options.includeBaseline === true,
        possiblyPreExistingFiles: []
      }
    };
  }

  const baselineStats = new Map(baseline.fileStats.map((stat) => [stat.path, stat]));
  const sessionStats: GitFileStat[] = [];
  const ignoredFiles: string[] = [];
  const possiblyPreExistingFiles: string[] = [];

  for (const stat of currentDiff.fileStats) {
    const baselineStat = baselineStats.get(stat.path);

    if (baselineStat === undefined) {
      sessionStats.push(stat);
      continue;
    }

    if (hasFileChangedSinceBaseline(stat, baselineStat)) {
      sessionStats.push(stat);
      possiblyPreExistingFiles.push(stat.path);
    } else {
      ignoredFiles.push(stat.path);
    }
  }

  const changedFiles = sessionStats.map((stat) => stat.path).sort();

  return {
    diff: {
      ...currentDiff,
      changedFiles,
      fileStats: sessionStats,
      rawDiff: filterRawDiffSections(currentDiff.rawDiff, changedFiles),
      totalLinesAdded: sessionStats.reduce((total, stat) => total + stat.added, 0),
      totalLinesDeleted: sessionStats.reduce((total, stat) => total + stat.deleted, 0),
      hasChanges: changedFiles.length > 0
    },
    baseline: {
      hasBaseline: true,
      preExistingFilesIgnored: ignoredFiles.length,
      sessionFilesChanged: changedFiles.length,
      baselineCreatedAt: baseline.createdAt,
      includeBaseline: false,
      possiblyPreExistingFiles
    }
  };
}

function hasFileChangedSinceBaseline(current: GitFileStat, baseline: GitFileStat): boolean {
  return (
    current.added !== baseline.added ||
    current.deleted !== baseline.deleted ||
    current.isDeleted !== baseline.isDeleted ||
    current.isUntracked !== baseline.isUntracked ||
    current.diffFingerprint !== baseline.diffFingerprint
  );
}

function fingerprintDiff(diff: GitDiffContext): string {
  return hashText(
    JSON.stringify({
      changedFiles: diff.changedFiles,
      fileStats: diff.fileStats.map((stat) => ({
        path: stat.path,
        added: stat.added,
        deleted: stat.deleted,
        isDeleted: stat.isDeleted === true,
        isUntracked: stat.isUntracked === true,
        diffFingerprint: stat.diffFingerprint
      }))
    })
  );
}

function collectDiffForBase(cwd: string, base: string): InternalDiffContext {
  return collectDiff(cwd, ["--no-ext-diff", base, "--", "."]);
}

interface InternalDiffContext {
  ok: boolean;
  changedFiles: string[];
  deletedFiles: Set<string>;
  fileStats: GitFileStat[];
  rawDiff: string;
  error?: string;
}

function collectDiff(cwd: string, diffCommand: string[]): InternalDiffContext {
  const nameOnly = runGit(cwd, ["diff", "--name-only", ...diffCommand]);
  const numstat = runGit(cwd, ["diff", "--numstat", ...diffCommand]);
  const nameStatus = runGit(cwd, ["diff", "--name-status", ...diffCommand]);
  const rawDiff = runGit(cwd, ["diff", ...diffCommand]);

  if (!nameOnly.ok || !numstat.ok || !nameStatus.ok || !rawDiff.ok) {
    return {
      ok: false,
      changedFiles: [],
      deletedFiles: new Set(),
      fileStats: [],
      rawDiff: "",
      error: nameOnly.stderr || numstat.stderr || nameStatus.stderr || rawDiff.stderr || "Git diff failed."
    };
  }

  return {
    ok: true,
    changedFiles: parseLines(nameOnly.stdout),
    deletedFiles: parseDeletedFiles(nameStatus.stdout),
    fileStats: parseNumstat(numstat.stdout),
    rawDiff: rawDiff.stdout
  };
}

function runGit(cwd: string, args: string[]): GitResult {
  try {
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      shell: false
    });

    return {
      ok: result.status === 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    };
  } catch (error) {
    return {
      ok: false,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => normalizePath(line.trim()))
    .filter((line) => line.length > 0);
}

function parseDeletedFiles(value: string): Set<string> {
  const deleted = new Set<string>();

  for (const line of value.split(/\r?\n/)) {
    const [status, ...pathParts] = line.split(/\t/);

    if (status === "D" && pathParts.length > 0) {
      deleted.add(normalizePath(pathParts.join("\t")));
    }
  }

  return deleted;
}

function parseNumstat(value: string): GitFileStat[] {
  const stats: GitFileStat[] = [];

  for (const line of value.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }

    const [addedRaw, deletedRaw, ...pathParts] = line.split(/\t/);
    const path = normalizePath(pathParts.join("\t"));

    if (path.length === 0) {
      continue;
    }

    stats.push({
      path,
      added: parseGitLineCount(addedRaw),
      deleted: parseGitLineCount(deletedRaw)
    });
  }

  return stats;
}

function parseGitLineCount(value: string | undefined): number {
  if (value === undefined || value === "-") {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function listUntrackedFiles(cwd: string): string[] {
  const result = runGit(cwd, ["ls-files", "--others", "--exclude-standard"]);

  if (!result.ok) {
    return [];
  }

  return parseLines(result.stdout).filter((path) => !isEphemeralGleipArtifactPath(path));
}

function listTrackedLocalArtifacts(cwd: string): string[] {
  const result = runGit(cwd, ["ls-files", "--", ".gleip"]);

  return result.ok
    ? parseLines(result.stdout).filter(
        (path) => isEphemeralGleipArtifactPath(path) && existsSync(join(cwd, path))
      )
    : [];
}

function countTextFileLines(cwd: string, relativePath: string): number {
  const absolutePath = join(cwd, relativePath);

  try {
    if (!existsSync(absolutePath) || statSync(absolutePath).size > 200_000) {
      return 0;
    }

    return readFileSync(absolutePath, "utf8").split(/\r?\n/).filter((line) => line.length > 0).length;
  } catch {
    return 0;
  }
}

function fingerprintRawDiffSections(rawDiff: string): Map<string, string> {
  const sections = rawDiffSections(rawDiff);
  const fingerprints = new Map<string, string>();

  for (const section of sections) {
    fingerprints.set(section.path, hashText(canonicalRawDiffSection(section.content)));
  }

  return fingerprints;
}

function canonicalRawDiffSection(content: string): string {
  return content.replace(/\n+$/u, "");
}

function filterRawDiffSections(rawDiff: string, includedPaths: string[]): string {
  const included = new Set(includedPaths);

  return rawDiffSections(rawDiff)
    .filter((section) => included.has(section.path))
    .map((section) => section.content)
    .join("\n");
}

function rawDiffSections(rawDiff: string): Array<{ path: string; content: string }> {
  const sections: Array<{ path: string; content: string }> = [];
  const lines = rawDiff.split(/\r?\n/);
  let currentPath: string | undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (currentPath !== undefined) {
        sections.push({ path: currentPath, content: currentLines.join("\n") });
      }

      currentPath = parseDiffGitPath(line);
      currentLines = [line];
      continue;
    }

    if (currentPath !== undefined) {
      currentLines.push(line);
    }
  }

  if (currentPath !== undefined) {
    sections.push({ path: currentPath, content: currentLines.join("\n") });
  }

  return sections;
}

function parseDiffGitPath(line: string): string {
  const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);

  if (match?.[2] !== undefined) {
    return normalizePath(match[2]);
  }

  return normalizePath(line.replace("diff --git ", ""));
}

function fingerprintUntrackedFile(cwd: string, relativePath: string): string {
  const absolutePath = join(cwd, relativePath);

  try {
    if (!existsSync(absolutePath) || statSync(absolutePath).size > 200_000) {
      return hashText(relativePath);
    }

    return hashText(readFileSync(absolutePath, "utf8"));
  } catch {
    return hashText(relativePath);
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function isEphemeralGleipArtifactPath(path: string): boolean {
  const normalized = normalizePath(path);

  return (
    EPHEMERAL_GLEIP_ARTIFACTS.includes(
      normalized as (typeof EPHEMERAL_GLEIP_ARTIFACTS)[number]
    ) || /^\.gleip\/session-[^/]+\.json$/u.test(normalized)
  );
}

function emptyDiff(isGitRepo: boolean, error?: string): GitDiffContext {
  const base = {
    changedFiles: [],
    fileStats: [],
    rawDiff: "",
    totalLinesAdded: 0,
    totalLinesDeleted: 0,
    isGitRepo,
    hasChanges: false,
    trackedLocalArtifacts: []
  };

  return error === undefined ? base : { ...base, error };
}
