# Local Package Testing

Use these flows before publishing anything. They verify the built CLI can run outside the source TypeScript entrypoint. For the full local-only preview release pass, see [docs/release-checklist.md](release-checklist.md).

Current release target: `1.1.0`.

## Flow A: npm pack

From the Gleip repository:

```sh
pnpm install
pnpm build
pnpm pack:cli
pnpm smoke:packed
npm pack --dry-run
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
npm install -D <path-to-repo>\dist-pack\gleip-1.1.0.tgz
```

On macOS or Linux, use a temp directory such as `/tmp/gleip-pack-test` and the matching tarball path.

Run the packaged CLI:

```sh
npx gleip --help
npx gleip --version
npx gleip init
npx gleip doctor
npx gleip doctor --agents
npx gleip doctor --fix
npx gleip compress --audit --json < large-output.txt
npx gleip compress --type test_output < large-output.txt
npx gleip retrieve <sha256-reference>
npx gleip run -- node -e "for (let i=0;i<200;i++) console.log('PASS repeated.test.ts')"
npx gleip stats --json
npx gleip report --json
npx gleip replay
npx gleip finalize --json
npx gleip check
npx gleip check --ci
npx gleip check --incremental
npx gleip check --incremental
npx gleip check --incremental --force
npx gleip status --compact
npx --no-install gleip uninstall --dry-run
npx --no-install gleip uninstall
```

Expected result: help prints, the version is `1.1.0`, setup diagnostics pass,
reports and checks run locally, `.gleip/canonical-task.json` is created by
preflight, compression stores exact originals under `.gleip/context/` and retrieves
them by reference, the command wrapper preserves exit status, the second identical
incremental check reuses its baseline, forced recomputation executes, compact
status remains concise, the selected agent instruction is created, repair
preserves local runtime files, dry-run changes nothing, and uninstall removes
recognized generated repository files without removing the npm dependency or
unknown `.gleip/` files.

Verify git behavior from the fixture:

```sh
git status --ignored
git check-ignore -v .gleip/session.json
git check-ignore -v .gleip/context/index.json
git check-ignore -v .gleip.yml
git check-ignore -v AGENTS.md
```

The `.gleip/session.json` and `.gleip/context/index.json` checks should match the Gleip block. The `.gleip.yml` and
`AGENTS.md` checks should return no match because they are intended to be versioned.

## Testing the workflow manually

The task workflow is intended for generated agent instructions. This optional flow verifies it directly with a focused task:

```sh
npx gleip preflight "Fix the checkout discount calculation bug without changing payment provider integration or checkout routing."
npx gleip preflight --file task.md
npx gleip preflight --amend "Also preserve Windows behavior."
npx gleip brief
npx gleip validate-plan "Update the discount calculation and its focused checkout tests."
npx gleip validate-plan --file plan.md
npx gleip status
npx gleip status --compact
npx gleip report
npx gleip report --json
npx gleip check
npx gleip check --incremental --json
npx gleip check --incremental --force --json
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
