import { CliError } from "../errors";
import type { TdChat, TdUser } from "../tdlib/types";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function bigrams(value: string) {
  const normalized = normalize(value).replace(/\s+/g, " ");
  if (normalized.length < 2) {
    return new Set([normalized]);
  }

  const grams = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    grams.add(normalized.slice(index, index + 2));
  }
  return grams;
}

export function scoreTitle(query: string, title: string) {
  const a = bigrams(query);
  const b = bigrams(title);
  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap / Math.max(a.size, b.size, 1);
}

export function selectChatByTitle(query: string, chats: TdChat[]) {
  const normalized = normalize(query);
  const exact = chats.filter((chat) => normalize(chat.title) === normalized);
  if (exact.length === 1) {
    return exact[0];
  }
  if (exact.length > 1) {
    throw new CliError(`Ambiguous exact title match for "${query}"`);
  }

  const fuzzyMatches = chats
    .map((chat) => ({
      chat,
      score: scoreTitle(query, chat.title),
    }))
    .filter((entry) => entry.score >= 0.2)
    .sort((left, right) => right.score - left.score);

  if (fuzzyMatches.length === 0) {
    throw new CliError(`Unable to resolve chat "${query}"`);
  }

  if (fuzzyMatches.length > 1 && fuzzyMatches[0].score - fuzzyMatches[1].score < 0.05) {
    const candidates = fuzzyMatches
      .slice(0, 5)
      .map(({ chat }) => `${chat.id}:${chat.title}`)
      .join(", ");
    throw new CliError(`Ambiguous chat selector "${query}". Candidates: ${candidates}`);
  }

  return fuzzyMatches[0].chat;
}

export function findUserByPhone(phone: string, users: TdUser[]) {
  const normalized = phone.replace(/[^0-9+]/g, "");
  return users.find((user) => user.phone_number?.replace(/[^0-9+]/g, "") === normalized);
}
