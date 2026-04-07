import { describe, expect, it } from "vitest";

import { buildBoardRanking } from "../../src/domain/ranking";
import { scoreSubmissionCandidate } from "../../src/domain/scoring";
import type { MemberProfile, SubmissionCandidate } from "../../src/domain/types";
import type { LlmProviderConfig } from "../../src/services/llm/provider-config";

describe("scoreSubmissionCandidate", () => {
  const candidate: SubmissionCandidate = {
    id: "candidate-01",
    campId: "camp-01",
    sessionId: "session-01",
    memberId: "member-01",
    homeworkTag: "#HW01",
    eventId: "evt-1",
    messageId: "om_001",
    eventIds: ["evt-1", "evt-2"],
    combinedText:
      "#HW01 #\u4f5c\u4e1a\u63d0\u4ea4 \u6211\u662f\u5148\u5199\u4e86\u4e00\u4e2a\u63d0\u793a\u8bcd\uff0c\u518d\u6839\u636e\u8f93\u51fa\u505a\u4e86\u4e24\u8f6e\u8fed\u4ee3\u3002\u6700\u7ec8\u6211\u4ea7\u51fa\u4e86\u4e00\u4efd\u7ed3\u6784\u5316\u603b\u7ed3\uff0c\u4e5f\u5b66\u4f1a\u4e86\u600e\u4e48\u628a\u95ee\u9898\u62c6\u89e3\u3002",
    attachmentCount: 1,
    attachmentTypes: ["image"],
    firstEventTime: "2026-04-10T08:00:00.000Z",
    latestEventTime: "2026-04-10T08:05:00.000Z",
    deadlineAt: "2026-04-17T08:59:59.000Z",
    evaluationWindowEnd: "2026-04-17T08:59:59.000Z"
  };

  it("awards base score when evidence, process, and result are all present", async () => {
    const result = await scoreSubmissionCandidate(candidate);

    expect(result.finalStatus).toBe("valid");
    expect(result.baseScore).toBe(5);
    expect(result.processScore).toBeGreaterThan(0);
    expect(result.qualityScore).toBeGreaterThan(0);
    expect(result.totalScore).toBeGreaterThanOrEqual(7);
    expect(result.scoreReason).toContain("evidence");
    expect(result.llmReason).toContain("启发式评分");
  });

  it("returns invalid when the aggregate is missing a result statement", async () => {
    const result = await scoreSubmissionCandidate({
      ...candidate,
      id: "candidate-02",
      combinedText: "#HW01 #\u4f5c\u4e1a\u63d0\u4ea4 \u6211\u662f\u5148\u5217\u95ee\u9898\uff0c\u518d\u5199\u63d0\u793a\u8bcd\u5e76\u505a\u4e86\u4e24\u8f6e\u8fed\u4ee3\u3002"
    });

    expect(result.finalStatus).toBe("invalid");
    expect(result.baseScore).toBe(0);
    expect(result.totalScore).toBe(0);
    expect(result.scoreReason).toContain("missing_result");
    expect(result.llmReason).toBe("该提交未通过基础校验，已跳过自动评分。");
  });

  it("uses parsed document text as the scoring input for file-only submissions", async () => {
    const result = await scoreSubmissionCandidate({
      ...candidate,
      id: "candidate-03",
      combinedText: "",
      attachmentCount: 1,
      attachmentTypes: ["file"],
      documentText:
        "我是先写了提示词，再根据输出做了两轮迭代。最终我产出了一份结构化总结，也学会了怎么拆解问题。",
      documentParseStatus: "parsed"
    });

    expect(result.finalStatus).toBe("valid");
    expect(result.baseScore).toBe(5);
    expect(result.totalScore).toBeGreaterThanOrEqual(7);
  });

  it("uses the injected llm scorer when provider-neutral config is enabled", async () => {
    const llmConfig: LlmProviderConfig = {
      enabled: true,
      provider: "aliyun",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "sk-demo",
      textModel: "qwen3-flash",
      fileModel: "qwen-doc-turbo",
      timeoutMs: 15000,
      maxInputChars: 6000,
      concurrency: 3
    };

    const result = await scoreSubmissionCandidate(candidate, {
      config: llmConfig,
      llmScorer: async () => ({
        processScore: 3,
        qualityScore: 2,
        reason: "Scored by qwen.",
        model: "qwen3-flash",
        inputExcerpt: candidate.combinedText.slice(0, 160)
      })
    });

    expect(result.finalStatus).toBe("valid");
    expect(result.processScore).toBe(3);
    expect(result.qualityScore).toBe(2);
    expect(result.totalScore).toBe(10);
    expect(result.llmModel).toBe("qwen3-flash");
    expect(result.llmReason).toBe("Scored by qwen.");
  });
});

describe("buildBoardRanking", () => {
  const members: MemberProfile[] = [
    {
      id: "member-01",
      campId: "camp-01",
      name: "Alice",
      department: "HBU",
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: false,
      status: "active"
    },
    {
      id: "member-ops",
      campId: "camp-01",
      name: "Operator",
      department: "Ops",
      roleType: "operator",
      isParticipant: false,
      isExcludedFromBoard: true,
      status: "active"
    }
  ];

  it("ranks only eligible participants and excludes operators", () => {
    const ranking = buildBoardRanking({
      members,
      scores: [
        {
          memberId: "member-01",
          sessionId: "session-01",
          totalScore: 8,
          communityBonus: 1,
          finalStatus: "valid"
        },
        {
          memberId: "member-ops",
          sessionId: "session-01",
          totalScore: 99,
          communityBonus: 0,
          finalStatus: "valid"
        }
      ]
    });

    expect(ranking).toHaveLength(1);
    expect(ranking[0]).toMatchObject({
      memberId: "member-01",
      totalScore: 8,
      rank: 1
    });
  });
});
