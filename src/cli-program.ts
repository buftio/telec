import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { stdin as input, stdout as output } from "node:process";
import { Command, InvalidArgumentError, Option } from "commander";
import { printOutput } from "./output/format";
import { resolveAppConfig, type AppEnv, type OutputMode } from "./config/env";
import { prepareRuntimeEnv } from "./config/runtime-env";
import { trashStatePaths } from "./config/state";
import { runDoctor } from "./doctor";
import { AuthResetResult } from "./output/app-results";
import { CliError } from "./errors";
import { FfiTdTransport } from "./tdlib/transport";
import { TdlibClient, type PromptAdapter } from "./tdlib/client";
import { TelegramService } from "./telegram/service";

type SharedOptions = {
  env: AppEnv;
  output: OutputMode;
};

type SharedCliOptions = SharedOptions & {
  compact?: boolean;
};

type LoginOptions = SharedCliOptions & {
  phone?: string;
};

type ListOptions = SharedCliOptions & {
  folder?: string;
  limit: number;
};

type ReadOptions = SharedCliOptions & {
  conversationId: string;
  limit: number;
  beforeMessageId?: number;
};

type SendOptions = SharedCliOptions & {
  conversationId: string;
  text: string;
};

type SendFileOptions = SharedCliOptions & {
  conversationId: string;
  filePath: string;
  caption?: string;
};

type MarkReadOptions = SharedCliOptions & {
  conversationId: string;
  messageId?: number;
};

type DownloadOptions = SharedCliOptions & {
  conversationId: string;
  messageId: number;
  outputPath?: string;
};

type SearchOptions = SharedCliOptions & {
  query: string;
  scope: "chats" | "messages";
  conversationId?: string;
  limit: number;
  offset?: string;
};

export interface CliHandlers {
  doctor(options: SharedOptions): Promise<void>;
  authLogin(options: LoginOptions): Promise<void>;
  authStatus(options: SharedOptions): Promise<void>;
  authReset(options: SharedOptions): Promise<void>;
  list(options: ListOptions): Promise<void>;
  read(options: ReadOptions): Promise<void>;
  send(options: SendOptions): Promise<void>;
  sendFile(options: SendFileOptions): Promise<void>;
  markRead(options: MarkReadOptions): Promise<void>;
  download(options: DownloadOptions): Promise<void>;
  search(options: SearchOptions): Promise<void>;
}

class InteractivePrompt implements PromptAdapter {
  constructor(private readonly answers: Record<string, string | undefined> = {}) {}

  async ask(prompt: string, options?: { sensitive?: boolean }) {
    const key = prompt.toLowerCase();
    if (key.startsWith("phone number:") && this.answers.phone) {
      return this.answers.phone;
    }
    if (options?.sensitive) {
      return askSensitive(prompt);
    }
    const rl = readline.createInterface({ input, output });
    try {
      return await rl.question(prompt);
    } finally {
      rl.close();
    }
  }

  write(message: string) {
    console.error(message);
  }

  close() {
    return;
  }
}

const ENV_CHOICES: AppEnv[] = ["dev", "test", "prod"];
const OUTPUT_CHOICES: OutputMode[] = ["json", "compact"];
const SEARCH_SCOPE_CHOICES: SearchOptions["scope"][] = ["chats", "messages"];

function enumOption<T extends string>(
  flags: string,
  description: string,
  choices: readonly T[],
  defaultValue?: T,
) {
  const option = new Option(flags, description).choices([...choices]);
  if (defaultValue !== undefined) {
    option.default(defaultValue);
  }
  return option;
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new InvalidArgumentError("must be a number");
  }
  return parsed;
}

function resolveSharedOptions<T extends SharedCliOptions>(
  options: T,
): Omit<T, "compact"> & SharedOptions {
  const { compact, ...rest } = options;
  return {
    ...rest,
    output: compact ? "compact" : options.output,
  };
}

export function getDefaultEnv(argv = Bun.argv): AppEnv {
  const scriptLikeArg = argv[1];
  if (scriptLikeArg && /\.(mjs|cjs|js|ts|tsx)$/.test(scriptLikeArg)) {
    return "dev";
  }
  return "prod";
}

