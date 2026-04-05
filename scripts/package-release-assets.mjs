import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TARGETS = {
  "darwin-arm64": {
    binary: "dist/telec-darwin-arm64",
  },
  "linux-x64": {
    binary: "dist/telec-linux-x64",
  },
};

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const version = packageJson.version;
const tagName = `v${version}`;
const releaseDir = path.join(repoRoot, ".local", "releases", tagName);

mkdirSync(releaseDir, { recursive: true });

const checksums = {
  version,
  tagName,
  targets: {},
};

const checksumLines = [];

for (const [targetName, target] of Object.entries(TARGETS)) {
  const binaryPath = path.join(repoRoot, target.binary);
  if (!existsSync(binaryPath)) {
    console.error(`Missing release binary: ${target.binary}`);
    process.exit(1);
  }

  const stageDir = path.join(releaseDir, targetName);
  mkdirSync(stageDir, { recursive: true });

  const stagedBinaryPath = path.join(stageDir, "telec");
  copyFileSync(binaryPath, stagedBinaryPath);

  const archiveName = `telec-${tagName}-${targetName}.tar.gz`;
  const archivePath = path.join(releaseDir, archiveName);
  const tarResult = spawnSync("tar", ["-C", stageDir, "-czf", archivePath, "telec"], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if ((tarResult.status ?? 1) !== 0) {
    process.exit(tarResult.status ?? 1);
  }

  const digest = sha256(archivePath);
  checksumLines.push(`${digest}  ${archiveName}`);
  checksums.targets[targetName] = {
    archiveName,
    archivePath,
    sha256: digest,
  };
}

writeFileSync(path.join(releaseDir, "checksums.txt"), `${checksumLines.join("\n")}\n`);
writeFileSync(path.join(releaseDir, "checksums.json"), `${JSON.stringify(checksums, null, 2)}\n`);
