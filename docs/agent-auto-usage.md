# Agent Auto-Usage

Agent auto-usage means the developer initializes Gleip once, then keeps using their coding agent normally. Generated repository instructions tell the agent to run Gleip before editing code, validate its plan, stay inside the scope budget, and run status before the final response.

## Supported Agent Files

- Codex and generic agents: `AGENTS.md`
- Claude Code: `CLAUDE.md`
- Cursor: `.cursor/rules/gleip.mdc`

## Recommended Setup

Use this when installing Gleip before choosing or opening a coding agent in VS Code:

```sh
npm install -D gleip
npx gleip init --all-agents
```

`init --all-agents` creates every supported instruction file even when no agent is installed or configured yet.

## If No Agent Is Installed Yet

`gleip init` and `gleip init --agent auto` detect existing agent files. If none exist, Gleip creates generic `AGENTS.md` and prints a note explaining that `gleip init --all-agents` can prepare all supported future agent files.

## Commands

- `gleip init --all-agents`
- `gleip init --agent auto`
- `gleip init --agent codex`
- `gleip init --agent claude`
- `gleip init --agent cursor`
- `gleip doctor --agents`
- `gleip repair-agents`

## Limitations

Gleip remains local-only: no telemetry, no network calls, no LLM/API calls, no dashboard, and no account. Agents must respect repository instructions for auto-usage to work; Gleip cannot force agents that ignore instructions.
