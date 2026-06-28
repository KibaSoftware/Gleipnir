# Session Reporting

`npx --no-install gleip report` creates the canonical per-session report:

- `.gleip/report.json`
- `.gleip/report.md`

`npx --no-install gleip report --json` also prints the stable JSON report to stdout. Agents run this automatically before their final response.

The generated report is the source of truth for Gleip final status. It recomputes
drift from the current Git state, current session state, current configuration, and
the latest successful accepted plan scope. It reads `.gleip/status.md` only as
output-evidence text for report scoring; drift and scope are still recomputed from
current local state.

Both report artifacts include a `Recommended final response` block with scope adherence, task drift risk, repository hygiene, output discipline, evidence-based token waste avoided when available, and unresolved warnings. Agents include only that compact block, not the full report.

## Report Model

The JSON report includes:

- Product and schema versions, session ID, generation time, phase, repository fingerprint, and current-artifact metadata.
- Scope adherence, plan alignment, output discipline, and review readiness scores.
- Task-drift, repository-hygiene, test-integrity, and over-edit risks.
- Evidence-based token waste avoided with scope, context, and output breakdowns when supported by local evidence.
- Evidence-backed warnings with stable IDs, severity, reason, evidence, files, and suggested action.
- Changed-file, unplanned-file, tests-mentioned, and risks-mentioned summary fields.
- File-level ambiguous baseline attribution when a file had preflight changes and
  then changed again after preflight.

The current report schema version is `1.2.0`. Gleip 0.8.0 and 0.8.1 session, cache, status, and report artifacts are read with compatibility fallbacks; new writes use the current metadata fields.

## Deterministic Scoring

Scores start at 100 and deduct for recomputed local evidence such as:

- Unplanned or out-of-scope changed files.
- Scope-budget limit or protected-check findings.
- Missing, clarification-needed, or approval-required plan validation.
- Missing required completion evidence for the active workflow profile.
- Drift risk and unresolved warnings.

All scores are clamped to 0-100. Plan alignment can be 100 without a plan only when the active profile does not require one. Review readiness can be 100 only when required changed-file, verification, final-state, and warning evidence is present for the active profile. Scores do not prove correctness.

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
