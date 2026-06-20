# Gleip

**Local-only guidance that AI coding agents use automatically.**

Coding agents can over-edit, drift from task scope, weaken tests, or produce noisy
final responses. Gleip gives them a deterministic local protocol for task
preflight, advisory scope budgeting, plan validation, drift checks, session
reports, and compact final status. Gleip is a guidance tool, not a permission
system: broad or complex work is acceptable when the task declares it.

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
4. Run `npx --no-install gleip check` before claiming completion.
5. Run `npx --no-install gleip status` when the expected next action is unclear.

## Commands for Developers

These commands are useful for setup, diagnostics, inspection, and repository lifecycle management.

| Command                         | Purpose                                                                                 | When to use                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `npx gleip init`                | Create Gleip config, policy docs, and generic/Codex-compatible `AGENTS.md`.             | Recommended first-time setup.                                       |
| `npx gleip init auto`           | Create or update one detected agent instruction file.                                   | When agent files already exist.                                     |
| `npx gleip doctor --agents`     | Check local prerequisites and supported agent files.                                    | Diagnose setup or instruction problems.                             |
| `npx gleip repair-agents --all` | Repair Gleip-managed instruction sections for all supported agents.                     | Restore missing or stale generated instructions.                    |
| `npx gleip state`               | Print the repository-local enabled/disabled state.                                      | Confirm whether guidance is active.                                 |
| `npx gleip enable`              | Enable guidance, optionally with `--reason`.                                            | Resume normal Gleip checks.                                         |
| `npx gleip disable`             | Disable guidance, optionally with `--reason`.                                           | Temporarily pause checks with an explicit local record.             |
| `npx gleip report`              | Generate and summarize the canonical session report.                                    | Inspect the current session outcome.                                |
| `npx gleip report --json`       | Generate the report and print stable JSON only.                                         | Local scripts, tooling, or debugging.                               |
| `npx gleip check`               | Check the working tree against scope without updating the active status file.           | Run a manual drift check; add `--json` for machine-readable output. |
| `npx gleip check --ci`          | Run the conservative CI check and fail only on documented action-required codes.        | Use in local CI without network access or telemetry.                |
| `npx gleip brief`               | Print the active implementation brief.                                                  | Inspect or debug agent context.                                     |
| `npx gleip stop`                | Archive the active session; `--clean` also removes its brief, budget, and status files. | End or reset a task session.                                        |
| `npx gleip uninstall --dry-run` | Preview repository cleanup.                                                             | Review removals before uninstalling.                                |
| `npx gleip uninstall`           | Remove Gleip-owned repository files and managed instruction sections.                   | Run before `npm uninstall gleip`.                                   |

All commands also accept the global `--cwd <path>` option.

## Commands Used by Agents

Generated agent instructions use these commands through `npx --no-install` so the repository-local package is used. Developers normally do not need to run them manually.

