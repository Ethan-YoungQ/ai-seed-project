import { describe, expect, it, vi } from "vitest";
import { createChatEngine } from "../../../../src/services/feishu/chat-bot/chat-engine";
import { createConversationMemory } from "../../../../src/services/feishu/chat-bot/conversation-memory";
import { createRateLimiter } from "../../../../src/services/feishu/chat-bot/rate-limiter";
import type { LlmChatClient, ChatMessage } from "../../../../src/services/v2/llm-scoring-client";
import { LlmRetryableError } from "../../../../src/domain/v2/errors";

function makeFakeClient(responses: string[]): LlmChatClient {
  const queue = [...responses];
  return {
    provider: "fake",
    model: "fake-v1",
    async chat(_messages: ChatMessage[]): Promise<string> {
      const next = queue.shift();
      if (next === undefined) throw new Error("fake queue exhausted");
      return next;
    }
  };
}

function makeThrowingClient(err: Error): LlmChatClient {
  return {
    provider: "fake",
    model: "fake-v1",
    async chat(): Promise<string> {
      throw err;
    }
  };
}

function makeRepoStub(members: Record<string, { displayName: string; roleType: string }>) {
  return {
    findMemberByOpenId(openId: string) {
      const m = members[openId];
      if (!m) return null;
      return {
        id: `id-${openId}`,
        displayName: m.displayName,
        roleType: m.roleType,
        isParticipant: true,
        isExcludedFromBoard: false,
        currentLevel: 1
      };
    }
  };
}

