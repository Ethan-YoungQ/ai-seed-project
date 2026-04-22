import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createConversationMemory } from "../../../../src/services/feishu/chat-bot/conversation-memory";

describe("ConversationMemory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty array for unknown user", () => {
    const mem = createConversationMemory();
    expect(mem.get("unknown")).toEqual([]);
  });

  it("returns user and assistant messages after append", () => {
    const mem = createConversationMemory();
    mem.append("u1", "你好", "你好，我是助教");
    expect(mem.get("u1")).toEqual([
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好，我是助教" }
    ]);
  });

  it("caps at 3 turns, dropping oldest", () => {
    const mem = createConversationMemory();
    mem.append("u1", "q1", "a1");
    mem.append("u1", "q2", "a2");
    mem.append("u1", "q3", "a3");
    mem.append("u1", "q4", "a4");

    const history = mem.get("u1");
    expect(history).toHaveLength(6);
    expect(history[0]).toEqual({ role: "user", content: "q2" });
    expect(history[5]).toEqual({ role: "assistant", content: "a4" });
  });

  it("expires turns older than 5 minutes", () => {
    const mem = createConversationMemory();
    mem.append("u1", "q1", "a1");

    vi.advanceTimersByTime(6 * 60 * 1000);

    expect(mem.get("u1")).toEqual([]);
  });

  it("keeps recent turns when some expire", () => {
    const mem = createConversationMemory();
    mem.append("u1", "q1", "a1");

    vi.advanceTimersByTime(4 * 60 * 1000);
    mem.append("u1", "q2", "a2");

    vi.advanceTimersByTime(2 * 60 * 1000);

    const history = mem.get("u1");
    expect(history).toEqual([
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" }
    ]);
  });

  it("isolates memory per user", () => {
    const mem = createConversationMemory();
    mem.append("u1", "q1", "a1");
    mem.append("u2", "q2", "a2");

    expect(mem.get("u1")).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" }
    ]);
    expect(mem.get("u2")).toEqual([
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" }
    ]);
  });
});
