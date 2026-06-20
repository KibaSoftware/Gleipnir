# Local Package Testing

Use these flows before publishing anything. They verify the built CLI can run outside the source TypeScript entrypoint. For the full local-only preview release pass, see [docs/release-checklist.md](release-checklist.md).

Current release target: `0.7.4`.

## Flow A: npm pack

From the Gleip repository:

```sh
pnpm install
pnpm build
pnpm pack:cli
```

This packs the root `gleip` package to `dist-pack/`. The package `bin` points to the
built CLI at `packages/cli/dist/index.js`.

Plain `npm pack` from the repository root produces the same package in the repository
root and is the command used for the release smoke test.

The public preview install target is:

```sh
npm install -D gleip
npx gleip init
```

Create a temporary repository and install the generated tarball:

```sh
mkdir %TEMP%\gleip-pack-test
cd %TEMP%\gleip-pack-test
git init
npm init -y
npm install -D <path-to-repo>\dist-pack\gleip-0.7.4.tgz
```

On macOS or Linux, use a temp directory such as `/tmp/gleip-pack-test` and the matching tarball path.

Run the packaged CLI:

```sh
npx gleip --help
npx gleip --version
npx gleip init
npx gleip doctor
npx gleip doctor --agents
npx gleip report --json
npx gleip check
npx gleip check --ci
npx --no-install gleip uninstall --dry-run
npx --no-install gleip uninstall
```

Expected result: help prints, the version is `0.7.4`, setup diagnostics pass, reports and checks run locally, the selected agent instruction is created, dry-run changes nothing, and uninstall removes generated repository files without removing the npm dependency.

Verify git behavior from the fixture:

```sh
git status --ignored
git check-ignore -v .gleip/session.json
git check-ignore -v .gleip.yml
git check-ignore -v AGENTS.md
```

The `.gleip/session.json` check should match the Gleip block. The `.gleip.yml` and
`AGENTS.md` checks should return no match because they are intended to be versioned.

## Testing the workflow manually

The task workflow is intended for generated agent instructions. This optional flow verifies it directly with a focused task:

```sh
npx gleip preflight "Fix the checkout discount calculation bug without changing payment provider integration or checkout routing."
npx gleip preflight --file task.md
npx gleip brief
npx gleip validate-plan "Update the discount calculation and its focused checkout tests."
npx gleip validate-plan --file plan.md
npx gleip status
npx gleip report
npx gleip report --json
npx gleip check
```

## Flow B: Built CLI Smoke Script

From the Gleip repository:

```sh
pnpm build
pnpm smoke:cli
```

The script creates a temporary git repo, runs `node packages/cli/dist/index.js`, executes agent setup and the task workflow, and checks that expected Gleip files exist.

## Flow C: pnpm link

From the CLI package:

```sh
pnpm build
cd packages/cli
pnpm link --global
```

From a temporary repository:

```sh
pnpm link --global
gleip --help
gleip init
```

Use `pnpm unlink --global gleip` when finished.
