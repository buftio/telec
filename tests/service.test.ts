import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { TelegramService } from "../src/telegram/service";

class MockClient {
  authStatus = {
    ready: true,
    state: "authorizationStateReady",
  };

  async getMe() {
    return {
      "@type": "user",
      id: 1,
      first_name: "Igor",
      last_name: "O",
      usernames: {
        active_usernames: ["buft"],
      },
    };
  }

  getAuthorizationStatus() {
    return this.authStatus;
  }

  async listChats(_chatList: unknown, _limit: number) {
    return [
      {
        "@type": "chat",
        id: 100,
        title: "Alex",
        unread_count: 3,
        type: { "@type": "chatTypePrivate" },
      },
    ];
  }

  getKnownChats() {
    return [];
  }

  async getChat(chatId: number) {
    return {
      "@type": "chat",
      id: chatId,
      title: "Alex",
      unread_count: 3,
      type: { "@type": "chatTypePrivate" },
    };
  }

  async createPrivateChat(userId: number) {
    return {
      "@type": "chat",
      id: userId,
      title: "Saved Messages",
      unread_count: 0,
      type: { "@type": "chatTypePrivate" },
    };
  }

  async getMessage(chatId: number, messageId: number) {
    return {
      "@type": "message",
      id: messageId,
      chat_id: chatId,
      date: 4000,
      is_outgoing: true,
      content: {
        "@type": "messageDocument",
        document: {
          "@type": "document",
          file_name: "report.pdf",
          mime_type: "application/pdf",
          document: {
            "@type": "file",
            id: 700,
            local: {
              "@type": "localFile",
              path: "/tmp/source-report.pdf",
            },
          },
        },
      },
    };
  }

  async downloadFile(fileId: number) {
    return {
      "@type": "file",
      id: fileId,
      local: {
        "@type": "localFile",
        path: "/tmp/source-report.pdf",
      },
    };
  }

  async waitForMessageSent(chatId: number, messageId: number) {
    return {
      "@type": "message",
      id: messageId + 1,
      chat_id: chatId,
      date: 1236,
      is_outgoing: true,
      content: {
        "@type": "messageDocument",
        document: {
          "@type": "document",
          file_name: "demo.pdf",
          mime_type: "application/pdf",
          document: {
            "@type": "file",
            id: 701,
          },
        },
      },
    };
  }

  async getChatHistory(chatId: number, limit: number) {
    return {
      "@type": "messages",
      messages: Array.from({ length: limit }, (_, index) => ({
        "@type": "message",
        id: index + 1,
        chat_id: chatId,
        date: 1000 + index,
        is_outgoing: false,
        content: {
          "@type": "messageText",
          text: {
            "@type": "formattedText",
            text: `message ${index + 1}`,
          },
        },
      })),
    };
  }

  async request(payload: Record<string, unknown>) {
    if (payload["@type"] === "sendMessage") {
      const content = payload.input_message_content as any;
      if (content["@type"] === "inputMessageDocument") {
        return {
          "@type": "message",
          id: 1001,
          chat_id: payload.chat_id,
          date: 1235,
          is_outgoing: true,
          sending_state: {
            "@type": "messageSendingStatePending",
            sending_id: 0,
          },
          content: {
            "@type": "messageDocument",
            caption: {
              "@type": "formattedText",
              text: content.caption.text as string,
            },
            document: {
              "@type": "document",
              file_name: "demo.pdf",
              mime_type: "application/pdf",
              document: {
                "@type": "file",
                id: 701,
              },
            },
          },
        };
      }

      return {
        "@type": "message",
        id: 999,
        chat_id: payload.chat_id,
        date: 1234,
        is_outgoing: true,
        content: {
          "@type": "messageText",
          text: {
            "@type": "formattedText",
            text: (payload.input_message_content as any).text.text as string,
          },
        },
      };
    }

    if (payload["@type"] === "viewMessages") {
      return { "@type": "ok" };
    }

    if (payload["@type"] === "searchContacts") {
      return {
        "@type": "users",
        user_ids: [],
      };
    }

    if (payload["@type"] === "searchMessages") {
      return {
        "@type": "foundMessages",
        total_count: 1,
        messages: [
          {
            "@type": "message",
            id: 77,
            chat_id: 100,
            date: 2222,
            is_outgoing: false,
            content: {
              "@type": "messageText",
              text: {
                "@type": "formattedText",
                text: "igor result",
              },
            },
          },
        ],
        next_offset: "next-token",
      };
    }

    throw new Error(`Unhandled payload: ${payload["@type"]}`);
  }

