import { describe, expect, it, vi } from "vitest";

import {
  createAiBootOrchestrator,
  type AiBootOrchestratorDeps,
} from "../../../../src/services/feishu/ai-boot/orchestrator";
import type {
  AiBootEventRecord,
  AiBootScoreEventRecord,
} from "../../../../src/domain/v3/ai-boot-types";
import type { NormalizedFeishuMessage } from "../../../../src/services/feishu/normalize-message";
import type { AiBootLlmClient } from "../../../../src/services/feishu/ai-boot/llm-decision-engine";

function message(overrides: Partial<NormalizedFeishuMessage> = {}): NormalizedFeishuMessage {
  return {
    messageId: "om-1",
    memberId: "ou-student",
    chatId: "chat-1",
    chatType: "group",
    senderType: "user",
    messageType: "text",
    eventTime: "2026-05-16T09:00:00.000Z",
    rawText: "我用 AI 做了一个客户拜访复盘表，并总结了三个改进点。",
    parsedTags: [],
    attachmentCount: 0,
    attachmentTypes: [],
    documentText: "",
    documentParseStatus: "not_applicable",
    eventUrl: "feishu://message/om-1",
    mentionedBotIds: [],
    cleanedText: "我用 AI 做了一个客户拜访复盘表，并总结了三个改进点。",
    ...overrides,
  };
}

function makeLlmClient(decision: Record<string, unknown>): AiBootLlmClient {
  return {
    provider: "test-provider",
    model: "test-model",
    chat: vi.fn().mockResolvedValue(JSON.stringify(decision)),
  };
}

function makeDeps(
  overrides: Partial<AiBootOrchestratorDeps> = {},
): AiBootOrchestratorDeps & {
  events: AiBootEventRecord[];
  scoreEvents: AiBootScoreEventRecord[];
} {
  const events: AiBootEventRecord[] = [];
  const scoreEvents: AiBootScoreEventRecord[] = [];
  const repo = {
    insertAiBootEvent: vi.fn((event: AiBootEventRecord) => {
      const existing = events.find(
        (row) => row.campId === event.campId && row.sourceMessageId === event.sourceMessageId,
      );
      if (existing) return false;
      events.push(event);
      return true;
    }),
    findAiBootEventByMessageId: vi.fn((campId: string, sourceMessageId: string) =>
      events.find((event) => event.campId === campId && event.sourceMessageId === sourceMessageId),
    ),
    insertAiBootScoreEvent: vi.fn((event: AiBootScoreEventRecord) => {
      const existing = scoreEvents.find((row) => row.eventId === event.eventId);
      if (existing) return false;
      scoreEvents.push(event);
      return true;
    }),
    findAiBootScoreEventByEventId: vi.fn((eventId: string) =>
      scoreEvents.find((event) => event.eventId === eventId),
    ),
    findAiBootEventByContentHash: vi.fn((campId: string, contentHash: string, excludeEventId?: string) =>
      [...events]
        .reverse()
        .find((event) =>
          event.campId === campId &&
          event.contentHash === contentHash &&
          event.id !== excludeEventId,
        ),
    ),
    findApprovedAiBootScoreEventByContentHash: vi.fn((campId: string, contentHash: string, excludeEventId?: string) => {
      const matchingEventIds = events
        .filter((event) =>
          event.campId === campId &&
          event.contentHash === contentHash &&
          event.id !== excludeEventId,
        )
        .map((event) => event.id);
      return scoreEvents.find((event) =>
        event.campId === campId &&
        event.status === "approved" &&
        matchingEventIds.includes(event.eventId),
      );
    }),
    countApprovedAiBootScoreEvents: vi.fn((input: {
      campId: string;
      memberId: string;
      category: string;
      decidedAtFrom: string;
      decidedAtTo: string;
    }) =>
      scoreEvents.filter((event) =>
        event.campId === input.campId &&
        event.memberId === input.memberId &&
        event.category === input.category &&
        event.status === "approved" &&
        event.decidedAt >= input.decidedAtFrom &&
        event.decidedAt < input.decidedAtTo,
      ).length,
    ),
    sumApprovedAiBootScore: vi.fn((campId: string, memberId: string) =>
      scoreEvents
        .filter((event) => event.campId === campId && event.memberId === memberId && event.status === "approved")
        .reduce((sum, event) => sum + event.scoreDelta, 0),
    ),
  };
  const deps: AiBootOrchestratorDeps = {
    repo: repo as AiBootOrchestratorDeps["repo"],
    memberResolver: {
      findMemberByOpenId: vi.fn().mockReturnValue({
        id: "member-1",
        displayName: "测试学员",
        roleType: "student",
        isParticipant: true,
        isExcludedFromBoard: false,
        currentLevel: 1,
      }),
    },
    feishuClient: {
      getMessageFile: vi.fn(),
      sendTextMessage: vi.fn().mockResolvedValue({ messageId: "praise-1" }),
    },
    config: {
      engineMode: "v3_live",
      allowGroupPraise: true,
      allowDailyDigest: false,
    },
    now: () => "2026-05-16T09:00:00.000Z",
    uuid: vi.fn()
      .mockReturnValueOnce("evt-1")
      .mockReturnValueOnce("score-1")
      .mockReturnValueOnce("evt-2")
      .mockReturnValueOnce("score-2"),
    ...overrides,
  };

  return Object.assign(deps, { events, scoreEvents });
}

