# Release Checklist

Use this checklist for the local-only developer preview.

## Package

- Confirm package name and version.
- Public preview install target is `npm install -D gleip`.
- Run:
  - `pnpm install`
  - `pnpm build`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm smoke:cli`
  - `pnpm pack:cli`
- Remove `dist-pack/` after verification if generated.

## Packed Install

- Install the packed tarballs into a clean external temp repo.
- Verify:
  - `npx gleip --help`
  - `npx gleip init`
  - `npx gleip state`
  - `npx gleip preflight "Add CSV export to users table"`
  - `npx gleip brief`
  - `npx gleip validate-plan "Modify UserTable, reuse csv utility, add tests"`
  - `npx gleip status`
  - `npx gleip check`
  - `npx gleip disable --reason "manual test"`
  - `npx gleip enable --reason "manual test complete"`

## Local-only Check

- Confirm no network/API/account/dashboard/telemetry behavior exists.
- Confirm `.gleip/` is ignored.
- Confirm `.gleip.yml` is not ignored.
