# Known Limitations

Gleipnir is a local-only evidence ledger and precision risk observer built around deterministic mechanisms and heuristics.

- Gleip does not prove code correctness.
- Gleip does not replace tests, human review, or security review.
- Gleip depends on coding agents respecting repo instructions.
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
- Compression is experimental and limited to selected execution-evidence classes in 1.0.0.
- Source code, active canonical task state, active brief, requirement ledger,
  accepted plan, scope state, approval state, and completion state pass through.
- Missing session artifacts, plan validation, git state, or explicit tests/risks evidence reduce report confidence.
- Scope and requirement relationships are inferences, not semantic proof.
- Hashes and event chains detect accidental corruption; they do not resist a malicious local process with equivalent filesystem permissions.
- Gleipnir does not authorize merges, verify deployments, provide AI review, or establish benchmarked task benefit.
