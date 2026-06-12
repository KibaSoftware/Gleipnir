# Drift Detection

`npx --no-install gleip status` compares the current working tree against the active `.gleip/scope-budget.json`.

Gleip collects the local Git diff, including staged and unstaged changes, then checks it against the scope budget produced by `npx --no-install gleip preflight "<task>"`.

## Session Baseline

`npx --no-install gleip preflight "<task>"` captures a working-tree baseline before implementation starts.

`npx --no-install gleip status` focuses on changes made after that preflight baseline. Pre-existing files are ignored when their diff has not changed since preflight.

Pre-existing changes are included again when:

- the file was not present in the baseline
- the file's added/deleted line counts changed
- the file's diff fingerprint changed

Use `--include-baseline` to analyze the full current working tree:

```sh
npx --no-install gleip status --include-baseline
npx --no-install gleip check --include-baseline
```

This is useful when you intentionally want Gleip to consider pre-existing changes as part of the active review.

`npx --no-install gleip check` is non-mutating. If an active session and baseline exist, it uses the same baseline-filtered diff as status. If no active session exists, it checks the whole working tree with a conservative default budget.

## Status Levels

- `within_scope`: No meaningful budget issues were detected.
- `warning`: A soft limit was exceeded, such as file count or line count.
- `approval_required`: The diff touches a path or category that needs explicit approval, such as dependency or CI files when the budget does not allow them.
- `blocked`: The diff contains an objective hard-gate issue, such as skipped tests, deleted tests, or tracked local Gleip artifacts.

Each finding also has a stable code and severity:

- `info`: Context only.
- `warn`: Advisory signal that does not block CI.
- `fail`: Strong local finding that does not block CI in 0.5.0.
- `blocking`: High-confidence finding eligible to block CI.

Text output uses a concise form such as `[TEST_SKIPPED] blocking: Skipped test added`.

## Finding Codes in 0.5.0

| Code | Severity | Current signal |
| --- | --- | --- |
| `TEST_SKIPPED` | `blocking` | A skipped or pending test was added. |
| `TEST_DELETED` | `blocking` | A test file was deleted. |
| `TEST_WEAKENED` | `fail` | Explicit test weakening intent or a large test deletion was detected. |
| `DEPENDENCY_FILE_CHANGED` | `fail` | A dependency manifest changed outside an allowed dependency task. |
| `LOCKFILE_CHANGED` | `fail` | A lockfile changed outside an allowed dependency task. |
| `LOCAL_ARTIFACT_INCLUDED` | `blocking` | A `.gleip/` session artifact is tracked by git. |
| `NO_ACTIVE_SESSION` | `blocking` | A session-required command has no active session. |
| `SCOPE_EXPANSION_WARN` | `warn` | Files are outside the inferred allowed paths. |
| `PLAN_TOO_VAGUE` | `warn` | Structural plan details are too vague. |
| `MISSING_TEST_STRATEGY` | `warn` | A structurally required test strategy is absent. |
| `SCOPE_LIMIT_EXCEEDED` | `warn` | A soft file or line limit was exceeded. |
| `GIT_UNAVAILABLE` | `warn` | Local git evidence could not be inspected. |
| `CI_FILE_CHANGED` | `fail` | CI configuration changed outside an allowed CI task. |
| `SECRET_FILE_CHANGED` | `fail` | A likely secret or env file changed. |
| `APPROVAL_REQUIRED_PATH_CHANGED` | `fail` | An explicitly protected path changed. |
| `BLOCKED_PATH_CHANGED` | `fail` | A configured blocked-without-approval path changed. |
| `DEPENDENCY_CHANGE_INTENT` | `fail` | A plan explicitly proposes a disallowed dependency change. |
| `CI_CHANGE_INTENT` | `fail` | A plan explicitly proposes a disallowed CI change. |
| `BROAD_REFACTOR_INTENT` | `warn` or `fail` | A plan explicitly proposes a broad refactor outside the task type. |

`MISSING_IMPLEMENTATION_CHANGE` is reserved but intentionally not emitted in 0.5.0.
Gleip does not yet have a high-confidence structural detector for that condition.

## How Agents Should Use It

Agents run `npx --no-install gleip status` before the final response.

For each status:

- `within_scope`: Continue and run relevant tests before the final response.
- `warning`: Review warnings and reduce scope if practical. Continue only when the expanded scope is justified.
- `approval_required`: Stop and ask for approval, or revise the implementation to stay within budget.
- `blocked`: Fix the blocked issue before continuing. Do not proceed with skipped/deleted tests or secret changes.

If Gleip reports `warning`, review the finding and keep the implementation narrow.

If Gleip reports `approval_required`, stop and ask for approval before continuing.

If Gleip reports `blocked`, do not continue until the blocked change is fixed or explicitly approved.

## Report Shape

Gleip groups related findings to reduce noise. For example, several outside-scope files are reported as one finding with a short examples list instead of one finding per file.

Findings are ordered by severity:

1. `blocking`
2. `fail`
3. `warn`
4. `info`

The report ends with one next action so coding agents have a clear instruction.

## JSON Output

Use `--json` for future editor or agent integrations:

```sh
npx --no-install gleip status --json
npx --no-install gleip check --json
```

JSON output includes:

- `status`
- `metrics`
- `baseline`
- `findings`
- `nextAction`

`npx --no-install gleip check --json` is non-mutating, like the text check command.

## CI Mode

`npx --no-install gleip check --ci` is deterministic, non-interactive, local-only, and
non-mutating. It exits `1` only when a documented blocking code is present and exits
`0` for OK, INFO, WARN, and non-blocking FAIL findings.

The 0.5.0 CI blocking codes are:

- `TEST_SKIPPED`
- `TEST_DELETED`
- `LOCAL_ARTIFACT_INCLUDED`
- `NO_ACTIVE_SESSION` for commands that require an active session

Dependency and lockfile changes use `DEPENDENCY_FILE_CHANGED` and `LOCKFILE_CHANGED`
with `fail` severity, but do not block `check --ci` in 0.5.0. Scope expansion uses
`SCOPE_EXPANSION_WARN` with `warn` severity.

## Limitations

Baseline filtering is intentionally simple in this first implementation. Gleip compares changed file paths, added/deleted line counts, and file-level diff fingerprints. It does not subtract individual patch hunks. If a pre-existing file changes after preflight, Gleip treats that file as a session change.

Gleip is intentionally quiet unless something meaningful changes. It is a sidecar drift detector, not a linter.
