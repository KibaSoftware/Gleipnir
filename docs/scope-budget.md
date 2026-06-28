# Scope Budget

Scope budget is the amount of repository change Gleip expects for a task.

Initial budget levels:

- `small`: localized edits with narrow tests or docs.
- `medium`: multiple related files or package-level behavior.
- `large`: cross-package work that requires explicit planning.

Agents should use the smallest budget that can satisfy the request. Explicitly broad
tasks receive broader advisory limits. Expansion beyond expected paths should
include a scope rationale naming the extra area, why it is needed, and how it will
be verified.

## Task Classification

Gleip starts preflight by classifying the developer task before code is written. Classification is deterministic and explainable: it uses keyword and phrase heuristics to identify signals such as copy changes, UI tweaks, bug fixes, API endpoints, migrations, dependency upgrades, auth or security changes, CI and infrastructure changes, and test-only work.

Classification is not the final authority for scope. It is an early, reviewable guess that records task type, confidence, risk level, test expectations, dependency expectations, and reasons. Later scope budget generation will combine this classification with repository context and git state before making stronger recommendations.

## Workflow Profiles

Gleip 0.8.2 assigns an internal workflow profile to calibrate ceremony:

- `documentation_only`: one- or two-file non-executable documentation/context updates. No plan or tests are required by default; verification is content review, formatting/generated-file checks where applicable, and diff validation.
- `local_behavior_change`: contained source behavior work in one implementation area. A short plan and focused verification are expected.
- `broad_change`: multi-module, multi-package, cross-layer, or repository-wide work. A validated plan, scope rationale, and broader verification are expected.
- `sensitive_change`: dependency, CI, auth/security, payment, infrastructure, migration, secret-handling, or security-policy work. Approval and hard-gate behavior is preserved.

Markdown, JSON, YAML, and context-looking files are not automatically documentation-only. Generated files, executable configuration, package metadata, CI, policy-bearing agent files, and runtime-consumed files remain protected by their active category.

## Repo Context Discovery

Classification is generic, so Gleip also discovers local repository context during preflight. This scan is deterministic and local-first: it walks bounded repository files, skips dependency, virtualenv, vendor, generated, cache, coverage, and build directories, ignores generated/binary artifacts, and extracts likely relevant files, likely tests, dependency files, CI files, existing patterns, and risky paths from config globs.

Repo context grounds the brief in the actual project before code changes start.
Runtime, output, cache, coverage, and build paths are excluded from passive
relevance discovery. A specific task-declared report, result, fixture, state file,
or artifact can still be accepted narrowly without broadening source scope.

Discovery candidates are not the same as expected scope. After a plan validates successfully, accepted plan targets become the effective expected scope for status and report checks. Original candidates can remain allowed or diagnostic evidence, but weak keyword matches do not dominate current scope.

## Preliminary Budgets

Scope budgets are hypotheses, not absolute truth. Gleip combines task
classification, local repo context, and config to propose expected file and line
ranges, expected paths, approval-required changes, expected verification, protected
checks, and pause-and-clarify conditions before implementation starts.

Scope is evaluated semantically as well as structurally. A file count above the
initial estimate is not scope expansion by itself. Scope expansion means proposed
work has no credible relationship to the requested objective, or crosses a
protected semantic boundary such as dependency additions, public contracts,
persistence behavior, auth behavior, test integrity, generated files, or secrets.

The legacy serialized keys `allowedPaths`, `blockedWithoutApproval`, `requiredTests`,
`hardGates`, and `stopConditions` remain readable for compatibility. New output and
documentation use `expectedPaths`, `approvalRequiredChanges`,
`verificationExpected`, `protectedChecks`, and `pauseAndClarifyConditions`.

## Declared Task Breadth

The task contract is the primary boundary for scope drift. Gleip detects affirmative,
explicit breadth from named files, directories, subsystems, categories, and work
lists. Categories include source, CLI, planner, tests, docs, README, changelog,
config, package metadata/version files, smoke coverage, and expected output areas.
It adds only those declared areas to expected paths and scales expected file and line
ranges by the number of named areas.

Task size is not inferred from magic release or version words. A task spanning
planner, CLI, tests, docs, and an output artifact may use those declared areas
without extra rationale, while an unrelated CI, secret, or dependency change still
requires approval or cleanup. A plan exceeds declared task scope only when it
proposes files or categories outside that contract.

Exact paths remain exact. Naming `tests/foo.test.ts` does not open every test path.
Package metadata changes are aligned only when package/version/metadata work is
explicitly requested. Dependency additions remain separately gated.

Explicit `modify only`, `edit only`, `change only`, `touch only`, and `only update`
constraints narrow expected paths and expected file counts to the named targets. Files
identified as task, specification, design, notes, reference, or other read-only
context do not become edit targets unless the task explicitly requests editing them.

`contextDocsTouchAllowed` is true only when the task or accepted plan explicitly edits a recognized context document. Read-only context files remain protected and are removed from the read-only list only when accepted as editable plan targets.

Small updates to common project context files such as `FULL_CONTEXT.md`,
`PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md`,
`CONTRIBUTING.md`, `NOTES.md`, and `docs/**/*.md` are accepted low-risk touches
when broad patch, docs, architecture, or context maintenance work calls for them.
They do not become primary implementation targets or open source scope. A task file
passed to `preflight --file` remains read-only unless explicitly targeted.

Soft limits are advisory thresholds for scope growth. Ordinary source and test
expansion remains advisory because the heuristic budget can be narrow. Protected
checks identify changes needing cleanup, focused action, or approval, such as new
dependencies, CI changes, skipped or deleted tests, and secrets. They guide the
next action without declaring the task invalid.

Gleip also records generic breadth as `local`, `feature`, `subsystem`,
`cross_cutting`, or `repository_wide`. Breadth adjusts advisory thresholds, but it
does not permit unrelated changes. Explicit declarations such as files,
directories, globs, all current surfaces, shared primitives, docs, tests, or all
consumers outrank narrower inferred path guesses.

Plan targets are classified as:

- `direct`: explicitly named or matched by a declared path, directory, or glob.
- `derived`: structurally related to direct scope, such as a test, import
  relationship, shared dependency, containing scope, or target with a specific
  operation rationale tied to the objective.
- `adjacent`: plausible for the task, but lacking enough evidence; add rationale.
- `unexplained`: no credible relationship was found; remove or justify it.

Slash-containing prose is not automatically a path. Strong path candidates need
evidence such as a file extension, manifest/config name, glob syntax, backticks or
quotes, a structured files/targets section, or another clear path context. Path
separators are normalized, so `path/to/file.ts` and `path\to\file.ts` are treated
as the same target.

Plan validation compares proposed files with the budget and requests clarification,
cleanup, or approval for excess file count, outside paths, risky categories,
dependency changes, and test weakening. Gleip does not infer that an implementation
is wrong from these signals.

Package metadata/version changes are distinct from dependency additions. When the
task requests package metadata, manifest version edits are aligned scope, but added
dependencies and lockfile changes remain gated.
