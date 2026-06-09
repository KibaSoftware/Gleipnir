# Gleip

Local-only guardrails that AI coding agents use automatically.

Install Gleip once, initialize agent instructions, and keep using your coding agent normally. Supported agents are instructed to run Gleip preflight, plan validation, and status checks automatically.

## Install

```bash
npm install -D gleip
npx gleip init --all-agents
```

## Supported agents

- Codex / generic agents via `AGENTS.md`
- Claude Code via `CLAUDE.md`
- Cursor via `.cursor/rules/gleip.mdc`

## What happens after init

- The agent checks Gleip state.
- The agent runs local preflight.
- The agent reads the brief and scope budget.
- The agent validates its plan.
- The agent runs status before final response.

Agents are instructed to use `npx --no-install gleip` internally so Gleip does not need to be globally installed.

## Setup and diagnostics

- `npx gleip init --all-agents`
- `npx gleip init --agent auto`
- `npx gleip doctor --agents`
- `npx gleip repair-agents --all`

Task workflow commands are available for testing, but the intended usage is for agents to run them automatically.

## Remove Gleip

`npm uninstall gleip` removes the package dependency, but not generated repository files. Remove Gleip in this order:

```bash
npx --no-install gleip uninstall
npm uninstall gleip
```

Use `npx --no-install gleip uninstall --dry-run` to preview repository cleanup.

## Local-only

- No telemetry.
- No network calls.
- No LLM/API calls.
- No account.
- No dashboard.

## License

Apache-2.0
