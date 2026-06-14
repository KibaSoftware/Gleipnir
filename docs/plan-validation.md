# Plan Validation

Gleip plan validation is a proactive guardrail for coding agents. After local preflight creates the implementation brief and scope budget, the agent validates its intended plan before editing code.

The goal is to catch deterministic structural and scope problems early: missing plan
sections, missing or out-of-scope files, vague expansion rationale, dependency
requirement conflicts, risky file categories, skipped or deleted tests, and scope
budget mismatches.

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

Preflight can read a full task contract without making that file an edit target:

```sh
npx --no-install gleip preflight --file task.md
```

Plan validation treats files referenced as context or reference material as read-only
unless the plan proposes modifying them. A file passed through `--file` is also
read-only context by default and is not added to editable scope. Verification
commands such as existing test runs, focused pytest/vitest runs, smoke tests,
compile checks, and typechecks satisfy the test-plan requirement without requiring
a new test file.

Providing both inline plan text and `--file` is rejected. Missing, empty, or
unreadable plan input exits non-zero with an actionable message.

## Structural Checks

For non-trivial code tasks, Gleip recognizes section labels and equivalent free-form
language for:

- files, modules, touched scope, or components
- implementation, changes, steps, or approach
- verification, tests, checks, or validation
- risks, assumptions, constraints, or scope rationale when risky or expanded scope is involved

Section names are not rigid. A free-form plan such as "Update `src/foo.ts`, then run
focused tests and typecheck" contains the required structural signals.

Gleip parses mentioned paths deterministically:

- existing edit targets should exist
- new files are allowed when marked with create/add/new wording
- context references remain read-only
- generated outputs remain output-only when clearly described as artifacts under expected output directories
- dependency, vendor, virtualenv, generated, cache, and build paths are not normal edit scope

## Scope Rationale

When proposed files exceed the soft budget or fall outside allowed paths, Gleip asks
for a scope rationale. A structurally specific rationale names the extra file,
module, or category, states why it is needed, and includes or implies verification
for that area. Gleip checks only that those elements are present; it does not decide
whether the explanation is true.

Ordinary source and test expansion is warning-based. Dependency manifests,
lockfiles, CI, secrets, environment files, and security-sensitive paths retain
stronger findings according to existing hard gates.

No extra rationale is required for paths directly named or structurally implied by
the task contract. For example, an explicit docs request covers docs plus
README/changelog, a package-version request covers package metadata, and a release
task naming CLI, planner, tests, and smoke tests covers those areas. Output describes
such plans as aligned with declared task scope.

## Dependency Conflicts

Gleip recognizes explicit requirements for a bounded registry of common Python and
Node packages. It compares those requirements with local `package.json`,
`pyproject.toml`, `requirements.txt`, `setup.cfg`, and `setup.py` evidence.

If a required package is absent and new dependencies are blocked, the plan requires
clarification or approval. A proposed substitution also requires an explicit
accepted-alternative or user-approval marker. Preference wording such as "prefer
Typer if available" is not treated as a hard requirement.

This check is local-only. Gleip performs no package-registry lookup and does not
inspect global machine package state.

## Statuses

- `approved`: The plan has no findings that require revision or approval.
- `needs_revision`: The plan should be narrowed or made more concrete before code is edited.
- `requires_approval`: The plan includes work that needs explicit user approval, such as disallowed dependency changes, CI changes, or test weakening.

## Limitations

Plan validation uses deterministic text extraction only. It is not an AI review and
it is not a semantic proof that the plan is correct, complete, necessary, or the
best design.

Agents and reviewers still need human judgment for risky work, unclear scope, architecture changes, and cases where the plan omits important context.

Gleip makes no network calls and has no LLM/API, telemetry, cloud, account,
dashboard, source-upload, or repository-metadata-upload behavior.
