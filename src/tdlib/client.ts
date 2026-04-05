import os from "node:os";
import { randomUUID } from "node:crypto";
import { CliError, TdlibError } from "../errors";
import type { AppConfig } from "../config/env";
import type { TdChat, TdFile, TdMessage, TdObject, TdUser } from "./types";
import type { TdTransport } from "./transport";

export interface PromptAdapter {
  ask(prompt: string, options?: { sensitive?: boolean }): Promise<string>;
}

export interface AuthStatus {
  ready: boolean;
  state: string | null;
}

type AuthorizationMode = "interactive" | "existing" | "status";

function isTdError(object: TdObject): object is TdObject & { code: number; message: string } {
  return object["@type"] === "error";
}

export class TdlibClient {
  private readonly transport: TdTransport;
  private readonly config: AppConfig;
  private readonly chats = new Map<number, TdChat>();
  private readonly users = new Map<number, TdUser>();
  private readonly sentMessages = new Map<string, TdMessage>();
  private readonly failedMessages = new Map<string, { code: number; message: string }>();
  private authState: string | null = null;
  private isOpen = false;

  constructor(config: AppConfig, transport: TdTransport) {
    this.config = config;
    this.transport = transport;
  }

  async open() {
    if (this.isOpen) {
      return;
    }

    this.isOpen = true;
    try {
      await this.waitForAuthState(5_000);
    } catch {
      await this.fetchAuthorizationState();
    }
  }

  async close() {
    if (!this.isOpen) {
      return;
    }

    try {
      await this.request({ "@type": "close" }, 2_000);
    } catch {
      // TDLib may already be closing; best-effort shutdown is enough here.
    } finally {
      this.transport.destroy();
      this.isOpen = false;
    }
  }

  getAuthorizationStatus(): AuthStatus {
    return {
      ready: this.authState === "authorizationStateReady",
      state: this.authState,
    };
  }

  async ensureReady(mode: AuthorizationMode, prompt?: PromptAdapter) {
    await this.open();
    await this.driveAuthorization(mode, prompt);
  }

  async request<T extends TdObject>(query: TdObject, timeoutMs = 30_000): Promise<T> {
    const extra = randomUUID();
    const request = JSON.stringify({
      ...query,
      "@extra": extra,
    });

    this.transport.send(request);

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const event = this.receiveAndProcess(0.2);
      if (!event || event["@extra"] !== extra) {
        continue;
      }

      if (isTdError(event)) {
        throw new TdlibError(event.code, event.message);
      }

      return event as T;
    }