const approvedArtifact = {
  status: "approved",
  category: "ai_artifact",
  scoreDelta: 5,
  confidence: "high",
  notifyPolicy: "group_praise",
  reason: "学员提交了明确的 AI 产物。",
  evidence: "图片或附件展示了 AI 生成结果。",
  badges: ["artifact"],
};

describe("createAiBootOrchestrator", () => {
  it("writes event and shadow score event in v3_shadow without approved leaderboard score or notification", async () => {
    const deps = makeDeps({
      config: {
        engineMode: "v3_shadow",
        allowGroupPraise: true,
        allowDailyDigest: false,
      },
      llmClient: makeLlmClient(approvedArtifact),
    });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message());

    expect(deps.events).toHaveLength(1);
    expect(deps.scoreEvents).toHaveLength(1);
    expect(deps.scoreEvents[0]).toMatchObject({
      eventId: "evt-1",
      memberId: "member-1",
      category: "ai_artifact",
      scoreDelta: 5,
      status: "shadow",
      notifyPolicy: "silent",
    });
    expect(deps.repo.sumApprovedAiBootScore("default", "member-1")).toBe(0);
    expect(deps.feishuClient.sendTextMessage).not.toHaveBeenCalled();
  });

  it("writes approved score in v3_live and sends group praise when notification policy allows", async () => {
    const deps = makeDeps({
      llmClient: makeLlmClient(approvedArtifact),
    });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message());

    expect(deps.events).toHaveLength(1);
    expect(deps.scoreEvents).toHaveLength(1);
    expect(deps.scoreEvents[0]).toMatchObject({
      status: "approved",
      category: "ai_artifact",
      scoreDelta: 5,
      notifyPolicy: "group_praise",
    });
    expect(deps.repo.sumApprovedAiBootScore("default", "member-1")).toBe(5);
    expect(deps.feishuClient.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({
      receiveId: "chat-1",
      receiveIdType: "chat_id",
      text: expect.stringContaining("测试学员"),
    }));
  });

  it("@Bot mention remains chat-only and does not write score event", async () => {
    const deps = makeDeps({
      llmClient: makeLlmClient(approvedArtifact),
      botOpenId: "ou-bot",
    });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message({
      rawText: "@_user_1 这个怎么提交？",
      cleanedText: "这个怎么提交？",
      mentionedBotIds: ["ou-bot"],
    }));

    expect(deps.events).toHaveLength(1);
    expect(deps.scoreEvents).toHaveLength(0);
    expect(deps.llmClient?.chat).not.toHaveBeenCalled();
    expect(deps.feishuClient.sendTextMessage).not.toHaveBeenCalled();
  });

  it("scores peer mentions normally instead of treating every mention as @Bot", async () => {
    const peerHelp = {
      status: "approved",
      category: "peer_help",
      scoreDelta: 3,
      confidence: "high",
      notifyPolicy: "silent",
      reason: "学员帮助同伴排查 AI 工具问题。",
      evidence: "消息中提到同伴并给出可执行建议。",
      badges: ["peer_help"],
    };
    const deps = makeDeps({
      botOpenId: "ou-bot",
      llmClient: makeLlmClient(peerHelp),
    });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message({
      rawText: "@_user_2 你可以先让 AI 列出字段，再检查哪些客户记录缺少关键信息。",
      cleanedText: "你可以先让 AI 列出字段，再检查哪些客户记录缺少关键信息。",
      mentionedBotIds: ["ou-peer"],
    }));

    expect(deps.scoreEvents[0]).toMatchObject({
      status: "approved",
      category: "peer_help",
      scoreDelta: 3,
    });
  });

  it("allows an image share without prompt to approve as ai_artifact", async () => {
    const deps = makeDeps({
      llmClient: makeLlmClient(approvedArtifact),
    });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message({
      messageType: "image",
      rawText: "",
      cleanedText: "",
      attachmentCount: 1,
      attachmentTypes: ["image"],
      fileKey: "img-key-1",
    }));

    expect(deps.scoreEvents[0]).toMatchObject({
      status: "approved",
      category: "ai_artifact",
      scoreDelta: 5,
    });
  });

  it("allows an experience share without prompt to approve as ai_practice_reflection", async () => {
    const deps = makeDeps({
      llmClient: makeLlmClient({
        status: "approved",
        category: "ai_practice_reflection",
        scoreDelta: 4,
        confidence: "high",
        notifyPolicy: "silent",
        reason: "学员复盘了 AI 使用过程和改进点。",
        evidence: "消息描述了实践收获、局限和下一步优化。",
        badges: ["reflection"],
      }),
    });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message({
      rawText: "今天用 AI 做客户分层，发现直接让它输出名单不稳定，改成先定义规则再让它检查异常值，结果更靠谱。",
      cleanedText: "今天用 AI 做客户分层，发现直接让它输出名单不稳定，改成先定义规则再让它检查异常值，结果更靠谱。",
    }));

    expect(deps.scoreEvents[0]).toMatchObject({
      status: "approved",
      category: "ai_practice_reflection",
      scoreDelta: 4,
    });
  });

  it("writes a no-score event for a pure link without reason", async () => {
    const deps = makeDeps({
      llmClient: makeLlmClient(approvedArtifact),
    });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message({
      rawText: "https://example.com/resource",
      cleanedText: "https://example.com/resource",
    }));

    expect(deps.scoreEvents).toHaveLength(1);
    expect(deps.scoreEvents[0]).toMatchObject({
      status: "no_score",
      category: "daily_participation",
      scoreDelta: 0,
      notifyPolicy: "silent",
      reason: "pure_link_without_reason",
    });
    expect(deps.llmClient?.chat).not.toHaveBeenCalled();
    expect(deps.feishuClient.sendTextMessage).not.toHaveBeenCalled();
  });

  it("does not repeat daily participation score after the member already has one for the Shanghai business day", async () => {
    const deps = makeDeps({
      now: () => "2026-05-16T15:30:00.000Z",
    });
    deps.scoreEvents.push({
      id: "existing-score",
      eventId: "existing-event",
      campId: "default",
      memberId: "member-1",
      category: "daily_participation",
      scoreDelta: 1,
      confidence: "high",
      status: "approved",
      notifyPolicy: "silent",
      reason: "trivial_chat",
      evidence: "OK",
      badgesJson: "[]",
      modelProvider: "deterministic",
      modelName: "guards",
      promptVersion: "",
      reviewedByOpId: null,
      reviewNote: null,
      decidedAt: "2026-05-15T16:01:00.000Z",
    });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message({
      rawText: "OK",
      cleanedText: "OK",
    }));

    expect(deps.events).toHaveLength(1);
    expect(deps.scoreEvents).toHaveLength(1);
  });

  it("ignores duplicate content when a previous event already has an approved score", async () => {
    const deps = makeDeps({
      llmClient: makeLlmClient(approvedArtifact),
    });
    const orchestrator = createAiBootOrchestrator(deps);
    const first = message({ messageId: "om-first" });
    const duplicate = message({ messageId: "om-second" });

    await orchestrator.handleMessage(first);
    await orchestrator.handleMessage(duplicate);

    expect(deps.events).toHaveLength(2);
    expect(deps.scoreEvents).toHaveLength(1);
    expect(deps.llmClient?.chat).toHaveBeenCalledTimes(1);
  });

  it("requires review for duplicate content when the previous event has no approved score", async () => {
    const deps = makeDeps({
      llmClient: makeLlmClient(approvedArtifact),
    });
    const orchestrator = createAiBootOrchestrator(deps);
    await orchestrator.handleMessage(message({ messageId: "om-first" }));
    deps.scoreEvents.length = 0;

    await orchestrator.handleMessage(message({ messageId: "om-second" }));

    expect(deps.scoreEvents).toHaveLength(1);
    expect(deps.scoreEvents[0]).toMatchObject({
      status: "review_required",
      reason: "duplicate_content",
      notifyPolicy: "silent",
    });
    expect(deps.llmClient?.chat).toHaveBeenCalledTimes(1);
  });

  it("continues scoring an existing event that has no score event yet", async () => {
    const deps = makeDeps({
      llmClient: makeLlmClient(approvedArtifact),
    });
    const orchestrator = createAiBootOrchestrator(deps);
    const first = message();
    await orchestrator.handleMessage(first);
    deps.scoreEvents.length = 0;

    await orchestrator.handleMessage(first);

    expect(deps.events).toHaveLength(1);
    expect(deps.scoreEvents).toHaveLength(1);
    expect(deps.scoreEvents[0]?.eventId).toBe("evt-1");
  });

  it("does not notify when score event insert loses an idempotency race", async () => {
    const deps = makeDeps({
      llmClient: makeLlmClient(approvedArtifact),
    });
    (deps.repo.insertAiBootScoreEvent as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message());

    expect(deps.scoreEvents).toHaveLength(0);
    expect(deps.feishuClient.sendTextMessage).not.toHaveBeenCalled();
  });
});
