# Changelog

## [1.2.1] - 2026-08-17

### Fixed

- Made continuous integration build before typechecking. Workspace packages resolve each other through their published entry points, so `@gleip/core` types come from `dist/`, and on a clean checkout the typecheck step failed with `Cannot find module '@gleip/core'` before reaching any step it was meant to run. The order now matches the sequence `CONTRIBUTING.md` documents.

### Compatibility

- No source, schema, dependency, or command behavior changed. This release contains a continuous-integration configuration fix and the version metadata for it.
- The defect predates 1.2.0 and reproduces identically on the 1.1.0 commit, where cross-platform CI was introduced. Released builds were unaffected, since the published package is produced by `pnpm build` and verified by the packed smoke test.

## [1.2.0] - 2026-08-17

### Added

- Added `--plan-mode` to `preflight`, `validate-plan`, and `check` so a coding agent in a read-only planning mode can obtain the same brief, scope budget, and plan verdict without writing any file, run, ledger event, or `.gitignore` change.
- Added `--task` and `--task-file` to `validate-plan --plan-mode`, which derive the canonical task and scope budget in memory so a plan can be checked before a session exists.
- Added `--json` to `preflight`, and a de-duplicated scope view in plan-mode output that emits each value once instead of repeating the schema's compatibility aliases.
- Added a read-only planning branch to the generated agent instruction block, naming the commands that are safe to run without writing.
- Added verification evidence from command attestations. A command recorded by `gleip run` now satisfies the completion verification requirement when it is a recognized verification command, exited zero, and ran against the repository state being reported on.

### Changed

- Ranked task classification rules by how much of the task each matched instead of returning on the first rule to match at all. Dependency, migration, auth, and CI rules keep first-match precedence so a passing mention of those areas still selects the sensitive profile.
- Made classification confidence reflect the margin over the runner-up rule, so a tie broken by declaration order alone no longer reports high confidence.
- Split a sentence into clauses when every clause reads as an instruction or a guardrail, so a multi-part instruction records each deliverable separately with exact source spans.
- Required a plan for open-ended restructuring that names no target, and for low-confidence classifications, instead of keying only on breadth counted from named paths.
- Reworded brief coverage to state that it compares the brief with the extracted requirements, and to report how many requirements were extracted.
- Added the canonical task's capture date to `status --compact` and a staleness note to the brief, so an agent that cannot re-run preflight can tell that artifacts belong to an earlier task.

### Fixed

- Recorded a trailing `without <gerund>`, `rather than`, or `instead of` clause as its own advisory constraint instead of absorbing it into the deliverable beside it, where it disappeared. These stay advisory rather than prohibited: the same phrasing states purpose as often as it forbids an action, and no deterministic test separates the two.
- Stopped the skipped-test detector from matching its markers as substrings. A `process.exit` call contains the `xit` marker, so ordinary code was reported as adding a skipped test at action-required severity.
- Kept a task whose only sentence carries both the work and its guardrail from classifying as `unknown` when blanking the prohibition consumed the entire text.
- Stopped `documentation_update` from pairing a documentation-sized file budget with a code-sized expected scope when no documentation-only scope was named, and recorded the fallback in the budget's reasons.
- Widened the documentation-only guard so release, publishing, npm, version-metadata, and lockfile work is no longer classified as a low-risk documentation update with plan validation disabled.
- Promoted paths named in a mandatory requirement into explicit scope, unless the task marks them as reference material, so a file the user named is no longer indistinguishable from a lexical guess.
- Stopped a `verification` requirement from being scored as missing without verification wording; it now falls through to the same token-overlap check every other category uses.
- Guarded evidence recording and the incremental cache write in `check`, which previously wrote to the run ledger despite the command's existing no-write configuration.
- Made `gleip finalize` pass the current status artifact to the completion report. It never did, so the verification requirement read empty input and no task expecting verification could reach `complete`.
- Distinguished verification that failed, that ran against a different repository state, and that was never recorded. All three previously reported the same "verification evidence is missing" message, and the status-output warning no longer competes with the more specific one when a command was actually attested.

### Compatibility

- Existing 1.0.0 and 1.1.0 artifacts and independently versioned evidence schemas remain compatible; no schema migration or dependency change is required. The `scope-budget.json` compatibility aliases are unchanged in the persisted artifact.
- Classification and requirement extraction are deterministic and local. Tasks that matched a single classification rule classify exactly as before.
- Gleip remains local-only. No telemetry, hosted service, provider integration, source upload, or automatic publication behavior was added. Gleip cannot detect a read-only planning mode; the agent declares it with `--plan-mode`.

