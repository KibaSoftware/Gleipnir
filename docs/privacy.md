# Privacy

Gleip runs locally in the repository. It does not send code, diffs, prompts, file paths, telemetry, or metadata to external services.

Gleip does not make network calls, does not call LLM APIs, does not require an account, does not use a hosted dashboard, and does not collect telemetry. All generated files stay inside the repository.

## What Gleip Reads Locally

- `.gleip.yml`
- `GLEIP.md`, `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` when relevant
- Local file paths
- Selected local file contents for repo context discovery
- Git working-tree diff
- Dependency file paths
- CI file paths
- `.gleip/session` files
- `.gleip/canonical-task.json`

## What Gleip Writes Locally

- `.gleip.yml`
- `GLEIP.md`
- `AGENTS.md` Gleip-managed section
- `CLAUDE.md` Gleip-managed section
- `GEMINI.md` Gleip-managed section
- `.gleip/session.json`
- `.gleip/canonical-task.json`
- `.gleip/brief.md`
- `.gleip/scope-budget.json`
- `.gleip/status.md`
- `.gleip/baseline.json`
- `.gleip/report.json`
- `.gleip/report.md`
- `.gleip/state.json`
- `.gleip/check-cache.json`
- `.gleip/context/index.json`
- `.gleip/context/objects/<sha256>`

The `.gleip/` directory contains local session state and should generally be ignored.

`.gleip/canonical-task.json` stores the exact task text received by Gleip, ordered
amendments, hashes, byte/character counts, and a derived requirement ledger. It is
repository-local and ignored with the rest of `.gleip/`. The derived brief avoids
duplicating the full task text and is not authoritative.

The incremental check cache stores only local fingerprints, normalized finding data, and result metadata. It does not duplicate source files or diff contents.

Report generation reads only local artifacts and git state. It does not send scores, warnings, file paths, diffs, or efficiency estimates anywhere.

## Context Compression

Context compression is local-only. When `gleip run` or `gleip compress` compacts
eligible execution evidence, Gleip writes the exact original first under
`.gleip/context/objects/<sha256>` and records metadata in `.gleip/context/index.json`.
The index does not store full original content.

Compression does not intercept provider traffic, authentication, prompts, model
calls, or network requests. It does not compress active canonical task state,
briefs, requirement ledgers, accepted plans, scope state, approval state, source
code, dependency manifests, lockfiles, CI configuration, or sensitive-looking
content.
