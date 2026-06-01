import { rmSync } from "node:fs";
import { join } from "node:path";

const packageDirs = ["adapters", "cli", "config", "controller", "core", "github-action", "planner"];

for (const packageDir of packageDirs) {
  rmSync(join("packages", packageDir, "dist"), { recursive: true, force: true });
}
