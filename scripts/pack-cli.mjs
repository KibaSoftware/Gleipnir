import { execSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const packages = ["config", "planner", "core", "controller", "cli"];
const destination = resolve("dist-pack");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });

for (const packageName of packages) {
  execSync(`${pnpmCommand} pack --pack-destination "${destination}"`, {
    cwd: resolve("packages", packageName),
    stdio: "inherit"
  });
}

console.log(`Packed CLI and runtime packages into ${destination}`);
