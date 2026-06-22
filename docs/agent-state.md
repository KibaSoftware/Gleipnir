# Agent State

Gleip stores repo-local enabled/disabled state in `.gleip/state.json`.

When `enabled` is `true`, coding agents should run `npx --no-install gleip preflight "<task>"` before editing code, follow the generated brief and scope budget, and run `npx --no-install gleip check --incremental` plus `npx --no-install gleip status --compact` before the final response.

When `enabled` is `false`, coding agents should not silently proceed. They should ask:

```text
Gleip is currently inactive. Do you want me to continue without Gleip guidance? y/n
```

If the user confirms, the agent should mention in the final response that Gleip was inactive and no Gleip validation was performed.

## Commands

```sh
npx gleip state
npx gleip enable
npx gleip disable
npx gleip disable --reason "manual test"
```

`npx gleip enable` and `npx gleip disable` update `.gleip/state.json` with the current enabled value, timestamp, `updatedBy: "local-cli"`, and optional reason.

Disabled state does not prevent manual Gleip commands. The task workflow remains available for testing or fallback and prints a concise disabled note.

Disabled state is not a security boundary. It works only when agents respect the repository instructions written by `npx gleip init`.
