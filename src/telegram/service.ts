import { CliError } from "../errors";
import type { AppEnv } from "../config/env";
import type { TdlibClient } from "../tdlib/client";
import type { TdChat, TdMessage, TdObject, TdUser } from "../tdlib/types";
import {
  AuthStatusResult,
  ChatListResult,
  ChatReadResult,
  MarkReadResult,
  SearchResult,
  SendMessageResult,
  normalizeChat,
  normalizeMessage,
} from "./results";
import { findUserByPhone, selectChatByTitle } from "./selector";

export interface ListOptions {
  folder?: string;
  limit: number;
}

export interface ReadOptions {
  conversationId: string;
  limit: number;
  beforeMessageId?: number;
}

export interface SendOptions {
  conversationId: string;
  text: string;
}

export interface MarkReadOptions {
  conversationId: string;
  messageId?: number;
}

export interface SearchOptions {
  query: string;
  scope: "chats" | "messages";
  conversationId?: string;
  limit: number;
  offset?: string;
}

function chatListFromFolder(folder?: string): TdObject | null {
  if (!folder || folder === "main") {
    return null;
  }
  if (folder === "archive") {
    return { "@type": "chatListArchive" };
  }

  const folderId = Number.parseInt(folder, 10);
  if (!Number.isFinite(folderId)) {
    throw new CliError(`Unsupported folder: ${folder}`);
  }

  return {
    "@type": "chatListFolder",
    chat_folder_id: folderId,
  };
}

function mergeChats(chats: TdChat[], limit: number) {
  const deduped = new Map<number, TdChat>();
  for (const chat of chats) {
    deduped.set(chat.id, chat);
    if (deduped.size >= limit) {
      break;
    }
  }
  return Array.from(deduped.values());
}

function searchKnownChats(query: string, chats: TdChat[], limit: number) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return chats
    .map((chat) => {
      const title = chat.title.toLowerCase();
      const index = title.indexOf(normalizedQuery);
      return {
        chat,
        index,
        startsWith: index === 0,
      };
    })
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => {
      if (left.startsWith !== right.startsWith) {
        return left.startsWith ? -1 : 1;
      }
      if (left.index !== right.index) {
        return left.index - right.index;
      }
      return left.chat.title.localeCompare(right.chat.title);
    })
    .slice(0, limit)
    .map((entry) => entry.chat);
}

export class TelegramService {
  constructor(
    private readonly client: TdlibClient,
    private readonly envName: AppEnv,
  ) {}

  async getAuthStatus() {
    const status = this.client.getAuthorizationStatus();
    if (!status.ready) {
      return new AuthStatusResult({
        env: this.envName,
        authorized: false,
        state: status.state ?? "unknown",
      });
    }

    const me = await this.client.getMe();
    return new AuthStatusResult({
      env: this.envName,
      authorized: true,
      state: status.state ?? "authorizationStateReady",
      me: {
        id: me.id,
        first_name: me.first_name ?? "",
        last_name: me.last_name ?? "",
        usernames: me.usernames?.active_usernames ?? [],
      },
    });
  }

  async listChats(options: ListOptions) {
    const chats = await this.client.listChats(chatListFromFolder(options.folder), options.limit);

    return new ChatListResult({
      env: this.envName,
      chats: chats.map(normalizeChat),
    });
  }

  async readChat(options: ReadOptions) {
    const chat = await this.resolveConversation(options.conversationId);
    const history = await this.readHistory(chat.id, options.limit, options.beforeMessageId);
    const messages = history.messages.map(normalizeMessage);

    return new ChatReadResult({
      env: this.envName,
      conversation: normalizeChat(chat),
      messages,
      next_cursor: history.nextCursor,
    });
  }

  async search(options: SearchOptions) {
    if (options.scope === "chats") {
      const knownChats = await this.loadKnownChats();
      const localMatches = searchKnownChats(options.query, knownChats, options.limit);
      const tdlibMatches = await this.client.searchChats(options.query, options.limit);
      const chats = mergeChats([...localMatches, ...tdlibMatches], options.limit);
      return new SearchResult({
        env: this.envName,
        scope: "chats",
        query: options.query,
        chats: chats.map(normalizeChat),
        next_cursor: null,
      });
    }

    if (options.conversationId) {
      const chat = await this.resolveConversation(options.conversationId);
      const found = await this.client.searchChatMessages(
        chat.id,
        options.query,
        options.limit,
        options.offset ? Number.parseInt(options.offset, 10) : undefined,
      );

      return new SearchResult({
        env: this.envName,
        scope: "messages",
        query: options.query,
        conversation: normalizeChat(chat),
        total_count: found.total_count,
        messages: found.messages.map(normalizeMessage),
        next_cursor:
          found.next_from_message_id && found.next_from_message_id !== 0
            ? String(found.next_from_message_id)
            : null,
      });
    }

    const found = await this.client.searchMessages(options.query, options.limit, options.offset);

    return new SearchResult({
      env: this.envName,
      scope: "messages",
      query: options.query,
      total_count: found.total_count,
      messages: found.messages.map(normalizeMessage),
      next_cursor: found.next_offset || null,
    });
  }

