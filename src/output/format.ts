import { CliError } from "../errors";
import type { OutputMode } from "../config/env";
import { isRenderableResult } from "./result";

export function printOutput(mode: OutputMode, payload: unknown) {
  if (isRenderableResult(payload)) {
    if (mode === "json") {
      console.log(JSON.stringify(payload.toFull(), null, 2));
      return;
    }
    console.log(payload.toCompact());
    return;
  }

  if (mode === "json") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (typeof payload === "string") {
    console.log(payload);
    return;
  }

  throw new CliError("Unsupported compact output payload");
}