| Command                                         | Agent use                                                             | Main artifacts                                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npx --no-install gleip preflight "<task>"`     | Classify the task and establish local scope before editing.           | `.gleip/session.json`, `.gleip/baseline.json`, `.gleip/brief.md`, `.gleip/scope-budget.json`, `.gleip/status.md` |
| `npx --no-install gleip preflight --file task.md` | Read a full task contract as read-only context and establish scope. | Same preflight artifacts; full task text is stored in the local session. |
| `npx --no-install gleip validate-plan "<plan>"` | Check a proposed implementation plan against the active scope budget. | Latest plan validation in `.gleip/session.json`                                                                  |
| `npx --no-install gleip validate-plan --file plan.md` | Read and structurally validate a plan file as read-only context. | Latest plan validation, including stable finding codes, in `.gleip/session.json` |
| `npx --no-install gleip check`                  | Check current changes before claiming completion.                     | Concise drift result; does not update `.gleip/status.md`                                                         |
| `npx --no-install gleip status`                 | Update drift and status evidence before the final response.           | `.gleip/status.md`, updated `.gleip/session.json`                                                                |
| `npx --no-install gleip report`                 | Generate the canonical final status and compact response block.       | `.gleip/report.md`, `.gleip/report.json`                                                                         |

`gleip start` is an implemented alias for `gleip preflight`. Preflight and plan validation accept `--file <path>`; plan validation also accepts stdin. Task and plan files are read-only context unless the task or plan explicitly requests editing them. `status` supports `--json` and `--include-baseline`.

Normal workflow commands print concise 1-5 line summaries that confirm the completed phase and the next expected agent action. JSON modes remain machine-readable without human summary noise.

## Stable Findings and CI

Gleip 0.7.3 uses guidance-oriented top-level statuses:

- `clean`: no findings
- `advisory`: informational or warning-level drift
- `needs_attention`: scope, risk, or verification clarification is recommended
- `needs_cleanup`: local artifacts, secrets, or accidental generated files need cleanup
- `needs_approval`: dependency, CI, protected config, or similar changes need approval

No local Gleip output uses `blocked` as a top-level status. Findings retain stable
codes and use action-oriented severities: `info`, `warn`, `action_required`,
`approval_required`, and `cleanup_required`. Legacy severity and scope-budget keys
remain readable for compatibility, but generated output uses the new language.

`npx gleip status` and `npx gleip check` guide cleanup, clarification, and approval
work and exit `0` when the command runs successfully. `npx gleip check --ci` may
exit `1` for documented high-confidence findings such as skipped or deleted tests
and tracked `.gleip/` artifacts. Its message still describes the required action,
for example cleanup rather than task denial. Runtime and CLI errors remain non-zero.

Plan validation checks deterministic structure only: recognizable implementation,
files/modules, verification, and risk or scope-rationale information when relevant.
Its statuses are `aligned`, `advisory`, `needs_clarification`, `needs_approval`, and
`needs_cleanup`. It does not decide whether an implementation is correct, optimal,
or semantically good.

Scope budgets adapt to declared task breadth. A narrow `modify only` bugfix remains
tightly scoped, while an explicit multi-area task naming implementation, focused
tests, docs, and output artifacts receives broader advisory limits. Expected paths
describe likely declared scope, not exclusive permission. Work outside that scope
calls for clarification or a rationale explaining the expansion; the rationale is
not proof that Gleip is right.

Plan validation and final drift checks classify targets as `direct`, `derived`,
`adjacent`, or `unexplained`. Direct and derived targets do not warn solely because
a broad task touches many files. Adjacent targets need rationale, and unexplained
targets are reported with normalized path, reason, evidence, and next action.
Protected semantic boundaries still apply inside expected files.

Small updates to project context and architecture documents are accepted as
low-risk touches when they align with broad patch, documentation, or context
maintenance work. A task contract passed with `preflight --file` remains read-only
unless explicitly targeted for editing. Large unrelated documentation rewrites
still receive advisory attention.

Slash-separated prose such as `cards/tables/headers` is not treated as a path
unless there is stronger path evidence, such as an extension, config/manifest name,
glob syntax, quotes, backticks, or a structured files/targets section. Windows and
POSIX path separators are normalized before matching and reporting.

Common runtime, output, cache, coverage, and build paths are excluded from passive
relevance discovery. They are not globally forbidden: a specifically declared
report, result, fixture, state file, or artifact is accepted narrowly and does not
open source implementation scope.

Verification is expected for behavior changes, but it does not always require a
new test file. Focused existing tests, smoke tests, typechecks, compile checks, CLI
dry runs, or appropriate manual verification can satisfy the plan structure.
Dependency, lockfile, CI, config, env, secret, and security-sensitive changes do
not become acceptable merely because a task is broad; they require approval,
attention, or cleanup according to their risk.

Before 1.0, Gleip favors precision over recall. False positives are worse than missed
suspicious cases, multi-file changes are normal, and the goal is to preserve valid
work rather than make every bad benchmark variant fail. Stable codes improve clarity;
they are not a proxy metric and should not create extra justification work.

## Reports and Metrics

Gleip 0.7.3 generates two local report artifacts:

- `.gleip/report.md`: concise scores, risks, findings, actions, and the recommended final-response block.
- `.gleip/report.json`: stable machine-readable report data, warnings, evidence, summary, and efficiency estimate.

The report includes deterministic local scores for scope adherence, plan alignment, output discipline, and review readiness. It also reports drift, test-integrity, and over-edit risk. These heuristics surface review evidence; they do not prove semantic correctness.

Before responding, agents treat the report as the source of truth and include only its compact `Recommended final response` block, not the full report. The block contains scope adherence, drift risk, output discipline, estimated token waste avoided, and unresolved warnings.

**Estimated output/token waste avoided is a deterministic local estimate. It is not exact model billing or API usage data.**

Estimates use only local artifacts and diff, context, or output size. When evidence is insufficient, Gleip returns zero or low confidence. Gleip has no separate `metrics` command or remote metrics service; report scores and estimates provide the implemented visibility.

See [Session Reporting](docs/reporting.md) for the stable model and scoring limitations.

See [Agent Auto-Usage](docs/agent-auto-usage.md) for setup details.

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

See [Privacy](docs/privacy.md).

## Known Limitations

- Agents must respect repository instructions.
- Deterministic heuristics do not prove correctness.
- Gleip does not replace tests, security review, or human review.
- Scope, report, and efficiency estimates are approximate local signals.
- Missing artifacts or git evidence reduce report confidence.

See [Known Limitations](docs/known-limitations.md).

## Remove Gleip

```bash
npx --no-install gleip uninstall --dry-run
npx --no-install gleip uninstall
npm uninstall gleip
```

The Gleip command removes generated repository files and managed instruction sections. Package dependency removal remains a separate npm command.

## Development

This repository uses Node.js 20+, TypeScript, pnpm workspaces, Vitest, tsup, tsx, and Commander.js.

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm smoke:cli
pnpm pack:cli
```

See [Local Package Testing](docs/package-testing.md) and the [Release Checklist](docs/release-checklist.md).

## Status

- Current release: `0.7.3`
- License: Apache-2.0
- Local-only developer preview
