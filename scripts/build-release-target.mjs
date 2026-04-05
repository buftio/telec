import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TARGETS = {
  "darwin-arm64": {
    bunTarget: "bun-darwin-arm64",
    output: "dist/telec-darwin-arm64",
  },
  "linux-x64": {
    bunTarget: "bun-linux-x64",
    output: "dist/telec-linux-x64",
  },
};

const targetName = process.argv[2];
const target = TARGETS[targetName];

if (!target) {
  console.error(`Unknown release target: ${targetName}`);
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
mkdirSync(path.join(repoRoot, "dist"), { recursive: true });

const result = spawnSync(
  "bun",
  [
    "build",
    "./src/cli.ts",
    "--compile",
    `--target=${target.bunTarget}`,
    "--minify",
    `--outfile=${target.output}`,
  ],
  {
    cwd: repoRoot,
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
