# Local Package Testing

Use these flows before publishing anything. They verify the built CLI can run outside the source TypeScript entrypoint. For the full local-only preview release pass, see [docs/release-checklist.md](release-checklist.md).

Current release target: `0.2.0`.

## Flow A: npm pack

From the Gleip repository:

```sh
pnpm install
pnpm build
pnpm pack:cli
```

This writes tarballs for the CLI and its runtime workspace packages to `dist-pack/`.
The CLI tarball bundles the internal runtime packages so it can be installed by itself.

The public preview install target is:

```sh
npm install -D gleip
npx gleip init --all-agents
```

Create a temporary repository and install the generated tarballs:

```sh
mkdir %TEMP%\gleip-pack-test
cd %TEMP%\gleip-pack-test
git init
npm init -y
npm install -D <path-to-repo>\dist-pack\gleip-0.2.0.tgz
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
npx gleip --version
npx gleip init --all-agents
npx gleip doctor --agents
npx gleip repair-agents --all
npx gleip state
npx gleip preflight "Add CSV export to users table"
npx gleip brief
npx gleip validate-plan "Modify UserTable, reuse csv utility, add tests"
npx gleip validate-plan --file plan.md
npx gleip status
npx gleip check
```

Expected result: help prints, Gleip files and agent instructions are created, plan validation is `approved`, and status runs without importing from the Gleip source tree.

## Flow B: Built CLI Smoke Script

From the Gleip repository:

```sh
pnpm build
pnpm smoke:cli
```

The script creates a temporary git repo, runs `node packages/cli/dist/index.js`, executes `init --all-agents`, `preflight`, `validate-plan`, and `status`, and checks that expected Gleip files exist.

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
gleip init --all-agents
```

Use `pnpm unlink --global gleip` when finished.
