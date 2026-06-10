# Agent Auto-Usage

Agent auto-usage means the developer initializes Gleip once, then keeps using their coding agent normally. Generated repository instructions tell the agent to run Gleip before editing code, validate its plan, stay inside the scope budget, then run status and generate the session report before the final response.

Agents use `npx --no-install gleip` for task workflow commands so Gleip can remain a local development dependency.

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

`npx gleip init` and `npx gleip init --agent auto` detect existing agent files. If none exist, Gleip creates generic `AGENTS.md` and prints a note explaining that `npx gleip init --all-agents` can prepare all supported future agent files.

## Commands

- `npx gleip init --all-agents`
- `npx gleip init --agent auto`
- `npx gleip init --agent codex`
- `npx gleip init --agent claude`
- `npx gleip init --agent cursor`
- `npx gleip doctor --agents`
- `npx gleip repair-agents --all`

These are setup, diagnostics, and repair commands. The task workflow commands are intended for agents to run automatically and are available to developers for testing or fallback.

Before final response, agents run or read `npx --no-install gleip report`, treat it as the source of truth, and include only its generated `Recommended final response` block. They do not paste the full report. Developers do not need to run this manually during normal usage.

Normal workflow commands emit concise 1-5 line summaries that confirm the completed phase and next expected agent action. Detailed evidence remains in local artifacts, while JSON mode stays machine-readable.

## Repository Lifecycle

To remove Gleip from a repository:

```sh
npx --no-install gleip uninstall
npm uninstall gleip
```

The first command removes `.gleip/`, `.gleip.yml`, `GLEIP.md`, Gleip-managed sections in `AGENTS.md` and `CLAUDE.md`, and the Gleip-generated Cursor rule. The second command removes the package dependency. Use `--dry-run` to preview cleanup or `--keep-agent-files` to leave all supported agent files unchanged.

## Limitations

Gleip remains local-only: no telemetry, no network calls, no LLM/API calls, no dashboard, and no account. Agents must respect repository instructions for auto-usage to work; Gleip cannot force agents that ignore instructions.
