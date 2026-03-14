import { resolveAppConfig, type AppEnv } from "./config/env";
import { CliError } from "./errors";
import { DoctorResult, type DoctorCheck } from "./output/app-results";
import { discoverTdjsonPath } from "./tdlib/ffi";
import { FfiTdTransport } from "./tdlib/transport";
import { TdlibClient } from "./tdlib/client";

function summarize(checks: DoctorCheck[]) {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }
  return "pass";
}

function redactedHashPreview(value: string) {
  if (value.length <= 8) {
    return "*".repeat(value.length);
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export async function runDoctor(cwd: string, envName: AppEnv) {
  const checks: DoctorCheck[] = [];
  let config;

  try {
    config = resolveAppConfig(cwd, envName);
    checks.push({
      name: "env",
      status: "pass",
      message: `Resolved runtime configuration for ${envName}`,
    });
    checks.push({
      name: "api_id",
      status: "pass",
      message: `TELEGRAM_APP_API_ID=${config.apiId}`,
    });
    checks.push({
      name: "api_hash",
      status: "pass",
      message: `TELEGRAM_APP_API_HASH present (${redactedHashPreview(config.apiHash)})`,
    });
  } catch (error) {
    const message =
      error instanceof CliError ? error.message : "Failed to load environment configuration";
    return new DoctorResult({
      env: envName,
      status: "fail",
      checks: [
        {
          name: "env",
          status: "fail",
          message,
        },
      ],
    });
  }

  checks.push({
    name: "state_dir",
    status: "pass",
    message: `State directory ${config.state.baseDir}`,
  });

  let tdjsonPath: string | null = null;
  try {
    tdjsonPath = discoverTdjsonPath(config.tdjsonPath);
    checks.push({
      name: "tdjson",
      status: "pass",
      message: `Using ${tdjsonPath}`,
    });
  } catch (error) {
    const message = error instanceof CliError ? error.message : "Unable to locate libtdjson";
    checks.push({
      name: "tdjson",
      status: "fail",
      message,
    });
  }

  if (tdjsonPath) {
    const transport = new FfiTdTransport(tdjsonPath);
    const client = new TdlibClient(config, transport);
    try {
      await client.ensureReady("status");
      const auth = client.getAuthorizationStatus();
      checks.push({
        name: "tdlib_status",
        status: auth.ready ? "pass" : "warn",
        message: auth.ready
          ? `Authorized (${auth.state})`
          : `TDLib reachable, current auth state: ${auth.state}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown TDLib startup error";
      checks.push({
        name: "tdlib_status",
        status: "fail",
        message,
      });
      if (message.includes("Valid api_id must be provided")) {
        checks.push({
          name: "api_credentials",
          status: "fail",
          message:
            "Telegram rejected TELEGRAM_APP_API_ID/TELEGRAM_APP_API_HASH. Recopy them from my.telegram.org.",
        });
      }
    } finally {
      await client.close();
    }
  }

  return new DoctorResult({
    env: envName,
    status: summarize(checks),
    checks,
  });
}
