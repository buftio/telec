import { randomBytes } from "node:crypto";
import { loadEnvIntoProcess, type AppEnv } from "./env";
import { getKeychainServiceName, KeychainSecretStore, type SecretStore } from "./keychain";
import { CliError } from "../errors";

const API_ID_ACCOUNT = "telegram-api-id";
const API_HASH_ACCOUNT = "telegram-api-hash";
const DB_KEY_ACCOUNT = "tdlib-database-encryption-key";

type SecretSource = "env" | "keychain" | "prompt" | "generated";

export interface RuntimePrompt {
  ask(prompt: string, options?: { sensitive?: boolean }): Promise<string>;
  write?(message: string): void;
}

export interface PreparedRuntimeEnv {
  apiCredentialsSource: Exclude<SecretSource, "generated">;
  dbEncryptionKeySource: Extract<SecretSource, "env" | "keychain" | "generated">;
}

export interface PrepareRuntimeEnvOptions {
  prompt?: RuntimePrompt;
  processEnv?: NodeJS.ProcessEnv;
  secretStore?: SecretStore;
}

function writePromptMessage(prompt: RuntimePrompt | undefined, message: string) {
  if (prompt?.write) {
    prompt.write(message);
    return;
  }
  console.error(message);
}

function getNonEmpty(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isBase64BytesString(value: string) {
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function buildMissingCredentialMessage() {
  return [
    "Missing Telegram app credentials.",
    "Create your own app at https://my.telegram.org/apps, then rerun telec in an interactive terminal to save them in Keychain.",
  ].join(" ");
}

async function promptForApiCredentials(prompt: RuntimePrompt) {
  writePromptMessage(
    prompt,
    [
      "Telegram app credentials are required once per machine.",
      "Open https://my.telegram.org/apps, create an application, then paste the API ID and API hash below.",
      "They will be stored in your macOS Keychain.",
    ].join("\n"),
  );

  const apiIdRaw = (await prompt.ask("Telegram API ID: ")).trim();
  const apiId = Number.parseInt(apiIdRaw, 10);
  if (!Number.isInteger(apiId) || apiId <= 0) {
    throw new CliError("TELEGRAM_APP_API_ID must be a positive integer");
  }

  const apiHash = (await prompt.ask("Telegram API hash: ", { sensitive: true })).trim();
  if (!apiHash) {
    throw new CliError("TELEGRAM_APP_API_HASH is required");
  }

  return {
    apiId: String(apiId),
    apiHash,
  };
}

function resolveStoredApiCredentials(store: SecretStore) {
  const apiId = getNonEmpty(store.get(API_ID_ACCOUNT));
  const apiHash = getNonEmpty(store.get(API_HASH_ACCOUNT));
  if (!apiId || !apiHash) {
    return null;
  }
  return {
    apiId,
    apiHash,
  };
}

function resolveDatabaseEncryptionKey(processEnv: NodeJS.ProcessEnv, store: SecretStore) {
  const fromEnv = getNonEmpty(processEnv.TDLIB_DATABASE_ENCRYPTION_KEY);
  if (fromEnv) {
    if (!isBase64BytesString(fromEnv)) {
      throw new CliError("TDLIB_DATABASE_ENCRYPTION_KEY must be a base64-encoded string");
    }
    return {
      value: fromEnv,
      source: "env" as const,
    };
  }

  const fromKeychain = getNonEmpty(store.get(DB_KEY_ACCOUNT));
  if (fromKeychain && isBase64BytesString(fromKeychain)) {
    return {
      value: fromKeychain,
      source: "keychain" as const,
    };
  }

  const generated = randomBytes(32).toString("base64");
  store.set(DB_KEY_ACCOUNT, generated);
  return {
    value: generated,
    source: "generated" as const,
  };
}

export async function prepareRuntimeEnv(
  cwd: string,
  envName: AppEnv,
  options: PrepareRuntimeEnvOptions = {},
): Promise<PreparedRuntimeEnv> {
  const processEnv = options.processEnv ?? process.env;
  loadEnvIntoProcess(cwd, envName, processEnv);

  const store = options.secretStore ?? new KeychainSecretStore(getKeychainServiceName(envName));

  let apiCredentialsSource: PreparedRuntimeEnv["apiCredentialsSource"] = "env";
  const envApiId = getNonEmpty(processEnv.TELEGRAM_APP_API_ID);
  const envApiHash = getNonEmpty(processEnv.TELEGRAM_APP_API_HASH);

  if (envApiId && envApiHash) {
    processEnv.TELEGRAM_APP_API_ID = envApiId;
    processEnv.TELEGRAM_APP_API_HASH = envApiHash;
  } else {
    const stored = resolveStoredApiCredentials(store);
    if (stored) {
      processEnv.TELEGRAM_APP_API_ID = stored.apiId;
      processEnv.TELEGRAM_APP_API_HASH = stored.apiHash;
      apiCredentialsSource = "keychain";
    } else {
      if (!options.prompt) {
        throw new CliError(buildMissingCredentialMessage());
      }

      const prompted = await promptForApiCredentials(options.prompt);
      store.set(API_ID_ACCOUNT, prompted.apiId);
      store.set(API_HASH_ACCOUNT, prompted.apiHash);
      processEnv.TELEGRAM_APP_API_ID = prompted.apiId;
      processEnv.TELEGRAM_APP_API_HASH = prompted.apiHash;
      apiCredentialsSource = "prompt";
    }
  }

  const dbKey = resolveDatabaseEncryptionKey(processEnv, store);
  processEnv.TDLIB_DATABASE_ENCRYPTION_KEY = dbKey.value;

  return {
    apiCredentialsSource,
    dbEncryptionKeySource: dbKey.source,
  };
}
