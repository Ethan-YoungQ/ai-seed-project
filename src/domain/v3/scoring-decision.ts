import { z } from "zod";

import type {
  AiBootConfidence,
  AiBootDecisionStatus,
  AiBootNotifyPolicy,
  AiBootScoreCategory
} from "./ai-boot-types.js";
import { CATEGORY_SCORE_RANGES } from "./scoring-rules.js";

const scoreCategorySchema = z.enum([
  "daily_participation",
  "ai_artifact",
  "ai_practice_reflection",
  "prompt_or_method",
  "resource_recommendation",
  "peer_help",
  "formal_task",
  "operator_adjustment"
]);

const decisionStatusSchema = z.enum([
  "approved",
  "review_required",
  "rejected",
  "no_score",
  "shadow"
]);

const notifyPolicySchema = z.enum([
  "silent",
  "personal_reply",
  "group_praise",
  "daily_digest"
]);

const confidenceSchema = z.enum(["high", "medium", "low"]);

const nonBlankStringSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "Required audit text must not be blank"
});

const scoringDecisionSchema = z.object({
  status: decisionStatusSchema,
  category: scoreCategorySchema,
  scoreDelta: z.number().finite(),
  confidence: confidenceSchema,
  notifyPolicy: notifyPolicySchema,
  reason: nonBlankStringSchema,
  evidence: nonBlankStringSchema,
  badges: z.array(
    z.string().refine((value) => value.trim().length > 0, {
      message: "Badge must not be blank"
    })
  )
});

export interface ScoringDecision {
  status: AiBootDecisionStatus;
  category: AiBootScoreCategory;
  scoreDelta: number;
  confidence: AiBootConfidence;
  notifyPolicy: AiBootNotifyPolicy;
  reason: string;
  evidence: string;
  badges: string[];
}

export function parseScoringDecision(raw: unknown): ScoringDecision {
  return normalizeDecision(scoringDecisionSchema.parse(raw));
}

export function normalizeDecision(input: ScoringDecision): ScoringDecision {
  const badges = normalizeBadges(input.badges);

  if (input.status === "no_score" || input.status === "rejected") {
    return {
      ...input,
      badges,
      scoreDelta: 0,
      notifyPolicy: "silent"
    };
  }

  if (input.category === "daily_participation") {
    return {
      ...input,
      badges,
      scoreDelta: 1
    };
  }

  const range = CATEGORY_SCORE_RANGES[input.category];
  const scoreDelta = Math.min(
    range.max,
    Math.max(range.min, Math.round(input.scoreDelta))
  );

  return {
    ...input,
    badges,
    scoreDelta
  };
}

export function noScoreDecision(
  reason: string,
  evidence: string
): ScoringDecision {
  return parseScoringDecision({
    status: "no_score",
    category: "daily_participation",
    scoreDelta: 0,
    confidence: "low",
    notifyPolicy: "silent",
    reason,
    evidence,
    badges: []
  });
}

function normalizeBadges(badges: string[]): string[] {
  return [...new Set(badges)].slice(0, 5);
}
