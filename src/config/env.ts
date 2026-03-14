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
  appTitle: string;
  appShortName: string;
  dc?: string;
  dcId?: number;
  publicKeyPath: string;
  publicKeyPem?: string;
  useTestDc: boolean;
  tdjsonPath?: string;
  state: ReturnType<typeof getStatePaths>;
}

function getScopedEnvFiles(cwd: string, envName: AppEnv) {
  if (envName === "dev") {
    return [path.join(cwd, ".env.dev"), path.join(cwd, ".env.test")];
  }
  return [path.join(cwd, `.env.${envName}`)];
}

function getDefaultPublicKeyPath(cwd: string, envName: AppEnv) {
  const candidate = path.join(cwd, "config", "telegram", `${envName}.public.pem`);
  if (existsSync(candidate)) {
    return candidate;
  }
  if (envName === "dev") {
    return path.join(cwd, "config", "telegram", "test.public.pem");
  }
  return candidate;
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
  envName?: AppEnv,
  processEnv: NodeJS.ProcessEnv = process.env,
) {
  const filePaths = [path.join(cwd, ".env")];
  if (envName) {
    filePaths.push(...getScopedEnvFiles(cwd, envName));
  }

  for (const filePath of filePaths) {
    const parsed = parseEnvFile(filePath);
    for (const [key, value] of Object.entries(parsed)) {
      if (processEnv[key] === undefined) {
        processEnv[key] = value;
      }
    }
  }
}

export function resolveAppConfig(
  cwd: string,
  envName: AppEnv,
  processEnv: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const baseEnv = parseEnvFile(path.join(cwd, ".env"));
  const scopedEnv = Object.assign(
    {},
    ...getScopedEnvFiles(cwd, envName).map((filePath) => parseEnvFile(filePath)),
  );
  const merged = {
    ...baseEnv,
    ...scopedEnv,
    ...Object.fromEntries(
      Object.entries(processEnv).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  };

  const apiIdRaw = merged.TELEGRAM_APP_API_ID;
  const apiHash = merged.TELEGRAM_APP_API_HASH;
  if (!apiIdRaw || !apiHash) {
    throw new CliError("Missing TELEGRAM_APP_API_ID or TELEGRAM_APP_API_HASH in .env");
  }

  const apiId = Number.parseInt(apiIdRaw, 10);
  if (!Number.isInteger(apiId) || apiId <= 0) {
    throw new CliError("TELEGRAM_APP_API_ID must be a positive integer");
  }

  const dcIdRaw = merged.TELEGRAM_APP_DC_ID;
  let dcId: number | undefined;
  if (dcIdRaw) {
    const parsedDcId = Number.parseInt(dcIdRaw, 10);
    if (!Number.isInteger(parsedDcId) || parsedDcId <= 0) {
      throw new CliError("TELEGRAM_APP_DC_ID must be a positive integer");
    }
    dcId = parsedDcId;
  }

  const defaultKeyPath = getDefaultPublicKeyPath(cwd, envName);
  const configuredKeyPath = merged.TELEGRAM_APP_PUBLIC_KEY_PATH
    ? path.resolve(cwd, merged.TELEGRAM_APP_PUBLIC_KEY_PATH)
    : defaultKeyPath;

  return {
    cwd,
    envName,
    apiId,
    apiHash,
    appTitle: merged.TELEGRAM_APP_TITLE ?? "Telegram CLI",
    appShortName: merged.TELEGRAM_APP_SHORT_NAME ?? "telegram-cli",
    dc: merged.TELEGRAM_APP_DC,
    dcId,
    publicKeyPath: configuredKeyPath,
    publicKeyPem: existsSync(configuredKeyPath)
      ? readFileSync(configuredKeyPath, "utf8")
      : undefined,
    useTestDc: envName !== "prod",
    tdjsonPath: merged.TDLIB_JSON_PATH,
    state: getStatePaths(envName),
  };
}
