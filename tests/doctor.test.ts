import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDoctor } from "../src/doctor";

describe("runDoctor", () => {
  test("reports invalid credentials clearly", async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "telec-doctor-"));
    writeFileSync(
      path.join(cwd, ".env"),
      [
        "TELEGRAM_APP_API_ID=12345",
        "TELEGRAM_APP_API_HASH=test-hash",
        "TDLIB_DATABASE_ENCRYPTION_KEY=test-db-key",
        "TDLIB_JSON_PATH=/definitely/missing/libtdjson.dylib",
      ].join("\n"),
    );

    try {
      const result = await runDoctor(cwd, "test");
      const full = result.toFull();
      expect(Array.isArray(full.checks)).toBe(true);
      expect(full.checks.some((check) => check.name === "tdjson")).toBe(true);
      expect(full.checks.some((check) => check.status === "fail")).toBe(true);
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });
});
