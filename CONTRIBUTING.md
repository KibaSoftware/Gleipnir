# Contributing

Gleip accepts focused contributions that make the control layer clearer, safer, or easier to run.

## Expectations

- Keep changes small and scoped to the issue or proposal.
- Avoid speculative refactors and broad rewrites.
- Do not add dependencies unless they are necessary and justified.
- Preserve existing tests and add coverage for changed behavior.
- Keep public APIs and package boundaries explicit.
- Update docs when behavior, policy, or workflows change.

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format
```

Before opening a pull request, make sure the relevant checks pass and include a short explanation of changed files, risks, and test coverage.
