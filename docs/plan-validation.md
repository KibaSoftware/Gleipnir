# Plan Validation

Gleip plan validation provides proactive local guidance for coding agents. After
preflight preserves the canonical task, creates the derived implementation brief,
and writes the scope budget, the agent checks its intended plan before editing code.

The goal is to catch deterministic structural and scope problems early: missing plan
sections, missing or out-of-scope files, vague expansion rationale, dependency
requirement conflicts, risky file categories, skipped or deleted tests, and scope
budget mismatches.

Validation also checks the active canonical requirement ledger. The
derived brief is a navigation aid, not the task contract. A plan can be fully
aligned only when required canonical requirements are addressed or validly scoped
out with rationale and no prohibited canonical action is planned.

## Agent Workflow

1. Run `npx --no-install gleip preflight "<task>"`.
2. Read `.gleip/canonical-task.json` as authoritative and `.gleip/brief.md` as an index.
3. Draft a short implementation plan that names likely files and tests.
4. Run plan validation.
5. Proceed when the plan is `aligned` or after reviewing `advisory` findings.
6. Clarify scope, canonical requirement coverage, or verification for `needs_clarification`.
7. Clean accidental artifacts for `needs_cleanup`.
8. Request approval or remove the relevant change for `needs_approval`.

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

User amendments should be recorded as ordered canonical revisions:

```sh
npx --no-install gleip preflight --amend "Also preserve Windows compatibility."
```

Plan validation treats files referenced as context or reference material as read-only
unless the plan proposes modifying them. A file passed through `--file` is also
read-only context by default and is not added to editable scope. Verification
commands such as existing test runs, focused pytest/vitest runs, smoke tests,
compile checks, CLI dry runs, and typechecks satisfy verification structure without
requiring a new test file. Manual verification may be appropriate for docs-only or
configuration-only work.

Providing both inline plan text and `--file` is a CLI input error. Missing, empty,
or unreadable plan input exits non-zero with an actionable message.

## Canonical Requirements

The canonical task artifact stores ordered revisions and a derived requirement
ledger. Requirement offsets use UTF-16 indices into the canonical revision content.
Obligations are classified as required, prohibited, optional, suggestion, or
informational. Required and prohibited active items affect plan status; optional,
informational, and ambiguous items remain advisory.

Plan validation emits canonical requirement findings when a mandatory item is
missing or a prohibited action is planned. It does not require word-for-word
repetition, but the plan must provide clear local evidence through file targets,
verification wording, rationale, or explicit deferral. The brief may omit details,
but omitted brief details are not treated as optional.

## Structural Checks

For non-trivial code tasks, Gleip recognizes section labels and equivalent free-form
language for:

- files, modules, touched scope, or components
- implementation, changes, steps, or approach
- verification, tests, checks, or validation
- risks, assumptions, constraints, or scope rationale when risky or expanded scope is involved

Section names are not rigid. A free-form plan such as "Update `src/foo.ts`, then run
focused tests and typecheck" contains the required structural signals.

Plan validation also uses task-sensitive deterministic evidence detection for
approach and verification. It can recognize broader verification phrasing such as
comparing output with a contract, reconciling totals against source data,
reproducing a failure, reviewing rendered documentation, confirming a clean working
tree, or reporting constraints that cannot be safely validated. This reduces
vocabulary-sensitive false positives without claiming general semantic
understanding.

Gleip parses mentioned paths deterministically:

- existing edit targets should exist
- new files are allowed when marked with create/add/new wording
- context references remain read-only
- explicit edit intent is preserved even when nearby rationale mentions generic
  output-like words such as cache, report, result, fixture, state, diagnostics, or
  response
- generated outputs remain output-only when clearly described as artifacts,
  outputs, fixtures, state files, coverage, reports, or results and when output
  generation applies to the path
- dependency, vendor, virtualenv, generated, cache, and build paths are not normal edit scope

## Scope Rationale

When proposed files exceed the soft budget or fall outside expected paths, Gleip asks
for a scope rationale. A structurally specific rationale names the extra file,
module, or category, states why it is needed, and includes or implies verification
for that area. Gleip checks only that those elements are present; it does not decide
whether the explanation is true.

Plan validation now classifies proposed targets before deciding whether a scope
finding is needed. Direct and derived targets do not warn solely because there are
many of them. Adjacent targets ask for rationale, and unexplained targets are
reported with the normalized target path, classification, reason, evidence, and
next action. An expected file can still contain an out-of-scope operation when the
plan text crosses a protected semantic boundary.

Gleip records the latest validation attempt separately from the latest successful
validation. Status and report use the latest successful accepted targets for drift
classification. A later failed validation attempt may remain workflow guidance,
but it does not erase accepted scope or make accepted implementation files
unexplained. A later successful validation replaces the accepted scope.

Ordinary source and test expansion is advisory. Dependency manifests, lockfiles,
CI, protected config, secrets, environment files, and security-sensitive paths
retain approval-, action-, or cleanup-required findings.

No extra rationale is required for paths directly named or structurally implied by
the task contract. For example, an explicit docs request covers docs plus
README/changelog, a package-version request covers package metadata, and a release
multi-area task naming CLI, planner, tests, and smoke tests covers those areas. Output describes
such plans as aligned with declared task scope.

Path extraction is intentionally conservative. Slash-separated prose like
`cards/tables/headers` or `loading/empty/error states` is ignored unless it has
strong path evidence, such as an extension, recognized manifest/config name, glob
syntax, quotes/backticks, or a structured files/targets section. Windows and POSIX
separators are normalized before matching and reporting.

Structured edit clauses only treat the direct edit target segment as editable
scope. Conceptual slash terms in rationale, field names, diagnostics, cache keys,
or validation descriptions do not become repository paths merely because the line
started with an edit verb.

## Dependency Conflicts

Gleip recognizes explicit requirements for a bounded registry of common Python and
Node packages. It compares those requirements with local `package.json`,
`pyproject.toml`, `requirements.txt`, `setup.cfg`, and `setup.py` evidence.

If a required package is absent and new dependencies are not approved, the plan
requires clarification or approval. A proposed substitution also requires an explicit
accepted-alternative or user-approval marker. Preference wording such as "prefer
Typer if available" is not treated as a hard requirement.

This check is local-only. Gleip performs no package-registry lookup and does not
inspect global machine package state.

## Statuses

- `aligned`: The plan aligns with declared task scope and verification expectations.
- `advisory`: The plan has non-denying guidance worth reviewing.
- `needs_clarification`: Scope, structure, rationale, or verification needs clarification.
- `needs_approval`: Dependency, CI, protected config, or similar work needs approval.
- `needs_cleanup`: Accidental artifact, secret, or generated-file scope needs cleanup.

Legacy plan statuses remain readable in historical report data, but new validation
output uses the statuses above.

## Limitations

Plan validation uses deterministic text extraction only. It is not an AI review and
it is not a semantic proof that the plan is correct, complete, necessary, or the
best design.

Agents and reviewers still need human judgment for risky work, unclear scope, architecture changes, and cases where the plan omits important context.

Gleip makes no network calls and has no LLM/API, telemetry, cloud, account,
dashboard, source-upload, or repository-metadata-upload behavior.
