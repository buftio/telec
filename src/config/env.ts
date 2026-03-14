import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CliError } from "../errors";
import { getStatePaths } from "./state";

export type AppEnv = "dev" | "test" | "prod";
export type OutputMode = "json" | "compact";

type EnvMap = Record<string, string>;

export interface AppConfig {
  cwd: string;
  envName: AppEnv;
  apiId: number;
  apiHash: string;
  dbEncryptionKey: string;
  appTitle: string;
  appShortName: string;
  useTestDc: boolean;
  tdjsonPath?: string;
  state: ReturnType<typeof getStatePaths>;
}

export function parseEnvFile(filePath: string): EnvMap {
  if (!existsSync(filePath)) {
    return {};
  }

  const env: EnvMap = {};
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value.replace(/\\n/g, "\n");
  }

  return env;
}

export function loadEnvIntoProcess(
  cwd: string,
  _envName?: AppEnv,
  processEnv: NodeJS.ProcessEnv = process.env,
) {
  const parsed = parseEnvFile(path.join(cwd, ".env"));
  for (const [key, value] of Object.entries(parsed)) {
    if (processEnv[key] === undefined) {
      processEnv[key] = value;
    }
  }
}

export function resolveAppConfig(
  cwd: string,
  envName: AppEnv,
  processEnv: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const merged = {
    ...parseEnvFile(path.join(cwd, ".env")),
    ...Object.fromEntries(
      Object.entries(processEnv).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  };

  const apiIdRaw = merged.TELEGRAM_APP_API_ID;
  const apiHash = merged.TELEGRAM_APP_API_HASH;
  if (!apiIdRaw || !apiHash) {
    throw new CliError(
      "Missing TELEGRAM_APP_API_ID or TELEGRAM_APP_API_HASH. Run telec in an interactive terminal to save them in Keychain.",
    );
  }

  const apiId = Number.parseInt(apiIdRaw, 10);
  if (!Number.isInteger(apiId) || apiId <= 0) {
    throw new CliError("TELEGRAM_APP_API_ID must be a positive integer");
  }

  const dbEncryptionKey = merged.TDLIB_DATABASE_ENCRYPTION_KEY;
  if (!dbEncryptionKey) {
    throw new CliError(
      "Missing TDLIB_DATABASE_ENCRYPTION_KEY. Run telec in an interactive terminal to create one.",
    );
  }

  return {
    cwd,
    envName,
    apiId,
    apiHash,
    dbEncryptionKey,
    appTitle: "Telegram CLI",
    appShortName: "telec",
    useTestDc: envName !== "prod",
    tdjsonPath: merged.TDLIB_JSON_PATH,
    state: getStatePaths(envName),
  };
}
