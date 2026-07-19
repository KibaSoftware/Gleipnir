# Gleip

**Passive-first local evidence for coding-agent work.**

Gleipnir records task authority, repository state, commands, policy inferences,
agent claims, and explicit approvals in an append-only local evidence ledger. The
default workflow is passive. It is not a permission system, autonomous planner,
merge authority, deployment verifier, or proven agent optimizer.

Gleip makes no network calls and uses no telemetry, LLM/API calls, account, dashboard, or remote metrics.

## Quick Start

```bash
npm i -D gleip
npx gleip init
npx gleip preflight "<task>"
npx gleip preflight --file task.md
npx gleip status
```

Install Gleip once, initialize the repository instructions, then continue using your coding agent normally. Generated instructions tell supported agents to use the local Gleip commands automatically.

Check the installed version with the command for your package manager or platform:

```bash
npx gleip --version
pnpm exec gleip --version
./node_modules/.bin/gleip --version
```

On Windows PowerShell, the local binary can also be run directly:

```powershell
.\node_modules\.bin\gleip --version
```

`npm gleip --version` prints npm's version, not Gleip's version.

Supported instruction files:

- Codex / generic agents: `AGENTS.md`
- Claude Code: `CLAUDE.md`
- Gemini CLI: `GEMINI.md`

Use `npx gleip init auto` to update one detected agent file, or select `codex`, `claude`, or `gemini` explicitly.

## How Agents Should Use Gleip

For each coding task, agents should:

1. Run `npx --no-install gleip preflight "<task>"` before editing.
2. Read `.gleip/brief.md` and follow `.gleip/scope-budget.json`.
3. Validate broad or sensitive plans with `npx --no-install gleip validate-plan`; other plan checks are advisory.
4. Run the narrowest existing validation while iterating; route large repetitive execution output through `npx --no-install gleip run -- <command>` when useful.
5. Retrieve exact originals with `npx --no-install gleip retrieve <reference>` before relying on omitted diagnostics.
6. Run complete required validation once for the final repository state.
7. Run `npx --no-install gleip check --incremental` before claiming completion.
8. Run `npx --no-install gleip finalize` to create the exact-state final evidence bundle.

## Commands for Developers

