import type { TdChat, TdMessage, TdObject } from "../tdlib/types";
import type { RenderableResult } from "../output/result";

export interface NormalizedChat {
  chat_id: number;
  title: string;
  type: string;
  unread_count: number;
  last_message: NormalizedMessage | null;
}

export interface NormalizedMessage {
  id: number;
  chat_id: number;
  date: number;
  direction: "outgoing" | "incoming";
  text: string;
}

export interface AuthStatusPayload {
  env: string;
  authorized: boolean;
  state: string;
  me?: {
    id: number;
    first_name: string;
    last_name: string;
    usernames: string[];
  };
}

export interface ChatListPayload {
  env: string;
  chats: NormalizedChat[];
}

export interface ChatReadPayload {
  env: string;
  conversation: NormalizedChat;
  messages: NormalizedMessage[];
  next_cursor: string | null;
}

export interface SearchPayload {
  env: string;
  scope: "chats" | "messages";
  query: string;
  chats?: NormalizedChat[];
  conversation?: NormalizedChat;
  total_count?: number;
  messages?: NormalizedMessage[];
  next_cursor: string | null;
}

export interface SendMessagePayload {
  env: string;
  conversation: NormalizedChat;
  message: NormalizedMessage;
}

export interface MarkReadPayload {
  env: string;
  conversation: NormalizedChat;
  message_ids: number[];
}

function normalizeInline(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactChat(chat: NormalizedChat): string {
  return [
    chat.type,
    `chat_id=${chat.chat_id}`,
    `title=${normalizeInline(chat.title) || "-"}`,
    `unread=${chat.unread_count}`,
  ].join(" | ");
}

function compactMessage(message: NormalizedMessage): string {
  const parts = [
    `[${message.id}]`,
    message.direction,
    `chat_id=${message.chat_id}`,
    `date=${message.date}`,
  ];
  const text = normalizeInline(message.text);
  if (text) {
    parts.push(`text=${text}`);
  }
  return parts.join(" | ");
}

function compactConversation(conversation?: NormalizedChat): string[] {
  if (!conversation) {
    return [];
  }
  return [`conversation | ${compactChat(conversation)}`];
}

export function extractMessageText(content?: TdObject) {
  if (!content) {
    return "";
  }

  const text = content.text as TdObject | undefined;
  if (content["@type"] === "messageText" && typeof text?.text === "string") {
    return text.text;
  }

  return content["@type"];
}

export function normalizeMessage(message: TdMessage): NormalizedMessage {
  return {
    id: message.id,
    chat_id: message.chat_id,
    date: message.date,
    direction: message.is_outgoing ? "outgoing" : "incoming",
    text: extractMessageText(message.content),
  };
}

export function normalizeChat(chat: TdChat): NormalizedChat {
  return {
    chat_id: chat.id,
    title: chat.title,
    type: (chat.type?.["@type"] as string | undefined) ?? "unknown",
    unread_count: chat.unread_count ?? 0,
    last_message: chat.last_message ? normalizeMessage(chat.last_message) : null,
  };
}

export class AuthStatusResult implements RenderableResult<AuthStatusPayload> {
  constructor(private readonly payload: AuthStatusPayload) {}

  toFull() {
    return this.payload;
  }

  toCompact() {
    const parts = [
      "auth",
      `env=${this.payload.env}`,
      `authorized=${this.payload.authorized}`,
      `state=${this.payload.state}`,
    ];

    if (this.payload.me) {
      const name = normalizeInline(
        [this.payload.me.first_name, this.payload.me.last_name].filter(Boolean).join(" "),
      );
      parts.push(`user_id=${this.payload.me.id}`);
      if (name) {
        parts.push(`name=${name}`);
      }
    }

    return parts.join(" | ");
  }
}

export class ChatListResult implements RenderableResult<ChatListPayload> {
  constructor(private readonly payload: ChatListPayload) {}

  toFull() {
    return this.payload;
  }

  toCompact() {
    const lines = [`list | env=${this.payload.env}`];
    if (this.payload.chats.length === 0) {
      lines.push("no chats");
      return lines.join("\n");
    }
    lines.push(...this.payload.chats.map((chat) => compactChat(chat)));
    return lines.join("\n");
  }
}

export class ChatReadResult implements RenderableResult<ChatReadPayload> {
  constructor(private readonly payload: ChatReadPayload) {}

  toFull() {
    return this.payload;
  }

  toCompact() {
    const lines = [`read | env=${this.payload.env}`];
    lines.push(...compactConversation(this.payload.conversation));
    if (this.payload.messages.length === 0) {
      lines.push("no messages");
      lines.push(`next_cursor=${this.payload.next_cursor ?? "-"}`);
      return lines.join("\n");
    }
    lines.push(...this.payload.messages.map((message) => compactMessage(message)));
    lines.push(`next_cursor=${this.payload.next_cursor ?? "-"}`);
    return lines.join("\n");
  }
}

export class SearchResult implements RenderableResult<SearchPayload> {
  constructor(private readonly payload: SearchPayload) {}

  toFull() {
    return this.payload;
  }

  toCompact() {
    const lines = [
      `search | env=${this.payload.env} | scope=${this.payload.scope} | query=${normalizeInline(this.payload.query) || "-"}`,
    ];

    if (this.payload.scope === "chats") {
      const chats = this.payload.chats ?? [];
      if (chats.length === 0) {
        lines.push("no chats");
        return lines.join("\n");
      }
      lines.push(...chats.map((chat) => compactChat(chat)));
      return lines.join("\n");
    }

    if (this.payload.total_count !== undefined) {
      lines.push(`total_count=${this.payload.total_count}`);
    }
    lines.push(...compactConversation(this.payload.conversation));

    const messages = this.payload.messages ?? [];
    if (messages.length === 0) {
      lines.push("no messages");
      if (this.payload.next_cursor) {
        lines.push(`next_cursor=${this.payload.next_cursor}`);
      }
      return lines.join("\n");
    }

    lines.push(...messages.map((message) => compactMessage(message)));
    if (this.payload.next_cursor) {
      lines.push(`next_cursor=${this.payload.next_cursor}`);
    }
    return lines.join("\n");
  }
}

export class SendMessageResult implements RenderableResult<SendMessagePayload> {
  constructor(private readonly payload: SendMessagePayload) {}

  toFull() {
    return this.payload;
  }

  toCompact() {
    return [
      `send | env=${this.payload.env}`,
      ...compactConversation(this.payload.conversation),
      `message | ${compactMessage(this.payload.message)}`,
    ].join("\n");
  }
}

export class MarkReadResult implements RenderableResult<MarkReadPayload> {
  constructor(private readonly payload: MarkReadPayload) {}

  toFull() {
    return this.payload;
  }

  toCompact() {
    return [
      `mark-read | env=${this.payload.env}`,
      ...compactConversation(this.payload.conversation),
      `message_ids=${this.payload.message_ids.length > 0 ? this.payload.message_ids.join(",") : "-"}`,
    ].join("\n");
  }
}
