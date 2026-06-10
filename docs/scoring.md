# Scoring

Gleip session reports contain four deterministic local scores:

- Scope adherence.
- Plan alignment.
- Output discipline.
- Review readiness.

Each score starts at 100. Evidence-backed problems create warnings and deduct points. Scores are rounded and clamped to 0-100.

Signals include unplanned files, files outside allowed scope, scope-budget limits, dependency or CI drift, missing or rejected plan validation, missing tests or risks evidence, repeated narration, and unresolved warnings. A blocked policy remains blocked even when other signals are strong.

Scores are heuristics. They explain local review signals but do not prove correctness, test quality, security, or merge readiness.

See [reporting.md](reporting.md) for the stable report model and efficiency estimate.
