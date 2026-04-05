import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getStatePaths, trashStatePaths } from "../src/config/state";

const originalHome = process.env.HOME;
const tempHomes: string[] = [];

afterEach(() => {
  process.env.HOME = originalHome;

  for (const homeDir of tempHomes.splice(0)) {
    rmSync(homeDir, { force: true, recursive: true });
  }
});

describe("trashStatePaths", () => {
  test("moves the TDLib state into the user's Trash without an external command", () => {
    const homeDir = path.join(
      os.tmpdir(),
      `telec-home-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    tempHomes.push(homeDir);
    process.env.HOME = homeDir;

    const state = getStatePaths("test");
    writeFileSync(path.join(state.databaseDir, "db.txt"), "db");
    writeFileSync(path.join(state.filesDir, "file.txt"), "file");

    const trashDir = path.join(homeDir, ".Trash");
    mkdirSync(trashDir, { recursive: true });
    const before = new Set(readdirSync(trashDir));

    trashStatePaths("test");

    expect(existsSync(state.databaseDir)).toBe(false);
    expect(existsSync(state.filesDir)).toBe(false);

    const moved = readdirSync(trashDir).filter((entry) => !before.has(entry));
    expect(moved.length).toBe(2);
    expect(moved.some((entry) => entry.startsWith("tdlib-db"))).toBe(true);
    expect(moved.some((entry) => entry.startsWith("tdlib-files"))).toBe(true);
  });
});
