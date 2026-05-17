export const AI_BOOT_RULESET_VERSION = "2026-05-17";

export const CATEGORY_SCORE_RANGES = {
  daily_participation: { min: 1, max: 1 },
  ai_artifact: { min: 3, max: 5 },
  ai_practice_reflection: { min: 3, max: 5 },
  prompt_or_method: { min: 4, max: 6 },
  resource_recommendation: { min: 2, max: 3 },
  peer_help: { min: 2, max: 4 },
  formal_task: { min: 1, max: 10 },
  operator_adjustment: { min: -20, max: 20 }
} as const;

export const CSG_SCORE_OPPORTUNITIES = {
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
} as const;
