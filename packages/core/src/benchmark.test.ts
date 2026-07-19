import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createBenchmarkManifest,
  recordBenchmarkObservation,
  type BenchmarkArm,
  type BenchmarkAssignment,
  type BenchmarkTask
} from "./benchmark.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("benchmark instrumentation", () => {
  it("requires every task to have three repetitions in all three arms", () => {
    expect(() =>
      createBenchmarkManifest({
        createdAt: "2026-07-19T00:00:00.000Z",
        tasks: [task()],
        assignments: assignments().slice(0, 8),
        preregisteredMetrics: ["acceptance_test_pass_rate"]
      })
    ).toThrow("requires 3 repetitions");
  });

  it("creates a blinded no-network manifest without claiming results", () => {
    const manifest = createBenchmarkManifest({
      createdAt: "2026-07-19T00:00:00.000Z",
      tasks: [task()],
      assignments: assignments(),
      preregisteredMetrics: ["regression_rate", "acceptance_test_pass_rate"]
    });

    expect(manifest.blindedReview).toBe(true);
    expect(manifest.networkAllowed).toBe(false);
    expect(manifest.minimumRepetitions).toBe(3);
    expect(manifest).not.toHaveProperty("results");
  });

  it("stores nullable measured outcomes atomically as local instrumentation", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gleip-benchmark-"));
    temporaryDirectories.push(cwd);
    const observation = recordBenchmarkObservation(cwd, "benchmark-1", {
      assignmentId: "assignment-1",
      recordedAt: "2026-07-19T00:00:00.000Z",
      repositoryFingerprint: "repo-final",
      finalTreeDigest: "tree-final",
      acceptancePassed: null,
      regressionCount: null,
      humanCorrectionCount: null,
      reviewerInspectionMs: null,
      executionMs: 12,
      providerInputTokens: null,
      providerOutputTokens: null,
      providerCost: null,
      scopeViolationCount: null,
      protectedSurfaceIncidentCount: null,
      evidenceCompleteness: null,
      interventionCodes: [],
      commandCount: 1,
      toolCallCount: 1,
      governanceBytes: 100,
      compressedBytes: 0,
      retrievedBytes: 0,
      notes: ["Outcome review not yet performed."]
    });
    const stored = JSON.parse(
      readFileSync(
        join(cwd, ".gleip", "benchmarks", "benchmark-1", "observations", "assignment-1.json"),
        "utf8"
      )
    ) as typeof observation;

    expect(stored).toEqual(observation);
    expect(stored.acceptancePassed).toBeNull();
  });
});

function task(): BenchmarkTask {
  return {
    id: "task-1",
    version: "1",
    repositoryCommit: "abc123",
    taskDigest: "sha256:task",
    acceptanceSuiteDigest: "sha256:suite",
    category: "source_and_test_change",
    longTask: false
  };
}

function assignments(): BenchmarkAssignment[] {
  const arms: BenchmarkArm[] = ["no_gleipnir", "current_gleipnir", "passive_gleipnir"];
  return arms.flatMap((arm) =>
    [1, 2, 3].map((repetition) => ({
      id: `${arm}-${repetition}`,
      taskId: "task-1",
      arm,
      repetition,
      modelId: "frozen-model",
      randomizationBlock: `block-${repetition}`
    }))
  );
}
