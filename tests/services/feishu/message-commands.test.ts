import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createMessageCommandHandler, type MessageCommandDeps } from "../../../src/services/feishu/message-commands";
import type { NormalizedFeishuMessage } from "../../../src/services/feishu/normalize-message";

let msgCounter = 0;

function makeMsg(overrides: Partial<NormalizedFeishuMessage> = {}): NormalizedFeishuMessage {
  msgCounter += 1;
  return {
    messageId: `msg-${String(msgCounter).padStart(3, "0")}`,
    memberId: "user-001",
    chatId: "chat-001",
    chatType: "group",
    senderType: "user",
    messageType: "text",
    eventTime: String(Date.now()),
    rawText: "",
    parsedTags: [],
    attachmentCount: 0,
    attachmentTypes: [],
    documentText: "",
    documentParseStatus: "not_applicable" as const,
    eventUrl: "",
    mentionedBotIds: [],
    cleanedText: "",
    ...overrides,
  };
}

describe("message-commands fallback praise", () => {
  // ==========================================================================
  // Reusable mocks
  // ==========================================================================

  let sendTextMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function buildDeps(
    overrides: Partial<MessageCommandDeps> = {},
  ): MessageCommandDeps {
    sendTextMessage = vi.fn().mockResolvedValue({ messageId: "reply-msg-id" });

    return {
      feishuClient: {
        sendTextMessage: vi.fn().mockResolvedValue({ messageId: "msg-id" }),
        sendCardMessage: vi.fn().mockResolvedValue({ messageId: "card-id" }),
      } as any,
      lifecycle: {
        getActivePeriod: vi.fn().mockResolvedValue({ number: 1, id: "p1" }),
        getActiveWindow: vi.fn().mockResolvedValue(null),
        countMembers: vi.fn().mockResolvedValue({ total: 5, activeStudents: 3 }),
      } as any,
      cardDeps: {
        repo: {
          findMemberByOpenId: vi.fn().mockReturnValue({
            id: "member-001",
            displayName: "测试学员",
            roleType: "student",
            isParticipant: true,
            isExcludedFromBoard: false,
            currentLevel: 1,
          }),
        },
      } as any,
      autoReply: {
        sendTextMessage,
      } as any,
      ingestor: {
        ingest: vi.fn().mockReturnValue({ accepted: true }),
      },
      // Enable semantic scoring with a throwing LLM client to trigger fallback
      semanticScoring: {
        enabled: true,
        llmClient: {
          provider: "fake",
          model: "fake",
          multiScore: vi.fn().mockRejectedValue(new Error("LLM down")),
          score: vi.fn().mockRejectedValue(new Error("LLM down")),
        } as any,
      },
      ...overrides,
    };
  }

  // ==========================================================================
  // Fallback praise — LLM fails → keyword classifier → praise sent
  // ==========================================================================

  it("sends proactive praise via autoReply after fallback classifier scores total >= 3", async () => {
    const deps = buildDeps();
    const handler = createMessageCommandHandler(deps);

    // This text triggers H3(2)+G1(5)+G2(3)+C3(5)+C1(4)+K1 = 19 non-K1 total score
    await handler(
      makeMsg({
        rawText:
          "我完成视频学习了发现了一个很好的prompt模板分享给大家 https://example.com",
      }),
    );

    // The LLM client's multiScore is called first and fails
    // -> fallbackToLegacyClassifier runs -> ingestor accepts -> totalScore >= 3 -> praise sent
    // Wait for the fire-and-forget praise IIFE to resolve
    await vi.advanceTimersByTimeAsync(100);

    // Verify ingestor was called for non-K1 classified items
    const ingestCalls = (deps.ingestor!.ingest as ReturnType<typeof vi.fn>).mock.calls;
    expect(ingestCalls.length).toBeGreaterThanOrEqual(3);

    // Verify praise message was sent via autoReply (not feishuClient)
    const praiseCalls = sendTextMessage.mock.calls.filter(
      (call: any[]) => {
        const text = call[0]?.text ?? "";
        return typeof text === "string" && text.includes("@测试学员");
      },
    );
    expect(praiseCalls.length).toBe(1);

    const praiseText = praiseCalls[0][0].text as string;
    // Verify praise contains the member's name
    expect(praiseText).toContain("@测试学员");
    // Verify praise contains a score value
    expect(praiseText).toMatch(/(\d+) 分/);

    // Verify praise sends to the correct group chat (not a DM)
    const sentInput = praiseCalls[0][0];
    expect(sentInput.receiveId).toBe("chat-001");
    // Verify it is NOT sent as a reply (no replyMessageId)
    expect(sentInput.replyMessageId).toBeUndefined();
  });

  it("does NOT send praise when total score < 3", async () => {
    const deps = buildDeps();
    const handler = createMessageCommandHandler(deps);

    // Short text only triggers K1, which is skipped in fallback
    // Total non-K1 score = 0, below threshold of 3
    await handler(makeMsg({ rawText: "ok" }));

    await vi.advanceTimersByTimeAsync(100);

    // No praise should have been sent
    const praiseCalls = sendTextMessage.mock.calls.filter(
      (call: any[]) => {
        const text = call[0]?.text ?? "";
        return typeof text === "string" && text.includes("太棒了");
      },
    );
    expect(praiseCalls.length).toBe(0);
  });
});
