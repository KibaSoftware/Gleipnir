# Scope Budget

Scope budget is the amount of repository change Gleip expects for a task.

Initial budget levels:

- `small`: localized edits with narrow tests or docs.
- `medium`: multiple related files or package-level behavior.
- `large`: cross-package work that requires explicit planning.

Agents should choose the smallest budget that can satisfy the request. Increasing budget should require an explanation of why the original scope is insufficient.

## Task Classification

Gleip starts preflight by classifying the developer task before code is written. Classification is deterministic and explainable: it uses keyword and phrase heuristics to identify signals such as copy changes, UI tweaks, bug fixes, API endpoints, migrations, dependency upgrades, auth or security changes, CI and infrastructure changes, and test-only work.

Classification is not the final authority for scope. It is an early, reviewable guess that records task type, confidence, risk level, test expectations, dependency expectations, and reasons. Later scope budget generation will combine this classification with repository context and git state before making stronger recommendations.

## Repo Context Discovery

Classification is generic, so Gleip also discovers local repository context during preflight. This scan is deterministic and local-first: it walks bounded repository files, skips generated and dependency directories, ignores obvious binary assets, and extracts likely relevant files, likely tests, dependency files, CI files, existing patterns, and risky paths from config globs.

Repo context grounds the brief in the actual project before code changes start. Later scope budget generation will combine classification with this discovered context to make better recommendations about expected files, tests, risky areas, and approval needs.

## Preliminary Budgets

Scope budgets are hypotheses, not absolute truth. Gleip combines task classification, local repo context, and config to propose expected file and line ranges, allowed paths, approval-required areas, required tests, and stop conditions before implementation starts.

Soft limits are warning thresholds for scope growth. Hard gates are objective danger checks such as new dependencies, CI changes, skipped or deleted tests, and secrets. When an agent needs to exceed the budget or cross a hard gate, it should stop and ask for approval instead of continuing silently.
