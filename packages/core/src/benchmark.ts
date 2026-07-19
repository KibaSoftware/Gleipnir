import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { canonicalJson, sha256Digest } from "./evidence.js";
import { writeAtomicJson } from "./ledger.js";

export const BENCHMARK_SCHEMA_VERSION = "1.0.0" as const;

export type BenchmarkArm = "no_gleipnir" | "current_gleipnir" | "passive_gleipnir";

export interface BenchmarkTask {
  id: string;
  version: string;
  repositoryCommit: string;
  taskDigest: string;
  acceptanceSuiteDigest: string;
  category: string;
  longTask: boolean;
}

export interface BenchmarkAssignment {
  id: string;
  taskId: string;
  arm: BenchmarkArm;
  repetition: number;
  modelId: string;
  randomizationBlock: string;
}

export interface BenchmarkManifest {
  schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  blindedReview: true;
  minimumRepetitions: number;
  networkAllowed: false;
  tasks: BenchmarkTask[];
  assignments: BenchmarkAssignment[];
  preregisteredMetrics: string[];
  integrityDigest: string;
}

export interface BenchmarkObservation {
  schemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
  assignmentId: string;
  recordedAt: string;
  repositoryFingerprint: string;
  finalTreeDigest: string;
  acceptancePassed: boolean | null;
  regressionCount: number | null;
  humanCorrectionCount: number | null;
  reviewerInspectionMs: number | null;
  executionMs: number;
  providerInputTokens: number | null;
  providerOutputTokens: number | null;
  providerCost: number | null;
  scopeViolationCount: number | null;
  protectedSurfaceIncidentCount: number | null;
  evidenceCompleteness: number | null;
  interventionCodes: string[];
  commandCount: number;
  toolCallCount: number;
  governanceBytes: number;
  compressedBytes: number;
  retrievedBytes: number;
  notes: string[];
  integrityDigest: string;
}

export function createBenchmarkManifest(input: {
  createdAt: string;
  tasks: BenchmarkTask[];
  assignments: BenchmarkAssignment[];
  preregisteredMetrics: string[];
  minimumRepetitions?: number;
}): BenchmarkManifest {
  const minimumRepetitions = input.minimumRepetitions ?? 3;

  if (minimumRepetitions < 3) {
    throw new Error("Benchmark manifests require at least three repetitions.");
  }

  validateAssignments(input.tasks, input.assignments, minimumRepetitions);
  const base = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    id: `benchmark-${randomUUID()}`,
    createdAt: input.createdAt,
    blindedReview: true as const,
    minimumRepetitions,
    networkAllowed: false as const,
    tasks: input.tasks,
    assignments: input.assignments,
    preregisteredMetrics: [...new Set(input.preregisteredMetrics)].sort()
  };

  return { ...base, integrityDigest: sha256Digest(canonicalJson(base)) };
}

export function recordBenchmarkObservation(
  cwd: string,
  benchmarkId: string,
  observation: Omit<BenchmarkObservation, "schemaVersion" | "integrityDigest">
): BenchmarkObservation {
  const base = { schemaVersion: BENCHMARK_SCHEMA_VERSION, ...observation };
  const completed = { ...base, integrityDigest: sha256Digest(canonicalJson(base)) };
  writeAtomicJson(
    join(
      cwd,
      ".gleip",
      "benchmarks",
      benchmarkId,
      "observations",
      `${observation.assignmentId}.json`
    ),
    completed
  );
  return completed;
}

function validateAssignments(
  tasks: BenchmarkTask[],
  assignments: BenchmarkAssignment[],
  minimumRepetitions: number
): void {
  const taskIds = new Set(tasks.map((task) => task.id));
  const arms: BenchmarkArm[] = ["no_gleipnir", "current_gleipnir", "passive_gleipnir"];

  for (const assignment of assignments) {
    if (!taskIds.has(assignment.taskId)) {
      throw new Error(`Unknown benchmark task: ${assignment.taskId}.`);
    }
  }

  for (const task of tasks) {
    for (const arm of arms) {
      const repetitions = new Set(
        assignments
          .filter((assignment) => assignment.taskId === task.id && assignment.arm === arm)
          .map((assignment) => assignment.repetition)
      );

      if (repetitions.size < minimumRepetitions) {
        throw new Error(
          `Task ${task.id} requires ${minimumRepetitions} repetitions for arm ${arm}.`
        );
      }
    }
  }
}
