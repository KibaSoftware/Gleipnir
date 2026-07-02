# Policy

Gleip policy defines the operating rules for generated code.

Initial policy areas:

- Scope control for changed files and implementation size.
- Dependency control for additions and upgrades.
- Test expectations for behavior changes.
- Review readiness for explanations, risks, and verification.

Policies should produce actionable feedback tied to repository facts. They should not rely on vague quality labels without evidence.

## Guidance-First Policy Before 1.0

Gleip is a guidance tool, not a permission system. It favors precision over recall
before 1.0 because noisy findings train agents and reviewers to ignore the signal.

- Multi-file and cross-module changes are normal in enterprise repositories.
- Ordinary source and test scope expansion is advisory and never makes complexity itself a failure.
- Local `status`, `check`, and valid plan validation guide the next action instead of denying the task.
- `gleip check --ci` may fail only for documented, high-confidence action findings.
- Gleip should reduce agent chatter, not require justification for every changed file.
- Stable finding codes improve clarity and automation; they are not a proxy metric or a target to maximize.
- Plan validation remains structural. It does not attempt semantic correctness judgments.
- Scope rationale checks require named scope, a reason, and verification, but do not
  judge whether the rationale is true.
- Expected paths describe likely declared scope; they are not an exclusive permission list.
- The canonical task and active amendments outrank the derived brief and repository discovery.
- Required and prohibited canonical requirements affect plan validation and review readiness; optional and ambiguous items remain advisory.
- Dependency, CI, protected config, and security-sensitive changes require approval,
  attention, or cleanup rather than task denial.
- Tracked `.gleip/` session artifacts are cleanup-required.
- Small context-document touches are acceptable when aligned with the declared work.
- Runtime, cache, and output paths are excluded from passive relevance but may be
  explicitly declared as narrow artifacts.
- Verification may be tests, smoke checks, typechecks, compilation, dry runs, or
  appropriate manual checks.
- Dependency requirement checks use task text, plan text, and local manifests only.
- The goal is not to make every suspicious external benchmark case fail.
- The goal is to preserve valid work while improving deterministic signal quality.

Gleip remains local-only. It has no telemetry, analytics, network calls, cloud behavior,
external APIs, LLM/API calls, source upload, repository metadata upload, hosted
dashboard, or account system. Source code, diffs, prompts, file names, repository
metadata, and usage data stay inside the local repository.
