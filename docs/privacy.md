# Privacy

Gleip runs locally in the repository. It does not send code, diffs, prompts, file paths, telemetry, or metadata to external services.

Gleip does not make network calls, does not call LLM APIs, does not require an account, does not use a hosted dashboard, and does not collect telemetry. All generated files stay inside the repository.

## What Gleip Reads Locally

- `.gleip.yml`
- `GLEIP.md`, `AGENTS.md`, `CLAUDE.md`, and `.cursor/rules/gleip.mdc` when relevant
- Local file paths
- Selected local file contents for repo context discovery
- Git working-tree diff
- Dependency file paths
- CI file paths
- `.gleip/session` files

## What Gleip Writes Locally

- `.gleip.yml`
- `GLEIP.md`
- `AGENTS.md` Gleip-managed section
- `CLAUDE.md` Gleip-managed section
- `.cursor/rules/gleip.mdc` Gleip-managed section
- `.gleip/session.json`
- `.gleip/brief.md`
- `.gleip/scope-budget.json`
- `.gleip/status.md`
- `.gleip/baseline.json`
- `.gleip/report.json`
- `.gleip/report.md`
- `.gleip/state.json`

The `.gleip/` directory contains local session state and should generally be ignored.

Report generation reads only local artifacts and git state. It does not send scores, warnings, file paths, diffs, or efficiency estimates anywhere.
