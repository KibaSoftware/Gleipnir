# Local Package Testing

Use these flows before publishing anything. They verify the built CLI can run outside the source TypeScript entrypoint. For the full local-only preview release pass, see [docs/release-checklist.md](release-checklist.md).

## Flow A: npm pack

From the Gleip repository:

```sh
pnpm install
pnpm build
pnpm pack:cli
```

This writes tarballs for the CLI and its runtime workspace packages to `dist-pack/`.

The public preview install target is:

```sh
npm install -D gleip
npx gleip init
```

Create a temporary repository and install the generated tarballs:

```sh
mkdir %TEMP%\gleip-pack-test
cd %TEMP%\gleip-pack-test
git init
npm init -y
npm install <path-to-repo>\dist-pack\gleip-config-0.1.0.tgz <path-to-repo>\dist-pack\gleip-planner-0.1.0.tgz <path-to-repo>\dist-pack\gleip-core-0.1.0.tgz <path-to-repo>\dist-pack\gleip-controller-0.1.0.tgz <path-to-repo>\dist-pack\gleip-0.1.0.tgz
```

On macOS or Linux, use a temp directory such as `/tmp/gleip-pack-test` and the matching tarball path.

Create a small repo shape:

```sh
mkdir src\features\users src\utils
echo export function UserTable() { return null; } > src\features\users\UserTable.tsx
echo describe('UserTable', () => {}); > src\features\users\UserTable.test.tsx
echo export function toCsv() { return ''; } > src\utils\csv.ts
```

Create `plan.md`:

```md
- Modify src/features/users/UserTable.tsx
- Reuse src/utils/csv.ts
- Add tests in src/features/users/UserTable.test.tsx
```

Run the packaged CLI:

```sh
npx gleip --help
npx gleip init
npx gleip state
npx gleip preflight "Add CSV export to users table"
npx gleip brief
npx gleip validate-plan "Modify UserTable, reuse csv utility, add tests"
npx gleip validate-plan --file plan.md
npx gleip status
npx gleip check
```

Expected result: help prints, Gleip files are created, plan validation is `approved`, and status runs without importing from the Gleip source tree.

## Flow B: Built CLI Smoke Script

From the Gleip repository:

```sh
pnpm build
pnpm smoke:cli
```

The script creates a temporary git repo, runs `node packages/cli/dist/index.js`, executes `init`, `preflight`, `validate-plan`, and `status`, and checks that expected Gleip files exist.

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
