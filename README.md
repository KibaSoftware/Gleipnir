# Gleip

Gleip is a control layer for AI coding agents. It keeps generated code lean, scoped, tested, and merge-ready from the first prompt to the final pull request.

## Install

```bash
npm install -D gleip
npx gleip init
```

Then run Gleip from the repository where you want local guardrails:

```bash
npx gleip preflight "Add CSV export to users table"
npx gleip validate-plan "Modify UserTable, reuse csv utility, add tests"
npx gleip status
```

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

Current patch release target: `0.1.1`.

## Common Commands

- `gleip init` creates repo-local Gleip files and AGENTS instructions.
- `gleip preflight "<task>"` creates the active brief, scope budget, status file, and baseline.
- `gleip validate-plan "<plan>"` checks an intended implementation plan before edits.
- `gleip status` checks current changes against the active scope budget.
- `gleip check` runs a non-mutating scope check.
- `gleip enable`, `gleip disable`, and `gleip state` manage repo-local guardrail state.

## Agent-Aware Workflow

Coding agents should follow the Gleip-managed section in `AGENTS.md`:

1. Run `gleip preflight "<task>"`.
2. Draft a short plan and validate it with `gleip validate-plan`.
3. Implement only after approval or explicit user approval.
4. Run `gleip status` before the final response.

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
