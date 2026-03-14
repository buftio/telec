import { spawnSync } from "node:child_process";
import { CliError } from "../errors";
import type { AppEnv } from "./env";

export interface SecretStore {
  get(account: string): string | undefined;
  set(account: string, value: string): void;
}

function trimTrailingNewline(value: string) {
  return value.replace(/\r?\n$/, "");
}

export function getKeychainServiceName(envName: AppEnv) {
  return `telec.${envName}`;
}

export class KeychainSecretStore implements SecretStore {
  constructor(private readonly serviceName: string) {}

  get(account: string) {
    const result = this.runSecurity([
      "find-generic-password",
      "-s",
      this.serviceName,
      "-a",
      account,
      "-w",
    ]);

    if (result.status === 0) {
      return trimTrailingNewline(result.stdout);
    }

    const stderr = result.stderr.trim();
    if (stderr.includes("could not be found")) {
      return undefined;
    }

    throw new CliError(
      stderr
        ? `Failed to read ${account} from Keychain: ${stderr}`
        : `Failed to read ${account} from Keychain`,
    );
  }

  set(account: string, value: string) {
    const result = this.runSecurity([
      "add-generic-password",
      "-U",
      "-s",
      this.serviceName,
      "-a",
      account,
      "-w",
      value,
    ]);

    if (result.status === 0) {
      return;
    }

    const stderr = result.stderr.trim();
    throw new CliError(
      stderr
        ? `Failed to save ${account} to Keychain: ${stderr}`
        : `Failed to save ${account} to Keychain`,
    );
  }

  private runSecurity(args: string[]) {
    return spawnSync("security", args, {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
  }
}