## [1.1.0] - 2026-08-09

### Added

- Added cross-platform CI coverage on Windows and Linux with Node.js 20 and 22, including direct checks that wrapped `npm` and `npx` commands work on every supported platform.
- Added focused regression coverage for requirement extraction, task classification, scope enforcement, completion gating, compression audit metrics, and Windows command execution.

### Changed

- Made requirement extraction stable across one-line, multiline, hard-wrapped, list, heading, and semicolon-separated task contracts while preserving exact canonical source spans.
- Kept generated Gleip guidance and nonexistent inferred module paths out of expected implementation scope unless the task names them, and made line-count limits informational metrics rather than drift findings.
- Wired `.gleip.yml` check toggles into the corresponding hard-gate policy and expanded generated agent guidance for exact-state completion evidence.

### Fixed

- Prevented prohibitions from escalating task classification, hiding required edit targets, or becoming the only extracted work; prohibited paths now remain actionable even when they also fall inside expected scope.
- Prevented plan validation from mutating the scope budget it validates, and made missing canonical requirements explicit in validation output.
- Made `gleip finalize` block incomplete work and prohibited-path changes instead of relying on a fixed drift-code subset.
- Made `gleip run` resolve bare executables and Windows `.cmd` shims without losing argument boundaries or command evidence.
- Made compression audit mode report projected gross and net savings using the real envelope metadata cost without storing compressed content.

### Compatibility

- Existing 1.0.0 artifacts and independently versioned evidence schemas remain compatible; no schema migration or dependency change is required.
- Gleip remains local-only. No telemetry, hosted service, provider integration, source upload, or automatic publication behavior was added.

## [1.0.0] - 2026-07-19
### Added

- Added an append-only, hash-chained local event ledger with run identifiers, replay, partial-tail recovery, atomic artifacts, generation checks, and per-run writer locking.
- Added explicit evidence classes, exact-state command attestations, durable approvals with revocation/invalidation, legacy artifact migration, and one final evidence bundle tied to the current repository fingerprint.
- Added controlled-benchmark manifests and local observation fixtures without claiming benchmark outcomes.

### Changed

- Made the workflow passive-first. Plan validation is required only for broad or sensitive work; numeric scope budgets remain recorded metrics without default findings.
- Made `gleip finalize` the primary completion workflow. The score-oriented `report` command remains compatibility output.
- Marked `strict` and `enterprise` as reserved compatibility aliases, adapter and GitHub Action packages as placeholders, and context compression as experimental.
- Replaced causal token-savings wording with non-causal removable-text estimates in user-facing documentation.

### Compatibility

- Existing 0.8.x and 0.9.x local artifacts remain readable and can be imported with backups using `gleip migrate`; legacy status prose remains an `agent_claim` and is never promoted to command evidence.
- Gleip remains local-only and does not provide merge authorization, deployment verification, cloud control, telemetry, or malicious-local-process tamper resistance.

## [0.9.0] - 2026-07-07
### Added

- Added deterministic local context compression for non-authoritative execution evidence: test output, build/log output, structured JSON, search results, file listings, command output, and git diffs.
- Added `.gleip/context/objects/<sha256>` and `.gleip/context/index.json` as a repository-local content-addressed store for exact originals.
- Added `gleip compress`, `gleip run`, `gleip retrieve`, and `gleip stats` for audit mode, command wrapping, exact retrieval, and gross/net savings reporting.
- Added authority-aware compression classification and passthrough policy that protects canonical task state, active brief, requirement ledger, accepted plan, scope state, approval state, completion state, source code, policy, manifests, lockfiles, CI, and sensitive-looking content.

### Changed

- Updated generated agent instructions to use compression only for non-authoritative execution evidence and to retrieve exact originals before relying on omitted diagnostics.
- Updated local artifact hygiene so `.gleip/context/` is treated as ignored runtime state.
- Extended `.gleip.yml` with conservative compression settings for enabled state, audit mode, thresholds, allowed classes, confidence, and envelope format.

### Compatibility

- Existing 0.8.3 normalized scope and 0.8.4 canonical-task behavior remain intact. Compressed displays are not used as task, scope, scoring, approval, requirement-completion, verification, or review-readiness truth.
- No network access, telemetry, provider proxying, hosted service, model/API call, or project-specific compression heuristic was added.

