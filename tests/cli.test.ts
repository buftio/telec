import { describe, expect, test } from "bun:test";
import { createProgram, getDefaultEnv, type CliHandlers } from "../src/cli-program";

describe("createProgram", () => {
  test("routes read options through commander", async () => {
    let captured: Record<string, unknown> | undefined;
    const handlers: CliHandlers = {
      doctor: async () => {},
      authLogin: async () => {},
      authStatus: async () => {},
      authReset: async () => {},
      list: async () => {},
      read: async (options) => {
        captured = options;
      },
      send: async () => {},
      sendFile: async () => {},
      markRead: async () => {},
      download: async () => {},
      search: async () => {},
    };

    const program = createProgram(handlers);
    await program.parseAsync(
      [
        "bun",
        "telegram",
        "--env",
        "prod",
        "read",
        "-c",
        "123",
        "--limit",
        "25",
        "--output",
        "compact",
      ],
      { from: "node" },
    );

    expect(captured).toEqual({
      conversationId: "123",
      env: "prod",
      limit: 25,
      output: "compact",
    });
  });

  test("routes auth login shortcut options through commander", async () => {
    let captured: Record<string, unknown> | undefined;
    const handlers: CliHandlers = {
      doctor: async () => {},
      authLogin: async (options) => {
        captured = options;
      },
      authStatus: async () => {},
      authReset: async () => {},
      list: async () => {},
      read: async () => {},
      send: async () => {},
      sendFile: async () => {},
      markRead: async () => {},
      download: async () => {},
      search: async () => {},
    };

    const program = createProgram(handlers);
    await program.parseAsync(["bun", "telegram", "auth", "login", "--phone", "+447405644796"], {
      from: "node",
    });

    expect(captured).toEqual({
      env: "dev",
      output: "json",
      phone: "+447405644796",
    });
  });

  test("defaults to dev when running from source", () => {
    expect(getDefaultEnv(["bun", "src/cli.ts"] as any)).toBe("dev");
  });

  test("defaults to prod for packaged binaries", () => {
    expect(getDefaultEnv(["/Users/buft/bin/telec"] as any)).toBe("prod");
  });

  test("routes search options through commander", async () => {
    let captured: Record<string, unknown> | undefined;
    const handlers: CliHandlers = {
      doctor: async () => {},
      authLogin: async () => {},
      authStatus: async () => {},
      authReset: async () => {},
      list: async () => {},
      read: async () => {},
      send: async () => {},
      sendFile: async () => {},
      markRead: async () => {},
      download: async () => {},
      search: async (options) => {
        captured = options;
      },
    };

    const program = createProgram(handlers);
    await program.parseAsync(
      [
        "bun",
        "telec",
        "--env",
        "test",
        "search",
        "--query",
        "igor",
        "--scope",
        "chats",
        "--limit",
        "5",
      ],
      { from: "node" },
    );

    expect(captured).toEqual({
      env: "test",
      output: "json",
      query: "igor",
      scope: "chats",
      limit: 5,
    });
  });

  test("routes send-file options through commander", async () => {
    let captured: Record<string, unknown> | undefined;
    const handlers: CliHandlers = {
      doctor: async () => {},
      authLogin: async () => {},
      authStatus: async () => {},
      authReset: async () => {},
      list: async () => {},
      read: async () => {},
      send: async () => {},
      sendFile: async (options) => {
        captured = options;
      },
      markRead: async () => {},
      download: async () => {},
      search: async () => {},
    };

    const program = createProgram(handlers);
    await program.parseAsync(
      [
        "bun",
        "telec",
        "send-file",
        "-c",
        "saved",
        "--file-path",
        "/tmp/demo.pdf",
        "--caption",
        "hi",
      ],
      { from: "node" },
    );

    expect(captured).toEqual({
      env: "dev",
      output: "json",
      conversationId: "saved",
      filePath: "/tmp/demo.pdf",
      caption: "hi",
    });
  });

  test("routes download options through commander", async () => {
    let captured: Record<string, unknown> | undefined;
    const handlers: CliHandlers = {
      doctor: async () => {},
      authLogin: async () => {},
      authStatus: async () => {},
      authReset: async () => {},
      list: async () => {},
      read: async () => {},
      send: async () => {},
      sendFile: async () => {},
      markRead: async () => {},
      download: async (options) => {
        captured = options;
      },
      search: async () => {},
    };

    const program = createProgram(handlers);
    await program.parseAsync(
      [
        "bun",
        "telec",
        "--compact",
        "download",
        "-c",
        "saved",
        "--message-id",
        "42",
        "--output-path",
        "/tmp/result.pdf",
      ],
      { from: "node" },
    );

    expect(captured).toEqual({
      env: "dev",
      output: "compact",
      conversationId: "saved",
      messageId: 42,
      outputPath: "/tmp/result.pdf",
    });
  });

  test("maps --compact to compact output", async () => {
    let captured: Record<string, unknown> | undefined;
    const handlers: CliHandlers = {
      doctor: async () => {},
      authLogin: async () => {},
      authStatus: async () => {},
      authReset: async () => {},
      list: async (options) => {
        captured = options;
      },
      read: async () => {},
      send: async () => {},
      sendFile: async () => {},
      markRead: async () => {},
      download: async () => {},
      search: async () => {},
    };

    const program = createProgram(handlers);
    await program.parseAsync(["bun", "telec", "--compact", "list"], { from: "node" });

    expect(captured).toEqual({
      env: "dev",
      limit: 50,
      output: "compact",
    });
  });

  test("shows enum choices in top-level help", () => {
    const program = createProgram({
      doctor: async () => {},
      authLogin: async () => {},
      authStatus: async () => {},
      authReset: async () => {},
      list: async () => {},
      read: async () => {},
      send: async () => {},
      sendFile: async () => {},
      markRead: async () => {},
      download: async () => {},
      search: async () => {},
    });

    const help = program.helpInformation();
    expect(help).toMatch(/choices:\s+"dev",\s+"test",\s+"prod"/);
    expect(help).toMatch(/choices:\s+"json",\s+"compact"/);
    expect(help).toContain("--compact");
  });

  test("shows enum choices in command help", () => {
    const program = createProgram({
      doctor: async () => {},
      authLogin: async () => {},
      authStatus: async () => {},
      authReset: async () => {},
      list: async () => {},
      read: async () => {},
      send: async () => {},
      sendFile: async () => {},
      markRead: async () => {},
      download: async () => {},
      search: async () => {},
    });

    const searchHelp = program.commands
      .find((command) => command.name() === "search")
      ?.helpInformation();
    expect(searchHelp).toMatch(/choices:\s+"chats",\s+"messages"/);
  });

  test("auth login help does not expose secret flags", () => {
    const program = createProgram({
      doctor: async () => {},
      authLogin: async () => {},
      authStatus: async () => {},
      authReset: async () => {},
      list: async () => {},
      read: async () => {},
      send: async () => {},
      sendFile: async () => {},
      markRead: async () => {},
      download: async () => {},
      search: async () => {},
    });

    const loginHelp = program.commands
      .find((command) => command.name() === "auth")
      ?.commands.find((command) => command.name() === "login")
      ?.helpInformation();

    expect(loginHelp).not.toContain("--code");
    expect(loginHelp).not.toContain("--password");
  });
});
