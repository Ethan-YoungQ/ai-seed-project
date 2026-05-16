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
    expect(praiseText.length).toBeLessThanOrEqual(120);
    expect(praiseText).toMatch(/AI|prompt|链接|分享|实战|作品|作业|流程|亮点|脑洞|拿捏|封神|炸场|绝|秀|硬核/i);
    expect(praiseText).not.toContain("多个维度全面开花");

    // Verify praise sends to the correct group chat (not a DM)
    const sentInput = praiseCalls[0][0];
    expect(sentInput.receiveId).toBe("chat-001");
    // Verify it is NOT sent as a reply (no replyMessageId)
    expect(sentInput.replyMessageId).toBeUndefined();
  });

  it("uses LLM-generated praise after semantic scoring accepts a high-score contribution", async () => {
    vi.setSystemTime(new Date("2026-04-29T12:03:00Z"));
    const chat = vi.fn().mockResolvedValue("@测试学员 这份 AI 流程设计太会抓重点了，业务痛点被你一把拿捏，6 分含金量拉满！");
    const deps = buildDeps({
      semanticScoring: {
        enabled: true,
        llmClient: {
          provider: "fake",
          model: "fake",
          multiScore: vi.fn().mockResolvedValue({
            items: [
              { code: "C1", score: 4, reason: "AI 工具实战" },
              { code: "G2", score: 3, reason: "经验分享" },
            ],
            raw: null,
          }),
          score: vi.fn(),
          chat,
        } as any,
      },
    });
    const handler = createMessageCommandHandler(deps);

    await handler(
      makeMsg({
        rawText:
          "我用 AI 设计了一套肺癌高危人群定位流程，并把 prompt 和复盘经验分享给大家。",
      }),
    );

    await vi.advanceTimersByTimeAsync(100);

    expect(chat).toHaveBeenCalledTimes(1);
    const praiseCalls = sendTextMessage.mock.calls.filter(
      (call: any[]) => typeof call[0]?.text === "string" && call[0].text.includes("@测试学员"),
    );
    expect(praiseCalls.length).toBe(1);
    expect(praiseCalls[0][0].text).toContain("业务痛点");
    expect(praiseCalls[0][0].replyMessageId).toBeUndefined();
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

describe("message-commands chat bot recent context", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records recent group messages and passes resolved context blocks to ChatEngine", async () => {
    const reply = vi.fn().mockResolvedValue({
      replyText: "结合你的 PDF 看，第二提问方向是准确的。",
      used: "llm",
      latencyMs: 12,
    });
    const record = vi.fn();
    const resolveMentionContext = vi.fn().mockResolvedValue([
      {
        title: "用户最近文件",
        content: "文件名：个人报告任务一李洁娴.pdf\n内容摘录：第二提问：业务场景客户触达",
      },
    ]);
    const sendTextMessage = vi.fn().mockResolvedValue({ messageId: "reply-001" });
    const deps: MessageCommandDeps = {
      feishuClient: {
        sendTextMessage,
        sendCardMessage: vi.fn().mockResolvedValue({ messageId: "card-001" }),
      } as any,
      lifecycle: {} as any,
      cardDeps: { repo: { findMemberByOpenId: vi.fn() } } as any,
      chatBot: {
        botOpenId: "ou_bot",
        engine: { reply },
        contextProvider: {
          record,
          resolveMentionContext,
        },
      },
    };
    const handler = createMessageCommandHandler(deps);

    await handler(makeMsg({
      messageId: "om_file_lijiexian",
      messageType: "file",
      rawText: "",
      fileKey: "file_v3_lijiexian",
      fileName: "个人报告任务一李洁娴.pdf",
      fileExt: "pdf",
      documentParseStatus: "pending",
    }));
    await handler(makeMsg({
      messageId: "om_mention_lijiexian",
      rawText: "@_user_1 麻烦结合我交的作业，分析针对业务场景的第二提问是否准确，谢谢",
      cleanedText: "麻烦结合我交的作业，分析针对业务场景的第二提问是否准确，谢谢",
      mentionedBotIds: ["ou_bot"],
    }));

    await vi.advanceTimersByTimeAsync(1);

    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "om_file_lijiexian",
      fileName: "个人报告任务一李洁娴.pdf",
    }));
    expect(resolveMentionContext).toHaveBeenCalledWith(expect.objectContaining({
      currentMessage: expect.objectContaining({ messageId: "om_mention_lijiexian" }),
      feishuClient: deps.feishuClient,
    }));
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      cleanedText: "麻烦结合我交的作业，分析针对业务场景的第二提问是否准确，谢谢",
      contextBlocks: [
        {
          title: "用户最近文件",
          content: "文件名：个人报告任务一李洁娴.pdf\n内容摘录：第二提问：业务场景客户触达",
        },
      ],
    }));
    expect(sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({
      receiveId: "chat-001",
      text: "结合你的 PDF 看，第二提问方向是准确的。",
    }));
  });
});

