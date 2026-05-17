import { describe, expect, test } from "vitest";

import {
  AI_BOOT_RULESET_VERSION,
  CATEGORY_SCORE_RANGES,
  CSG_SCORE_OPPORTUNITIES,
} from "../../../src/domain/v3/scoring-rules.js";

describe("v3 scoring rules", () => {
  test("defines the expected ruleset version", () => {
    expect(AI_BOOT_RULESET_VERSION).toBe("2026-05-17");
  });

  test("defines exactly the expected category score ranges", () => {
    expect(CATEGORY_SCORE_RANGES).toEqual({
      daily_participation: { min: 1, max: 1 },
      ai_artifact: { min: 3, max: 5 },
      ai_practice_reflection: { min: 3, max: 5 },
      prompt_or_method: { min: 4, max: 6 },
      resource_recommendation: { min: 2, max: 3 },
      peer_help: { min: 2, max: 4 },
      formal_task: { min: 1, max: 10 },
      operator_adjustment: { min: -20, max: 20 }
    });
  });

  test("documents relaxed C/S/G scoring opportunities", () => {
    expect(CSG_SCORE_OPPORTUNITIES).toEqual({
      C: [
        "AI 图片",
        "AI 海报",
        "AI 工作流",
        "客户演示",
        "内部工作产物"
      ],
      S: [
        "回答同伴问题",
        "纠错",
        "测试结果"
      ],
      G: [
        "2-3 句具体复盘"
      ]
    });
  });
});
