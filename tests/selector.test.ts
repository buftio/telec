import { describe, expect, test } from "bun:test";
import { CliError } from "../src/errors";
import { scoreTitle, selectChatByTitle } from "../src/telegram/selector";

describe("selector", () => {
  test("scores better matches higher", () => {
    expect(scoreTitle("alex", "Alex")).toBeGreaterThan(scoreTitle("alex", "Travel"));
  });

  test("rejects ambiguous fuzzy matches", () => {
    expect(() =>
      selectChatByTitle("alex", [
        { "@type": "chat", id: 1, title: "Alex One" },
        { "@type": "chat", id: 2, title: "Alex Two" },
      ]),
    ).toThrow(CliError);
  });
});
