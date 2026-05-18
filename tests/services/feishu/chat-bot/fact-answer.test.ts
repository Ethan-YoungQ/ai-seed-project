import { describe, expect, it } from "vitest";

import { buildFactAnswer } from "../../../../src/services/feishu/chat-bot/fact-answer";
import type { OperationalFacts } from "../../../../src/services/feishu/chat-bot/fact-service";
import type { BotQuestionIntent } from "../../../../src/services/feishu/chat-bot/intent-router";

const levelIntent: BotQuestionIntent = { kind: "level_status", reason: "test" };
const csIntent: BotQuestionIntent = { kind: "cs_interaction_check", reason: "test" };
const rulesIntent: BotQuestionIntent = { kind: "rules_query", reason: "test" };
const missingIntent: BotQuestionIntent = { kind: "score_missing_check", reason: "test" };

function makeFoundFacts(overrides: Partial<Extract<OperationalFacts, { kind: "found" }>> = {}): OperationalFacts {
  return {
    kind: "found",
    openId: "ou_grace",
    question: "为什么我还是潜力股",
    member: {
      id: "member-grace",
      displayName: "Grace",
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: false,
      currentLevel: 1,
    },
    status: {
      memberName: "Grace",
      rank: 4,
      currentLevel: 1,
      currentLevelName: "AI 潜力股",
      nextLevel: 2,
      nextLevelName: "AI 研究员",
      totalScore: 26,
      dimensions: { K: 13, H: 13, C: 0, S: 0, G: 0 },
    },
    scoreFacts: [
      {
        source: "v3",
        categoryOrItem: "homework_submit",
        dimension: "H",
        scoreDelta: 5,
        status: "approved",
        eventId: "evt-1",
        sourceRef: null,
        sourceMessageId: "om-1",
        reason: "提交作业",
        reviewNote: null,
        createdAt: "2026-05-18T07:00:00.000Z",
        decidedAt: "2026-05-18T07:05:00.000Z",
        note: "source_ref=om-1 category=homework_submit event_id=evt-1",
      },
    ],
    interactionFacts: [],
    ...overrides,
  };
}

describe("buildFactAnswer", () => {
  it("explains why Grace remains potential stock from concrete level facts", () => {
    const answer = buildFactAnswer({
      intent: levelIntent,
      facts: makeFoundFacts(),
      question: "Grace 为什么我还是潜力股[泣不成声]",
    });

    expect(answer.handled).toBe(true);
    expect(answer.text).toContain("Grace");
    expect(answer.text).toContain("总分 26 分");
    expect(answer.text).toContain("K13 / H13 / C0 / S0 / G0");
    expect(answer.text).toContain("Lv1 AI 潜力股");
    expect(answer.text).toContain("Lv2 AI 研究员");
    expect(answer.text).toContain("缺口");
    expect(answer.text).toContain("C/S/G");
    expect(answer.text).toContain("不是泛泛聊天");
  });

  it("does not invent C/S interaction facts when none are found", () => {
    const answer = buildFactAnswer({
      intent: csIntent,
      facts: makeFoundFacts({ interactionFacts: [] }),
      question: "我的 C/S 点赞互动算了吗",
    });

    expect(answer.handled).toBe(true);
    expect(answer.text).toContain("暂时没有查到已计入的 C/S 互动分");
    expect(answer.text).not.toContain("evt-");
  });

  it("answers prompt rule questions as not the only hard condition", () => {
    const answer = buildFactAnswer({
      intent: rulesIntent,
      facts: makeFoundFacts(),
      question: "天梯榜规则是什么，Prompt 必须发吗",
    });

    expect(answer.handled).toBe(true);
    expect(answer.text).toContain("Prompt");
    expect(answer.text).toContain("不是唯一硬条件");
    expect(answer.text).toContain("Lv2");
  });

  it("gives recent score facts and an executable next step for missing score checks", () => {
    const answer = buildFactAnswer({
      intent: missingIntent,
      facts: makeFoundFacts(),
      question: "我刚才那条海报是不是漏分了",
    });

    expect(answer.handled).toBe(true);
    expect(answer.text).toContain("近期已计入/已记录的分数事实");
    expect(answer.text).toContain("homework_submit");
    expect(answer.text).toContain("请转发/引用原消息");
    expect(answer.text).not.toContain("已经补分");
  });
});
