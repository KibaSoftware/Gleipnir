# Changelog

## [0.8.2]

### Changed

- Added workflow profiles for documentation-only, local behavior, broad, and sensitive changes so ordinary docs and contained source work use less ceremony while sensitive work keeps approval gates.
- Reclassified accepted plans into the current scope budget so validated targets become the effective expected scope.
- Split discovery candidates from expected scope in normal output and kept dormant repository protections separate from active findings.
- Added phase, repository fingerprint, session, sequence, and current-artifact metadata to status and report artifacts.
- Made efficiency reporting evidence-based; unavailable token-savings evidence is reported as unavailable instead of as a positive claim.

### Fixed

- Prevented editable context documents from also being marked read-only.
- Prevented review readiness from reaching 100 when required verification or completion evidence is missing.
- Prevented documentation-only tasks from being penalized for skipping an unnecessary plan.

### Compatibility

- 0.8.0 and 0.8.1 session, cache, status, and report artifacts remain readable with compatibility fallbacks. New artifacts use the 0.8.2 schema metadata.

## [0.8.1]

### Fixed

- Made `validate-plan` use deterministic task-sensitive evidence detection for approach and verification, reducing vocabulary-sensitive false positives for audit, investigation, documentation, operational, and constrained validation plans.
- Broadened verification recognition beyond exact test/check/smoke wording to include comparison, reconciliation, reproduction, rendered review, status confirmation, and explicit limitation reporting.
- Prevented negated verification wording such as "do not run tests" from satisfying the verification requirement.

## [0.8.0]

### Added

- Added `gleip check --incremental` with deterministic result reuse, `--force` recomputation, complete first-run baselines, and added/updated/resolved finding deltas.
- Added `gleip status --compact` for five-field iterative status output.
- Added directly observable incremental JSON metrics for requested, executed, and reused checks; reuse rate; finding emission and delta counts; and changed files. Unobservable validation and external-command repetition metrics remain explicitly unavailable.

### Changed

- Added a canonical local fingerprint over repository HEAD and working state, active session/task, brief, baseline, scope budget, plan state, configuration, analysis flags, enabled state, and Gleip version.
- Updated generated agent instructions to use narrow iterative validation, one complete final validation per unchanged repository state, incremental checks, and compact status.
- Added `.gleip/check-cache.json` to recognized local runtime artifacts. Cache data contains only hashes, normalized findings, and result metadata.

### Compatibility

- Incremental checks and compact status are explicit opt-in modes; existing `check`, `status`, and CI behavior remains compatible.
- Missing, corrupt, version-incompatible, or input-stale caches fall back to a complete check. The Node.js requirement remains 20 or newer.

### Limitations

- Gleip directly measures check execution, reuse, finding emission and deltas, and changed files. Validation cycles, repeated external commands, arbitrary agent reads, and tool calls remain unavailable because Gleip does not intercept shells or agent tools.
- Incremental state remains repository-local. Gleip adds no network access, telemetry, or remote cache.

## [0.7.5]

### Added

- Added `gleip doctor --fix` as an explicit repository repair command that restores Gleip's managed `.gitignore` policy and removes only recognized Gleip runtime/state files from the Git index while preserving local copies.
- Added repository-hygiene risk to JSON, markdown, and compact reports so tracked local Gleip state is distinguished from task implementation drift.

### Fixed

- Ensure `init`, `preflight`, `validate-plan`, `status`, and `report` establish or repair `.gleip/` ignore protection before writing runtime files.
- Detect effective `.gitignore` overrides, including later negation rules, instead of validating only the presence of the managed block.
- Report already tracked recognized `.gleip/` runtime files during initialization without silently changing the Git index.
- Preserve unknown `.gleip/**` files during repository uninstall and remove tracked recognized runtime files from the index explicitly.
- Keep `LOCAL_ARTIFACT_INCLUDED` cleanup-required and CI-blocking without incorrectly raising task drift risk when no implementation drift exists.

### Changed

- Bumped the additive report schema to `1.1.0` for `risk.repositoryHygiene`.
- Clarified that package-manager install, update, and uninstall operations do not mutate repository lifecycle files; repository repair and cleanup remain explicit Gleip commands.

## [0.7.4]

### Fixed

- Recompute reports from current repository and session state instead of treating `.gleip/status.md` as authoritative evidence.
- Preserve the latest successful accepted plan scope when a later validation attempt fails.
- Separate the latest validation attempt from the latest successful validation in status and report behavior.
- Surface file-level attribution ambiguity when a preflight-dirty file changes again during the task.
- Improve handling of explicitly accepted documentation, context files, and read-only “for context” references.
- Keep durable tracked `.gleip` documentation and configuration visible while excluding ephemeral runtime artifacts.
- Prevent terse plans, failed validations, and path normalization edge cases from causing scope over-acceptance or false positives.

### Documentation

- Document report source-of-truth boundaries, validation history behavior, dirty-baseline attribution, and documentation/context scope handling.

## 0.7.3

### Added

- Added semantic scope target classification for plan validation and final drift
  checks, with `direct`, `derived`, `adjacent`, and `unexplained` target reasons.
- Added task breadth tracking so broad, cross-cutting, and repository-wide tasks
  can avoid file-count-only warnings when planned targets are directly or
  structurally related to the requested objective.
- Added CLI text and JSON output for scope target classifications, evidence, and
  next actions in `validate-plan`, `check`, status reports, and markdown findings.
- Added smoke coverage for broad semantic scope, unrelated target reporting, and
  conservative path extraction.

### Changed

- Classified proposed plan targets before producing scope findings, so direct and
  derived targets do not require expansion rationale solely because many files are
  involved.
- Made path extraction more conservative so slash-separated prose is not treated
  as a repository path without stronger path evidence.
- Normalized Windows and POSIX path separators before matching and reporting plan
  targets.
- Improved drift findings so changed files outside expected scope identify the
  relevant normalized targets and recommended action directly in console output.

### Fixed

- Preserved protected semantic boundaries, such as calculation, public contract,
  persistence, and authentication constraints, even when a plan edits an expected
  file.
- Reduced false-positive scope warnings for broad valid-work plans that touch
  related source, test, documentation, and shared implementation targets.

### Security / Privacy

- Preserved local-only operation with no telemetry, analytics, network calls,
  cloud behavior, external API/LLM calls, source upload, repository metadata
  upload, dashboards, or account systems.

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
