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
  const deps: AiBootOrchestratorDeps = {
    repo: {
      insertAiBootEvent: vi.fn((event: AiBootEventRecord) => {
        events.push(event);
      }),
      findAiBootEventByMessageId: vi.fn((campId: string, sourceMessageId: string) =>
        events.find((event) => event.campId === campId && event.sourceMessageId === sourceMessageId),
      ),
      insertAiBootScoreEvent: vi.fn((event: AiBootScoreEventRecord) => {
        scoreEvents.push(event);
      }),
      sumApprovedAiBootScore: vi.fn((campId: string, memberId: string) =>
        scoreEvents
          .filter((event) => event.campId === campId && event.memberId === memberId && event.status === "approved")
          .reduce((sum, event) => sum + event.scoreDelta, 0),
      ),
    },
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
});
