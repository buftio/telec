import { mkdirSync } from "node:fs";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CliError } from "../errors";

export function getStatePaths(envName: string) {
  const baseDir = path.join(os.homedir(), "Library", "Application Support", "tgc", envName);
  const databaseDir = path.join(baseDir, "tdlib-db");
  const filesDir = path.join(baseDir, "tdlib-files");

  mkdirSync(databaseDir, { recursive: true });
  mkdirSync(filesDir, { recursive: true });

  return {
    baseDir,
    databaseDir,
    filesDir,
  };
}

export function trashStatePaths(envName: string) {
  const state = getStatePaths(envName);
  const targets = [state.databaseDir, state.filesDir].filter((target) => existsSync(target));
  if (targets.length === 0) {
    return state;
  }

  const result = spawnSync("trash", targets, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new CliError(result.stderr.trim() || "Failed to move TDLib state to Trash");
  }

  return state;
}
