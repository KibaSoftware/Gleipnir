# Gleip

**Local-only guardrails that AI coding agents use automatically.**

Coding agents can over-edit, drift from task scope, weaken tests, or produce noisy final responses. Gleip gives them a deterministic local protocol for task preflight, scope budgeting, plan validation, drift checks, session reports, and compact final status.

Gleip makes no network calls and uses no telemetry, LLM/API calls, account, dashboard, or remote metrics.

## Quick Start

```bash
npm install -D gleip
npx gleip init --all-agents
```

Install Gleip once, initialize the repository instructions, then continue using your coding agent normally. Generated instructions tell supported agents to use the local Gleip commands automatically.

Supported instruction files:

- Codex / generic agents: `AGENTS.md`
- Claude Code: `CLAUDE.md`
- Cursor: `.cursor/rules/gleip.mdc`

Use `npx gleip init --agent auto` to update detected agent files, or select `generic`, `codex`, `claude`, or `cursor` explicitly.

## Commands for Developers

These commands are useful for setup, diagnostics, inspection, and repository lifecycle management.

| Command | Purpose | When to use |
| --- | --- | --- |
| `npx gleip init --all-agents` | Create Gleip config, policy docs, and every supported agent instruction file. | Recommended first-time setup. |
| `npx gleip init --agent auto` | Create or update detected agent instructions. | When agent files already exist. |
| `npx gleip doctor --agents` | Check local prerequisites and supported agent files. | Diagnose setup or instruction problems. |
| `npx gleip repair-agents --all` | Repair Gleip-managed instruction sections for all supported agents. | Restore missing or stale generated instructions. |
| `npx gleip state` | Print the repository-local enabled/disabled state. | Confirm whether guardrails are active. |
| `npx gleip enable` | Enable guardrails, optionally with `--reason`. | Resume normal Gleip enforcement. |
| `npx gleip disable` | Disable guardrails, optionally with `--reason`. | Temporarily pause guardrails with an explicit local record. |
| `npx gleip report` | Generate and summarize the canonical session report. | Inspect the current session outcome. |
| `npx gleip report --json` | Generate the report and print stable JSON only. | Local scripts, tooling, or debugging. |
| `npx gleip check` | Check the working tree against scope without updating the active status file. | Run a manual drift check; add `--json` for machine-readable output. |
| `npx gleip brief` | Print the active implementation brief. | Inspect or debug agent context. |
| `npx gleip stop` | Archive the active session; `--clean` also removes its brief, budget, and status files. | End or reset a task session. |
| `npx gleip uninstall --dry-run` | Preview repository cleanup. | Review removals before uninstalling. |
| `npx gleip uninstall` | Remove Gleip-owned repository files and managed instruction sections. | Run before `npm uninstall gleip`. |

All commands also accept the global `--cwd <path>` option.

## Commands Used by Agents

Generated agent instructions use these commands through `npx --no-install` so the repository-local package is used. Developers normally do not need to run them manually.

| Command | Agent use | Main artifacts |
| --- | --- | --- |
| `npx --no-install gleip preflight "<task>"` | Classify the task and establish local scope before editing. | `.gleip/session.json`, `.gleip/baseline.json`, `.gleip/brief.md`, `.gleip/scope-budget.json`, `.gleip/status.md` |
| `npx --no-install gleip validate-plan "<plan>"` | Check a proposed implementation plan against the active scope budget. | Latest plan validation in `.gleip/session.json` |
| `npx --no-install gleip status` | Update drift and status evidence before the final response. | `.gleip/status.md`, updated `.gleip/session.json` |
| `npx --no-install gleip report` | Generate the canonical final status and compact response block. | `.gleip/report.md`, `.gleip/report.json` |

`gleip start` is an implemented alias for `gleip preflight`. Plan validation also accepts `--file <path>` or stdin, while `status` supports `--json` and `--include-baseline`.

Normal workflow commands print concise 1-5 line summaries that confirm the completed phase and the next expected agent action. JSON modes remain machine-readable without human summary noise.

## Reports and Metrics

Gleip 0.3.0 generates two local report artifacts:

- `.gleip/report.md`: concise scores, risks, findings, actions, and the recommended final-response block.
- `.gleip/report.json`: stable machine-readable report data, warnings, evidence, summary, and efficiency estimate.

The report includes deterministic local scores for scope adherence, plan alignment, output discipline, and review readiness. It also reports drift, test-integrity, and over-edit risk. These heuristics surface review evidence; they do not prove semantic correctness.

Before responding, agents treat the report as the source of truth and include only its compact `Recommended final response` block, not the full report. The block contains scope adherence, drift risk, output discipline, estimated token waste avoided, and unresolved warnings.

**Estimated output/token waste avoided is a deterministic local estimate. It is not exact model billing or API usage data.**

Estimates use only local artifacts and diff, context, or output size. When evidence is insufficient, Gleip returns zero or low confidence. Gleip has no separate `metrics` command or remote metrics service; report scores and estimates provide the implemented visibility.

See [Session Reporting](docs/reporting.md) for the stable model and scoring limitations.

## Automatic Agent Workflow

1. Check `.gleip/state.json`.
2. Run preflight for the requested task.
3. Read `.gleip/brief.md` and `.gleip/scope-budget.json`.
4. Draft and validate a focused implementation plan.
5. Implement within the approved scope.
6. Run status and report before the final response.
7. Include the compact Gleip report block with the implementation and test summary.

See [Agent Auto-Usage](docs/agent-auto-usage.md) for setup details.

## Files Gleip Creates

Repository files intended to be reviewed or committed:

- `.gleip.yml`
- `GLEIP.md`
- `AGENTS.md` when generic/Codex instructions are generated
- `CLAUDE.md` when Claude instructions are generated
- `.cursor/rules/gleip.mdc` when Cursor instructions are generated

Ignored local state under `.gleip/`:

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

- Current release: `0.3.0`
- License: Apache-2.0
- Local-only developer preview