| Command                         | Purpose                                                                                 | When to use                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npx gleip init`                | Create Gleip config, policy docs, and generic/Codex-compatible `AGENTS.md`.             | Recommended first-time setup.                                           |
| `npx gleip init auto`           | Create or update one detected agent instruction file.                                   | When agent files already exist.                                         |
| `npx gleip doctor --agents`     | Check local prerequisites and supported agent files.                                    | Diagnose setup or instruction problems.                                 |
| `npx gleip doctor --fix`        | Repair `.gleip/` ignore protection and untrack recognized runtime files.                | Recover older or damaged repository setup while preserving local files. |
| `npx gleip repair-agents --all` | Repair managed instruction sections for all supported agents.                           | Restore missing or stale generated instructions.                        |
| `npx gleip state`               | Print the repository-local enabled/disabled state.                                      | Confirm whether guidance is active.                                     |
| `npx gleip enable`              | Enable guidance, optionally with `--reason`.                                            | Resume normal Gleip checks.                                             |
| `npx gleip disable`             | Disable guidance, optionally with `--reason`.                                           | Temporarily pause checks with an explicit local record.                 |
| `npx gleip finalize`            | Create the final evidence bundle for the exact repository fingerprint.                  | Primary completion workflow.                                            |
| `npx gleip report`              | Generate the legacy-compatible score-oriented report.                                   | Compatibility diagnostics only.                                         |
| `npx gleip report --json`       | Generate the report and print stable JSON only.                                         | Local scripts, tooling, or debugging.                                   |
| `npx gleip compress`            | Classify and compress eligible local execution evidence from stdin or text.             | Inspect compression policy or pipe large command output.                |
| `npx gleip run -- <command>`    | Run a local command and compress eligible stdout/stderr while preserving exit status.   | Large repetitive test, build, log, search, or listing output.           |
| `npx gleip retrieve <ref>`      | Print the byte-for-byte original for a compression reference.                           | Review omitted diagnostics or pipe exact original evidence.             |
| `npx gleip stats`               | Print local compression gross/net savings, retrieval, and dedup statistics.             | Audit context compression behavior.                                     |
| `npx gleip check`               | Check the working tree against scope without updating the active status file.           | Run a manual drift check; add `--json` for machine-readable output.     |
| `npx gleip check --incremental` | Reuse a complete deterministic result when all check inputs match.                      | Iterative agent checks; add `--force` to recompute.                     |
| `npx gleip check --ci`          | Run the conservative CI check and fail only on documented action-required codes.        | Use in local CI without network access or telemetry.                    |
| `npx gleip status --compact`    | Print only task, repository change, finding counts, check need, and next action.        | Iterative status without repeated brief or plan output.                 |
| `npx gleip brief`               | Print the active implementation brief.                                                  | Inspect or debug agent context.                                         |
| `npx gleip stop`                | Archive the active session; `--clean` also removes its brief, budget, and status files. | End or reset a task session.                                            |
| `npx gleip uninstall --dry-run` | Preview repository cleanup.                                                             | Review removals before uninstalling.                                    |
| `npx gleip uninstall`           | Remove Gleip-owned repository files and managed instruction sections.                   | Run before `npm uninstall gleip`.                                       |

All commands also accept the global `--cwd <path>` option.

## Commands Used by Agents

Generated agent instructions use these commands through `npx --no-install` so the repository-local package is used. Developers normally do not need to run them manually.

| Command                                               | Agent use                                                                             | Main artifacts                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx --no-install gleip preflight "<task>"`           | Preserve the canonical task, classify it, and establish local scope.                  | `.gleip/canonical-task.json`, `.gleip/session.json`, `.gleip/baseline.json`, `.gleip/brief.md`, `.gleip/scope-budget.json`, `.gleip/status.md` |
| `npx --no-install gleip preflight --file task.md`     | Read a full task contract as read-only context and establish scope.                   | Same preflight artifacts; exact received task text is stored in the canonical task artifact.                                                   |
| `npx --no-install gleip preflight --amend "<task>"`   | Add an ordered canonical task revision without resetting the baseline.                | Refreshed canonical task, requirement ledger, brief, and scope budget.                                                                         |
| `npx --no-install gleip validate-plan "<plan>"`       | Check a proposed implementation plan against active canonical requirements and scope. | Latest plan validation in `.gleip/session.json`                                                                                                |
| `npx --no-install gleip validate-plan --file plan.md` | Read and structurally validate a plan file as read-only context.                      | Latest plan validation and stable finding codes in `.gleip/session.json`                                                                       |
| `npx --no-install gleip check --incremental`          | Check current changes or reuse the matching complete result.                          | `.gleip/check-cache.json`; complete baseline or finding delta                                                                                  |
| `npx --no-install gleip run -- <command>`             | Run local validation and compact only eligible execution evidence.                    | `.gleip/context/objects/<sha256>`, `.gleip/context/index.json`                                                                                 |
| `npx --no-install gleip compress`                     | Compress or audit stdin execution evidence without running a command.                 | `.gleip/context/objects/<sha256>`, `.gleip/context/index.json` when compression applies                                                        |
| `npx --no-install gleip retrieve <reference>`         | Retrieve exact original execution evidence by stable reference.                       | Raw original content from `.gleip/context/objects/<sha256>`                                                                                    |
| `npx --no-install gleip status --compact`             | Print compact iterative state and the next required action.                           | Five-line output; no repeated brief, plan, or unchanged finding details                                                                        |
| `npx --no-install gleip finalize`                     | Create the primary exact-state evidence bundle.                                       | `.gleip/runs/<run-id>/final/latest.json`                                                                                                       |
| `npx --no-install gleip report`                       | Generate compatibility scoring diagnostics.                                           | `.gleip/report.md`, `.gleip/report.json`                                                                                                       |

