export const AI_BOOT_RULESET_VERSION = "2026-05-16";

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