describe("ChatEngine.reply", () => {
  it("returns empty_prompt when cleanedText is blank", async () => {
    const engine = createChatEngine({
      llmClient: makeFakeClient([]),
      memory: createConversationMemory(),
      rateLimiter: createRateLimiter(),
      repo: makeRepoStub({})
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "u1",
      messageId: "m1",
      cleanedText: ""
    });

    expect(result.used).toBe("empty_prompt");
    expect(result.replyText).toContain("有什么可以帮你的");
  });

  it("returns LLM response for student without appending a fixed ending", async () => {
    const engine = createChatEngine({
      llmClient: makeFakeClient(["RAG 是检索增强生成"]),
      memory: createConversationMemory(),
      rateLimiter: createRateLimiter(),
      repo: makeRepoStub({ u1: { displayName: "李明", roleType: "student" } })
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "u1",
      messageId: "m1",
      cleanedText: "什么是 RAG？"
    });

    expect(result.used).toBe("llm");
    expect(result.replyText).toContain("RAG 是检索增强生成");
    expect(result.replyText).not.toContain("欢迎其他同学");
  });

  it("returns LLM response without encouragement for trainer", async () => {
    const engine = createChatEngine({
      llmClient: makeFakeClient(["答案是 C"]),
      memory: createConversationMemory(),
      rateLimiter: createRateLimiter(),
      repo: makeRepoStub({ k1: { displayName: "Karen", roleType: "trainer" } })
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "k1",
      messageId: "m1",
      cleanedText: "测验第三题选什么"
    });

    expect(result.used).toBe("llm");
    expect(result.replyText).toContain("答案是 C");
    expect(result.replyText).not.toContain("欢迎其他同学");
  });

  it("returns rate_limited when cooldown active", async () => {
    const rl = createRateLimiter();
    rl.markUsed("u1", "c1");

    const engine = createChatEngine({
      llmClient: makeFakeClient([]),
      memory: createConversationMemory(),
      rateLimiter: rl,
      repo: makeRepoStub({ u1: { displayName: "李明", roleType: "student" } })
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "u1",
      messageId: "m1",
      cleanedText: "hello"
    });

    expect(result.used).toBe("rate_limited");
    expect(result.replyText).toContain("30");
  });

  it("returns error_fallback when LLM fails after retry", async () => {
    const engine = createChatEngine({
      llmClient: makeThrowingClient(new LlmRetryableError("timeout")),
      memory: createConversationMemory(),
      rateLimiter: createRateLimiter(),
      repo: makeRepoStub({ u1: { displayName: "李明", roleType: "student" } })
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "u1",
      messageId: "m1",
      cleanedText: "hello"
    });

    expect(result.used).toBe("error_fallback");
    expect(result.replyText).toContain("稍后再问");
  });

  it("includes conversation history in second turn", async () => {
    const llm = vi.fn().mockResolvedValueOnce("R1").mockResolvedValueOnce("R2");
    const engine = createChatEngine({
      llmClient: {
        provider: "fake",
        model: "fake-v1",
        chat: llm
      },
      memory: createConversationMemory(),
      rateLimiter: { check: () => ({ allowed: true }), markUsed: () => { /* noop */ } },
      repo: makeRepoStub({ u1: { displayName: "李明", roleType: "student" } })
    });

    await engine.reply({ chatId: "c1", openId: "u1", messageId: "m1", cleanedText: "Q1" });
    await engine.reply({ chatId: "c1", openId: "u1", messageId: "m2", cleanedText: "Q2" });

    expect(llm).toHaveBeenCalledTimes(2);
    const secondCallMessages = llm.mock.calls[1][0];
    expect(secondCallMessages).toHaveLength(4);
    expect(secondCallMessages[0].role).toBe("system");
    expect(secondCallMessages[1]).toEqual({ role: "user", content: "Q1" });
    expect(secondCallMessages[2]).toEqual({ role: "assistant", content: "R1" });
    expect(secondCallMessages[3]).toEqual({ role: "user", content: "Q2" });
  });

  it("injects recent chat context before the user question", async () => {
    const llm = vi.fn().mockResolvedValue("你的第二提问基本准确，但业务对象需要更具体。");
    const engine = createChatEngine({
      llmClient: {
        provider: "fake",
        model: "fake-v1",
        chat: llm
      },
      memory: createConversationMemory(),
      rateLimiter: { check: () => ({ allowed: true }), markUsed: () => { /* noop */ } },
      repo: makeRepoStub({ u1: { displayName: "李洁娴", roleType: "student" } })
    });

    await engine.reply({
      chatId: "c1",
      openId: "u1",
      messageId: "m2",
      cleanedText: "麻烦结合我交的作业，分析针对业务场景的第二提问是否准确",
      contextBlocks: [
        {
          title: "用户最近文件",
          content: "文件名：个人报告任务一李洁娴.pdf\n内容摘录：第二提问：业务场景中如何设计更精准的客户触达？"
        }
      ]
    });

    expect(llm).toHaveBeenCalledTimes(1);
    const messages = llm.mock.calls[0][0] as ChatMessage[];
    expect(messages.at(-2)).toEqual({
      role: "user",
      content: expect.stringContaining("用户最近文件")
    });
    expect(messages.at(-2)?.content).toContain("个人报告任务一李洁娴.pdf");
    expect(messages.at(-2)?.content).toContain("第二提问");
    expect(messages.at(-1)).toEqual({
      role: "user",
      content: "麻烦结合我交的作业，分析针对业务场景的第二提问是否准确"
    });
  });

  it("defaults to student role when member not found", async () => {
    const engine = createChatEngine({
      llmClient: makeFakeClient(["answer"]),
      memory: createConversationMemory(),
      rateLimiter: createRateLimiter(),
      repo: makeRepoStub({})
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "unknown",
      messageId: "m1",
      cleanedText: "hi"
    });

    expect(result.used).toBe("llm");
    expect(result.replyText).not.toContain("欢迎其他同学");
  });

  it("answers level and potential-stock questions from score facts without calling the LLM", async () => {
    const llm = vi.fn().mockResolvedValue("泛泛而谈的回答");
    const engine = createChatEngine({
      llmClient: {
        provider: "fake",
        model: "fake-v1",
        chat: llm,
      },
      memory: createConversationMemory(),
      rateLimiter: createRateLimiter(),
      repo: {
        findMemberByOpenId(openId: string) {
          if (openId !== "grace") return null;
          return {
            id: "member-grace",
            displayName: "Grace",
            roleType: "student",
            isParticipant: true,
            isExcludedFromBoard: false,
            currentLevel: 1,
          };
        },
        getLevelStatus(memberId: string) {
          expect(memberId).toBe("member-grace");
          return {
            memberName: "Grace",
            rank: 4,
            currentLevel: 1,
            currentLevelName: "AI 潜力股",
            nextLevel: 2,
            nextLevelName: "AI 研究员",
            totalScore: 26,
            dimensions: { K: 13, H: 13, C: 0, S: 0, G: 0 },
          };
        },
      },
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "grace",
      messageId: "m1",
      cleanedText: "为什么我还是潜力股[泣不成声]",
    });

    expect(result.used).toBe("level_status");
    expect(llm).not.toHaveBeenCalled();
    expect(result.replyText).toContain("Grace");
    expect(result.replyText).toContain("26 分");
    expect(result.replyText).toContain("K13 / H13 / C0 / S0 / G0");
    expect(result.replyText).toContain("缺少 C/S/G");
    expect(result.replyText).toContain("AI 研究员");
  });

  it("does not send level questions to the LLM when the sender is not on the student board", async () => {
    const llm = vi.fn().mockResolvedValue("泛泛而谈的回答");
    const engine = createChatEngine({
      llmClient: {
        provider: "fake",
        model: "fake-v1",
        chat: llm,
      },
      memory: createConversationMemory(),
      rateLimiter: createRateLimiter(),
      repo: {
        findMemberByOpenId(openId: string) {
          if (openId !== "operator") return null;
          return {
            id: "member-operator",
            displayName: "运营",
            roleType: "operator",
            isParticipant: true,
            isExcludedFromBoard: false,
            currentLevel: 1,
          };
        },
        getLevelStatus() {
          return null;
        },
      },
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "operator",
      messageId: "m1",
      cleanedText: "为什么我还是潜力股？",
    });

    expect(result.used).toBe("level_status");
    expect(llm).not.toHaveBeenCalled();
    expect(result.replyText).toContain("没有在学员天梯榜里找到");
  });
});