async function withClient<T>(
  env: AppEnv,
  prompt: InteractivePrompt,
  execute: (client: TdlibClient, service: TelegramService) => Promise<T>,
) {
  await prepareRuntimeEnv(process.cwd(), env, { prompt });
  const config = resolveAppConfig(process.cwd(), env);
  const transport = new FfiTdTransport(config.tdjsonPath);
  const client = new TdlibClient(config, transport);
  const service = new TelegramService(client, env);

  try {
    return await execute(client, service);
  } finally {
    await client.close();
  }
}

export const defaultHandlers: CliHandlers = {
  async doctor(options) {
    const prompt = new InteractivePrompt();
    try {
      await prepareRuntimeEnv(process.cwd(), options.env, { prompt });
      printOutput(options.output, await runDoctor(process.cwd(), options.env));
    } finally {
      prompt.close();
    }
  },

  async authLogin(options) {
    const prompt = new InteractivePrompt({
      phone: options.phone,
    });

    try {
      await withClient(options.env, prompt, async (client, service) => {
        await client.ensureReady("interactive", prompt);
        printOutput(options.output, await service.getAuthStatus());
      });
    } finally {
      prompt.close();
    }
  },

  async authStatus(options) {
    const prompt = new InteractivePrompt();
    try {
      await withClient(options.env, prompt, async (client, service) => {
        await client.ensureReady("status");
        printOutput(options.output, await service.getAuthStatus());
      });
    } finally {
      prompt.close();
    }
  },

  async authReset(options) {
    const state = trashStatePaths(options.env);
    printOutput(
      options.output,
      new AuthResetResult({
        env: options.env,
        reset: true,
        state_dir: state.baseDir,
      }),
    );
  },

  async list(options) {
    await withPromptedClient(options.env, async (client, service) => {
      await client.ensureReady("existing");
      printOutput(
        options.output,
        await service.listChats({
          folder: options.folder,
          limit: options.limit,
        }),
      );
    });
  },

  async read(options) {
    await withPromptedClient(options.env, async (client, service) => {
      await client.ensureReady("existing");
      printOutput(
        options.output,
        await service.readChat({
          conversationId: options.conversationId,
          limit: options.limit,
          beforeMessageId: options.beforeMessageId,
        }),
      );
    });
  },

  async send(options) {
    await withPromptedClient(options.env, async (client, service) => {
      await client.ensureReady("existing");
      printOutput(
        options.output,
        await service.sendMessage({
          conversationId: options.conversationId,
          text: options.text,
        }),
      );
    });
  },

  async sendFile(options) {
    await withPromptedClient(options.env, async (client, service) => {
      await client.ensureReady("existing");
      printOutput(
        options.output,
        await service.sendFile({
          conversationId: options.conversationId,
          filePath: options.filePath,
          caption: options.caption,
        }),
      );
    });
  },

  async markRead(options) {
    await withPromptedClient(options.env, async (client, service) => {
      await client.ensureReady("existing");
      printOutput(
        options.output,
        await service.markRead({
          conversationId: options.conversationId,
          messageId: options.messageId,
        }),
      );
    });
  },

  async download(options) {
    await withPromptedClient(options.env, async (client, service) => {
      await client.ensureReady("existing");
      printOutput(
        options.output,
        await service.downloadFile({
          conversationId: options.conversationId,
          messageId: options.messageId,
          outputPath: options.outputPath,
        }),
      );
    });
  },

  async search(options) {
    await withPromptedClient(options.env, async (client, service) => {
      await client.ensureReady("existing");
      printOutput(options.output, await service.search(options));
    });
  },
};

