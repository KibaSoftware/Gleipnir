# Release Checklist

Use this checklist for the local-only developer preview.

Current release target: `0.7.3`.

Release focus: semantic scope target classification, broad-task precision,
conservative path extraction, deterministic structural plan validation, stable
findings, conservative CI behavior, and precision-first policy.

## Signal Quality Gates

- Existing valid-work benchmark cases must continue to pass.
- No new false-positive category may be introduced without a matching benchmark scenario.
- Run external black-box benchmarks before release to check for false-positive regressions.
- Non-zero CI behavior must be limited to documented high-confidence finding codes.
- Scope expansion must remain warning-based unless there is high-confidence evidence of unrelated or risky work.
- Multi-file changes must not fail solely because multiple files or modules changed.
- Plan validation must remain structural rather than semantic.

## Package

- Confirm package name and version.
- Public preview install target is `npm install -D gleip`.
- Run:
  - `pnpm install --lockfile-only`
  - `pnpm build`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm smoke:cli`
  - `pnpm pack:cli`
  - `npm pack`

## Packed Install

- Install `dist-pack/gleip-0.7.3.tgz` into a clean external temp repo.
- Verify:
  - `npx gleip --help`
  - `npx gleip --version`
  - `npx gleip init`
  - `npx gleip preflight --file task.md`
  - `npx gleip validate-plan --file plan.md`
  - `npx gleip status`
  - `npx gleip doctor`
  - `npx gleip check`
  - `npx gleip check --ci`
  - `npx --no-install gleip uninstall --dry-run`
  - `npx --no-install gleip uninstall`

- Confirm repository cleanup removes Gleip-owned files and managed sections while preserving unrelated agent instructions.
- Confirm package removal remains a separate `npm uninstall gleip` step.

## Testing the workflow manually

Task workflow commands are for agents and direct release testing, not the normal developer workflow.

- `npx gleip preflight "Fix the checkout discount calculation bug without changing payment provider integration or checkout routing."`
- `npx gleip preflight --file task.md`
- `npx gleip brief`
- `npx gleip validate-plan "Update the discount calculation and its focused checkout tests."`
- `npx gleip validate-plan --file plan.md`
- `npx gleip status`
- `npx gleip report`
- `npx gleip report --json`
- `npx gleip check`
- `npx gleip disable --reason "manual test"`
- `npx gleip enable --reason "manual test complete"`

## Local-only Check

- Confirm no network/API/account/dashboard/telemetry behavior exists.
- Confirm no source code, diffs, prompts, file names, repository metadata, or usage data leave the repository.
- Confirm `.gleip/` is ignored.
- Confirm `.gleip.yml` is not ignored.
- Confirm generated agent instructions use `npx --no-install gleip` for preflight, plan validation, check, status, and report.
- Confirm `doctor` reports complete setup and identifies missing `.gitignore` or agent instructions.
- Confirm the root and npm READMEs lead with agent auto-usage and list Codex/generic agents, Claude Code, and Gemini CLI.
- Confirm the root and npm READMEs document the uninstall lifecycle.
