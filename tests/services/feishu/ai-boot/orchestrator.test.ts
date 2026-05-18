import { describe, expect, it, vi } from "vitest";

import {
  createAiBootOrchestrator,
  type AiBootOrchestratorDeps,
} from "../../../../src/services/feishu/ai-boot/orchestrator";
import type {
  AiBootEventRecord,
  AiBootImageUnderstandingRecord,
  AiBootNotificationEventRecord,
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

function makeLlmClient(
  decision: Record<string, unknown>,
  overrides: Partial<AiBootLlmClient> = {},
): AiBootLlmClient {
  return {
    provider: "test-provider",
    model: "test-model",
    chat: vi.fn().mockResolvedValue(JSON.stringify(decision)),
    ...overrides,
  };
}

function makeDeps(
  overrides: Partial<AiBootOrchestratorDeps> = {},
): AiBootOrchestratorDeps & {
  events: AiBootEventRecord[];
  imageUnderstandings: AiBootImageUnderstandingRecord[];
  notificationEvents: AiBootNotificationEventRecord[];
  scoreEvents: AiBootScoreEventRecord[];
} {
  const events: AiBootEventRecord[] = [];
  const scoreEvents: AiBootScoreEventRecord[] = [];
  const notificationEvents: AiBootNotificationEventRecord[] = [];
  const imageUnderstandings: AiBootImageUnderstandingRecord[] = [];
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
    sumApprovedAiBootScoreByCategory: vi.fn((input: {
      campId: string;
      memberId: string;
      category: string;
      decidedAtFrom: string;
      decidedAtTo: string;
    }) =>
      scoreEvents
        .filter((event) =>
          event.campId === input.campId &&
          event.memberId === input.memberId &&
          event.category === input.category &&
          event.status === "approved" &&
          event.decidedAt >= input.decidedAtFrom &&
          event.decidedAt < input.decidedAtTo,
        )
        .reduce((sum, event) => sum + Math.max(0, event.scoreDelta), 0),
    ),
    sumApprovedAiBootScore: vi.fn((campId: string, memberId: string) =>
      scoreEvents
        .filter((event) => event.campId === campId && event.memberId === memberId && event.status === "approved")
        .reduce((sum, event) => sum + event.scoreDelta, 0),
    ),
    getMember: vi.fn((memberId: string) => {
      if (memberId !== "member-1") return undefined;
      return {
        id: "member-1",
        campId: "default",
        name: "测试学员",
        displayName: "测试学员",
        avatarUrl: "",
        department: "",
        roleType: "student",
        isParticipant: true,
        isExcludedFromBoard: false,
        status: "active",
      };
    }),
    listAiBootReviewQueue: vi.fn((input: {
      campId: string;
      limit: number;
      offset: number;
    }) =>
      scoreEvents
        .filter((event) =>
          event.campId === input.campId &&
          event.status === "review_required" &&
          event.confidence === "low",
        )
        .slice(input.offset, input.offset + input.limit),
    ),
    countAiBootReviewQueue: vi.fn((input: { campId: string }) =>
      scoreEvents.filter((event) =>
        event.campId === input.campId &&
        event.status === "review_required" &&
        event.confidence === "low",
      ).length,
    ),
    insertAiBootNotificationEvent: vi.fn((event: AiBootNotificationEventRecord) => {
      const existing = notificationEvents.find((row) => row.scoreEventId === event.scoreEventId);
      if (existing) return false;
      notificationEvents.push(event);
      return true;
    }),
    countAiBootNotificationEventsForMember: vi.fn((input: {
      campId: string;
      memberId: string;
      from: string;
      to: string;
    }) =>
      notificationEvents.filter((event) =>
        event.campId === input.campId &&
        event.memberId === input.memberId &&
        event.sentAt >= input.from &&
        event.sentAt < input.to,
      ).length,
    ),
    countAiBootNotificationEventsForChat: vi.fn((input: {
      campId: string;
      chatId: string;
      from: string;
    }) =>
      notificationEvents.filter((event) =>
        event.campId === input.campId &&
        event.chatId === input.chatId &&
        event.sentAt >= input.from,
      ).length,
    ),
    findRecentAiBootNotificationByTopicHash: vi.fn((input: {
      campId: string;
      topicHash: string;
      since: string;
    }) =>
      [...notificationEvents]
        .reverse()
        .find((event) =>
          event.campId === input.campId &&
          event.topicHash === input.topicHash &&
          event.sentAt >= input.since,
        ),
    ),
    findAiBootNotificationEventByScoreEventId: vi.fn((scoreEventId: string) =>
      notificationEvents.find((event) => event.scoreEventId === scoreEventId),
    ),
    findAiBootImageUnderstandingByContentHash: vi.fn((contentHash: string) =>
      imageUnderstandings.find((row) => row.contentHash === contentHash) ?? null,
    ),
    upsertAiBootImageUnderstanding: vi.fn((record: AiBootImageUnderstandingRecord) => {
      const index = imageUnderstandings.findIndex((row) => row.contentHash === record.contentHash);
      if (index >= 0) {
        imageUnderstandings[index] = record;
      } else {
        imageUnderstandings.push(record);
      }
    }),
    findActivePeriod: vi.fn(() => ({
      id: "period-2",
      campId: "default",
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-22T00:00:00.000Z",
      endedAt: null,
      openedByOpId: null,
      closedReason: null,
      createdAt: "2026-04-22T00:00:00.000Z",
      updatedAt: "2026-04-22T00:00:00.000Z",
    })),
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
      getMessageFile: vi.fn().mockResolvedValue({
        fileKey: "img-key-1",
        mimeType: "image/png",
        bytes: Buffer.from("fake-image"),
      }),
      sendTextMessage: vi.fn().mockResolvedValue({ messageId: "praise-1" }),
      sendCardMessage: vi.fn().mockResolvedValue({ messageId: "review-card-1" }),
    },
    campId: "default",
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

  return Object.assign(deps, { events, imageUnderstandings, notificationEvents, scoreEvents });
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
  it("ignores messages from non-bound chats", async () => {
    const deps = makeDeps({
      chatId: "chat-expected",
      llmClient: makeLlmClient(approvedArtifact),
    });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message({ chatId: "chat-other" }));

    expect(deps.events).toHaveLength(0);
    expect(deps.scoreEvents).toHaveLength(0);
  });

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

  it("records the text scoring model name when an image is scored from cached understanding", async () => {
    const cachedUnderstanding: AiBootImageUnderstandingRecord = {
      fileKey: "img-key-1",
      messageId: "om-1",
      contentHash: "hash-image-1",
      modelName: "qwen-vl-max-latest",
      caption: "截图展示了一个 AI 生成的客户拜访复盘表。",
      scoreHint: "可按 ai_artifact 审核。",
      latencyMs: 40,
      status: "succeeded",
      errorReason: "",
      createdAt: "2026-05-16T09:00:00.000Z",
      updatedAt: "2026-05-16T09:00:00.000Z",
    };
    const deps = makeDeps({
      config: {
        engineMode: "v3_shadow",
        allowGroupPraise: false,
        allowDailyDigest: false,
      },
      llmClient: makeLlmClient(approvedArtifact, {
        model: "glm-4.7",
        visionModel: "qwen-vl-max-latest",
      }),
      imageUnderstandingService: {
        getCachedUnderstanding: vi.fn().mockReturnValue(cachedUnderstanding),
        enqueueUnderstanding: vi.fn(),
      },
    } as Partial<AiBootOrchestratorDeps>);
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message({
      messageType: "image",
      rawText: "",
      cleanedText: "",
      attachmentCount: 1,
      attachmentTypes: ["image"],
      fileKey: "img-key-1",
    }));

    expect(deps.scoreEvents).toHaveLength(1);
    expect(deps.scoreEvents[0]).toMatchObject({
      modelProvider: "test-provider",
      modelName: "glm-4.7",
    });
  });

  it("writes v3 events into the configured production camp id", async () => {
    const deps = makeDeps({
      campId: "camp-demo",
      llmClient: makeLlmClient(approvedArtifact),
    });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message());

    expect(deps.events[0]).toMatchObject({ campId: "camp-demo" });
    expect(deps.scoreEvents[0]).toMatchObject({ campId: "camp-demo" });
    expect(deps.repo.findAiBootEventByMessageId).toHaveBeenCalledWith("camp-demo", "om-1");
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
    expect(deps.notificationEvents).toHaveLength(1);
    expect(deps.notificationEvents[0]).toMatchObject({
      scoreEventId: "score-1",
      campId: "default",
      memberId: "member-1",
      chatId: "chat-1",
      topicHash: expect.any(String),
      notifyPolicy: "group_praise",
      sentAt: "2026-05-16T09:00:00.000Z",
      textHash: expect.any(String),
    });
  });

  it("caps v3 category score at remaining period allowance before writing approved score", async () => {
    const deps = makeDeps({
      llmClient: makeLlmClient(approvedArtifact),
    });
    deps.scoreEvents.push({
      id: "score-existing",
      eventId: "evt-existing",
      campId: "default",
      memberId: "member-1",
      category: "ai_artifact",
      scoreDelta: 6,
      confidence: "high",
      status: "approved",
      notifyPolicy: "silent",
      reason: "历史 AI 作品分",
      evidence: "历史记录",
      badgesJson: "[]",
      modelProvider: "test",
      modelName: "test",
      promptVersion: "test",
      reviewedByOpId: null,
      reviewNote: null,
      decidedAt: "2026-05-15T09:00:00.000Z",
    });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message());

    expect(deps.scoreEvents).toHaveLength(2);
    expect(deps.scoreEvents[1]).toMatchObject({
      status: "approved",
      category: "ai_artifact",
      scoreDelta: 2,
      notifyPolicy: "group_praise",
      reviewNote: expect.stringContaining("v3_period_cap_applied"),
    });
  });

  it("turns v3 score into no_score when the category period cap is exhausted", async () => {
    const deps = makeDeps({
      llmClient: makeLlmClient(approvedArtifact),
    });
    deps.scoreEvents.push({
      id: "score-existing",
      eventId: "evt-existing",
      campId: "default",
      memberId: "member-1",
      category: "ai_artifact",
      scoreDelta: 8,
      confidence: "high",
      status: "approved",
      notifyPolicy: "silent",
      reason: "历史 AI 作品分",
      evidence: "历史记录",
      badgesJson: "[]",
      modelProvider: "test",
      modelName: "test",
      promptVersion: "test",
      reviewedByOpId: null,
      reviewNote: null,
      decidedAt: "2026-05-15T09:00:00.000Z",
    });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message());

    expect(deps.scoreEvents).toHaveLength(2);
    expect(deps.scoreEvents[1]).toMatchObject({
      status: "no_score",
      category: "ai_artifact",
      scoreDelta: 0,
      notifyPolicy: "silent",
      reviewNote: expect.stringContaining("v3_period_cap_reached"),
    });
    expect(deps.feishuClient.sendTextMessage).not.toHaveBeenCalled();
  });

  it("uses durable notification caps after restart before sending group praise", async () => {
    const deps = makeDeps({
      llmClient: makeLlmClient(approvedArtifact),
    });
    deps.notificationEvents.push(
      {
        id: "notification-prior-1",
        scoreEventId: "score-prior-1",
        campId: "default",
        memberId: "member-1",
        chatId: "chat-1",
        topicHash: "prior-topic-1",
        notifyPolicy: "group_praise",
        sentAt: "2026-05-16T01:00:00.000Z",
        textHash: "text-prior-1",
      },
      {
        id: "notification-prior-2",
        scoreEventId: "score-prior-2",
        campId: "default",
        memberId: "member-1",
        chatId: "chat-1",
        topicHash: "prior-topic-2",
        notifyPolicy: "group_praise",
        sentAt: "2026-05-16T02:00:00.000Z",
        textHash: "text-prior-2",
      },
      {
        id: "notification-prior-3",
        scoreEventId: "score-prior-3",
        campId: "default",
        memberId: "member-1",
        chatId: "chat-1",
        topicHash: "prior-topic-3",
        notifyPolicy: "group_praise",
        sentAt: "2026-05-16T03:00:00.000Z",
        textHash: "text-prior-3",
      },
    );
    const orchestratorAfterRestart = createAiBootOrchestrator(deps);

    await orchestratorAfterRestart.handleMessage(message());

    expect(deps.scoreEvents).toHaveLength(1);
    expect(deps.feishuClient.sendTextMessage).not.toHaveBeenCalled();
    expect(deps.notificationEvents).toHaveLength(3);
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

  it("defers an image-only cache miss, then scores from the async cached caption without group praise", async () => {
    vi.useFakeTimers();
    const llmClient = makeLlmClient(approvedArtifact);
    const cachedUnderstanding: AiBootImageUnderstandingRecord = {
      fileKey: "img-key-1",
      messageId: "om-1",
      contentHash: "hash-image-1",
      modelName: "qwen3.5-flash",
      caption: "截图展示了一个 AI 生成的客户拜访复盘表。",
      scoreHint: "可按 ai_artifact 审核。",
      latencyMs: 40,
      status: "succeeded",
      errorReason: "",
      createdAt: "2026-05-16T09:00:00.000Z",
      updatedAt: "2026-05-16T09:00:00.000Z",
    };
    let cached: AiBootImageUnderstandingRecord | null = null;
    const imageUnderstandingService = {
      getCachedUnderstanding: vi.fn(() => cached),
      enqueueUnderstanding: vi.fn(),
      understandImage: vi.fn().mockImplementation(async () => {
        cached = cachedUnderstanding;
        return cachedUnderstanding;
      }),
    };
    const deps = makeDeps({
      llmClient,
      imageUnderstandingService,
    } as Partial<AiBootOrchestratorDeps>);
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message({
      messageType: "image",
      rawText: "",
      cleanedText: "",
      attachmentCount: 1,
      attachmentTypes: ["image"],
      fileKey: "img-key-1",
    }));

    expect(deps.events).toHaveLength(1);
    expect(deps.scoreEvents).toHaveLength(0);
    expect(imageUnderstandingService.enqueueUnderstanding).not.toHaveBeenCalled();
    expect(deps.llmClient?.chat).not.toHaveBeenCalled();
    expect(deps.feishuClient.getMessageFile).not.toHaveBeenCalled();
    expect(deps.feishuClient.sendTextMessage).not.toHaveBeenCalled();

    const pendingWork = orchestrator.drainPendingWork();
    await vi.runOnlyPendingTimersAsync();
    await pendingWork;

    expect(imageUnderstandingService.understandImage).toHaveBeenCalledTimes(1);
    expect(deps.scoreEvents).toHaveLength(1);
    expect(deps.scoreEvents[0]).toMatchObject({
      status: "approved",
      category: "ai_artifact",
      scoreDelta: 5,
      notifyPolicy: "silent",
    });
    expect(llmClient.chat).toHaveBeenCalledTimes(1);
    expect(deps.feishuClient.getMessageFile).not.toHaveBeenCalled();
    expect(deps.feishuClient.sendTextMessage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("recovers image-only events without score after restart", async () => {
    vi.useFakeTimers();
    const llmClient = makeLlmClient(approvedArtifact);
    const existingEvent: AiBootEventRecord = {
      id: "evt-existing-image",
      campId: "default",
      chatId: "chat-1",
      memberId: "member-1",
      sourceMessageId: "om-existing-image",
      eventType: "image",
      rawText: "",
      sanitizedText: "",
      attachmentJson: JSON.stringify([{ type: "image", fileKey: "img-key-1" }]),
      evidenceJson: JSON.stringify({
        sanitizedText: "",
        urls: [],
        attachments: [{ type: "image", fileKey: "img-key-1" }],
        documentText: "",
        extractionStatus: "not_applicable",
        extractionReason: "non_file_message",
        contentHash: "hash-existing-image",
      }),
      contentHash: "hash-existing-image",
      status: "extracted",
      engineVersion: "ai-boot-v3.0.0",
      rulesetVersion: "2026-05-17",
      createdAt: "2026-05-16T08:59:00.000Z",
    };
    const cachedUnderstanding: AiBootImageUnderstandingRecord = {
      fileKey: "img-key-1",
      messageId: "om-existing-image",
      contentHash: "hash-existing-image",
      modelName: "qwen3.5-flash",
      caption: "截图展示了一个 AI 生成的客户拜访复盘表。",
      scoreHint: "可按 ai_artifact 审核。",
      latencyMs: 40,
      status: "succeeded",
      errorReason: "",
      createdAt: "2026-05-16T09:00:00.000Z",
      updatedAt: "2026-05-16T09:00:00.000Z",
    };
    let cached: AiBootImageUnderstandingRecord | null = null;
    const imageUnderstandingService = {
      getCachedUnderstanding: vi.fn(() => cached),
      enqueueUnderstanding: vi.fn(),
      understandImage: vi.fn().mockImplementation(async () => {
        cached = cachedUnderstanding;
        return cachedUnderstanding;
      }),
    };
    const deps = makeDeps({
      llmClient,
      imageUnderstandingService,
      recoverImageOnlyOnStartup: true,
    } as Partial<AiBootOrchestratorDeps>);
    deps.events.push(existingEvent);
    (deps.repo as any).listAiBootImageOnlyEventsWithoutScore = vi.fn(() => [existingEvent]);

    createAiBootOrchestrator(deps);

    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();

    expect((deps.repo as any).listAiBootImageOnlyEventsWithoutScore).toHaveBeenCalledWith({
      campId: "default",
      limit: 50,
    });
    expect(imageUnderstandingService.understandImage).toHaveBeenCalledTimes(1);
    expect(deps.scoreEvents).toHaveLength(1);
    expect(deps.scoreEvents[0]).toMatchObject({
      eventId: "evt-existing-image",
      memberId: "member-1",
      status: "approved",
      category: "ai_artifact",
      notifyPolicy: "silent",
    });
    expect(deps.feishuClient.sendTextMessage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not start image-only recovery unless explicitly enabled", async () => {
    vi.useFakeTimers();
    const deps = makeDeps({
      llmClient: makeLlmClient(approvedArtifact),
    });
    (deps.repo as any).listAiBootImageOnlyEventsWithoutScore = vi.fn(() => []);

    createAiBootOrchestrator(deps);

    await vi.runOnlyPendingTimersAsync();

    expect((deps.repo as any).listAiBootImageOnlyEventsWithoutScore).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("scores image messages from cached captions without passing the raw image to the scoring model", async () => {
    const llmClient = makeLlmClient(approvedArtifact, {
      visionModel: "glm-4.6v",
    });
    const cachedUnderstanding: AiBootImageUnderstandingRecord = {
      fileKey: "img-key-1",
      messageId: "om-1",
      contentHash: "hash-image-1",
      modelName: "glm-4.6v",
      caption: "截图展示了一个 AI 生成的客户拜访复盘表。",
      scoreHint: "可按 ai_artifact 审核。",
      latencyMs: 40,
      status: "succeeded",
      errorReason: "",
      createdAt: "2026-05-16T09:00:00.000Z",
      updatedAt: "2026-05-16T09:00:00.000Z",
    };
    const deps = makeDeps({
      llmClient,
      imageUnderstandingService: {
        getCachedUnderstanding: vi.fn().mockReturnValue(cachedUnderstanding),
        enqueueUnderstanding: vi.fn(),
      },
    } as Partial<AiBootOrchestratorDeps>);
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message({
      messageType: "image",
      rawText: "",
      cleanedText: "",
      attachmentCount: 1,
      attachmentTypes: ["image"],
      fileKey: "img-key-1",
    }));

    expect(deps.feishuClient.getMessageFile).not.toHaveBeenCalled();
    const messages = (llmClient.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(messages[1].content).toEqual(expect.stringContaining("截图展示了一个 AI 生成的客户拜访复盘表。"));
    expect(messages[1].content).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "image_url" }),
    ]));
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

  it("writes no-score without calling LLM when evidence is empty", async () => {
    const deps = makeDeps({
      llmClient: makeLlmClient(approvedArtifact),
    });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message({
      rawText: "",
      cleanedText: "",
    }));

    expect(deps.scoreEvents).toHaveLength(1);
    expect(deps.scoreEvents[0]).toMatchObject({
      status: "no_score",
      scoreDelta: 0,
      reason: "empty_evidence",
    });
    expect(deps.llmClient?.chat).not.toHaveBeenCalled();
  });

  it("moves LLM failures into review_required instead of dropping the score event", async () => {
    const llmClient: AiBootLlmClient = {
      provider: "test-provider",
      model: "test-model",
      chat: vi.fn().mockRejectedValue(new Error("rate limited")),
    };
    const deps = makeDeps({ llmClient });
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message());

    expect(deps.scoreEvents).toHaveLength(1);
    expect(deps.scoreEvents[0]).toMatchObject({
      status: "review_required",
      scoreDelta: 1,
      notifyPolicy: "silent",
    });
    expect(deps.scoreEvents[0].reason).toContain("rate limited");
  });

  it("pushes a v3 review queue card to the configured test chat when a score needs operator review", async () => {
    const llmClient = makeLlmClient({
      status: "review_required",
      category: "ai_artifact",
      scoreDelta: 4,
      confidence: "low",
      notifyPolicy: "silent",
      reason: "证据需要运营确认。",
      evidence: "学员发了 AI 图片作品，但上下文不足。",
      badges: ["needs_review"],
    });
    const deps = makeDeps({
      llmClient,
      reviewQueueChatId: "oc-admin-test",
    } as Partial<AiBootOrchestratorDeps>);
    const orchestrator = createAiBootOrchestrator(deps);

    await orchestrator.handleMessage(message());

    expect(deps.feishuClient.sendCardMessage).toHaveBeenCalledOnce();
    expect(deps.feishuClient.sendCardMessage).toHaveBeenCalledWith(expect.objectContaining({
      chatId: "oc-admin-test",
    }));
    const cardJson = (deps.feishuClient.sendCardMessage as ReturnType<typeof vi.fn>).mock.calls[0][0].cardJson;
    const cardText = JSON.stringify(cardJson);
    expect(cardText).toContain("测试学员");
    expect(cardText).toContain("ai_artifact");
    expect(cardText).toContain('"engine":"v3"');
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

  it("caps LLM-approved daily participation after one Shanghai business day score", async () => {
    const deps = makeDeps({
      now: () => "2026-05-16T15:30:00.000Z",
      llmClient: makeLlmClient({
        status: "approved",
        category: "daily_participation",
        scoreDelta: 1,
        confidence: "high",
        notifyPolicy: "silent",
        reason: "LLM treated this as participation.",
        evidence: "ordinary chat",
        badges: ["daily"],
      }),
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
      rawText: "今天 AI 课挺有启发",
      cleanedText: "今天 AI 课挺有启发",
    }));

    expect(deps.scoreEvents.at(-1)).toMatchObject({
      status: "no_score",
      category: "daily_participation",
      scoreDelta: 0,
      reason: "daily_participation_cap_used",
    });
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