export function createProgram(handlers: CliHandlers = defaultHandlers) {
  const program = new Command()
    .name("telec")
    .description("Scriptable Telegram CLI on top of TDLib")
    .addOption(
      enumOption("--env <env>", "target Telegram environment", ENV_CHOICES, getDefaultEnv()),
    )
    .addOption(enumOption("--output <output>", "output format", OUTPUT_CHOICES, "json"))
    .option("--compact", "alias for --output compact");

  program
    .command("doctor")
    .description("Check local CLI and TDLib setup")
    .action(async function () {
      await handlers.doctor(resolveSharedOptions(this.optsWithGlobals<SharedCliOptions>()));
    });

  const auth = program.command("auth").description("Authentication commands");

  auth
    .command("login")
    .description("Login or register a Telegram account")
    .option("--phone <phone>", "phone number in international format")
    .action(async function () {
      await handlers.authLogin(resolveSharedOptions(this.optsWithGlobals<LoginOptions>()));
    });

  auth
    .command("status")
    .description("Show current authorization status")
    .action(async function () {
      await handlers.authStatus(resolveSharedOptions(this.optsWithGlobals<SharedCliOptions>()));
    });

  auth
    .command("reset")
    .description("Trash the local TDLib session for this env")
    .action(async function () {
      await handlers.authReset(resolveSharedOptions(this.optsWithGlobals<SharedCliOptions>()));
    });

  program
    .command("list")
    .description("List chats")
    .option("--folder <folder>", "main, archive, or numeric folder id")
    .option("--limit <limit>", "max chats to return", parseInteger, 50)
    .action(async function () {
      await handlers.list(resolveSharedOptions(this.optsWithGlobals<ListOptions>()));
    });

  program
    .command("read")
    .description("Read chat history")
    .requiredOption("-c, --conversation-id <conversationId>", "chat id or selector")
    .option("--limit <limit>", "max messages to return", parseInteger, 50)
    .option("--before-message-id <messageId>", "pagination cursor", parseInteger)
    .action(async function () {
      await handlers.read(resolveSharedOptions(this.optsWithGlobals<ReadOptions>()));
    });

  program
    .command("send")
    .description("Send a text message")
    .requiredOption("-c, --conversation-id <conversationId>", "chat id or selector")
    .requiredOption("--text <text>", "message text")
    .action(async function () {
      await handlers.send(resolveSharedOptions(this.optsWithGlobals<SendOptions>()));
    });

  program
    .command("send-file")
    .description("Send a file")
    .requiredOption("-c, --conversation-id <conversationId>", "chat id or selector")
    .requiredOption("--file-path <filePath>", "local file path")
    .option("--caption <caption>", "file caption")
    .action(async function () {
      await handlers.sendFile(resolveSharedOptions(this.optsWithGlobals<SendFileOptions>()));
    });

  program
    .command("mark-read")
    .description("Mark a chat as read")
    .requiredOption("-c, --conversation-id <conversationId>", "chat id or selector")
    .option("--message-id <messageId>", "single message id to mark read", parseInteger)
    .action(async function () {
      await handlers.markRead(resolveSharedOptions(this.optsWithGlobals<MarkReadOptions>()));
    });

  program
    .command("download")
    .description("Download a file from a message")
    .requiredOption("-c, --conversation-id <conversationId>", "chat id or selector")
    .requiredOption(
      "--message-id <messageId>",
      "message id containing the attachment",
      parseInteger,
    )
    .option("--output-path <outputPath>", "destination file path")
    .action(async function () {
      await handlers.download(resolveSharedOptions(this.optsWithGlobals<DownloadOptions>()));
    });

  program
    .command("search")
    .description("Search chats or messages")
    .requiredOption("--query <query>", "search query")
    .addOption(enumOption("--scope <scope>", "search scope", SEARCH_SCOPE_CHOICES, "messages"))
    .option(
      "-c, --conversation-id <conversationId>",
      "chat id or selector for in-chat message search",
    )
    .option("--limit <limit>", "max results to return", parseInteger, 20)
    .option("--offset <offset>", "pagination cursor")
    .action(async function () {
      await handlers.search(resolveSharedOptions(this.optsWithGlobals<SearchOptions>()));
    });

  return program;
}

export async function runCli(argv = Bun.argv) {
  const program = createProgram();
  await program.parseAsync(argv);
}

async function withPromptedClient<T>(
  env: AppEnv,
  execute: (client: TdlibClient, service: TelegramService) => Promise<T>,
) {
  const prompt = new InteractivePrompt();
  try {
    return await withClient(env, prompt, execute);
  } finally {
    prompt.close();
  }
}

async function askSensitive(prompt: string) {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    const rl = readline.createInterface({ input, output });
    try {
      return await rl.question(prompt);
    } finally {
      rl.close();
    }
  }

  stdout.write(prompt);

  return await new Promise<string>((resolve, reject) => {
    const chunks: string[] = [];
    const previousRawMode = stdin.isRaw;

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(previousRawMode);
      stdin.pause();
    };

    const onData = (data: Buffer | string) => {
      const text = data.toString("utf8");
      for (const char of text) {
        if (char === "\u0003") {
          stdout.write("\n");
          cleanup();
          reject(new CliError("Prompt cancelled", 130));
          return;
        }

        if (char === "\r" || char === "\n") {
          stdout.write("\n");
          cleanup();
          resolve(chunks.join(""));
          return;
        }

        if (char === "\u007f") {
          chunks.pop();
          continue;
        }

        chunks.push(char);
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}
