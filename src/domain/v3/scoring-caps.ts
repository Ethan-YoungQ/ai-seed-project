import type { AiBootDecisionStatus, AiBootScoreCategory } from "./ai-boot-types.js";
import { V3_CATEGORY_PERIOD_CAPS } from "./scoring-rules.js";

export interface V3CategoryPeriodCapInput {
  category: AiBootScoreCategory;
  requestedScoreDelta: number;
  approvedCategoryScore: number;
}

export interface V3CategoryPeriodCapResult {
  status: Extract<AiBootDecisionStatus, "approved" | "no_score">;
  scoreDelta: number;
  capRemainingBefore: number | null;
  capped: boolean;
}

export function computeV3CategoryCapRemaining(
  category: AiBootScoreCategory,
  approvedCategoryScore: number
): number | null {
  const cap = V3_CATEGORY_PERIOD_CAPS[category];
  if (cap === null) {
    return null;
  }
  return Math.max(0, cap - Math.max(0, approvedCategoryScore));
}

export function applyV3CategoryPeriodCap(
  input: V3CategoryPeriodCapInput
): V3CategoryPeriodCapResult {
  const remaining = computeV3CategoryCapRemaining(
    input.category,
    input.approvedCategoryScore
  );

  if (remaining === null || input.requestedScoreDelta <= 0) {
    return {
      status: "approved",
      scoreDelta: input.requestedScoreDelta,
      capRemainingBefore: remaining,
      capped: false,
    };
  }

  if (remaining <= 0) {
    return {
      status: "no_score",
      scoreDelta: 0,
      capRemainingBefore: 0,
      capped: true,
    };
  }

  const scoreDelta = Math.min(input.requestedScoreDelta, remaining);
  return {
    status: "approved",
    scoreDelta,
    capRemainingBefore: remaining,
    capped: scoreDelta !== input.requestedScoreDelta,
  };
}
