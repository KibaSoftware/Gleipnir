# Scoring

Gleip session reports contain four deterministic local scores:

- Scope adherence.
- Plan alignment.
- Output discipline.
- Review readiness.

Each score starts at 100. Evidence-backed problems create warnings and deduct points. Scores are rounded and clamped to 0-100.

Signals include unplanned files, files outside expected scope, advisory scope-budget
limits, dependency or CI drift, missing or clarification-needed plan validation,
missing verification or risk evidence, repeated narration, and unresolved findings.
Cleanup- and approval-required findings remain visible even when other signals are
strong.

Scores are heuristics. They explain local review signals but do not prove correctness, test quality, security, or merge readiness.

See [reporting.md](reporting.md) for the stable report model and efficiency estimate.
