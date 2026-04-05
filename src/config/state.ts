import { existsSync, mkdirSync, renameSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CliError } from "../errors";

function getHomeDirectory() {
  return process.env.HOME || os.homedir();
}

function getTrashDir() {
  return path.join(getHomeDirectory(), ".Trash");
}

function getTrashDestination(target: string) {
  const trashDir = getTrashDir();
  const targetName = path.basename(target);
  let nextPath = path.join(trashDir, targetName);

  if (!existsSync(nextPath)) {
    return nextPath;
  }

  for (let index = 1; ; index += 1) {
    nextPath = path.join(trashDir, `${targetName} ${index}`);
    if (!existsSync(nextPath)) {
      return nextPath;
    }
  }
}

export function getStatePaths(envName: string) {
  const baseDir = path.join(getHomeDirectory(), "Library", "Application Support", "telec", envName);
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

  mkdirSync(getTrashDir(), { recursive: true });

  try {
    for (const target of targets) {
      renameSync(target, getTrashDestination(target));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to move TDLib state to Trash";
    throw new CliError(message);
  }

  return state;
}
