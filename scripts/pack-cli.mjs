import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const runtimePackages = ["config", "planner", "core", "controller"];
const destination = resolve("dist-pack");
const cliStaging = join(destination, ".gleip-cli-pack");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });

for (const packageName of runtimePackages) {
  execSync(`${pnpmCommand} pack --pack-destination "${destination}"`, {
    cwd: resolve("packages", packageName),
    stdio: "inherit"
  });
}

stageCliPackage();

execSync(`${npmCommand} pack --pack-destination "${destination}"`, {
  cwd: cliStaging,
  stdio: "inherit"
});

rmSync(cliStaging, { recursive: true, force: true });

console.log(`Packed CLI and runtime packages into ${destination}`);

function stageCliPackage() {
  const cliPackageDir = resolve("packages", "cli");

  mkdirSync(cliStaging, { recursive: true });
  cpSync(join(cliPackageDir, "dist"), join(cliStaging, "dist"), { recursive: true });
  cpSync(join(cliPackageDir, "README.md"), join(cliStaging, "README.md"));
  writePackageJson(
    join(cliStaging, "package.json"),
    rewriteWorkspaceDependencies(readPackageJson(join(cliPackageDir, "package.json")))
  );

  for (const packageName of runtimePackages) {
    stageBundledPackage(packageName);
  }
}

function stageBundledPackage(packageName) {
  const packageDir = resolve("packages", packageName);
  const packageJson = readPackageJson(join(packageDir, "package.json"));
  const packageDestination = join(cliStaging, "node_modules", ...packageJson.name.split("/"));

  mkdirSync(packageDestination, { recursive: true });
  cpSync(join(packageDir, "dist"), join(packageDestination, "dist"), { recursive: true });
  cpSync(join(packageDir, "README.md"), join(packageDestination, "README.md"));
  writePackageJson(
    join(packageDestination, "package.json"),
    rewriteWorkspaceDependencies(packageJson)
  );

  if (packageName === "config") {
    stageConfigRuntimeDependencies(packageDestination);
  }
}

function stageConfigRuntimeDependencies(packageDestination) {
  for (const dependencyName of ["yaml", "zod"]) {
    cpSync(
      resolve("packages", "config", "node_modules", dependencyName),
      join(packageDestination, "node_modules", dependencyName),
      { dereference: true, recursive: true }
    );
  }
}

function readPackageJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writePackageJson(path, packageJson) {
  writeFileSync(path, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function rewriteWorkspaceDependencies(packageJson) {
  return {
    ...packageJson,
    dependencies: rewriteDependencyBlock(packageJson.dependencies)
  };
}

function rewriteDependencyBlock(dependencies) {
  if (dependencies === undefined) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => [
      name,
      typeof range === "string" && range.startsWith("workspace:")
        ? range.slice("workspace:".length)
        : range
    ])
  );
}
