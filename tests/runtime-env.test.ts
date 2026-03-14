import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareRuntimeEnv } from "../src/config/runtime-env";

class MemoryStore {
  private readonly values = new Map<string, string>();

  get(account: string) {
    return this.values.get(account);
  }

  set(account: string, value: string) {
    this.values.set(account, value);
  }
}

class FakePrompt {
  readonly prompts: string[] = [];
  readonly messages: string[] = [];

  constructor(private readonly answers: string[]) {}

  async ask(prompt: string) {
    this.prompts.push(prompt);
    const value = this.answers.shift();
    if (value === undefined) {
      throw new Error(`Unexpected prompt: ${prompt}`);
    }
    return value;
  }

  write(message: string) {
    this.messages.push(message);
  }
}

describe("prepareRuntimeEnv", () => {
  test("loads credentials from keychain and creates a db key when needed", async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "tgc-runtime-"));
    const processEnv: NodeJS.ProcessEnv = {};
    const store = new MemoryStore();
    store.set("telegram-api-id", "12345");
    store.set("telegram-api-hash", "stored-hash");

    try {
      const result = await prepareRuntimeEnv(cwd, "prod", {
        processEnv,
        secretStore: store,
      });

      expect(result.apiCredentialsSource).toBe("keychain");
      expect(result.dbEncryptionKeySource).toBe("generated");
      expect(processEnv.TELEGRAM_APP_API_ID).toBe("12345");
      expect(processEnv.TELEGRAM_APP_API_HASH).toBe("stored-hash");
      expect(processEnv.TDLIB_DATABASE_ENCRYPTION_KEY).toBeTruthy();
      expect(store.get("tdlib-database-encryption-key")).toBeTruthy();
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });

  test("prompts once and stores fresh credentials", async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "tgc-runtime-"));
    const processEnv: NodeJS.ProcessEnv = {};
    const store = new MemoryStore();
    const prompt = new FakePrompt(["98765", "prompted-hash"]);

    try {
      const result = await prepareRuntimeEnv(cwd, "prod", {
        processEnv,
        prompt,
        secretStore: store,
      });

      expect(result.apiCredentialsSource).toBe("prompt");
      expect(prompt.prompts).toEqual(["Telegram API ID: ", "Telegram API hash: "]);
      expect(prompt.messages[0]).toContain("my.telegram.org/apps");
      expect(store.get("telegram-api-id")).toBe("98765");
      expect(store.get("telegram-api-hash")).toBe("prompted-hash");
      expect(store.get("tdlib-database-encryption-key")).toBeTruthy();
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });

  test("replaces malformed stored db keys with a valid base64 key", async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "tgc-runtime-"));
    const processEnv: NodeJS.ProcessEnv = {
      TELEGRAM_APP_API_ID: "12345",
      TELEGRAM_APP_API_HASH: "env-hash",
    };
    const store = new MemoryStore();
    store.set("tdlib-database-encryption-key", "not-base64url-_");

    try {
      const result = await prepareRuntimeEnv(cwd, "prod", {
        processEnv,
        secretStore: store,
      });

      expect(result.dbEncryptionKeySource).toBe("generated");
      expect(processEnv.TDLIB_DATABASE_ENCRYPTION_KEY).toMatch(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      );
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  });
});
