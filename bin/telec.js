#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_BINARIES = {
  "darwin:arm64": "telec-darwin-arm64",
  "linux:x64": "telec-linux-x64",
};

function getDistDir() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDir, "..", "dist");
}

function getBinaryName() {
  return TARGET_BINARIES[`${process.platform}:${process.arch}`];
}

function getBinaryPath() {
  const binaryName = getBinaryName();
  if (!binaryName) {
    return undefined;
  }

  const distDir = getDistDir();
  const preferred = path.join(distDir, binaryName);
  if (existsSync(preferred)) {
    return preferred;
  }

  const fallback = path.join(distDir, "telec");
  if (existsSync(fallback)) {
    return fallback;
  }

  return undefined;
}

function printUnsupportedPlatform() {
  const supported = Object.keys(TARGET_BINARIES)
    .map((target) => target.replace(":", "/"))
    .join(", ");
  console.error(
    `telec does not ship a binary for ${process.platform}/${process.arch}. Supported targets: ${supported}.`,
  );
  console.error("Use a GitHub release asset or Homebrew if you need a different platform.");
}

const binaryPath = getBinaryPath();

if (!binaryPath) {
  printUnsupportedPlatform();
  process.exit(1);
}

const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
