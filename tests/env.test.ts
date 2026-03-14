import { describe, expect, test } from "bun:test";
import { loadEnvIntoProcess } from "../src/config/env";

describe("loadEnvIntoProcess", () => {
  test("loads .env values into process env without overwriting existing values", () => {
    const fakeEnv: NodeJS.ProcessEnv = {
      TELEGRAM_APP_API_HASH: "keep-me",
    };

    loadEnvIntoProcess(process.cwd(), "dev", fakeEnv);

    expect(fakeEnv.TELEGRAM_APP_API_ID).toBe("37921488");
    expect(fakeEnv.TELEGRAM_APP_API_HASH).toBe("keep-me");
    expect(fakeEnv.TELEGRAM_APP_DC_ID).toBe("2");
  });
});
