# Gleip

Local-only guardrails that AI coding agents use automatically.

Gleip helps coding agents stay scoped, validate plans before editing, and check implementation drift before final response. Install it once, initialize agent instructions, and continue using your coding agent normally. Gleip runs locally in your repository and does not send code, diffs, prompts, telemetry, or metadata to external services.

## Install

```bash
npm install -D gleip
npx gleip init --all-agents
```

Continue using your coding agent normally. The generated instructions tell supported agents to run Gleip automatically before editing code.

## What the agent does automatically

1. Checks `.gleip/state.json`.
2. Runs local Gleip preflight for the user task.
3. Reads `.gleip/brief.md` and `.gleip/scope-budget.json`.
4. Drafts and validates an implementation plan.
5. Implements only after the plan is approved.
6. Runs Gleip status before final response.
7. Reports status, files changed, tests run, and risks.

Internally, agents are instructed to use local execution through `npx --no-install gleip`.

## Officially supported agents

- Codex / generic agents: `AGENTS.md`
- Claude Code: `CLAUDE.md`
- Cursor: `.cursor/rules/gleip.mdc`

Setup commands:

```bash
npx gleip init --all-agents
npx gleip init --agent auto
npx gleip init --agent codex
npx gleip init --agent claude
npx gleip init --agent cursor
```

If you install Gleip before choosing or opening an agent in VS Code, use `npx gleip init --all-agents`.

See [docs/agent-auto-usage.md](docs/agent-auto-usage.md) for details.

## Setup and diagnostics commands

- `npx gleip init --all-agents`
- `npx gleip init --agent auto`
- `npx gleip doctor --agents`
- `npx gleip repair-agents --all`
- `npx gleip state`
- `npx gleip enable`
- `npx gleip disable`

The task workflow commands exist for agents and for testing, but developers normally should not need to run them manually.

## Remove Gleip

`npm uninstall gleip` removes the package dependency, but it does not remove files generated in the repository. Clean up the repository first:

```bash
npx --no-install gleip uninstall
npm uninstall gleip
```

Use `npx --no-install gleip uninstall --dry-run` to inspect the cleanup plan. The uninstall command removes Gleip-owned files and managed instruction sections only; it does not modify package dependencies or lockfiles.

## Why Gleip?

- AI coding agents can over-edit, add unnecessary dependencies, weaken tests, or drift from the requested task.
- Gleip gives agents a local preflight and status protocol.
- It creates an implementation brief, scope budget, plan validation, and drift check.
- It is deterministic and local-only.

## Local-only guarantee

- No telemetry.
- No network calls.
- No LLM/API calls.
- No account.
- No dashboard.
- Generated session files stay inside `.gleip/`.

See [docs/privacy.md](docs/privacy.md).

## Files Gleip creates

Tracked or intended repo files:

- `.gleip.yml`
- `GLEIP.md`
- `AGENTS.md`
- `CLAUDE.md` if generated
- `.cursor/rules/gleip.mdc` if generated

Local ignored state:

- `.gleip/`

## Known limitations

- Agents must respect repo instructions.
- Gleip uses deterministic heuristics.
- Gleip does not prove correctness.
- Gleip does not replace tests or human review.

See [docs/known-limitations.md](docs/known-limitations.md).

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
- Current release: `0.2.2`.
- No AI review, dashboard, telemetry, or cloud service.
