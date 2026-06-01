# Plan Validation

Gleip plan validation is a proactive guardrail for coding agents. After `gleip preflight` creates the implementation brief and scope budget, the agent can validate its intended plan before editing code.

The goal is to catch obvious scope problems early: new dependencies, CI changes, skipped or deleted tests, broad rewrites, missing tests, and files outside the active allowed paths.

## Agent Workflow

1. Run `gleip preflight "<task>"`.
2. Draft a short implementation plan that names likely files and tests.
3. Run plan validation.
4. Proceed only when the status is `approved`.
5. Revise the plan for `needs_revision`.
6. Ask the user before proceeding on `requires_approval`.

## Commands

Validate inline text:

```sh
gleip validate-plan "Modify src/features/users/UserTable.tsx and add tests in src/features/users/UserTable.test.tsx"
```

Validate a plan file:

```sh
gleip validate-plan --file plan.md
```

Validate from stdin:

```sh
echo "Modify src/features/users/UserTable.tsx and run tests" | gleip validate-plan
```

Use JSON output for automation:

```sh
gleip validate-plan --json --file plan.md
```

## Statuses

- `approved`: The plan has no findings that require revision or approval.
- `needs_revision`: The plan should be narrowed or made more concrete before code is edited.
- `requires_approval`: The plan includes work that needs explicit user approval, such as disallowed dependency changes, CI changes, or test weakening.

## Limitations

Plan validation uses deterministic text extraction only. It is not an AI review and it is not a semantic proof that the plan is correct or complete.

Agents and reviewers still need human judgment for risky work, unclear scope, architecture changes, and cases where the plan omits important context.
