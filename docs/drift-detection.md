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
- `blocked`: The diff contains an objective hard-gate issue, such as skipped tests, deleted tests, or likely secret/env files.

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

1. `blocked`
2. `approval_required`
3. `warning`
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

## Limitations

Baseline filtering is intentionally simple in this first implementation. Gleip compares changed file paths, added/deleted line counts, and file-level diff fingerprints. It does not subtract individual patch hunks. If a pre-existing file changes after preflight, Gleip treats that file as a session change.

Gleip is intentionally quiet unless something meaningful changes. It is a sidecar drift detector, not a linter.
