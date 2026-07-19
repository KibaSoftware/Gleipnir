import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  appendRunEvent,
  createEvidenceRun,
  finalizeEvidenceRun,
  GenerationConflictError,
  inspectLegacyArtifacts,
  migrateLegacyArtifacts,
  recordApproval,
  recordCommandAttestation,
  recordRunEvidence,
  recoverRunLedger,
  replayRun,
  revokeApproval,
  runDirectory,
  synchronizeEvidenceRun,
  writeAtomicJson
} from "./ledger.js";
import { environmentFingerprint, sha256Digest } from "./evidence.js";

const tempDirectories: string[] = [];
const now = "2026-07-19T12:00:00.000Z";

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("append-only run ledger", () => {
  it("orders events and deterministically replays evidence and findings", () => {
    const cwd = tempDirectory();
    const run = createEvidenceRun({
      cwd,
      runId: "run-replay",
      createdAt: now,
      repositoryFingerprint: "repo-a"
    });
    appendRunEvent(cwd, run.runId, {
      type: "task_captured",
      createdAt: now,
      repositoryFingerprint: "repo-a",
      taskRevision: 1,
      payload: { digest: sha256Digest("task") }
    });
    const evidence = recordRunEvidence(cwd, run.runId, {
      evidenceClass: "observed_fact",
      source: { kind: "git", name: "working_tree" },
      createdAt: now,
      repositoryFingerprint: "repo-a",
      taskRevision: 1,
      payload: { changedPaths: ["src/index.ts"] }
    });
    appendRunEvent(cwd, run.runId, {
      type: "finding_created",
      createdAt: now,
      repositoryFingerprint: "repo-a",
      taskRevision: 1,
      payload: { findingId: "finding-1", code: "TEST_SKIPPED" }
    });

    const state = replayRun(cwd, run.runId);
    expect(state.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(state.evidence).toEqual([evidence]);
    expect(state.findings.get("finding-1")?.code).toBe("TEST_SKIPPED");
    expect(replayRun(cwd, run.runId)).toEqual(state);
  });

  it("recovers an incomplete final line without losing valid events", () => {
    const cwd = tempDirectory();
    const run = createEvidenceRun({
      cwd,
      runId: "run-recovery",
      createdAt: now,
      repositoryFingerprint: "repo-a"
    });
    const eventPath = join(runDirectory(cwd, run.runId), "events.jsonl");
    appendFileSync(eventPath, '{"schemaVersion":"1.0.0"', "utf8");

    expect(() => replayRun(cwd, run.runId)).toThrow("Incomplete or invalid event ledger tail");
    const recovery = recoverRunLedger(cwd, run.runId, "2026-07-19T12:01:00.000Z");
    expect(recovery.recovered).toBe(true);
    expect(recovery.recoveryPath === undefined ? false : existsSync(recovery.recoveryPath)).toBe(
      true
    );
    expect(replayRun(cwd, run.runId).events).toHaveLength(1);
  });

  it("serializes concurrent process writers without gaps", async () => {
    const cwd = tempDirectory();
    const run = createEvidenceRun({
      cwd,
      runId: "run-concurrent",
      createdAt: now,
      repositoryFingerprint: "repo-a"
    });
    await Promise.all(
      Array.from({ length: 4 }, (_, worker) => runWriter(cwd, run.runId, 8, String(worker)))
    );

    const state = replayRun(cwd, run.runId);
    expect(state.events).toHaveLength(33);
    expect(state.events.map((event) => event.sequence)).toEqual(
      Array.from({ length: 33 }, (_, index) => index + 1)
    );
  }, 30_000);
});

describe("atomic and generation-controlled persistence", () => {
  it("preserves the prior complete file when interrupted before rename", () => {
    const cwd = tempDirectory();
    const path = join(cwd, "state.json");
    writeAtomicJson(path, { generation: 1, value: "before" });

    expect(() =>
      writeAtomicJson(path, { generation: 2, value: "after" }, { failBeforeRename: true })
    ).toThrow("Injected failure");
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ generation: 1, value: "before" });
  });

  it("leaves the new complete file when interrupted after rename", () => {
    const cwd = tempDirectory();
    const path = join(cwd, "state.json");
    writeAtomicJson(path, { generation: 1, value: "before" });

    expect(() =>
      writeAtomicJson(path, { generation: 2, value: "after" }, { failAfterRename: true })
    ).toThrow("Injected failure after atomic rename");
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ generation: 2, value: "after" });
  });

  it("rejects stale generation writes", () => {
    const cwd = tempDirectory();
    const path = join(cwd, "state.json");
    writeAtomicJson(path, { generation: 2 });

    expect(() => writeAtomicJson(path, { generation: 3 }, { expectedGeneration: 1 })).toThrow(
      GenerationConflictError
    );
  });
});