describe("message-commands AI Boot v3 routing", () => {
  function buildDeps(
    overrides: Partial<MessageCommandDeps> = {},
  ): MessageCommandDeps {
    return {
      feishuClient: {
        sendTextMessage: vi.fn().mockResolvedValue({ messageId: "msg-id" }),
        sendCardMessage: vi.fn().mockResolvedValue({ messageId: "card-id" }),
      } as any,
      lifecycle: {} as any,
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
      ingestor: {
        ingest: vi.fn().mockReturnValue({ accepted: true }),
      },
      aiBootConfig: {
        engineMode: "v3_live",
        allowGroupPraise: false,
        allowDailyDigest: false,
      },
      aiBootOrchestrator: {
        handleMessage: vi.fn().mockResolvedValue(undefined),
      },
      ...overrides,
    };
  }

  it("routes v3_live auto-capture messages to AI Boot v3 and skips legacy ingestor scoring", async () => {
    const deps = buildDeps();
    const handler = createMessageCommandHandler(deps);
    const msg = makeMsg({ rawText: "我用 AI 完成了一张客户沟通海报。" });

    await handler(msg);

    expect(deps.aiBootOrchestrator?.handleMessage).toHaveBeenCalledWith(msg);
    expect(deps.ingestor?.ingest).not.toHaveBeenCalled();
  });

  it("runs v3_shadow as a sidecar while keeping legacy auto-capture scoring", async () => {
    const deps = buildDeps({
      aiBootConfig: {
        engineMode: "v3_shadow",
        allowGroupPraise: false,
        allowDailyDigest: false,
      },
    });
    const handler = createMessageCommandHandler(deps);
    const msg = makeMsg({
      rawText: "我完成视频学习了，分享一个 prompt 模板给大家 https://example.com",
    });

    await handler(msg);

    expect(deps.aiBootOrchestrator?.handleMessage).toHaveBeenCalledWith(msg);
    const ingestCalls = (deps.ingestor!.ingest as ReturnType<typeof vi.fn>).mock.calls;
    expect(ingestCalls).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ itemCode: "K1", sourceRef: `msg:${msg.messageId}:K1` })],
        [expect.objectContaining({ itemCode: "H3", sourceRef: `msg:${msg.messageId}:H3` })],
        [expect.objectContaining({ itemCode: "G2", sourceRef: `msg:${msg.messageId}:G2` })],
      ]),
    );
  });

  it("keeps @Bot chat path ahead of AI Boot v3 routing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T12:00:00Z"));
    const reply = vi.fn().mockResolvedValue({
      replyText: "这是聊天回复。",
      used: "llm",
      latencyMs: 1,
    });
    const deps = buildDeps({
      chatBot: {
        botOpenId: "ou_bot",
        engine: { reply },
        contextProvider: {
          record: vi.fn(),
          resolveMentionContext: vi.fn().mockResolvedValue([]),
        },
      },
    });
    const handler = createMessageCommandHandler(deps);

    await handler(makeMsg({
      rawText: "@_user_1 这个怎么提交？",
      cleanedText: "这个怎么提交？",
      mentionedBotIds: ["ou_bot"],
    }));
    await vi.advanceTimersByTimeAsync(1);

    expect(deps.aiBootOrchestrator?.handleMessage).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
