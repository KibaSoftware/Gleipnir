# Plan Validation

Gleip plan validation is a proactive guardrail for coding agents. After local preflight creates the implementation brief and scope budget, the agent validates its intended plan before editing code.

The goal is to catch obvious scope problems early: new dependencies, CI changes, skipped or deleted tests, broad rewrites, missing tests, and files outside the active allowed paths.

## Agent Workflow

1. Run `npx --no-install gleip preflight "<task>"`.
2. Draft a short implementation plan that names likely files and tests.
3. Run plan validation.
4. Proceed only when the status is `approved`.
5. Revise the plan for `needs_revision`.
6. Ask the user before proceeding on `requires_approval`.

## Testing the workflow manually

These commands are available for testing or fallback. Normal usage is for generated agent instructions to run them automatically.

Validate inline text:

```sh
npx --no-install gleip validate-plan "Update the checkout discount calculation and its focused tests"
```

Validate a plan file:

```sh
npx --no-install gleip validate-plan --file plan.md
```

Validate from stdin:

```sh
echo "Update the checkout discount calculation and run focused tests" | npx --no-install gleip validate-plan
```

Use JSON output for automation:

```sh
npx --no-install gleip validate-plan --json --file plan.md
```

## Statuses

- `approved`: The plan has no findings that require revision or approval.
- `needs_revision`: The plan should be narrowed or made more concrete before code is edited.
- `requires_approval`: The plan includes work that needs explicit user approval, such as disallowed dependency changes, CI changes, or test weakening.

## Limitations

Plan validation uses deterministic text extraction only. It is not an AI review and it is not a semantic proof that the plan is correct or complete.

Agents and reviewers still need human judgment for risky work, unclear scope, architecture changes, and cases where the plan omits important context.
