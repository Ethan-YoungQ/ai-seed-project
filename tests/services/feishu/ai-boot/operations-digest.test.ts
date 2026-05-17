import { describe, expect, it } from "vitest";

import {
  buildOperationsDigest,
  buildGroupPromotionDigest,
  buildOperatorDigest,
  type OperationsDigestInput,
} from "../../../../src/services/feishu/ai-boot/operations-digest";

function input(overrides: Partial<OperationsDigestInput> = {}): OperationsDigestInput {
  return {
    nowIso: "2026-05-17T12:00:00.000Z",
    nearPromotionWindow: 5,
    ranking: [
      {
        memberId: "m-1",
        memberName: "林一",
        currentLevel: 1,
        cumulativeAq: 30,
        dimensions: { K: 20, H: 10, C: 0, S: 0, G: 0 },
      },
      {
        memberId: "m-2",
        memberName: "周二",
        currentLevel: 2,
        cumulativeAq: 60,
        dimensions: { K: 20, H: 20, C: 8, S: 7, G: 5 },
      },
      {
        memberId: "m-3",
        memberName: "陈三",
        currentLevel: 1,
        cumulativeAq: 12,
        dimensions: { K: 12, H: 0, C: 0, S: 0, G: 0 },
      },
    ],
    suspectedMissedScores: [
      {
        memberId: "m-1",
        memberName: "林一",
        messageId: "om-poster-1",
        reason: "图片海报疑似未入账",
      },
    ],
    slowImageTasks: [
      {
        messageId: "om-image-1",
        memberName: "周二",
        latencyMs: 45_000,
      },
    ],
    ...overrides,
  };
}

describe("operations digest", () => {
  it("builds a low-noise group digest with only near-promotion reminders", () => {
    const digest = buildGroupPromotionDigest(input());

    expect(digest.shouldSend).toBe(true);
    expect(digest.text).toContain("临近晋升");
    expect(digest.text).toContain("林一");
    expect(digest.text).toContain("周二");
    expect(digest.text).not.toContain("疑似漏分");
    expect(digest.text).not.toContain("慢图片任务");
    expect(digest.text).not.toContain("C/S/G 为 0");
    expect(digest.text).not.toContain("om-poster-1");
  });

  it("calculates Lv1 near-promotion gaps using the relaxed continuous promotion paths", () => {
    const digest = buildGroupPromotionDigest(input({
      ranking: [
        {
          memberId: "m-csg",
          memberName: "有实践信号",
          currentLevel: 1,
          cumulativeAq: 23,
          dimensions: { K: 10, H: 10, C: 3, S: 0, G: 0 },
        },
      ],
      suspectedMissedScores: [],
      slowImageTasks: [],
    }));

    expect(digest.shouldSend).toBe(true);
    expect(digest.nearPromotions[0]).toMatchObject({
      memberName: "有实践信号",
      nextLevel: 2,
      pointsRemaining: 1,
    });
    expect(digest.text).toContain("还差 1 分");
  });

  it("does not list members who already satisfy a relaxed Lv2 promotion path", () => {
    const digest = buildGroupPromotionDigest(input({
      ranking: [
        {
          memberId: "m-promoted",
          memberName: "已达标",
          currentLevel: 1,
          cumulativeAq: 21,
          dimensions: { K: 10, H: 0, C: 5, S: 0, G: 6 },
        },
      ],
      suspectedMissedScores: [],
      slowImageTasks: [],
    }));

    expect(digest.shouldSend).toBe(false);
    expect(digest.nearPromotions).toEqual([]);
  });

  it("builds an operator digest with missed scores, slow image tasks, zero C/S/G and near promotions", () => {
    const digest = buildOperatorDigest(input());

    expect(digest.text).toContain("疑似漏分");
    expect(digest.text).toContain("图片海报疑似未入账");
    expect(digest.text).toContain("慢图片任务");
    expect(digest.text).toContain("om-image-1");
    expect(digest.text).toContain("C/S/G 为 0");
    expect(digest.text).toContain("陈三");
    expect(digest.text).toContain("临近晋升");
    expect(digest.nearPromotions.map((item) => item.memberName)).toEqual(["林一", "周二"]);
  });

  it("returns the combined groupNudge and operatorDigest shape used by callers", () => {
    const digest = buildOperationsDigest(input());

    expect(digest.groupNudge).toContain("临近晋升");
    expect(digest.groupNudge).not.toContain("疑似漏分");
    expect(digest.operatorDigest).toContain("疑似漏分");
    expect(digest.operatorDigest).toContain("慢图片任务");
    expect(digest.operatorDigest).toContain("C/S/G 为 0");
  });
});
