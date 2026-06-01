# Gleip Product and Engineering Rules

Gleip exists to make AI-generated code easier to trust, review, and merge.

## Product Rules

- Gleip should constrain agent work before it expands.
- Policy feedback should be concrete, actionable, and tied to changed files.
- Scoring should explain tradeoffs instead of hiding them behind a single opaque number.
- Defaults should favor small patches, explicit tests, and low dependency growth.
- CI and local workflows should use the same policy concepts.

## Engineering Rules

- Keep packages focused on one responsibility.
- Prefer plain TypeScript types and small functions before framework-level abstractions.
- Do not implement product behavior before its policy and boundary are clear.
- Treat configuration as user-facing API.
- Preserve deterministic output where possible so results are reviewable.
- Keep the CLI thin; product logic belongs in packages that can be tested directly.
