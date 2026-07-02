# Known Limitations

Gleip is a local-only developer preview built around deterministic heuristics.

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
- Estimated token waste avoided is not exact model usage, billing data, or a measured counterfactual.
- Missing session artifacts, plan validation, git state, or explicit tests/risks evidence reduce report confidence.
- No AI review is included in this local-only preview.
- 0.8.4 does not implement context compression; it only preserves canonical task authority needed before compression work.
