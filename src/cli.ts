#!/usr/bin/env bun

import { CommanderError } from "commander";
import { CliError } from "./errors";
import { runCli } from "./cli-program";

if (import.meta.main) {
  runCli().catch((error: unknown) => {
    if (error instanceof CliError) {
      console.error(error.message);
      process.exit(error.exitCode);
    }

    if (error instanceof CommanderError) {
      process.exit(error.exitCode);
    }

    console.error(error);
    process.exit(1);
  });
}