## [0.8.4] - 2026-07-02
### Added

- Added `.gleip/canonical-task.json` as the local authoritative task artifact with exact received content, stable SHA-256 hashes, byte and character counts, ordered revisions, and amendment history.
- Added a derived requirement ledger with source-span traceability, obligation levels, generic categories, brief coverage analysis, and plan-to-requirement validation.
- Added final report requirement completion counts and warnings for unresolved mandatory requirements or prohibited requirement conflicts.

### Changed

- Marked implementation briefs as derived navigation aids that reference the canonical task instead of replacing or duplicating it.
- Updated generated agent instructions to read the canonical task first, use the brief as an index, check amendments, and verify mandatory canonical requirements before completion.
- Updated review-readiness and plan-alignment scoring so unresolved mandatory canonical requirements prevent perfect readiness while optional and ambiguous requirements remain advisory.

### Compatibility

- Existing 0.8.x sessions load safely. When possible, Gleip creates a compatibility canonical revision from the original session task; if only an old brief is available, provenance is marked incomplete.
- No compression, provider integration, network access, telemetry, or project-specific production logic was added.

## [0.8.3] - not released

The 0.8.3 work was folded into the 0.8.4 release. No commit carried version 0.8.3
and no `v0.8.3` tag exists; the entry is kept here so the changes remain findable.

### Fixed

- Preserved explicit edit intent when plan clauses also mention generic output-like words such as cache, report, result, fixture, state, diagnostics, or response.
- Kept genuine generated artifacts in output scope only when direct output-generation evidence is present.
- Prevented slash-separated conceptual terms in implementation rationale from becoming edit targets.
- Used normalized credible plan mentions in final report plan-alignment checks, including compatible recovery for older artifacts that misbucketed editable files as outputs.
- Treated advisory plan validation as accepted guidance consistently across CLI scope refinement and final reports.
- Made the release build deterministic from clean generated outputs and kept internal workspace code bundled into the published CLI.

### Changed

- Broad and subsystem drift checks now scale line-count advisories with changed target count instead of applying a narrow feature ceiling.
- Final reports recognize verification evidence from common validation/check wording and command-result lines, not only a `Tests` heading.
- Report scope checks merge accepted planned targets with expected paths before declaring files outside budget.
- Efficiency reporting no longer makes positive scope-savings claims from discovery-only outside-scope evidence.

### Compatibility

- No CLI command, exit-code, or schema break was introduced. Existing 0.8.x artifacts remain readable.
- Dependency, CI, secret, local-artifact, and test-integrity gates remain strict.
  These are enforced by `gleip check`; automated enforcement across platforms
  arrived with the CI workflow added after 1.0.0.

## [0.8.2] - 2026-06-28
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

## [0.8.1] - 2026-06-26
### Fixed

- Made `validate-plan` use deterministic task-sensitive evidence detection for approach and verification, reducing vocabulary-sensitive false positives for audit, investigation, documentation, operational, and constrained validation plans.
- Broadened verification recognition beyond exact test/check/smoke wording to include comparison, reconciliation, reproduction, rendered review, status confirmation, and explicit limitation reporting.
- Prevented negated verification wording such as "do not run tests" from satisfying the verification requirement.

## [0.8.0] - 2026-06-22
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

## [0.7.5] - 2026-06-22
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

## [0.7.4] - 2026-06-20
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

## [0.7.3] - 2026-06-20
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

## [0.7.2] - 2026-06-19
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

## [0.7.1] - 2026-06-15
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

## [0.7.0] - 2026-06-14
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

## [0.5.0] - 2026-06-12
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

## [0.4.0] - 2026-06-11
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

## [0.3.0] - 2026-06-10

Entries for 0.1.0 through 0.3.0 were reconstructed from git history after the fact;
the changelog previously began at 0.4.0. Detail is coarser than for later releases.

### Changed

- Published the `gleip` binary correctly from the npm package.

## [0.2.2] - 2026-06-09

### Changed

- Polished automatic agent usage instructions.

## [0.2.1] - 2026-06-05

### Changed

- Polished the README.

## [0.2.0] - 2026-06-03

### Added

- Added automatic agent usage so supported agents pick up Gleip without manual wiring.

## [0.1.1] - 2026-06-01

### Added

- First local-only preview release.

### Fixed

- Corrected npm installation instructions in the README.

## [0.1.0] - 2026-06-01

### Added

- First public commit of the local-only guidance CLI.
