import { describe, expect, it, vi } from "vitest";

import {
  createBotFactService,
  type BotFactServiceRepo,
} from "../../../../src/services/feishu/chat-bot/fact-service";

function makeRepo(overrides: Partial<BotFactServiceRepo> = {}): BotFactServiceRepo {
  return {
    findMemberByOpenId: vi.fn().mockReturnValue({
      id: "member-1",
      displayName: "Grace",
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: false,
      currentLevel: 2,
    }),
    getLevelStatus: vi.fn().mockReturnValue({
      memberName: "Grace",
      rank: 3,
      currentLevel: 2,
      currentLevelName: "AI 研究员",
      nextLevel: 3,
      nextLevelName: "AI 操盘手",
      totalScore: 42,
      dimensions: { K: 10, H: 12, C: 8, S: 7, G: 5 },
    }),
    listRecentScoreFacts: vi.fn().mockReturnValue([
      {
        source: "v3",
        categoryOrItem: "peer_help",
        dimension: "S",
        scoreDelta: 3,
        status: "approved",
        createdAt: "2026-05-18T07:59:00.000Z",
        decidedAt: "2026-05-18T08:00:00.000Z",
        eventId: "evt-1",
        sourceRef: null,
        sourceMessageId: "om-1",
        reason: "帮助同学",
        reviewNote: null,
        note: "category=peer_help source_ref=om-1",
      },
    ]),
    listInteractionFacts: vi.fn().mockReturnValue([
      {
        type: "peer_help",
        actorName: null,
        targetName: null,
        scoredMemberName: "Grace",
        scoreDelta: 3,
        status: "approved",
        occurredAt: "2026-05-18T08:00:00.000Z",
        eventId: "evt-1",
        sourceRef: null,
        sourceMessageId: "om-1",
        categoryOrItem: "peer_help",
        note: "source_ref=om-1 category=peer_help item=peer_help",
      },
    ]),
    ...overrides,
  };
}

describe("createBotFactService", () => {
  it("returns operational facts for a known member", async () => {
    const repo = makeRepo();
    const service = createBotFactService({ repo });

    const result = await service.getOperationalFacts({
      openId: "ou_grace",
      question: "我最近为什么升段了？",
    });

    expect(result.kind).toBe("found");
    if (result.kind !== "found") throw new Error("expected found result");
    expect(result.member.displayName).toBe("Grace");
    expect(result.status.currentLevelName).toBe("AI 研究员");
    expect(result.scoreFacts).toHaveLength(1);
    expect(result.interactionFacts).toHaveLength(1);
    expect(repo.listRecentScoreFacts).toHaveBeenCalledWith("member-1", 10);
    expect(repo.listInteractionFacts).toHaveBeenCalledWith("member-1", 10);
  });

  it("returns missing_member when open id cannot be resolved", async () => {
    const repo = makeRepo({
      findMemberByOpenId: vi.fn().mockReturnValue(null),
    });
    const service = createBotFactService({ repo });

    const result = await service.getOperationalFacts({
      openId: "ou_missing",
      question: "查一下我的评分",
    });

    expect(result).toEqual({
      kind: "missing_member",
      openId: "ou_missing",
      question: "查一下我的评分",
    });
    expect(repo.getLevelStatus).not.toHaveBeenCalled();
    expect(repo.listRecentScoreFacts).not.toHaveBeenCalled();
    expect(repo.listInteractionFacts).not.toHaveBeenCalled();
  });

  it("returns missing_status when member exists but has no level status", async () => {
    const repo = makeRepo({
      getLevelStatus: vi.fn().mockReturnValue(null),
    });
    const service = createBotFactService({ repo });

    const result = await service.getOperationalFacts({
      openId: "ou_grace",
      question: "我的段位呢？",
    });

    expect(result).toEqual({
      kind: "missing_status",
      openId: "ou_grace",
      question: "我的段位呢？",
      member: {
        id: "member-1",
        displayName: "Grace",
        roleType: "student",
        isParticipant: true,
        isExcludedFromBoard: false,
        currentLevel: 2,
      },
    });
    expect(repo.listRecentScoreFacts).not.toHaveBeenCalled();
    expect(repo.listInteractionFacts).not.toHaveBeenCalled();
  });
});
