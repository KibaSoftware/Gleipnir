# Gleip

**Local-only guardrails that AI coding agents use automatically.**

Coding agents can over-edit, drift from task scope, weaken tests, or produce noisy final responses. Gleip gives them a deterministic local protocol for task preflight, scope budgeting, plan validation, drift checks, session reports, and compact final status.

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
- Cursor: `.cursor/rules/gleip.mdc`

Use `npx gleip init --agent auto` to update detected agent files, or select `generic`, `codex`, `claude`, or `cursor` explicitly.

## How Agents Should Use Gleip

For each coding task, agents should:

1. Run `npx --no-install gleip preflight "<task>"` before editing.
2. Read `.gleip/brief.md` and follow `.gleip/scope-budget.json`.
3. Validate non-trivial plans with `npx --no-install gleip validate-plan`.
4. Run `npx --no-install gleip check` before claiming completion.
5. Run `npx --no-install gleip status` when the expected next action is unclear.

## Commands for Developers

| Command                         | Purpose                                                                                 | When to use                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `npx gleip init --all-agents`   | Create Gleip config, policy docs, and every supported agent instruction file.           | Recommended first-time setup.                                       |
| `npx gleip init --agent auto`   | Create or update detected agent instructions.                                           | When agent files already exist.                                     |
| `npx gleip doctor --agents`     | Check local prerequisites and supported agent files.                                    | Diagnose setup or instruction problems.                             |
| `npx gleip repair-agents --all` | Repair managed instruction sections for all supported agents.                           | Restore missing or stale generated instructions.                    |
| `npx gleip state`               | Print the repository-local enabled/disabled state.                                      | Confirm whether guardrails are active.                              |
| `npx gleip enable`              | Enable guardrails, optionally with `--reason`.                                          | Resume normal Gleip enforcement.                                    |
| `npx gleip disable`             | Disable guardrails, optionally with `--reason`.                                         | Temporarily pause guardrails with an explicit local record.         |
| `npx gleip report`              | Generate and summarize the canonical session report.                                    | Inspect the current session outcome.                                |
| `npx gleip report --json`       | Generate the report and print stable JSON only.                                         | Local scripts, tooling, or debugging.                               |
| `npx gleip check`               | Check the working tree against scope without updating the active status file.           | Run a manual drift check; add `--json` for machine-readable output. |
| `npx gleip check --ci`          | Run the conservative CI check and fail only on documented blocking codes.               | Use in local CI without network access or telemetry.                |
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
| `npx --no-install gleip validate-plan --file plan.md` | Read and structurally validate a plan file as read-only context. | Latest plan validation and stable finding codes in `.gleip/session.json` |
| `npx --no-install gleip check`                  | Check current changes before claiming completion.                     | Concise drift result; does not update `.gleip/status.md`                                                         |
| `npx --no-install gleip status`                 | Update drift and status evidence before the final response.           | `.gleip/status.md`, updated `.gleip/session.json`                                                                |
| `npx --no-install gleip report`                 | Generate the canonical final status and compact response block.       | `.gleip/report.md`, `.gleip/report.json`                                                                         |

`gleip start` is an implemented alias for `gleip preflight`. Preflight and plan validation accept `--file <path>`; plan validation also accepts stdin. Task and plan files are read-only context unless explicitly proposed as edit targets. `status` supports `--json` and `--include-baseline`.

Normal workflow commands print concise 1-5 line summaries that confirm the completed phase and the next expected agent action. JSON modes remain machine-readable without human summary noise.

## Stable Findings and CI

Gleip 0.7.0 is conservative by design. It reports stable finding codes but only fails
CI on high-confidence blocking findings. Scope expansion is warning-only because
valid enterprise work often touches multiple files or modules.

Severities are `info`, `warn`, `fail`, and `blocking`. Human output includes both code
and severity, for example `[TEST_SKIPPED] blocking: Skipped test added`.

`npx gleip check` remains advisory. `npx gleip check --ci` exits `1` only for
`TEST_SKIPPED`, `TEST_DELETED`, or `LOCAL_ARTIFACT_INCLUDED`; otherwise it exits `0`.
`NO_ACTIVE_SESSION` exits non-zero for commands that require a session. Dependency,
lockfile, plan structure, and scope-expansion findings do not block CI in 0.7.0.

Plan validation is deterministic and structural. It checks recognizable plan
sections or equivalent language, mentioned files, scope expansion rationale, risky
file rationale, and explicit dependency requirements against local manifests. It
does not judge whether a design is correct or best. Ordinary source and test
expansion remains advisory.

Budgets scale with affirmative task scope. Named files, directories, subsystems,
and categories such as source, CLI, planner, tests, docs, config, package metadata,
and smoke coverage are aligned only when the task declares them. Exact named test
paths remain exact, and `modify only` tasks remain narrow. Dependency additions,
lockfiles, CI, env, and secrets retain their existing gates unless the task
explicitly requests the relevant category and policy allows it.

Before 1.0, Gleip favors precision over recall. False positives are worse than missed
suspicious cases, multi-file changes are normal, and stable codes should improve
clarity without creating extra justification work.

## Reports and Metrics

Gleip 0.7.0 generates:

- `.gleip/report.md`: concise scores, risks, findings, actions, and the recommended final-response block.
- `.gleip/report.json`: stable machine-readable report data, warnings, evidence, summary, and efficiency estimate.

The report includes deterministic local scores for scope adherence, plan alignment, output discipline, and review readiness. It also reports drift, test-integrity, and over-edit risk. These heuristics surface review evidence; they do not prove semantic correctness.

Before responding, agents treat the report as the source of truth and include only its compact `Recommended final response` block, not the full report. The block contains scope adherence, drift risk, output discipline, estimated token waste avoided, and unresolved warnings.

**Estimated output/token waste avoided is a deterministic local estimate. It is not exact model billing or API usage data.**

Estimates use only local artifacts and diff, context, or output size. When evidence is insufficient, Gleip returns zero or low confidence. Gleip has no separate `metrics` command or remote metrics service; report scores and estimates provide the implemented visibility.

## What Gets Committed?

The following generated setup files are durable repository configuration or agent guidance and are usually committed:

- `.gleip.yml`
- `GLEIP.md`
- `AGENTS.md` when generic/Codex instructions are generated
- `CLAUDE.md` when Claude instructions are generated
- `.cursor/rules/gleip.mdc` when Cursor instructions are generated

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

The Gleip command removes generated repository files and managed instruction sections. Package dependency removal remains a separate npm command.

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

- Current release: `0.7.0`
- License: Apache-2.0
- Local-only developer preview
