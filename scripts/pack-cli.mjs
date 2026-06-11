import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const destination = resolve("dist-pack");
const cliEntrypoint = resolve("packages", "cli", "dist", "index.js");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

if (!existsSync(cliEntrypoint)) {
  throw new Error("Built CLI entrypoint is missing. Run `pnpm build` before packing.");
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });

execFileSync(npmCommand, ["pack", "--pack-destination", destination], {
  cwd: resolve("."),
  stdio: "inherit"
});

console.log(`Packed the root Gleip package into ${destination}`);
