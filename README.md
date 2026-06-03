# Gleip

Gleip is a control layer for AI coding agents. It keeps generated code lean, scoped, tested, and merge-ready from the first prompt to the final pull request.

## Install

```bash
npm install -D gleip
npx gleip init --all-agents
```

Then continue using your coding agent normally. The generated instructions tell agents to run Gleip automatically before editing code.

`init --all-agents` creates or updates `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/gleip.mdc`, `GLEIP.md`, `.gleip.yml`, and `.gleip/state.json`.

## Local-only by default

Gleip uses local deterministic checks:

- No external services.
- No network calls.
- No telemetry.
- No LLM calls.
- No dashboard.
- No account.
- Data stays in the repo.

See [docs/privacy.md](docs/privacy.md) for details.

## Local Package Testing

For local package testing, build and pack the CLI package:

```sh
pnpm build
pnpm pack:cli
```

Install the generated tarballs from `dist-pack/` in a target repository and run `npx gleip`. See [docs/package-testing.md](docs/package-testing.md) for the full workflow.

For preview release verification, see [docs/release-checklist.md](docs/release-checklist.md).

Current release target: `0.2.0`.

## Common Commands

- `gleip init --all-agents` creates repo-local Gleip files and instructions for common coding agents.
- `gleip init --agent <name>` creates instructions for `auto`, `generic`, `codex`, `claude`, or `cursor`.
- `gleip preflight "<task>"` creates the active brief, scope budget, status file, and baseline.
- `gleip validate-plan "<plan>"` checks an intended implementation plan before edits.
- `gleip status` checks current changes against the active scope budget.
- `gleip check` runs a non-mutating scope check.
- `gleip doctor --agents` reports supported agent instruction files and Gleip workflow presence.
- `gleip repair-agents` repairs existing agent instruction files; `--all` creates all supported files.
- `gleip enable`, `gleip disable`, and `gleip state` manage repo-local guardrail state.

## Agent Auto-Usage

- Codex and generic coding agents use `AGENTS.md`.
- Claude Code uses `CLAUDE.md`.
- Cursor uses `.cursor/rules/gleip.mdc`.
- `gleip init --agent auto` detects existing agent files and updates those; if none exist, it creates generic `AGENTS.md`.
- `gleip init --all-agents` is recommended when Gleip is installed before any coding agent is configured in VS Code.
- `gleip doctor --agents` checks agent instruction readiness.
- `gleip repair-agents` repairs Gleip-managed sections without replacing unrelated content.

See [docs/agent-auto-usage.md](docs/agent-auto-usage.md).

## Commands Agents Are Instructed To Run

- `gleip preflight`
- `gleip validate-plan`
- `gleip status`

## Development

This repo uses TypeScript, Node.js, pnpm workspaces, Vitest, tsup, tsx, and Commander.js.

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format
pnpm smoke:cli
```

## Local Development

Run the CLI locally with `pnpm gleip` while developing. See [docs/local-testing.md](docs/local-testing.md) for the full temporary-repository verification workflow.

This repository intentionally tracks `.gleip.yml`, `GLEIP.md`, and `AGENTS.md` as Gleip project policy and agent instructions. The `.gleip/` directory contains local session state and is ignored.

## Plan Validation

Use `gleip validate-plan` after preflight and before editing code to check an agent's intended implementation plan against the active scope budget. See [docs/plan-validation.md](docs/plan-validation.md).

## Known Limitations

Gleip is a deterministic local guardrail, not a proof of correctness or a replacement for tests and review. See [docs/known-limitations.md](docs/known-limitations.md).

## Agent State

Gleip stores repo-local enabled/disabled state in `.gleip/state.json`. Use `gleip state`, `gleip enable`, and `gleip disable` to inspect or change it. See [docs/agent-state.md](docs/agent-state.md).
