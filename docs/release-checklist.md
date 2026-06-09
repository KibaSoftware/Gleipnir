# Release Checklist

Use this checklist for the local-only developer preview.

Current release target: `0.2.2`.

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

## Packed Install

- Install `dist-pack/gleip-0.2.2.tgz` into a clean external temp repo.
- Verify:
  - `npx gleip --help`
  - `npx gleip --version`
  - `npx gleip init --all-agents`
  - `npx gleip doctor --agents`
  - `npx --no-install gleip uninstall --dry-run`
  - `npx --no-install gleip uninstall`

- Confirm repository cleanup removes Gleip-owned files and managed sections while preserving unrelated agent instructions.
- Confirm package removal remains a separate `npm uninstall gleip` step.

## Testing the workflow manually

Task workflow commands are for agents and direct release testing, not the normal developer workflow.

- `npx gleip preflight "Fix the checkout discount calculation bug without changing payment provider integration or checkout routing."`
- `npx gleip brief`
- `npx gleip validate-plan "Update the discount calculation and its focused checkout tests."`
- `npx gleip status`
- `npx gleip check`
- `npx gleip disable --reason "manual test"`
- `npx gleip enable --reason "manual test complete"`

## Local-only Check

- Confirm no network/API/account/dashboard/telemetry behavior exists.
- Confirm `.gleip/` is ignored.
- Confirm `.gleip.yml` is not ignored.
- Confirm generated agent instructions use `npx --no-install gleip` for preflight, plan validation, and status.
- Confirm the root and npm READMEs lead with agent auto-usage and list Codex/generic agents, Claude Code, and Cursor.
- Confirm the root and npm READMEs document the uninstall lifecycle.
