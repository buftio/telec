import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command, InvalidArgumentError, Option } from "commander";
import { printOutput } from "./output/format";
import { loadEnvIntoProcess, resolveAppConfig, type AppEnv, type OutputMode } from "./config/env";
import { trashStatePaths } from "./config/state";
import { runDoctor } from "./doctor";
import { AuthResetResult } from "./output/app-results";
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
  code?: string;
  password?: string;
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

type MarkReadOptions = SharedCliOptions & {
  conversationId: string;
  messageId?: number;
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
  markRead(options: MarkReadOptions): Promise<void>;
  search(options: SearchOptions): Promise<void>;
}

class InteractivePrompt implements PromptAdapter {
  private readonly rl = readline.createInterface({ input, output });

  constructor(private readonly answers: Record<string, string | undefined> = {}) {}

  async ask(prompt: string) {
    const key = prompt.toLowerCase();
    if (key.startsWith("phone number:") && this.answers.phone) {
      return this.answers.phone;
    }
    if (key.startsWith("login code:") && this.answers.code) {
      return this.answers.code;
    }
    if (key.startsWith("2fa password:") && this.answers.password) {
      return this.answers.password;
    }
    return this.rl.question(prompt);
  }

  close() {
    this.rl.close();
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
  execute: (client: TdlibClient, service: TelegramService) => Promise<T>,
) {
  loadEnvIntoProcess(process.cwd(), env);
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
    printOutput(options.output, await runDoctor(process.cwd(), options.env));
  },

  async authLogin(options) {
    await withClient(options.env, async (client, service) => {
      const prompt = new InteractivePrompt({
        phone: options.phone,
        code: options.code,
        password: options.password,
      });

      try {
        await client.ensureReady("interactive", prompt);
        printOutput(options.output, await service.getAuthStatus());
      } finally {
        prompt.close();
      }
    });
  },

  async authStatus(options) {
    await withClient(options.env, async (client, service) => {
      await client.ensureReady("status");
      printOutput(options.output, await service.getAuthStatus());
    });
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
    await withClient(options.env, async (client, service) => {
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
    await withClient(options.env, async (client, service) => {
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
    await withClient(options.env, async (client, service) => {
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

  async markRead(options) {
    await withClient(options.env, async (client, service) => {
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

  async search(options) {
    await withClient(options.env, async (client, service) => {
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
    .option("--code <code>", "login code to submit")
    .option("--password <password>", "2FA password to submit")
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
    .command("mark-read")
    .description("Mark a chat as read")
    .requiredOption("-c, --conversation-id <conversationId>", "chat id or selector")
    .option("--message-id <messageId>", "single message id to mark read", parseInteger)
    .action(async function () {
      await handlers.markRead(resolveSharedOptions(this.optsWithGlobals<MarkReadOptions>()));
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
  loadEnvIntoProcess(process.cwd());
  const program = createProgram();
  await program.parseAsync(argv);
}
