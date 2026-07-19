import { describe, expect, it } from "vitest";

import {
  approvalAtRepositoryState,
  canonicalJson,
  createApprovalRecord,
  createEvidenceItem,
  createFinalEvidenceBundle,
  evidenceAtRepositoryState,
  revokeApprovalRecord,
  sha256Digest,
  verifyEvidenceItem,
  type CommandAttestationPayload,
  type EvidenceClass
} from "./evidence.js";

const now = "2026-07-19T12:00:00.000Z";

describe("typed evidence", () => {
  it("creates stable canonical evidence without promoting its class", () => {
    const input = {
      runId: "run-test",
      eventSequence: 3,
      evidenceClass: "agent_claim" as const,
      source: { kind: "status", name: ".gleip/status.md" },
      createdAt: now,
      repositoryFingerprint: "repo-a",
      taskRevision: 1,
      payload: { tests: "passed", nested: { z: 1, a: 2 } }
    };
    const first = createEvidenceItem(input);
    const second = createEvidenceItem(input);

    expect(first).toEqual(second);
    expect(first.evidenceClass).toBe("agent_claim");
    expect(verifyEvidenceItem(first)).toBe(true);
    expect(canonicalJson({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
  });

  it("marks evidence stale after repository or task changes", () => {
    const item = evidence("observed_fact", "repo-a", 1);

    expect(evidenceAtRepositoryState(item, "repo-a", 1, now).staleness.state).toBe("current");
    const stale = evidenceAtRepositoryState(item, "repo-b", 2, now);
    expect(stale.staleness.state).toBe("stale");
    expect(stale.staleness.reason).toContain("Repository fingerprint changed");
    expect(stale.staleness.reason).toContain("Task revision changed");
    expect(verifyEvidenceItem(stale)).toBe(true);
  });
});

describe("approvals", () => {
  it("creates, invalidates, and revokes explicit approval records", () => {
    const approval = createApprovalRecord({
      runId: "run-test",
      actor: "reviewer@example.test",
      source: "local-review",
      reason: "Approved dependency addition.",
      scope: "DEPENDENCY_FILE_CHANGED",
      affectedPaths: ["package.json"],
      findingIds: ["finding-1"],
      repositoryFingerprint: "repo-a",
      taskRevision: 1,
      createdAt: now
    });

    expect(approval.state).toBe("active");
    expect(approvalAtRepositoryState(approval, "repo-a", 1, now)).toEqual(approval);
    expect(approvalAtRepositoryState(approval, "repo-b", 1, now).state).toBe("invalid");
    expect(revokeApprovalRecord(approval, now).state).toBe("revoked");
  });
});

describe("final evidence bundle", () => {
  it("separates classes and requires current successful attestations", () => {
    const command = evidence("command_attestation", "repo-final", 1, {
      ...commandPayload(0)
    });
    const claim = evidence("agent_claim", "repo-final", 1, { tests: "passed" });
    const bundle = createFinalEvidenceBundle({
      runId: "run-test",
      createdAt: now,
      taskAuthority: { present: true, revision: 1, digest: sha256Digest("task") },
      repository: {
        fingerprint: "repo-final",
        head: "abc",
        dirty: true,
        changedPaths: ["src/index.ts"]
      },
      evidenceItems: [command, claim],
      approvals: [],
      hazards: [],
      requiredCommands: [
        {
          id: "tests",
          executable: "pnpm.cmd",
          argumentIncludes: ["test"],
          description: "Full tests"
        }
      ]
    });

    expect(bundle.evidence.agent_claim).toEqual([claim.id]);
    expect(bundle.evidence.command_attestation).toEqual([command.id]);
    expect(bundle.requiredCommands[0]?.state).toBe("satisfied");
    expect(bundle.completionStatus).toBe("complete");
  });

  it("does not use prose claims as command evidence", () => {
    const claim = evidence("agent_claim", "repo-final", 1, {
      executable: "pnpm.cmd",
      arguments: ["test"],
      exitCode: 0
    });
    const bundle = createFinalEvidenceBundle({
      runId: "run-test",
      createdAt: now,
      taskAuthority: { present: true, revision: 1 },
      repository: { fingerprint: "repo-final", dirty: false, changedPaths: [] },
      evidenceItems: [claim],
      approvals: [],
      hazards: [],
      requiredCommands: [{ id: "tests", description: "Full tests" }]
    });

    expect(bundle.requiredCommands[0]?.state).toBe("missing");
    expect(bundle.completionStatus).toBe("incomplete");
  });

  it.each([
    ["failed", commandPayload(1), "repo-final"],
    ["stale", commandPayload(0), "repo-changed"]
  ] as const)("reports %s required command evidence", (state, payload, fingerprint) => {
    const command = evidence("command_attestation", fingerprint, 1, { ...payload });
    const bundle = createFinalEvidenceBundle({
      runId: "run-test",
      createdAt: now,
      taskAuthority: { present: true, revision: 1 },
      repository: { fingerprint: "repo-final", dirty: false, changedPaths: [] },
      evidenceItems: [command],
      approvals: [],
      hazards: [],
      requiredCommands: [{ id: "tests", description: "Full tests" }]
    });

    expect(bundle.requiredCommands[0]?.state).toBe(state);
    expect(bundle.completionStatus).toBe("incomplete");
  });

  it("uses only current explicit approvals to resolve approval hazards", () => {
    const approval = createApprovalRecord({
      runId: "run-test",
      actor: "reviewer",
      source: "local-review",
      reason: "Reviewed the dependency.",
      scope: "DEPENDENCY_FILE_CHANGED",
      findingIds: ["finding-1"],
      repositoryFingerprint: "repo-final",
      taskRevision: 1,
      createdAt: now
    });
    const base = {
      runId: "run-test",
      createdAt: now,
      taskAuthority: { present: true, revision: 1 },
      repository: { fingerprint: "repo-final", dirty: false, changedPaths: [] },
      evidenceItems: [],
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
    };

    expect(createFinalEvidenceBundle({ ...base, approvals: [approval] }).completionStatus).toBe(
      "complete"
    );
    expect(
      createFinalEvidenceBundle({
        ...base,
        repository: { ...base.repository, fingerprint: "repo-changed" },
        approvals: [approval]
      }).completionStatus
    ).toBe("blocked_completion");
  });
});

function evidence(
  evidenceClass: EvidenceClass,
  repositoryFingerprint: string,
  taskRevision: number,
  payload: Record<string, unknown> = {}
) {
  return createEvidenceItem({
    runId: "run-test",
    eventSequence: evidenceClass === "command_attestation" ? 2 : 1,
    evidenceClass,
    source: { kind: "test", name: evidenceClass },
    createdAt: now,
    repositoryFingerprint,
    taskRevision,
    payload
  });
}

function commandPayload(exitCode: number): CommandAttestationPayload {
  return {
    executable: "pnpm.cmd",
    arguments: ["test"],
    workingDirectory: "C:/repo",
    startedAt: now,
    finishedAt: now,
    durationMs: 1,
    exitCode,
    repositoryFingerprintBefore: "repo-final",
    repositoryFingerprintAfter: "repo-final",
    environmentFingerprint: sha256Digest("environment"),
    stdoutDigest: sha256Digest("ok"),
    stderrDigest: sha256Digest(""),
    fullOutputStored: false,
    outputCompressed: false
  };
}
