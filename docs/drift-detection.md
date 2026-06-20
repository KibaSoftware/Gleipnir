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

When a baseline file changes again after preflight, Gleip includes the file in
current drift metrics and records the attribution as file-level ambiguous. It does
not silently ignore post-preflight modifications, and it does not claim hunk-level
precision.

Use `--include-baseline` to analyze the full current working tree:

```sh
npx --no-install gleip status --include-baseline
npx --no-install gleip check --include-baseline
```

This is useful when you intentionally want Gleip to consider pre-existing changes as part of the active review.

`npx --no-install gleip check` is non-mutating. If an active session and baseline exist, it uses the same baseline-filtered diff as status. If no active session exists, it checks the whole working tree with a conservative default budget.

Final checks reconcile the actual diff against the active objective, explicit
scope, inferred task breadth, expected and derived paths, protected checks, and the
latest validated plan when present. Planning-time tolerance does not make unrelated
diff files acceptable: changed files outside explicit or derived scope are reported
with target classification, reason, evidence, and the required next action.

`gleip status` recomputes findings and the next action from the current Git diff on
every run. Previous status snapshots are history only; they do not keep resolved
cleanup or scope findings active. Accepted direct and derived targets from the
latest successful `validate-plan` run are reused during status so files already
validated as task-related are not reclassified as unexplained.

`gleip report` uses the same current Git diff, baseline filtering, configuration,
and latest successful accepted plan scope. It does not read `.gleip/status.md` as
authoritative evidence; status is an output artifact that can be regenerated.

Known Gleip runtime artifacts under `.gleip/`, such as session, baseline, brief,
scope-budget, status, report, and archived session files, are excluded from task
changed-file metrics and scope findings. Currently tracked runtime artifacts are
still reported separately while they exist. Durable or user-authored `.gleip` files
that are not runtime artifacts remain visible to Git diff analysis.

## Status Levels

- `clean`: No findings were detected.
- `advisory`: Informational or warning-level drift is present.
- `needs_attention`: Scope, risk, or verification clarification is recommended.
- `needs_cleanup`: Local artifacts, secrets, or accidental generated files need cleanup.
- `needs_approval`: Dependency, CI, protected config, or similar changes need approval.

Each finding also has a stable code and severity:

- `info`: Context only.
- `warn`: Advisory signal.
- `action_required`: Focused correction or rationale is required.
- `approval_required`: Approval is required or the change should be removed.
- `cleanup_required`: Accidental or sensitive content should be removed.

Text output uses a concise form such as
`[TEST_SKIPPED] action_required: Skipped test added`.

## Finding Codes

