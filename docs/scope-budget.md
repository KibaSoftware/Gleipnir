# Scope Budget

Scope budget is the amount of repository change Gleip expects for a task.

Initial budget levels:

- `small`: localized edits with narrow tests or docs.
- `medium`: multiple related files or package-level behavior.
- `large`: cross-package work that requires explicit planning.

Agents should choose the smallest budget that can satisfy the request. Expansion
beyond expected paths should include a scope rationale naming the extra area, why it
is needed, and how it will be verified.

## Task Classification

Gleip starts preflight by classifying the developer task before code is written. Classification is deterministic and explainable: it uses keyword and phrase heuristics to identify signals such as copy changes, UI tweaks, bug fixes, API endpoints, migrations, dependency upgrades, auth or security changes, CI and infrastructure changes, and test-only work.

Classification is not the final authority for scope. It is an early, reviewable guess that records task type, confidence, risk level, test expectations, dependency expectations, and reasons. Later scope budget generation will combine this classification with repository context and git state before making stronger recommendations.

## Repo Context Discovery

Classification is generic, so Gleip also discovers local repository context during preflight. This scan is deterministic and local-first: it walks bounded repository files, skips dependency, virtualenv, vendor, generated, cache, coverage, and build directories, ignores generated/binary artifacts, and extracts likely relevant files, likely tests, dependency files, CI files, existing patterns, and risky paths from config globs.

Repo context grounds the brief in the actual project before code changes start. Later scope budget generation will combine classification with this discovered context to make better recommendations about expected files, tests, risky areas, and approval needs.

## Preliminary Budgets

Scope budgets are hypotheses, not absolute truth. Gleip combines task classification, local repo context, and config to propose expected file and line ranges, allowed paths, approval-required areas, required tests, and stop conditions before implementation starts.

## Declared Task Breadth

The task contract is the primary boundary for scope drift. Gleip detects affirmative,
explicit breadth from named files, directories, subsystems, categories, and work
lists. Categories include source, CLI, planner, tests, docs, README, changelog,
config, package metadata/version files, smoke coverage, and expected output areas.
It adds only those declared areas to allowed paths and scales expected file and line
ranges by the number of named areas.

Task size is not inferred from magic release or version words. A feature spanning
planner, CLI, tests, and docs may use those areas without extra rationale, while an
unrelated CI, secret, or dependency change remains outside scope. A plan exceeds
declared task scope only when it proposes files or categories outside that contract.

Exact paths remain exact. Naming `tests/foo.test.ts` does not open every test path.
Package metadata changes are aligned only when package/version/metadata work is
explicitly requested. Dependency additions remain separately gated.

Explicit `modify only`, `edit only`, `change only`, `touch only`, and `only update`
constraints narrow allowed paths and expected file counts to the named targets. Files
identified as task, specification, design, notes, reference, or other read-only
context do not become edit targets unless the task explicitly requests editing them.

Soft limits are warning thresholds for scope growth. Ordinary source and test
expansion remains advisory because the heuristic budget can be narrow. Hard gates
are objective danger checks such as new dependencies, CI changes, skipped or
deleted tests, and secrets. When an agent needs to cross a hard gate, it should stop
and ask for approval instead of continuing silently.

Plan validation compares proposed files with the budget and requests clarification
for excess file count, outside paths, risky categories, dependency changes, and test
weakening. Gleip does not infer that an implementation is wrong from these signals.

Package metadata/version changes are distinct from dependency additions. When the
task requests package metadata, manifest version edits are aligned scope, but added
dependencies and lockfile changes remain gated.
