import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvIntoProcess } from "../src/config/env";

describe("loadEnvIntoProcess", () => {
  test("loads .env values into process env without overwriting existing values", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "telec-env-"));
    const fakeEnv: NodeJS.ProcessEnv = {
      TELEGRAM_APP_API_HASH: "keep-me",
    };

    writeFileSync(
      path.join(cwd, ".env"),
      ["TELEGRAM_APP_API_ID=37921488", "TELEGRAM_APP_API_HASH=from-dotenv"].join("\n"),
    );

    try {
      loadEnvIntoProcess(cwd, "dev", fakeEnv);

      expect(fakeEnv.TELEGRAM_APP_API_ID).toBe("37921488");
      expect(fakeEnv.TELEGRAM_APP_API_HASH).toBe("keep-me");
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });
});
