import { describe, expect, test } from "bun:test";
import {
  AuthStatusResult,
  ChatListResult,
  ChatReadResult,
  SearchResult,
} from "../src/telegram/results";

describe("result compact output", () => {
  test("formats chat lists", () => {
    expect(
      new ChatListResult({
        env: "test",
        chats: [
          {
            chat_id: 1,
            title: "General",
            type: "chatTypePrivate",
            unread_count: 2,
            last_message: null,
          },
        ],
      }).toCompact(),
    ).toContain("chatTypePrivate | chat_id=1 | title=General | unread=2");
  });

  test("formats auth status", () => {
    expect(
      new AuthStatusResult({
        env: "test",
        authorized: true,
        state: "authorizationStateReady",
        me: {
          id: 42,
          first_name: "Igor",
          last_name: "Testanin",
          usernames: [],
        },
      }).toCompact(),
    ).toContain(
      "auth | env=test | authorized=true | state=authorizationStateReady | user_id=42 | name=Igor Testanin",
    );
  });

  test("formats search messages with next cursor", () => {
    expect(
      new SearchResult({
        env: "test",
        scope: "messages",
        query: "igor",
        total_count: 1,
        next_cursor: "99",
        messages: [
          {
            id: 10,
            direction: "incoming",
            chat_id: 5,
            date: 123,
            text: "hello  igor",
          },
        ],
      }).toCompact(),
    ).toContain("[10] | incoming | chat_id=5 | date=123 | text=hello igor");
  });

  test("formats read with explicit next cursor line", () => {
    expect(
      new ChatReadResult({
        env: "test",
        conversation: {
          chat_id: 1,
          title: "General",
          type: "chatTypePrivate",
          unread_count: 0,
          last_message: null,
        },
        messages: [],
        next_cursor: null,
      }).toCompact(),
    ).toContain("next_cursor=-");
  });
});
