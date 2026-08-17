# Known Limitations

Gleipnir is a local-only evidence ledger and precision risk observer built around deterministic mechanisms and heuristics.

- Gleip does not prove code correctness.
- Gleip does not replace tests, human review, or security review.
- Gleip depends on coding agents respecting repo instructions.
- Gleip cannot detect that an agent is in a read-only planning mode. The agent declares it by passing `--plan-mode`; nothing enforces that it does.
- Task classification is keyword-based. Rules are ranked by how much of the task each matched, but dependency, migration, auth, and CI rules keep first-match precedence, so a passing mention of those areas still selects the sensitive profile.
- Requirement extraction splits sentences into clauses only when every clause reads as an instruction or a guardrail. A multi-part instruction phrased without those signals is still recorded as one requirement.
- A trailing `without <gerund>` constraint is recorded as advisory, not prohibited. The same phrasing states purpose as often as it forbids an action, and Gleip does not attempt to tell them apart.
- Verification evidence is recognized from a closed vocabulary of verification commands. A project-specific verification command outside that vocabulary is not detected unless it is declared under `required_commands`.
- Brief coverage compares the brief with the extracted requirements. It does not measure whether extraction captured the whole task.
- `scope-budget.json` repeats several values under compatibility aliases (`expectedPaths`/`allowedPaths`, `protectedChecks`/`hardGates`, `approvalRequiredChanges`/`blockedWithoutApproval`, `pauseAndClarifyConditions`/`stopConditions`). The `--plan-mode` view emits each once; collapsing the persisted artifact is a schema change deferred past 1.2.
- Scope budgets are practical estimates, not absolute truth.
- Repo context discovery is lexical and local, not semantic AI reasoning.
- Plan validation is deterministic and can miss intent.
- Requirement extraction is deterministic and conservative; ambiguous requirements are advisory until confirmed.
- Drift detection is based on git working-tree diffs and scope budget rules.
- Report scores are deterministic heuristics and do not prove correctness, test coverage, or review approval.
- Requirement completion uses available local evidence and cannot prove deep semantic implementation.
- Estimated removable text is not exact model usage, billing data, or a measured counterfactual.
- Context-compression token counts are estimates and net savings can be zero when
  retrieval overhead cancels compact-display savings.
- Compression is experimental and limited to selected execution-evidence classes in 1.1.0.
- Source code, active canonical task state, active brief, requirement ledger,
  accepted plan, scope state, approval state, and completion state pass through.
- Missing session artifacts, plan validation, git state, or explicit tests/risks evidence reduce report confidence.
- Scope and requirement relationships are inferences, not semantic proof.
- Hashes and event chains detect accidental corruption; they do not resist a malicious local process with equivalent filesystem permissions.
- Gleipnir does not authorize merges, verify deployments, provide AI review, or establish benchmarked task benefit.
