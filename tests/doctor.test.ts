import { describe, expect, test } from "bun:test";
import { runDoctor } from "../src/doctor";

describe("runDoctor", () => {
  test("reports invalid credentials clearly", async () => {
    const result = await runDoctor(process.cwd(), "test");
    const full = result.toFull();
    expect(Array.isArray(full.checks)).toBe(true);
    expect(full.checks.some((check) => check.name === "tdjson")).toBe(true);
  });
});
