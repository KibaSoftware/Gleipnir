# Scoring

Gleip session reports contain four deterministic local scores:

- Scope adherence.
- Plan alignment.
- Output discipline.
- Review readiness.

Each score starts at 100. Evidence-backed problems create warnings and deduct points. Scores are rounded and clamped to 0-100.

Signals include unplanned files, files outside expected scope, advisory scope-budget
limits, dependency or CI drift, missing or clarification-needed plan validation,
missing mandatory canonical requirement evidence, prohibited requirement conflicts,
missing verification or risk evidence, repeated narration, and unresolved findings.
Cleanup- and approval-required findings remain visible even when other signals are
strong.

Scores are heuristics. They explain local review signals but do not prove correctness, test quality, security, or merge readiness.

## 0.8.4 Invariants

- Review readiness may be 100 only when required completion evidence is present for the active workflow profile and all mandatory canonical requirements are resolved.
- A prohibited canonical requirement conflict prevents perfect review readiness and reduces scope and plan scores.
- Optional, informational, and ambiguous requirements remain advisory and do not reduce readiness as mandatory work.
- Plan alignment may be 100 when a required plan is aligned, advisory, or approved, or when the selected workflow profile explicitly does not require a plan.
- Output discipline measures avoidable narration, repetition, compactness, and format compliance. It is not a substitute for changed-file or verification evidence.
- Output discipline stays separate from requirement completeness.
- Scope adherence is measured against the effective validated scope after accepted plan validation, including credible explicit edit mentions from compatible artifacts, not against the initial broad candidate list.
- Broad and subsystem line-count advisories scale with changed target count and do not by themselves prove over-editing.

See [reporting.md](reporting.md) for the stable report model and efficiency estimate.
