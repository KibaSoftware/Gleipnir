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

## 0.8.2 Invariants

- Review readiness may be 100 only when required completion evidence is present for the active workflow profile. For local behavior changes this includes changed-file evidence, required verification evidence, accurate unresolved warnings, and final repository-state evidence.
- Plan alignment may be 100 when a required plan validated successfully, or when the selected workflow profile explicitly does not require a plan.
- Output discipline measures avoidable narration, repetition, compactness, and format compliance. It is not a substitute for changed-file or verification evidence.
- Scope adherence is measured against the effective validated scope after accepted plan validation, not against the initial broad candidate list.

See [reporting.md](reporting.md) for the stable report model and efficiency estimate.
