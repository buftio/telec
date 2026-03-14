export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export class TdlibError extends CliError {
  readonly tdCode: number;

  constructor(code: number, message: string) {
    super(`TDLib error ${code}: ${message}`);
    this.name = "TdlibError";
    this.tdCode = code;
  }
}