    throw new CliError(`Timed out waiting for TDLib response to ${query["@type"]}`);
  }

  async getMe() {
    return this.request<TdUser>({ "@type": "getMe" });
  }

  async getChat(chatId: number) {
    const chat = await this.request<TdChat>({
      "@type": "getChat",
      chat_id: chatId,
    });
    this.chats.set(chat.id, chat);
    return chat;
  }

  async getUser(userId: number) {
    const user = await this.request<TdUser>({
      "@type": "getUser",
      user_id: userId,
    });
    this.users.set(user.id, user);
    return user;
  }

  async createPrivateChat(userId: number) {
    const chat = await this.request<TdChat>({
      "@type": "createPrivateChat",
      user_id: userId,
      force: false,
    });
    this.chats.set(chat.id, chat);
    return chat;
  }

  async getMessage(chatId: number, messageId: number) {
    return this.request<TdMessage>({
      "@type": "getMessage",
      chat_id: chatId,
      message_id: messageId,
    });
  }

  async downloadFile(fileId: number) {
    return this.request<TdFile>({
      "@type": "downloadFile",
      file_id: fileId,
      priority: 32,
      offset: 0,
      limit: 0,
      synchronous: true,
    });
  }

  async waitForMessageSent(chatId: number, messageId: number, timeoutMs = 120_000) {
    const key = `${chatId}:${messageId}`;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const sent = this.sentMessages.get(key);
      if (sent) {
        this.sentMessages.delete(key);
        this.failedMessages.delete(key);
        return sent;
      }

      const failed = this.failedMessages.get(key);
      if (failed) {
        this.sentMessages.delete(key);
        this.failedMessages.delete(key);
        throw new TdlibError(failed.code, failed.message);
      }

      this.receiveAndProcess(0.5);
    }

    throw new CliError(`Timed out waiting for message ${messageId} to finish sending`);
  }

  async listChats(chatList: TdObject | null, limit: number) {
    try {
      await this.request(
        {
          "@type": "loadChats",
          chat_list: chatList,
          limit,
        },
        10_000,
      );
    } catch (error) {
      if (!(error instanceof TdlibError) || !error.message.includes("already")) {
        throw error;
      }
    }

    const chatIds = await this.request<{ chat_ids: number[] } & TdObject>({
      "@type": "getChats",
      chat_list: chatList,
      limit,
    });

    const chats = await Promise.all(chatIds.chat_ids.map((chatId) => this.getChat(chatId)));
    return chats;
  }

  async searchChats(query: string, limit: number) {
    const chatIds = await this.request<{ chat_ids: number[] } & TdObject>({
      "@type": "searchChats",
      query,
      limit,
    });

    const chats = await Promise.all(chatIds.chat_ids.map((chatId) => this.getChat(chatId)));
    return chats;
  }

  async getChatHistory(chatId: number, limit: number, fromMessageId?: number) {
    return this.request<{ messages: TdMessage[] } & TdObject>({
      "@type": "getChatHistory",
      chat_id: chatId,
      from_message_id: fromMessageId ?? 0,
      offset: 0,
      limit,
      only_local: false,
    });
  }

  async searchChatMessages(chatId: number, query: string, limit: number, fromMessageId?: number) {
    return this.request<
      {
        total_count: number;
        messages: TdMessage[];
        next_from_message_id: number;
      } & TdObject
    >({
      "@type": "searchChatMessages",
      chat_id: chatId,
      topic_id: null,
      query,
      sender_id: null,
      from_message_id: fromMessageId ?? 0,
      offset: 0,
      limit,
      filter: null,
    });
  }

  async searchMessages(query: string, limit: number, offset?: string) {
    return this.request<
      {
        total_count: number;
        messages: TdMessage[];
        next_offset: string;
      } & TdObject
    >({
      "@type": "searchMessages",
      chat_list: null,
      query,
      offset: offset ?? "",
      limit,
      filter: null,
      chat_type_filter: null,
      min_date: 0,
      max_date: 0,
    });
  }

  getKnownChats() {
    return Array.from(this.chats.values());
  }

  getKnownUsers() {
    return Array.from(this.users.values());
  }

  private receiveAndProcess(timeoutSeconds: number) {
    const raw = this.transport.receive(timeoutSeconds);
    if (!raw) {
      return null;
    }

    const object = JSON.parse(raw) as TdObject;
    this.processObject(object);
    return object;
  }

  private processObject(object: TdObject) {
    switch (object["@type"]) {
      case "updateAuthorizationState":
        this.authState = ((object.authorization_state as TdObject | undefined)?.["@type"] ??
          null) as string | null;
        break;
      case "updateUser":
        if (typeof object.user === "object" && object.user) {
          const user = object.user as TdUser;
          this.users.set(user.id, user);
        }
        break;
      case "updateNewChat":
        if (typeof object.chat === "object" && object.chat) {
          const chat = object.chat as TdChat;
          this.chats.set(chat.id, chat);
        }
        break;
      case "updateChatTitle":
      case "updateChatLastMessage":
      case "updateChatPosition":
      case "updateChatReadInbox":
      case "updateChatDraftMessage":
      case "updateChatUnreadMentionCount":
      case "updateChatIsMarkedAsUnread":
        this.mergeChatUpdate(object);
        break;
      case "updateMessageSendSucceeded":
        this.mergeSendSucceeded(object);
        break;
      case "updateMessageSendFailed":
        this.mergeSendFailed(object);
        break;
      default:
        break;
    }
  }

  private mergeSendSucceeded(update: TdObject) {
    const oldMessageId = Number(update.old_message_id);
    const message =
      typeof update.message === "object" && update.message ? (update.message as TdMessage) : null;
    if (!Number.isFinite(oldMessageId) || !message) {
      return;
    }

    this.sentMessages.set(`${message.chat_id}:${oldMessageId}`, message);
  }

  private mergeSendFailed(update: TdObject) {
    const chatId = Number(update.chat_id);
    const oldMessageId = Number(update.old_message_id);
    if (!Number.isFinite(chatId) || !Number.isFinite(oldMessageId)) {
      return;
    }

    this.failedMessages.set(`${chatId}:${oldMessageId}`, {
      code: Number(update.error_code) || 500,
      message:
        typeof update.error_message === "string" && update.error_message
          ? update.error_message
          : "Message sending failed",
    });
  }

  private mergeChatUpdate(update: TdObject) {
    const chatId = Number(update.chat_id);
    if (!Number.isFinite(chatId)) {
      return;
    }

    const current =
      this.chats.get(chatId) ??
      ({
        "@type": "chat",
        id: chatId,
        title: "",
      } as TdChat);

    if (typeof update.title === "string") {
      current.title = update.title;
    }
    if (typeof update.unread_count === "number") {
      current.unread_count = update.unread_count;
    }
    if (typeof update.last_message === "object" && update.last_message) {
      current.last_message = update.last_message as TdMessage;
    }
    this.chats.set(chatId, current);
  }

  private async waitForAuthState(timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.authState) {
        return;
      }
      this.receiveAndProcess(0.2);
    }

    throw new CliError("TDLib did not report an authorization state");
  }

  private async driveAuthorization(mode: AuthorizationMode, prompt?: PromptAdapter) {
    while (true) {
      const state = this.authState ?? (await this.fetchAuthorizationState());
      switch (state) {
        case "authorizationStateWaitTdlibParameters":
          await this.request({
            "@type": "setTdlibParameters",
            use_test_dc: this.config.useTestDc,
            database_directory: this.config.state.databaseDir,
            files_directory: this.config.state.filesDir,
            database_encryption_key: this.config.dbEncryptionKey,
            use_file_database: true,
            use_chat_info_database: true,
            use_message_database: true,
            use_secret_chats: true,
            api_id: this.config.apiId,
            api_hash: this.config.apiHash,
            system_language_code: "en",
            device_model: "bun",
            system_version: `${os.platform()} ${os.release()}`,
            application_version: "0.1.0",
            enable_storage_optimizer: true,
            ignore_file_names: false,
          });
          break;
        case "authorizationStateWaitPhoneNumber":
          if (mode === "status") {
            return;
          }
          if (mode !== "interactive" || !prompt) {
            throw new CliError("Not authorized. Run `telec auth login` first.");
          }
          await this.request({
            "@type": "setAuthenticationPhoneNumber",
            phone_number: await prompt.ask("Phone number: "),
          });
          break;
        case "authorizationStateWaitCode":
          if (mode === "status") {
            return;
          }
          if (mode !== "interactive" || !prompt) {
            throw new CliError("Login code is required. Run `telec auth login`.");
          }
          await this.request({
            "@type": "checkAuthenticationCode",
            code: await prompt.ask("Login code: "),
          });
          break;
        case "authorizationStateWaitPassword":
          if (mode === "status") {
            return;
          }
          if (mode !== "interactive" || !prompt) {
            throw new CliError("2FA password is required. Run `telec auth login`.");
          }
          await this.request({
            "@type": "checkAuthenticationPassword",
            password: await prompt.ask("2FA password: ", { sensitive: true }),
          });
          break;
        case "authorizationStateReady":
          return;
        case "authorizationStateClosed":
          throw new CliError("TDLib session is closed");
        case "authorizationStateWaitRegistration":
          if (mode === "status") {
            return;
          }
          if (mode !== "interactive" || !prompt) {
            throw new CliError(
              "Registration is required. Run `telec auth login` and complete signup.",
            );
          }
          await this.request({
            "@type": "registerUser",
            first_name: await this.askWithDefault(
              prompt,
              this.config.useTestDc ? "First name [Test]: " : "First name: ",
              this.config.useTestDc ? "Test" : undefined,
            ),
            last_name: await this.askWithDefault(
              prompt,
              this.config.useTestDc ? "Last name [User]: " : "Last name (optional): ",
              this.config.useTestDc ? "User" : "",
            ),
            disable_notification: true,
          });
          break;
        case "authorizationStateWaitEmailAddress":
        case "authorizationStateWaitEmailCode":
        case "authorizationStateWaitOtherDeviceConfirmation":
          throw new CliError(`Unsupported authorization state: ${state}`);
        default:
          await this.waitForAuthState(10_000);
          break;
      }
    }
  }

  private async fetchAuthorizationState() {
    const state = await this.request<TdObject>({
      "@type": "getAuthorizationState",
    });
    const authType = (state.authorization_state as TdObject | undefined)?.["@type"];
    this.authState = (authType as string | undefined) ?? this.authState;
    return this.authState;
  }

  private async askWithDefault(prompt: PromptAdapter, label: string, fallback?: string) {
    const value = (await prompt.ask(label)).trim();
    if (value) {
      return value;
    }
    if (fallback !== undefined) {
      return fallback;
    }
    throw new CliError(`A value is required for "${label.trim()}"`);
  }
}
