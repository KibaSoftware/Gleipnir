# Policy

Gleip policy defines the operating rules for generated code.

Initial policy areas:

- Scope control for changed files and implementation size.
- Dependency control for additions and upgrades.
- Test expectations for behavior changes.
- Review readiness for explanations, risks, and verification.

Policies should produce actionable feedback tied to repository facts. They should not rely on vague quality labels without evidence.

## Precision-First Policy Before 1.0

Gleip favors precision over recall before 1.0. False positives are worse than missed
suspicious cases because noisy guardrails train agents and reviewers to ignore the signal.

- Multi-file and cross-module changes are normal in enterprise repositories.
- Ordinary source and test scope expansion is not automatically a failure and remains warning-based in 0.7.0.
- Local mode remains advisory unless a finding is clearly severe.
- `gleip check --ci` fails only for documented, high-confidence blocking finding codes.
- Gleip should reduce agent chatter, not require justification for every changed file.
- Stable finding codes improve clarity and automation; they are not a proxy metric or a target to maximize.
- Plan validation remains structural. It does not attempt semantic correctness judgments.
- Scope rationale checks require named scope, a reason, and verification, but do not
  judge whether the rationale is true.
- Dependency requirement checks use task text, plan text, and local manifests only.
- The goal is not to make every suspicious external benchmark case fail.
- The goal is to preserve valid work while improving deterministic signal quality.

Gleip remains local-only. It has no telemetry, analytics, network calls, cloud behavior,
external APIs, LLM/API calls, source upload, repository metadata upload, hosted
dashboard, or account system. Source code, diffs, prompts, file names, repository
metadata, and usage data stay inside the local repository.
