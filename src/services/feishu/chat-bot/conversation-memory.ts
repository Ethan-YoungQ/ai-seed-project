import type { ChatMessage } from "../../v2/llm-scoring-client.js";

const MAX_TURNS = 3;
const TTL_MS = 5 * 60 * 1000;

interface Turn {
  userText: string;
  botText: string;
  timestamp: number;
}

export interface ConversationMemory {
  get(openId: string): ChatMessage[];
  append(openId: string, userText: string, botText: string): void;
  clear(openId: string): void;
}

export function createConversationMemory(): ConversationMemory {
  const store = new Map<string, Turn[]>();

  function pruneExpired(turns: Turn[]): Turn[] {
    const cutoff = Date.now() - TTL_MS;
    return turns.filter((t) => t.timestamp >= cutoff);
  }

  return {
    get(openId: string): ChatMessage[] {
      const turns = store.get(openId);
      if (!turns) return [];

      const alive = pruneExpired(turns);
      if (alive.length !== turns.length) {
        if (alive.length === 0) {
          store.delete(openId);
        } else {
          store.set(openId, alive);
        }
      }

      const messages: ChatMessage[] = [];
      for (const t of alive) {
        messages.push({ role: "user", content: t.userText });
        messages.push({ role: "assistant", content: t.botText });
      }
      return messages;
    },

    append(openId: string, userText: string, botText: string): void {
      const existing = store.get(openId) ?? [];
      const alive = pruneExpired(existing);
      alive.push({ userText, botText, timestamp: Date.now() });
      while (alive.length > MAX_TURNS) {
        alive.shift();
      }
      store.set(openId, alive);
    },

    clear(openId: string): void {
      store.delete(openId);
    }
  };
}
