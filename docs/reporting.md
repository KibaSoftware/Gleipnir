# Session Reporting

`npx --no-install gleip report` creates the canonical per-session report:

- `.gleip/report.json`
- `.gleip/report.md`

`npx --no-install gleip report --json` also prints the stable JSON report to stdout. Agents run this automatically before their final response.

The generated report is the source of truth for Gleip final status. It recomputes
drift from the current Git state, current session state, current configuration, and
the latest successful accepted plan scope. Accepted plan scope includes proposed
files, direct or derived validated targets, and compatible recovery for explicit
edit mentions that older artifacts may have stored in an output bucket. It reads
`.gleip/status.md` only as output-evidence text for report scoring; drift and
scope are still recomputed from current local state.

Both report artifacts include a `Recommended final response` block with scope adherence, task drift risk, repository hygiene, output discipline, canonical requirement completion, evidence-based token waste avoided when available, and unresolved warnings. Agents may include that compact block when it adds useful review evidence, but they should not paste the full report.

## Report Model

The JSON report includes:

- Product and schema versions, session ID, generation time, phase, repository fingerprint, and current-artifact metadata.
- Scope adherence, plan alignment, output discipline, and review readiness scores.
- Task-drift, repository-hygiene, test-integrity, and over-edit risks.
- Canonical requirement completion counts for required, prohibited, and advisory obligations.
- Evidence-based token waste avoided with scope, context, and output breakdowns when supported by local evidence.
- Evidence-backed warnings with stable IDs, severity, reason, evidence, files, and suggested action.
- Changed-file, unplanned-file, tests-mentioned, and risks-mentioned summary fields.
- File-level ambiguous baseline attribution when a file had preflight changes and
  then changed again after preflight.

The current report schema version is `1.3.0`. Gleip 0.8.x session, cache, status, report, and pre-canonical task artifacts are read with compatibility fallbacks. When the original task is available, Gleip creates a local compatibility canonical revision; if only a brief is available, provenance is marked incomplete. New writes use the current metadata fields and do not treat the brief as authoritative.

## Deterministic Scoring

Scores start at 100 and deduct for recomputed local evidence such as:

- Unplanned or out-of-scope changed files after accepted plan targets are merged.
- Scope-budget limit or protected-check findings.
- Missing, clarification-needed, or approval-required plan validation.
- Unresolved mandatory canonical requirements or prohibited requirement conflicts.
- Missing required completion evidence for the active workflow profile.
- Drift risk and unresolved warnings.

All scores are clamped to 0-100. Plan alignment can be 100 without a plan only when the active profile does not require one. Advisory plan validation is accepted guidance rather than failed validation. Review readiness can be 100 only when required changed-file, verification, final-state, warning, and canonical requirement evidence is present for the active profile. Optional and ambiguous requirements remain advisory. Scores do not prove correctness.

Verification evidence is recognized from explicit Tests, Verification,
Validation, or Checks sections and from common local command-result lines such as
focused test, typecheck, lint, or smoke commands that report success. Gleip still
does not execute or attest verification commands in 0.8.4; absent current evidence
reduces readiness without proving that tests were not run.

## Requirement Completion

When `.gleip/canonical-task.json` contains a requirement ledger, reports include a concise completion matrix. Required items are satisfied only by local changed-path, accepted-plan, diff, documentation/release metadata, or verification evidence. Prohibited items are treated as respected unless local plan, diff, or drift findings show the prohibited action. Optional, suggestion, informational, and ambiguous items are reported as advisory and do not reduce readiness.

The report does not print the complete canonical task. It references requirement IDs, source excerpts, related paths, and evidence so reviewers can inspect `.gleip/canonical-task.json` locally when needed.

## Efficiency Estimate

Gleip uses `Math.ceil(characterCount / 4)` for conservative character-to-token estimates. It only creates a non-zero basis from local evidence, such as a plan needing clarification, flagged unexpected diff content, or repeated output that guidance can remove.

Token-waste reporting is deterministic and evidence-based. When evidence is insufficient, the report says unavailable instead of implying positive savings. It is not exact model billing or API usage data.

When evidence is insufficient, the estimate is zero or low confidence. Gleip does not inspect API usage, model billing, prompts, accounts, or remote metrics.

Output discipline and estimated output waste remain deterministic local heuristics. They do not judge semantic correctness or represent exact model billing usage.

## Interaction Summaries

Default preflight, plan validation, status, check, and report modes emit concise 1-5 line summaries. Incremental baselines and deltas add only the finding lines that must be emitted and keep unchanged findings as a count. JSON mode emits only machine-readable JSON.

## Missing Evidence

The command remains usable when session artifacts or git state are missing. It writes a report with explicit warnings and reduced confidence instead of inventing evidence.

## Privacy

Report generation is local-only and deterministic. It introduces no network calls, telemetry, LLM/API calls, accounts, dashboards, or remote storage.
