# Changelog

## 0.4.0

### Added

- Added `gleip --version` so installed package versions can be verified directly.
- Added clearer first-run guidance after `gleip init`.
- Strengthened agent usage instructions for `preflight`, `validate-plan`, `check`, and `status`.
- Added `doctor` setup diagnostics for incomplete initialization, instructions, and local artifact protection.

### Changed

- Improved npm package metadata with accurate AI-agent, code-quality, and local guardrail keywords.
- Updated README install, first-run, agent workflow, and committed-file guidance.
- Clarified correct version-check commands, including `npx gleip --version` and local binary usage on Unix and Windows PowerShell.
- Documented that `npm gleip --version` prints npm's version, not Gleip's.

### Fixed

- Made `gleip init` reliably create or update `.gitignore` with an idempotent Gleip local-artifacts block.
- Protected local-only Gleip session, baseline, state, and report artifacts from accidental commits.
- Fixed the root npm package metadata so installs expose the built `gleip` executable.
- Improved and smoke-tested behavior from the packed npm artifact.

### Security / Privacy

- Reaffirmed Gleip's local-only design: no telemetry, network calls, cloud sync, external API calls, or source code and repository metadata leaving the local repository.
