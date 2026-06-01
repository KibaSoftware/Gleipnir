# Agent State

Gleip stores repo-local enabled/disabled state in `.gleip/state.json`.

When `enabled` is `true`, coding agents should run `gleip preflight "<task>"` before editing code, follow the generated brief and scope budget, and run `gleip status` before the final response.

When `enabled` is `false`, coding agents should not silently proceed. They should ask:

```text
Gleip is currently inactive. Do you want me to proceed without Gleip guardrails? y/n
```

If the user confirms, the agent should mention in the final response that Gleip was inactive and no Gleip validation was performed.

## Commands

```sh
gleip state
gleip enable
gleip disable
gleip disable --reason "manual test"
```

`gleip enable` and `gleip disable` update `.gleip/state.json` with the current enabled value, timestamp, `updatedBy: "local-cli"`, and optional reason.

Disabled state does not prevent manual Gleip commands. `gleip preflight`, `gleip status`, and `gleip check` still run and print a concise disabled note.

Disabled state is not a security boundary. It works only when agents respect the repository instructions written by `gleip init`.
