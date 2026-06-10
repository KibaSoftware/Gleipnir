# Known Limitations

Gleip is a local-only developer preview built around deterministic heuristics.

- Gleip does not prove code correctness.
- Gleip does not replace tests, human review, or security review.
- Gleip depends on coding agents respecting repo instructions.
- Scope budgets are practical estimates, not absolute truth.
- Repo context discovery is lexical and local, not semantic AI reasoning.
- Plan validation is deterministic and can miss intent.
- Drift detection is based on git working-tree diffs and scope budget rules.
- Report scores are deterministic heuristics and do not prove correctness, test coverage, or review approval.
- Estimated token waste avoided is not exact model usage, billing data, or a measured counterfactual.
- Missing session artifacts, plan validation, git state, or explicit tests/risks evidence reduce report confidence.
- No AI review is included in this local-only preview.