describe("attestations, approvals, and finalization", () => {
  it("records command details and binds the final bundle to current state", () => {
    const cwd = tempDirectory();
    const run = createEvidenceRun({ cwd, createdAt: now, repositoryFingerprint: "repo-final" });
    const attestation = recordCommandAttestation({
      cwd,
      runId: run.runId,
      createdAt: now,
      repositoryFingerprint: "repo-final",
      taskRevision: 1,
      payload: {
        executable: "pnpm.cmd",
        arguments: ["test"],
        workingDirectory: cwd,
        startedAt: now,
        finishedAt: now,
        durationMs: 12,
        exitCode: 0,
        repositoryFingerprintBefore: "repo-final",
        repositoryFingerprintAfter: "repo-final",
        environmentFingerprint: environmentFingerprint({ PATH: "redacted" }),
        stdoutDigest: sha256Digest("passed"),
        stderrDigest: sha256Digest(""),
        fullOutputStored: true,
        outputCompressed: false,
        stdoutReference: "commands/stdout",
        stderrReference: "commands/stderr"
      },
      stdout: "passed",
      stderr: ""
    });
    const bundle = finalizeEvidenceRun({
      cwd,
      runId: run.runId,
      createdAt: now,
      taskAuthority: { present: true, revision: 1, digest: sha256Digest("task") },
      repository: { fingerprint: "repo-final", dirty: true, changedPaths: ["src/index.ts"] },
      hazards: [],
      requiredCommands: [
        { id: "tests", executable: "pnpm.cmd", argumentIncludes: ["test"], description: "Tests" }
      ]
    });

    expect(bundle.repository.fingerprint).toBe("repo-final");
    expect(bundle.requiredCommands[0]).toMatchObject({
      state: "satisfied",
      satisfiedBy: attestation.id
    });
    expect(bundle.completionStatus).toBe("complete");
    expect(replayRun(cwd, run.runId).completed).toBe(true);
  });

  it("invalidates approvals after repository changes and supports explicit revocation", () => {
    const cwd = tempDirectory();
    const run = createEvidenceRun({ cwd, createdAt: now, repositoryFingerprint: "repo-a" });
    const approval = recordApproval({
      cwd,
      runId: run.runId,
      actor: "reviewer",
      source: "local-review",
      reason: "Reviewed dependency addition.",
      scope: "DEPENDENCY_FILE_CHANGED",
      findingIds: ["finding-1"],
      repositoryFingerprint: "repo-a",
      taskRevision: 1,
      createdAt: now
    });
    const revoked = revokeApproval({
      cwd,
      runId: run.runId,
      approvalId: approval.id,
      revokedAt: "2026-07-19T12:02:00.000Z",
      repositoryFingerprint: "repo-a",
      taskRevision: 1
    });
    expect(revoked.state).toBe("revoked");

    const active = recordApproval({
      cwd,
      runId: run.runId,
      actor: "reviewer",
      source: "local-review",
      reason: "Reviewed dependency addition again.",
      scope: "DEPENDENCY_FILE_CHANGED",
      findingIds: ["finding-1"],
      repositoryFingerprint: "repo-a",
      taskRevision: 1,
      createdAt: now
    });
    const bundle = finalizeEvidenceRun({
      cwd,
      runId: run.runId,
      createdAt: "2026-07-19T12:03:00.000Z",
      taskAuthority: { present: true, revision: 1 },
      repository: { fingerprint: "repo-b", dirty: true, changedPaths: ["package.json"] },
      hazards: [
        {
          id: "finding-1",
          code: "DEPENDENCY_FILE_CHANGED",
          message: "Dependency added.",
          blocking: true,
          evidenceIds: [],
          approvalRequired: true
        }
      ],
      requiredCommands: []
    });

    expect(bundle.completionStatus).toBe("blocked_completion");
    expect(replayRun(cwd, run.runId).approvals.find((item) => item.id === active.id)?.state).toBe(
      "invalid"
    );
  });

  it("invalidates approvals immediately when synchronized repository state changes", () => {
    const cwd = tempDirectory();
    const run = createEvidenceRun({ cwd, createdAt: now, repositoryFingerprint: "repo-a" });
    const approval = recordApproval({
      cwd,
      runId: run.runId,
      actor: "reviewer",
      source: "local-review",
      reason: "Reviewed current state.",
      scope: "CI_FILE_CHANGED",
      repositoryFingerprint: "repo-a",
      taskRevision: 1,
      createdAt: now
    });

    synchronizeEvidenceRun({
      cwd,
      runId: run.runId,
      checkedAt: "2026-07-19T12:01:00.000Z",
      repositoryFingerprint: "repo-b",
      taskRevision: 1
    });
    const state = replayRun(cwd, run.runId);

    expect(state.approvals.find((item) => item.id === approval.id)?.state).toBe("invalid");
    expect(state.events.map((event) => event.type)).toContain("repository_state_changed");
    expect(state.events.map((event) => event.type)).toContain("artifact_became_stale");
  });

  it("treats the event ledger as authority when the approval projection diverges", () => {
    const cwd = tempDirectory();
    const run = createEvidenceRun({ cwd, createdAt: now, repositoryFingerprint: "repo-a" });
    const approval = recordApproval({
      cwd,
      runId: run.runId,
      actor: "reviewer",
      source: "local-review",
      reason: "Reviewed current state.",
      scope: "CI_FILE_CHANGED",
      repositoryFingerprint: "repo-a",
      taskRevision: 1,
      createdAt: now
    });
    const projectionPath = join(runDirectory(cwd, run.runId), "approvals.json");
    const projection = JSON.parse(readFileSync(projectionPath, "utf8")) as {
      generation: number;
      approvals: unknown[];
    };
    writeFileSync(
      projectionPath,
      `${JSON.stringify({ ...projection, approvals: [...projection.approvals, { id: "orphan" }] })}\n`
    );

    const divergent = replayRun(cwd, run.runId);
    expect(divergent.approvals.map((item) => item.id)).toEqual([approval.id]);
    expect(divergent.compatibilityWarnings).toContain(
      "Approval projection differs from the authoritative event ledger."
    );

    synchronizeEvidenceRun({
      cwd,
      runId: run.runId,
      checkedAt: now,
      repositoryFingerprint: "repo-a",
      taskRevision: 1
    });
    const repaired = JSON.parse(readFileSync(projectionPath, "utf8")) as {
      approvals: Array<{ id: string }>;
    };
    expect(repaired.approvals.map((item) => item.id)).toEqual([approval.id]);
  });
});