  async getUser() {
    throw new Error("not used");
  }

  async searchChats() {
    return [
      {
        "@type": "chat",
        id: 100,
        title: "Alex",
        unread_count: 3,
        type: { "@type": "chatTypePrivate" },
      },
    ];
  }

  async searchChatMessages(chatId: number, _query: string, limit: number) {
    return {
      "@type": "foundChatMessages",
      total_count: limit,
      messages: Array.from({ length: limit }, (_, index) => ({
        "@type": "message",
        id: index + 10,
        chat_id: chatId,
        date: 3000 + index,
        is_outgoing: false,
        content: {
          "@type": "messageText",
          text: {
            "@type": "formattedText",
            text: `match ${index + 1}`,
          },
        },
      })),
      next_from_message_id: 99,
    };
  }

  async searchMessages(_query: string, _limit: number, _offset?: string) {
    return {
      "@type": "foundMessages",
      total_count: 1,
      messages: [
        {
          "@type": "message",
          id: 77,
          chat_id: 100,
          date: 2222,
          is_outgoing: false,
          content: {
            "@type": "messageText",
            text: {
              "@type": "formattedText",
              text: "igor result",
            },
          },
        },
      ],
      next_offset: "next-token",
    };
  }
}

describe("TelegramService", () => {
  test("returns auth status", async () => {
    const service = new TelegramService(new MockClient() as any, "test");
    const status = await service.getAuthStatus();
    const full = status.toFull();
    expect(full.authorized).toBe(true);
    expect(full.me?.usernames).toEqual(["buft"]);
  });

  test("returns paginated read response", async () => {
    const client = new MockClient();
    client.getChatHistory = async (chatId: number, limit: number, fromMessageId?: number) => {
      if (!fromMessageId) {
        return {
          "@type": "messages",
          messages: [
            {
              "@type": "message",
              id: 3,
              chat_id: chatId,
              date: 1003,
              is_outgoing: false,
              content: {
                "@type": "messageText",
                text: {
                  "@type": "formattedText",
                  text: "message 3",
                },
              },
            },
            {
              "@type": "message",
              id: 2,
              chat_id: chatId,
              date: 1002,
              is_outgoing: false,
              content: {
                "@type": "messageText",
                text: {
                  "@type": "formattedText",
                  text: "message 2",
                },
              },
            },
          ].slice(0, limit),
        };
      }

      if (fromMessageId === 2) {
        return {
          "@type": "messages",
          messages: [
            {
              "@type": "message",
              id: 2,
              chat_id: chatId,
              date: 1002,
              is_outgoing: false,
              content: {
                "@type": "messageText",
                text: {
                  "@type": "formattedText",
                  text: "message 2",
                },
              },
            },
            {
              "@type": "message",
              id: 1,
              chat_id: chatId,
              date: 1001,
              is_outgoing: false,
              content: {
                "@type": "messageText",
                text: {
                  "@type": "formattedText",
                  text: "message 1",
                },
              },
            },
          ].slice(0, limit),
        };
      }

      return {
        "@type": "messages",
        messages: [],
      };
    };

    const service = new TelegramService(client as any, "test");
    const response = await service.readChat({
      conversationId: "100",
      limit: 2,
    });
    const full = response.toFull();
    expect(full.messages).toHaveLength(2);
    expect(full.next_cursor).toBe("2");
  });

  test("returns global search response", async () => {
    const service = new TelegramService(new MockClient() as any, "test");
    const response = await service.search({
      query: "igor",
      scope: "messages",
      limit: 10,
    });
    const full = response.toFull();
    expect(full.messages).toHaveLength(1);
    expect(full.next_cursor).toBe("next-token");
  });

  test("falls back to local chat titles for chat search", async () => {
    const client = new MockClient();
    client.searchChats = async () => [];

    const service = new TelegramService(client as any, "test");
    const response = await service.search({
      query: "al",
      scope: "chats",
      limit: 10,
    });

    const full = response.toFull();
    expect(full.chats).toHaveLength(1);
    expect(full.chats?.[0]?.title).toBe("Alex");
  });

  test("keeps fetching history when TDLib returns partial pages", async () => {
    const client = new MockClient();
    client.getChatHistory = async (_chatId: number, _limit: number, fromMessageId?: number) => {
      if (!fromMessageId) {
        return {
          "@type": "messages",
          messages: [
            {
              "@type": "message",
              id: 3,
              chat_id: 100,
              date: 1003,
              is_outgoing: false,
              content: {
                "@type": "messageText",
                text: {
                  "@type": "formattedText",
                  text: "message 3",
                },
              },
            },
          ],
        };
      }

      if (fromMessageId === 3) {
        return {
          "@type": "messages",
          messages: [
            {
              "@type": "message",
              id: 2,
              chat_id: 100,
              date: 1002,
              is_outgoing: false,
              content: {
                "@type": "messageText",
                text: {
                  "@type": "formattedText",
                  text: "message 2",
                },
              },
            },
          ],
        };
      }

      if (fromMessageId === 2) {
        return {
          "@type": "messages",
          messages: [
            {
              "@type": "message",
              id: 1,
              chat_id: 100,
              date: 1001,
              is_outgoing: false,
              content: {
                "@type": "messageText",
                text: {
                  "@type": "formattedText",
                  text: "message 1",
                },
              },
            },
          ],
        };
      }

      return {
        "@type": "messages",
        messages: [],
      };
    };

    const service = new TelegramService(client as any, "test");
    const response = await service.readChat({
      conversationId: "100",
      limit: 10,
    });

    const full = response.toFull();
    expect(full.messages).toHaveLength(3);
    expect(full.messages.map((message) => message.id)).toEqual([3, 2, 1]);
    expect(full.next_cursor).toBeNull();
  });

  test("sends files to saved messages", async () => {
    const service = new TelegramService(new MockClient() as any, "test");
    const response = await service.sendFile({
      conversationId: "saved",
      filePath: "/tmp/demo.pdf",
      caption: "hello",
    });

    const full = response.toFull();
    expect(full.conversation.chat_id).toBe(1);
    expect(full.file.file_name).toBe("demo.pdf");
    expect(full.file.caption).toBe("hello");
    expect(full.message.id).toBe(1002);
    expect(full.message.text).toBe("messageDocument");
  });

  test("downloads a document attachment to the requested path", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "telec-download-"));
    const sourcePath = path.join(tempDir, "source-report.pdf");
    const outputPath = path.join(tempDir, "copied-report.pdf");
    await writeFile(sourcePath, "pdf-data");

    const client = new MockClient();
    client.getMessage = async (chatId: number, messageId: number) => ({
      "@type": "message",
      id: messageId,
      chat_id: chatId,
      date: 4000,
      is_outgoing: true,
      content: {
        "@type": "messageDocument",
        document: {
          "@type": "document",
          file_name: "report.pdf",
          mime_type: "application/pdf",
          document: {
            "@type": "file",
            id: 700,
            local: {
              "@type": "localFile",
              path: sourcePath,
            },
          },
        },
      },
    });
    client.downloadFile = async (fileId: number) => ({
      "@type": "file",
      id: fileId,
      local: {
        "@type": "localFile",
        path: sourcePath,
      },
    });

    try {
      const service = new TelegramService(client as any, "test");
      const response = await service.downloadFile({
        conversationId: "saved",
        messageId: 55,
        outputPath,
      });

      const full = response.toFull();
      expect(full.file.file_id).toBe(700);
      expect(full.file.saved_path).toBe(outputPath);
      expect(await readFile(outputPath, "utf8")).toBe("pdf-data");
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});
