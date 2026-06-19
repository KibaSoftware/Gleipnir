# Changelog

## 0.7.2

### Fixed

- Added target-specific agent initialization:
  - `gleip init codex` writes `AGENTS.md`.
  - `gleip init claude` writes `CLAUDE.md`.
  - `gleip init gemini` writes `GEMINI.md`.
  - `gleip init auto` detects and writes exactly one instruction file.
- Preserved the existing default `gleip init` behavior using `AGENTS.md`.
- Prevented generation of unsupported `CODEX.md` files.
- Added Gleip's standard agent working principles:
  - Think before coding.
  - Simplicity first.
  - Surgical changes.
  - Goal-driven execution.
- Added agent-standard documentation and practical anti-pattern examples.
- Preserved user-authored content outside Gleip-managed instruction blocks.

## 0.7.1

### Added

- Added guidance-oriented top-level statuses: `clean`, `advisory`,
  `needs_attention`, `needs_cleanup`, and `needs_approval`.
- Added finding-aware next actions for cleanup, approval, verification, secret,
  CI, dependency, and scope findings.
- Added compatibility aliases for `expectedPaths`, `protectedChecks`,
  `approvalRequiredChanges`, `verificationExpected`, and
  `pauseAndClarifyConditions`.
- Added generic context-document handling and runtime/output/cache scope hygiene.

### Changed

- Reframed Gleip as a local guidance tool rather than a permission system.
- Made local `status`, `check`, and valid `validate-plan` findings advisory in
  process behavior; CI may still fail on documented high-confidence findings.
- Reframed dependency, lockfile, CI, config, and security-sensitive changes as
  approval or cleanup work instead of task denial.
- Treated expected scope as a declared likelihood signal rather than exclusive
  permission, with scope rationale used to explain expansion.
- Scaled advisory file and line budgets for explicitly broad, multi-area tasks
  while keeping narrow `modify only` tasks tight.
- Accepted focused existing tests, smoke tests, typechecks, compile checks, and
  appropriate manual checks as verification evidence.
- Treated small context and architecture documentation updates as low-risk
  touches when aligned with the declared work.
- Excluded common runtime, output, cache, coverage, and build paths from passive
  relevance discovery without globally forbidding task-declared artifacts.

### Security / Privacy

- Preserved local-only operation with no telemetry, analytics, network calls,
  cloud behavior, external API/LLM calls, source upload, repository metadata
  upload, dashboards, or account systems.

## 0.7.0

### Added

- Added `gleip preflight --file <path>` for full task contracts.
- Added `gleip validate-plan --file <path>` with clear missing-plan and mixed-input errors.
- Added first-class read-only context-file tracking in task and plan analysis.
- Added deterministic structural checks for implementation, file/module scope,
  verification, and risk/scope-rationale information.
- Added local mentioned-file validation, explicit new-file handling, output-artifact
  handling, and excluded vendor/generated edit-target findings.
- Added scope-expansion rationale checks that require a named area, reason, and
  verification without judging whether the rationale is semantically correct.
- Added local dependency requirement conflict detection for common Python and Node
  packages using task text, plan text, and repository manifests only.
- Added stable structural finding codes for plan sections, mentioned files, scope
  expansion, dependency conflicts, risky changes, and scope-budget mismatches.
- Added declared-breadth detection so explicit multi-area release, feature, docs,
  tests, package metadata, and smoke-test tasks scale their scope budgets.

### Changed

- Included the scope-hygiene work prepared for 0.6.0 in this 0.7.0 release.
- Excluded dependency, virtualenv, vendor, generated, cache, coverage, and binary
  build artifacts from repository relevance and scope discovery.
- Narrowed scope budgets for explicit `modify only` task constraints.
- Recognized existing-test runs, smoke tests, typechecks, compile checks, and
  common test runners as valid plan verification.
- Kept ordinary source and test expansion advisory while preserving stronger
  findings for dependency, lockfile, CI, secret, and security-sensitive changes.
- Distinguished changes aligned with declared task scope from unexpected expansion;
  scope rationale is required only beyond the declared contract.
- Scaled budgets from generic declared files, directories, subsystems, categories,
  and multi-area work lists without treating release/version wording as a scope
  shortcut.
- Kept specifically named test paths exact instead of opening every test directory.
- Allowed explicitly requested package metadata/version edits without opening
  dependency additions or lockfile changes.
- Updated plan wording to request clarification and scope rationale rather than
  claiming semantic plan quality.

### Security / Privacy

- Preserved local-only operation with no telemetry, analytics, network calls,
  cloud behavior, external API/LLM calls, source upload, repository metadata
  upload, dashboards, or account systems.

## 0.5.0

### Added

- Added stable finding codes and `info`, `warn`, `fail`, and `blocking` severities.
- Added conservative `gleip check --ci` behavior with an explicit blocking-code allowlist.
- Added non-zero exits and `NO_ACTIVE_SESSION` output for session-required commands.

### Changed

- Made scope expansion warning-only for 0.5.0.
- Split dependency manifest and lockfile findings into stable codes.
- Documented precision-first policy, CI behavior, and false-positive release gates.

### Security / Privacy

- Preserved local-only operation with no telemetry, network calls, cloud behavior,
  external API/LLM calls, source upload, repository metadata upload, accounts, or
  hosted dashboards.

## 0.4.0

### Added

- Added `gleip --version` so installed package versions can be verified directly.
- Added clearer first-run guidance after `gleip init`.
- Strengthened agent usage instructions for `preflight`, `validate-plan`, `check`, and `status`.
- Added `doctor` setup diagnostics for incomplete initialization, instructions, and local artifact protection.

### Changed

- Improved npm package metadata with accurate AI-agent, code-quality, and local guardrail keywords.
- Updated README install, first-run, agent workflow, and committed-file guidance.
- Clarified correct version-check commands, including `npx gleip --version` and local binary usage on Unix and Windows PowerShell.
- Documented that `npm gleip --version` prints npm's version, not Gleip's.

### Fixed

- Made `gleip init` reliably create or update `.gitignore` with an idempotent Gleip local-artifacts block.
- Protected local-only Gleip session, baseline, state, and report artifacts from accidental commits.
- Fixed the root npm package metadata so installs expose the built `gleip` executable.
- Improved and smoke-tested behavior from the packed npm artifact.

### Security / Privacy

- Reaffirmed Gleip's local-only design: no telemetry, network calls, cloud sync, external API calls, or source code and repository metadata leaving the local repository.