describe("legacy migration", () => {
  it("backs up sources and preserves status prose as an agent claim", () => {
    const cwd = tempDirectory();
    mkdirSync(join(cwd, ".gleip"), { recursive: true });
    writeFileSync(
      join(cwd, ".gleip", "canonical-task.json"),
      `${JSON.stringify({ currentRevision: 2, revisions: [{}, {}] })}\n`
    );
    writeFileSync(join(cwd, ".gleip", "status.md"), "Tests passed according to agent.\n");
    writeFileSync(join(cwd, ".gleip", "report.json"), '{"schemaVersion":"1.3.0"}\n');

    expect(inspectLegacyArtifacts(cwd)).toHaveLength(3);
    const sourceBefore = readFileSync(join(cwd, ".gleip", "status.md"), "utf8");
    const migrated = migrateLegacyArtifacts({
      cwd,
      createdAt: now,
      repositoryFingerprint: "repo-current"
    });
    expect(migrated.run).toBeDefined();
    const state = replayRun(cwd, migrated.run!.runId);
    const statusEvidence = state.evidence.find(
      (item) => item.source.reference === ".gleip/status.md"
    );
    expect(statusEvidence?.evidenceClass).toBe("agent_claim");
    expect(statusEvidence?.staleness.state).toBe("unknown");
    expect(readFileSync(join(cwd, ".gleip", "status.md"), "utf8")).toBe(sourceBefore);
  });

  it("supports a non-mutating migration preview", () => {
    const cwd = tempDirectory();
    mkdirSync(join(cwd, ".gleip"), { recursive: true });
    writeFileSync(join(cwd, ".gleip", "session.json"), '{"version":1,"task":"Fix bug"}\n');
    const result = migrateLegacyArtifacts({
      cwd,
      createdAt: now,
      repositoryFingerprint: "repo-current",
      dryRun: true
    });
    expect(result.run).toBeUndefined();
    expect(existsSync(join(cwd, ".gleip", "runs"))).toBe(false);
  });

  it.each([
    {
      version: "0.8.4",
      files: ["session.json", "status.md"],
      expectedClasses: ["policy_inference", "agent_claim"]
    },
    {
      version: "0.9.0",
      files: ["canonical-task.json", "report.json"],
      expectedClasses: ["observed_fact", "policy_inference"]
    }
  ])(
    "migrates the $version fixture without promoting claims",
    ({ version, files, expectedClasses }) => {
      const cwd = tempDirectory();
      mkdirSync(join(cwd, ".gleip"), { recursive: true });
      const fixtureDirectory = fileURLToPath(
        new URL(`./test-fixtures/migrations/${version}/`, import.meta.url)
      );

      for (const file of files) {
        writeFileSync(
          join(cwd, ".gleip", file),
          readFileSync(join(fixtureDirectory, file), "utf8")
        );
      }

      const migrated = migrateLegacyArtifacts({
        cwd,
        createdAt: now,
        repositoryFingerprint: `repo-${version}`
      });
      const state = replayRun(cwd, migrated.run!.runId);

      expect(state.evidence.map((item) => item.evidenceClass).sort()).toEqual(
        [...expectedClasses].sort()
      );
      expect(state.evidence.every((item) => item.staleness.state === "unknown")).toBe(true);
    }
  );
});

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "gleip-ledger-"));
  tempDirectories.push(directory);
  return directory;
}

function runWriter(cwd: string, runId: string, count: number, workerId: string): Promise<void> {
  const workerPath = fileURLToPath(new URL("./test-fixtures/ledger-writer.ts", import.meta.url));

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", workerPath, cwd, runId, String(count), workerId],
      { cwd: process.cwd(), stdio: "pipe" }
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Ledger writer ${workerId} failed (${code}): ${stderr}`));
      }
    });
  });
}