  async sendMessage(options: SendOptions) {
    const chat = await this.resolveConversation(options.conversationId);
    const response = await this.client.request<TdObject>({
      "@type": "sendMessage",
      chat_id: chat.id,
      input_message_content: {
        "@type": "inputMessageText",
        text: {
          "@type": "formattedText",
          text: options.text,
        },
      },
    });

    return new SendMessageResult({
      env: this.envName,
      conversation: normalizeChat(chat),
      message: normalizeMessage(response as TdMessage),
    });
  }

  async markRead(options: MarkReadOptions) {
    const chat = await this.resolveConversation(options.conversationId);
    const messageIds = options.messageId
      ? [options.messageId]
      : await this.getUnreadMessageIds(chat.id);

    if (messageIds.length === 0) {
      return new MarkReadResult({
        env: this.envName,
        conversation: normalizeChat(chat),
        message_ids: [],
      });
    }

    await this.client.request({
      "@type": "viewMessages",
      chat_id: chat.id,
      message_ids: messageIds,
      force_read: true,
      source: {
        "@type": "messageSourceOther",
      },
    });

    return new MarkReadResult({
      env: this.envName,
      conversation: normalizeChat(chat),
      message_ids: messageIds,
    });
  }

  async resolveConversation(selector: string) {
    const chatId = Number.parseInt(selector, 10);
    if (Number.isFinite(chatId) && String(chatId) === selector.trim()) {
      return this.client.getChat(chatId);
    }

    if (selector.startsWith("@")) {
      const response = await this.client.request<TdObject>({
        "@type": "searchPublicChat",
        username: selector.slice(1),
      });
      return response as TdChat;
    }

    const phoneMatch = await this.lookupPhone(selector);
    if (phoneMatch) {
      return phoneMatch;
    }

    const chats = await this.loadKnownChats();
    return selectChatByTitle(selector, chats);
  }

  private async lookupPhone(selector: string) {
    const response = await this.client.request<{ user_ids: number[] } & TdObject>({
      "@type": "searchContacts",
      query: selector,
      limit: 20,
    });

    const users: TdUser[] = [];
    for (const userId of response.user_ids) {
      users.push(await this.client.getUser(userId));
    }

    const user = findUserByPhone(selector, users);
    if (!user) {
      return null;
    }

    return this.client.request<TdChat>({
      "@type": "createPrivateChat",
      user_id: user.id,
      force: false,
    });
  }

  private async loadKnownChats() {
    const [main, archive] = await Promise.all([
      this.client.listChats(null, 200),
      this.client.listChats({ "@type": "chatListArchive" }, 200),
    ]);

    const deduped = new Map<number, TdChat>();
    for (const chat of [...main, ...archive, ...this.client.getKnownChats()]) {
      deduped.set(chat.id, chat);
    }
    return Array.from(deduped.values());
  }

  private async getUnreadMessageIds(chatId: number) {
    const history = await this.client.getChatHistory(chatId, 100);
    return history.messages.filter((message) => !message.is_outgoing).map((message) => message.id);
  }

  private async readHistory(chatId: number, limit: number, beforeMessageId?: number) {
    const messages: TdMessage[] = [];
    const seen = new Set<number>();
    let cursor = beforeMessageId;
    if (beforeMessageId) {
      seen.add(beforeMessageId);
    }

    for (let attempt = 0; attempt < 20 && messages.length < limit; attempt += 1) {
      const requestLimit = Math.min(100, limit - messages.length + (cursor ? 1 : 0));
      const page = await this.client.getChatHistory(chatId, requestLimit, cursor);
      const fresh = page.messages.filter((message) => !seen.has(message.id));

      if (fresh.length === 0) {
        break;
      }

      for (const message of fresh) {
        seen.add(message.id);
        messages.push(message);
      }

      cursor = fresh[fresh.length - 1]?.id;
      if (!cursor) {
        break;
      }
    }

    let nextCursor: string | null = null;
    const oldestLoaded = messages[messages.length - 1];
    if (oldestLoaded) {
      const probe = await this.client.getChatHistory(chatId, 2, oldestLoaded.id);
      const olderMessages = probe.messages.filter((message) => !seen.has(message.id));
      if (olderMessages.length > 0) {
        nextCursor = String(oldestLoaded.id);
      }
    }

    return {
      messages,
      nextCursor,
    };
  }
}