`gleip start` is an implemented alias for `gleip preflight`. Preflight and plan validation accept `--file <path>`; plan validation also accepts stdin. Task and plan files are read-only context unless explicitly proposed as edit targets. `status` supports `--json` and `--include-baseline`.

Default workflow modes print concise 1-5 line summaries that confirm the completed phase and next action. An incremental baseline or delta adds one line per finding that must be emitted; unchanged findings remain a count. JSON modes remain machine-readable without human summary noise.

Gleip preserves the exact received task in `.gleip/canonical-task.json` and treats `.gleip/brief.md` as a derived navigation aid. The canonical task and active amendments remain authoritative for scope, plan validation, final reporting, generated agent instructions, and compression passthrough policy. The local requirement ledger tracks required, prohibited, optional, and informational obligations with deterministic source spans so long prompts are not silently narrowed.

Gleip calibrates ceremony by workflow profile. Documentation-only tasks use a compact brief, no required plan, and content/diff verification by default. Local behavior changes use a short plan and focused verification. Broad changes keep explicit scope rationale and broader verification while scaling advisory line limits with accepted target count. Sensitive dependency, CI, auth, payment, infrastructure, migration, secret, and security-policy work keeps the complete approval and hard-gate workflow.

## Context Compression

Gleip 1.0 experimentally compresses only non-authoritative execution evidence: test output,
build/log output, structured JSON, search results, file listings, generic command
output, and git diffs. Originals are written first to
`.gleip/context/objects/<sha256>` and are retrievable with `npx --no-install gleip
retrieve <reference>`.

Active canonical task state, task amendments, derived brief, requirement ledger,
accepted plan, scope state, approvals, completion state, policy/instructions,
source code, dependency manifests, lockfiles, CI configuration, infrastructure,
migrations, auth/payment configuration, and sensitive-looking content pass through.
Compressed displays are never used as task, scope, scoring, approval,
verification, requirement-completion, or review-readiness truth.

Use `gleip run -- <command>` for large repetitive local command output,
`gleip compress --audit --json` to inspect classification and passthrough reasons,
and `gleip stats --json` for gross and net estimated savings. Retrieval overhead is
counted, so net savings can be zero when the original is immediately needed.

See `docs/compression-policy.md` in the root package docs.

## Stable Findings and CI

Gleip emits `clean`, `advisory`, `needs_attention`, `needs_cleanup`, or
`needs_approval`. It never emits `blocked` as a new top-level status.

Stable findings use `info`, `warn`, `action_required`, `approval_required`, and
`cleanup_required`. Local `status` and `check` guide the next action and exit `0`
when the command succeeds. `check --ci` may exit `1` for documented
high-confidence findings such as skipped/deleted tests or tracked `.gleip/`
artifacts, while still using guidance-oriented wording.
`check --incremental` preserves that contract: without `--ci` it exits `0` after
a successful check, while `check --incremental --ci` uses the complete current or
reused finding set. Reusing an unchanged blocking result retains exit code `1`.

Expected paths describe likely declared scope, not exclusive permission. Narrow
`modify only` tasks remain tight, while explicitly broad multi-area work receives
broader advisory limits. Small aligned context-document updates are accepted.
Runtime, output, and cache paths are excluded from passive relevance but can be
declared narrowly as artifacts.

Plan validation and final drift checks classify targets as `direct`, `derived`,
`adjacent`, or `unexplained`. Broad direct and derived targets do not warn solely
because many files are involved. Adjacent and unexplained targets include a reason,
evidence, and next action in CLI output. Protected semantic boundaries still apply
inside expected files, and slash-separated prose is ignored unless it has strong
path evidence.

