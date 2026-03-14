import type { RenderableResult } from "./result";

export type DoctorCheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  name: string;
  status: DoctorCheckStatus;
  message: string;
}

export interface DoctorPayload {
  env: string;
  status: DoctorCheckStatus;
  checks: DoctorCheck[];
}

export interface AuthResetPayload {
  env: string;
  reset: boolean;
  state_dir: string;
}

function normalizeInline(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export class DoctorResult implements RenderableResult<DoctorPayload> {
  constructor(private readonly payload: DoctorPayload) {}

  toFull() {
    return this.payload;
  }

  toCompact() {
    const lines = [`doctor | env=${this.payload.env} | status=${this.payload.status}`];
    for (const check of this.payload.checks) {
      lines.push(
        `[${check.status.toUpperCase()}] ${check.name} | ${normalizeInline(check.message)}`,
      );
    }
    return lines.join("\n");
  }
}

export class AuthResetResult implements RenderableResult<AuthResetPayload> {
  constructor(private readonly payload: AuthResetPayload) {}

  toFull() {
    return this.payload;
  }

  toCompact() {
    return [
      "auth-reset",
      `env=${this.payload.env}`,
      `reset=${this.payload.reset}`,
      `state_dir=${this.payload.state_dir}`,
    ].join(" | ");
  }
}
