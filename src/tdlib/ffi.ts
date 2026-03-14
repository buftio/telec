import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { FFIType, dlopen, suffix } from "bun:ffi";
import { CliError } from "../errors";

export function discoverTdjsonPath(explicitPath?: string): string {
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const libraryName = `libtdjson.${suffix}`;
  const candidates = [
    process.env.TDLIB_JSON_PATH,
    process.env.TDLIB_PATH ? path.join(process.env.TDLIB_PATH, libraryName) : undefined,
    path.join(process.cwd(), ".vendor", "td-install", "lib", libraryName),
    `/opt/homebrew/opt/tdlib/lib/${libraryName}`,
    `/usr/local/opt/tdlib/lib/${libraryName}`,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const prefix = execSync("brew --prefix tdlib", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    const brewed = path.join(prefix, "lib", libraryName);
    if (existsSync(brewed)) {
      return brewed;
    }
  } catch {
    // Ignore and fall through to the actionable error below.
  }

  throw new CliError(
    "Unable to find libtdjson. Install TDLib with `brew install tdlib` or set TDLIB_JSON_PATH.",
  );
}

export function loadTdjsonLibrary(explicitPath?: string) {
  const libraryPath = discoverTdjsonPath(explicitPath);
  const lib = dlopen(libraryPath, {
    td_json_client_create: {
      args: [],
      returns: FFIType.ptr,
    },
    td_json_client_send: {
      args: [FFIType.ptr, FFIType.cstring],
      returns: FFIType.void,
    },
    td_json_client_receive: {
      args: [FFIType.ptr, FFIType.f64],
      returns: FFIType.ptr,
    },
    td_json_client_execute: {
      args: [FFIType.ptr, FFIType.cstring],
      returns: FFIType.ptr,
    },
    td_json_client_destroy: {
      args: [FFIType.ptr],
      returns: FFIType.void,
    },
    td_set_log_verbosity_level: {
      args: [FFIType.i32],
      returns: FFIType.void,
    },
  });

  return {
    libraryPath,
    lib,
  };
}