Plan validation is deterministic and structural. Its statuses are `aligned`,
`advisory`, `needs_clarification`, `needs_approval`, and `needs_cleanup`. Focused
existing tests, smoke tests, typechecks, compile checks, dry runs, or appropriate
manual verification can satisfy verification expectations. Dependency, CI,
protected config, env, secret, and security-sensitive changes still require
approval, attention, or cleanup.

Gleipnir 1.0 favors precision over recall. False positives are worse than missed
suspicious cases, multi-file changes are normal, and stable codes should improve
clarity without creating extra justification work.

## Reports and Metrics

The compatibility `report` command generates:

- `.gleip/report.md`: concise scores, risks, findings, actions, and the recommended final-response block.
- `.gleip/report.json`: stable machine-readable report data, warnings, evidence, summary, and efficiency estimate.

The compatibility report includes deterministic heuristic scores and inferred requirement traceability. These are diagnostics, not proof of correctness, approval, or readiness.

Before responding, agents run `gleip finalize`. Its bundle separates evidence classes, unresolved hazards, and stale or missing evidence for the exact final repository fingerprint.

**Estimated removable text is a non-causal approximation, not exact model billing, provider usage, or measured task benefit.**

Estimates use only local artifacts and diff, context, or output size. When evidence is insufficient, Gleip returns zero or low confidence. Context compression has `gleip stats`; Gleip still has no remote metrics service, telemetry, or hosted dashboard.

Incremental JSON output directly reports whether a check executed or was reused,
its reuse rate, full and delta findings emitted, added/updated/resolved counts, and
changed files. Validation-cycle and repeated-command measurements are `unavailable`
because Gleip does not intercept shell commands or agent tools. The first incremental
check emits a complete baseline; later changed checks emit finding deltas and an
unchanged count. Identical fingerprints reuse the complete cached result. Use
`check --incremental --force` to recompute deliberately.

## What Gets Committed?

The following generated setup files are durable repository configuration or agent guidance and are usually committed:

- `.gleip.yml`
- `GLEIP.md`
- `AGENTS.md` when generic/Codex instructions are generated
- `CLAUDE.md` when Claude instructions are generated
- `GEMINI.md` when Gemini instructions are generated

The `.gitignore` block added by `gleip init` ignores `.gleip/`. This local-only directory contains:

- `state.json`
- `session.json`
- `canonical-task.json`
- `baseline.json`
- `brief.md`
- `scope-budget.json`
- `status.md`
- `report.md`
- `report.json`
- `check-cache.json`
- `context/index.json`
- `context/objects/<sha256>`
- Timestamped `session-*.json` archives created by `gleip stop`

## Local-Only Guarantee

- No telemetry.
- No network calls.
- No LLM/API calls.
- No account.
- No dashboard.
- No cloud or remote metrics.
- No source, diff, prompt, file-name, repository-metadata, or usage-data upload.
- Generated session, report, and compression-store files stay inside the repository.
- Exact originals for compressed execution evidence remain local and retrievable.

## Known Limitations

- Agents must respect repository instructions.
- Deterministic heuristics do not prove correctness.
- Gleip does not replace tests, security review, or human review.
- Scope, report, and efficiency estimates are approximate local signals.
- Compression is limited to selected execution-evidence classes.
- Source code and active task-contract artifacts are not compressed in 1.0.0.
- Net savings can be zero when retrieval overhead cancels the compact display gain.
- Missing artifacts or git evidence reduce report confidence.

## Remove Gleip

```bash
npx --no-install gleip uninstall --dry-run
npx --no-install gleip uninstall
npm uninstall gleip
```

The Gleip command removes recognized generated repository files, safely removes managed instruction and ignore sections, and preserves unknown `.gleip/**` files. Package dependency removal remains a separate npm command. `npm install`, `npm update`, and `npm uninstall` do not run Gleip repository repair or modify the Git index.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm smoke:cli
pnpm pack:cli
```

## Status

- Current release: `1.0.0`
- License: Apache-2.0
- Local-only developer preview