| Code | Severity | Current signal |
| --- | --- | --- |
| `TEST_SKIPPED` | `action_required` | A skipped or pending test was added. |
| `TEST_DELETED` | `action_required` | A test file was deleted. |
| `TEST_WEAKENED` | `action_required` | Explicit test weakening intent or a large test deletion was detected. |
| `DEPENDENCY_FILE_CHANGED` | `approval_required` | A dependency manifest changed without declared approval. |
| `LOCKFILE_CHANGED` | `approval_required` | A lockfile changed without declared approval. |
| `LOCAL_ARTIFACT_INCLUDED` | `cleanup_required` | A `.gleip/` session artifact is tracked by git. |
| `NO_ACTIVE_SESSION` | `action_required` | A session-required command has no active session. |
| `SCOPE_EXPANSION_WARN` | `warn` | Adjacent or unexplained files need scope clarification. |
| `PLAN_TOO_VAGUE` | `warn` | Structural plan details are too vague. |
| `MISSING_TEST_STRATEGY` | `warn` | A structurally required test strategy is absent. |
| `SCOPE_LIMIT_EXCEEDED` | `warn` | A soft file or line limit was exceeded. |
| `GIT_UNAVAILABLE` | `warn` | Local git evidence could not be inspected. |
| `CI_FILE_CHANGED` | `approval_required` | CI configuration changed without declared approval. |
| `SECRET_FILE_CHANGED` | `cleanup_required` | A likely secret or env file changed. |
| `APPROVAL_REQUIRED_PATH_CHANGED` | `approval_required` | An explicitly protected path changed. |
| `BLOCKED_PATH_CHANGED` | `approval_required` | A legacy protected-path rule matched. |
| `DEPENDENCY_CHANGE_INTENT` | `approval_required` | A plan proposes an unapproved dependency change. |
| `CI_CHANGE_INTENT` | `approval_required` | A plan proposes an unapproved CI change. |
| `BROAD_REFACTOR_INTENT` | `warn` or `action_required` | A plan proposes a broad refactor outside the declared task. |
| `PLAN_MISSING` | `action_required` | Structural validation received no plan text. |
| `PLAN_REQUIRED_SECTION_MISSING` | `warn` | Implementation/change structure is absent. |
| `PLAN_NO_FILES_MENTIONED` | `warn` | A code-task plan has no file, module, or scope signal. |
| `PLAN_NO_VERIFICATION` | `warn` | Required verification structure or language is absent. |
| `PLAN_RISK_RATIONALE_MISSING` | `warn` | Risky or expanded scope lacks risk/assumption/rationale structure. |
| `PLAN_MENTIONED_FILE_MISSING` | `warn` | An edit target does not exist and is not marked new. |
| `PLAN_SCOPE_OUTSIDE_BUDGET` | `warn` | Proposed files fall outside active expected paths. |
| `PLAN_RISKY_FILE_MENTIONED` | `warn` | A dependency, CI, config, secret, or security-sensitive file is named. |
| `PLAN_VENDOR_EDIT_TARGET` | `warn` | An excluded dependency/vendor/generated path is proposed for editing. |
| `SCOPE_EXPANSION_RATIONALE_REQUIRED` | `warn` | Expanded scope lacks a named reason and verification. |
| `SCOPE_EXPANSION_RATIONALE_VAGUE` | `warn` | Expansion rationale uses only generic wording. |
| `DEPENDENCY_REQUIREMENT_CONFLICT` | `approval_required` | A required package is absent while new dependencies are unapproved. |
| `DEPENDENCY_SUBSTITUTION_REQUIRES_APPROVAL` | `approval_required` | A required package is replaced without an approval marker. |
| `RISKY_CHANGE_RATIONALE_REQUIRED` | `warn` or `approval_required` | A risky file category lacks a named reason. |
| `PLAN_SCOPE_EXCEEDS_BUDGET` | `warn` | Proposed file count exceeds the soft maximum. |
| `PLAN_HARD_GATE_VIOLATION` | `approval_required` | A proposed path crosses a legacy protected check. |

`MISSING_IMPLEMENTATION_CHANGE` is reserved but intentionally not emitted.
Gleip does not yet have a high-confidence structural detector for that condition.

## How Agents Should Use It

Agents run `npx --no-install gleip status` before the final response.

Use `nextAction` as the finding-specific instruction. Advisory scope findings ask
for review or rationale. Cleanup findings name artifacts or sensitive files to
remove. Approval findings ask for approval or removal of the relevant change.
Verification findings ask for focused restoration or explicit user-approved
rationale. Gleip does not label the task itself as denied.

## Report Shape

Gleip groups related findings to reduce noise. For example, several outside-scope files are reported as one finding with a short examples list instead of one finding per file.

Findings are ordered by action category: cleanup, approval, action, warning, then
information.

The report ends with one next action so coding agents have a clear instruction.
Scope findings include the relevant normalized targets in normal console output;
agents should not need to inspect `.gleip/session.json` or `.gleip/status.md` to
identify the files.

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
non-mutating. It exits `1` only when a documented high-confidence action code is
present and exits `0` for clean, advisory, and non-CI-enforced findings.

The CI-enforced codes are:

- `TEST_SKIPPED`
- `TEST_DELETED`
- `LOCAL_ARTIFACT_INCLUDED`
- `NO_ACTIVE_SESSION` for commands that require an active session

Dependency and lockfile changes use `approval_required`; scope expansion uses
`warn`. The CI allowlist remains intentionally conservative. CI wording describes
the required cleanup or action rather than declaring the task blocked.

## Limitations

Baseline filtering is intentionally file-level. Gleip compares changed file paths,
added/deleted line counts, and file-level diff fingerprints. It does not subtract
individual patch hunks. If a pre-existing file changes after preflight, Gleip
treats that file as a session change and marks attribution as ambiguous.

Gleip is intentionally quiet unless something meaningful changes. It is a sidecar drift detector, not a linter.
