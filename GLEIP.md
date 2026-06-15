# Gleip Product and Engineering Rules

Gleip exists to guide AI-generated work toward lower drift, lower token waste,
clearer scope, safer changes, and cleaner final output.

## Product Rules

- Gleip is a guidance tool, not a permission system.
- Expected scope should explain likely work without making all other paths illegal.
- Policy feedback should be concrete, actionable, and tied to changed files.
- Scoring should explain tradeoffs instead of hiding them behind a single opaque number.
- Reports and efficiency estimates must remain deterministic, evidence-backed, conservative, and local-only.
- Defaults should favor reviewable patches, appropriate verification, and low
  dependency growth while allowing explicitly broad work.
- CI and local workflows should use the same policy concepts.

## Engineering Rules

- Keep packages focused on one responsibility.
- Prefer plain TypeScript types and small functions before framework-level abstractions.
- Do not implement product behavior before its policy and boundary are clear.
- Treat configuration as user-facing API.
- Preserve deterministic output where possible so results are reviewable.
- Keep the CLI thin; product logic belongs in packages that can be tested directly.
