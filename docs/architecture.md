# Architecture

Gleip is organized as a TypeScript monorepo with small packages and explicit boundaries.

## Packages

- `gleip` owns command-line parsing and user-facing command wiring.
- `@gleip/core` owns shared domain types and orchestration primitives.
- `@gleip/config` owns `.gleip.yml` loading, validation, and defaults.
- `@gleip/planner` owns scope, budget, and task planning concepts.
- `@gleip/controller` owns policy application across agent workflows, deterministic report scoring, and report rendering.
- `@gleip/adapters` owns integrations with coding agents and external tools.
- `@gleip/github-action` owns CI entry points for GitHub Actions.

The CLI should stay thin. Reusable behavior belongs in package code that can be tested without invoking a shell.
