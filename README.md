# Gleip

Local-only guardrails for AI coding agents.

Gleip helps coding agents stay scoped, validate plans before editing, and check implementation drift before final response. It runs locally in your repository and does not send code, diffs, prompts, telemetry, or metadata to external services.

## Install

```bash
npm install -D gleip
npx gleip init --all-agents
```

Continue using your coding agent normally. The generated instructions tell agents to use Gleip automatically.

## Why Gleip?

AI coding agents can over-edit, add unnecessary dependencies, weaken tests, or drift from the requested task. Gleip gives agents a local preflight workflow: it creates an implementation brief, scope budget, plan validation, and status check. It is deterministic and local-only.

## How It Works

1. Developer runs `npx gleip init --all-agents`.
2. Gleip creates agent instruction files.
3. Agent runs `gleip preflight "<task>"`.
4. Agent reads `.gleip/brief.md` and `.gleip/scope-budget.json`.
5. Agent validates its plan with `gleip validate-plan`.
6. Agent implements the change.
7. Agent runs `gleip status`.
8. Agent reports status, files changed, tests run, and risks.

## Agent Auto-Usage

- Codex and generic agents use `AGENTS.md`.
- Claude Code uses `CLAUDE.md`.
- Cursor uses `.cursor/rules/gleip.mdc`.

Useful setup and maintenance commands:

- `npx gleip init --all-agents`
- `npx gleip init --agent auto`
- `npx gleip doctor --agents`
- `npx gleip repair-agents --all`

If no agent is installed yet, `init --all-agents` prepares the repo for future agent use. See [docs/agent-auto-usage.md](docs/agent-auto-usage.md).

## Local-Only Guarantee

- No telemetry.
- No network calls.
- No LLM/API calls.
- No account.
- No dashboard.
- Generated session files stay inside `.gleip/`.

See [docs/privacy.md](docs/privacy.md).

## Commands

These are commands agents are instructed to run; developers should not need to memorize them for normal use.

- `gleip init --all-agents`
- `gleip init --agent auto`
- `gleip preflight`
- `gleip validate-plan`
- `gleip status`
- `gleip check`
- `gleip doctor --agents`
- `gleip repair-agents`
- `gleip enable`
- `gleip disable`

## Files Gleip Creates

Tracked or intended repo files:

- `.gleip.yml`
- `GLEIP.md`
- `AGENTS.md`
- `CLAUDE.md` if generated
- `.cursor/rules/gleip.mdc` if generated

Local ignored state:

- `.gleip/`

## Known Limitations

Agents must respect repo instructions. Gleip uses deterministic heuristics, does not prove correctness, and does not replace tests or human review. See [docs/known-limitations.md](docs/known-limitations.md).

## Development

This repo uses TypeScript, Node.js, pnpm workspaces, Vitest, tsup, tsx, and Commander.js.

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm smoke:cli
pnpm pack:cli
```

For package testing, see [docs/package-testing.md](docs/package-testing.md). For release verification, see [docs/release-checklist.md](docs/release-checklist.md).

## Status

- Local-only developer preview.
- Current release: `0.2.1`.
- No AI review, dashboard, telemetry, or cloud service.
