# Gleip

**Local-only guidance that AI coding agents use automatically.**

Coding agents can over-edit, drift from task scope, weaken tests, or produce noisy
final responses. Gleip gives them deterministic local guidance for task preflight,
advisory scope budgeting, plan validation, drift checks, session reports, and
compact final status. It is not a permission system.

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
3. Validate non-trivial plans with `npx --no-install gleip validate-plan`.
4. Run the narrowest existing validation while iterating; run complete required validation once for the final repository state.
5. Run `npx --no-install gleip check --incremental` before claiming completion.
6. Run `npx --no-install gleip status --compact` when the expected next action is unclear.

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
| `npx gleip report`              | Generate and summarize the canonical session report.                                    | Inspect the current session outcome.                                    |
| `npx gleip report --json`       | Generate the report and print stable JSON only.                                         | Local scripts, tooling, or debugging.                                   |
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

| Command                                               | Agent use                                                             | Main artifacts                                                                                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npx --no-install gleip preflight "<task>"`           | Classify the task and establish local scope before editing.           | `.gleip/session.json`, `.gleip/baseline.json`, `.gleip/brief.md`, `.gleip/scope-budget.json`, `.gleip/status.md` |
| `npx --no-install gleip preflight --file task.md`     | Read a full task contract as read-only context and establish scope.   | Same preflight artifacts; full task text is stored in the local session.                                         |
| `npx --no-install gleip validate-plan "<plan>"`       | Check a proposed implementation plan against the active scope budget. | Latest plan validation in `.gleip/session.json`                                                                  |
| `npx --no-install gleip validate-plan --file plan.md` | Read and structurally validate a plan file as read-only context.      | Latest plan validation and stable finding codes in `.gleip/session.json`                                         |
| `npx --no-install gleip check --incremental`          | Check current changes or reuse the matching complete result.          | `.gleip/check-cache.json`; complete baseline or finding delta                                                    |
| `npx --no-install gleip status --compact`             | Print compact iterative state and the next required action.           | Five-line output; no repeated brief, plan, or unchanged finding details                                          |
| `npx --no-install gleip report`                       | Generate the canonical final status and compact response block.       | `.gleip/report.md`, `.gleip/report.json`                                                                         |

`gleip start` is an implemented alias for `gleip preflight`. Preflight and plan validation accept `--file <path>`; plan validation also accepts stdin. Task and plan files are read-only context unless explicitly proposed as edit targets. `status` supports `--json` and `--include-baseline`.

Default workflow modes print concise 1-5 line summaries that confirm the completed phase and next action. An incremental baseline or delta adds one line per finding that must be emitted; unchanged findings remain a count. JSON modes remain machine-readable without human summary noise.

## Stable Findings and CI

Gleip 0.8.1 emits `clean`, `advisory`, `needs_attention`, `needs_cleanup`, or
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

Before 1.0, Gleip favors precision over recall. False positives are worse than missed
suspicious cases, multi-file changes are normal, and stable codes should improve
clarity without creating extra justification work.

## Reports and Metrics

Gleip 0.8.1 generates:

- `.gleip/report.md`: concise scores, risks, findings, actions, and the recommended final-response block.
- `.gleip/report.json`: stable machine-readable report data, warnings, evidence, summary, and efficiency estimate.

The report includes deterministic local scores for scope adherence, plan alignment, output discipline, and review readiness. It also reports task drift, repository hygiene, test-integrity, and over-edit risk. Repository hygiene covers tracked Gleip runtime/state files without mislabeling them as implementation drift. These heuristics surface review evidence; they do not prove semantic correctness.

Before responding, agents treat the report as the source of truth and include only its compact `Recommended final response` block, not the full report. The block contains scope adherence, drift risk, repository hygiene, output discipline, estimated token waste avoided, and unresolved warnings.

**Estimated output/token waste avoided is a deterministic local estimate. It is not exact model billing or API usage data.**

Estimates use only local artifacts and diff, context, or output size. When evidence is insufficient, Gleip returns zero or low confidence. Gleip has no separate `metrics` command or remote metrics service; report scores and estimates provide the implemented visibility.

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
- `baseline.json`
- `brief.md`
- `scope-budget.json`
- `status.md`
- `report.md`
- `report.json`
- `check-cache.json`
- Timestamped `session-*.json` archives created by `gleip stop`

## Local-Only Guarantee

- No telemetry.
- No network calls.
- No LLM/API calls.
- No account.
- No dashboard.
- No cloud or remote metrics.
- No source, diff, prompt, file-name, repository-metadata, or usage-data upload.
- Generated session and report files stay inside the repository.

## Known Limitations

- Agents must respect repository instructions.
- Deterministic heuristics do not prove correctness.
- Gleip does not replace tests, security review, or human review.
- Scope, report, and efficiency estimates are approximate local signals.
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

- Current release: `0.8.1`
- License: Apache-2.0
- Local-only developer preview
