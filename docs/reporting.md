# Session Reporting

`npx --no-install gleip report` creates the canonical per-session report:

- `.gleip/report.json`
- `.gleip/report.md`

`npx --no-install gleip report --json` also prints the stable JSON report to stdout. Agents run this automatically before their final response.

The generated report is the source of truth for Gleip final status. Both artifacts include a `Recommended final response` block with scope adherence, drift risk, output discipline, estimated token waste avoided, and unresolved warnings. Agents include only that compact block, not the full report.

## Report Model

The JSON report includes:

- Product and schema versions, session ID, and generation time.
- Scope adherence, plan alignment, output discipline, and review readiness scores.
- Drift, test-integrity, and over-edit risks.
- Estimated token waste avoided with scope, context, and output breakdowns.
- Evidence-backed warnings with stable IDs, severity, reason, evidence, files, and suggested action.
- Changed-file, unplanned-file, tests-mentioned, and risks-mentioned summary fields.

The current report schema version is `1.0.0`.

## Deterministic Scoring

Scores start at 100 and deduct for local evidence such as:

- Unplanned or out-of-scope changed files.
- Scope-budget limit or protected-check findings.
- Missing, clarification-needed, or approval-required plan validation.
- Missing tests or risks evidence.
- Missing changed-file evidence.
- Excessive verbosity, repeated plan narration, repeated output, or unrelated suggestions.
- Drift risk and unresolved warnings.

All scores are clamped to 0-100. Every deduction is tied to a warning with a reason and evidence. Scores do not prove correctness.

## Efficiency Estimate

Gleip uses `Math.ceil(characterCount / 4)` for conservative character-to-token estimates. It only creates a non-zero basis from local evidence, such as a plan needing clarification, flagged unexpected diff content, or repeated output that guidance can remove.

Estimated token waste avoided is a deterministic local estimate based on local artifacts and diff/context/output size. It is not exact model billing or API usage data.

When evidence is insufficient, the estimate is zero or low confidence. Gleip does not inspect API usage, model billing, prompts, accounts, or remote metrics.

Output discipline and estimated output waste remain deterministic local heuristics. They do not judge semantic correctness or represent exact model billing usage.

## Interaction Summaries

Normal preflight, plan validation, status, check, and report commands emit concise 1-5 line summaries. These summaries confirm the completed phase, point to local artifacts where relevant, and state the next expected agent action. JSON mode emits only machine-readable JSON.

## Missing Evidence

The command remains usable when session artifacts or git state are missing. It writes a report with explicit warnings and reduced confidence instead of inventing evidence.

## Privacy

Report generation is local-only and deterministic. It introduces no network calls, telemetry, LLM/API calls, accounts, dashboards, or remote storage.
