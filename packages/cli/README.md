# Gleip

Local-only guardrails for AI coding agents.

Gleip helps coding agents stay scoped, validate plans before editing, and check drift before final response.

## Install

```bash
npm install -D gleip
npx gleip init --all-agents
```

## Quick Start

```bash
npx gleip preflight "Add CSV export to users table"
npx gleip validate-plan "Modify UserTable, reuse src/utils/csv.ts, add tests"
npx gleip status
```

In normal usage, coding agents should run these commands automatically based on generated `AGENTS.md`, `CLAUDE.md`, or Cursor rules.

## Agent Auto-Usage

- `npx gleip init --all-agents`
- `npx gleip init --agent auto`
- `npx gleip doctor --agents`
- `npx gleip repair-agents --all`

## Local-Only

- No telemetry.
- No network calls.
- No LLM/API calls.
- No account.
- No dashboard.

## Commands

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

## License

Apache-2.0
