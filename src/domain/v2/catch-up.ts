import type { AiBootScoreCategory } from "../v3/ai-boot-types.js";
import {
  CONTINUOUS_PROMOTION_THRESHOLDS,
  evaluateContinuousPromotion,
  type ContinuousDimensionTotals,
  type ContinuousLevelValue,
} from "./continuous-promotion.js";

const CATCH_UP_START_PERIOD = 3;
const CATCH_UP_PERIOD_CAP = 8;

const BOOST_MULTIPLIERS: Partial<Record<AiBootScoreCategory, number>> = {
  ai_artifact: 1.5,
  ai_practice_reflection: 1.5,
  prompt_or_method: 1.5,
  peer_help: 1.5,
  formal_task: 1.2,
};

export type CatchUpBonusReason =
  | "eligible"
  | "not_lv1"
  | "period_too_early"
  | "category_not_boosted"
  | "non_positive_score"
  | "period_cap_reached";

export interface CatchUpBonusDecision {
  eligible: boolean;
  bonusScore: number;
  multiplier: number;
  remainingPeriodBonus: number;
  reason: CatchUpBonusReason;
}

export function calculateCatchUpBonus(input: {
  activePeriodNumber: number | null | undefined;
  currentLevel: number;
  category: AiBootScoreCategory;
  scoreDelta: number;
  existingPeriodCatchUpBonus: number;
}): CatchUpBonusDecision {
  const multiplier = BOOST_MULTIPLIERS[input.category] ?? 1;
  const remainingPeriodBonus = Math.max(
    0,
    CATCH_UP_PERIOD_CAP - Math.max(0, input.existingPeriodCatchUpBonus),
  );

  if (input.currentLevel !== 1) {
    return { eligible: false, bonusScore: 0, multiplier, remainingPeriodBonus, reason: "not_lv1" };
  }
  if ((input.activePeriodNumber ?? 0) < CATCH_UP_START_PERIOD) {
    return { eligible: false, bonusScore: 0, multiplier, remainingPeriodBonus, reason: "period_too_early" };
  }
  if (input.scoreDelta <= 0) {
    return { eligible: false, bonusScore: 0, multiplier, remainingPeriodBonus, reason: "non_positive_score" };
  }
  if (multiplier <= 1) {
    return { eligible: false, bonusScore: 0, multiplier, remainingPeriodBonus, reason: "category_not_boosted" };
  }
  if (remainingPeriodBonus <= 0) {
    return { eligible: false, bonusScore: 0, multiplier, remainingPeriodBonus, reason: "period_cap_reached" };
  }

  const rawBonus = Math.floor(input.scoreDelta * ((multiplier * 10) - 10) / 10);
  const bonusScore = Math.min(rawBonus, remainingPeriodBonus);
  if (bonusScore <= 0) {
    return { eligible: false, bonusScore: 0, multiplier, remainingPeriodBonus, reason: "non_positive_score" };
  }

  return { eligible: true, bonusScore, multiplier, remainingPeriodBonus, reason: "eligible" };
}

export interface NearPromotionNudge {
  targetLevel: 2 | 3 | 4 | 5;
  gap: number;
  threshold: number;
}

export function findNearPromotionNudge(input: {
  currentLevel: number;
  totalScore: number;
  dimensions: ContinuousDimensionTotals;
  maxGap: number;
}): NearPromotionNudge | null {
  if (!isContinuousLevel(input.currentLevel) || input.currentLevel >= 5) {
    return null;
  }

  const currentDecision = evaluateContinuousPromotion({
    currentLevel: input.currentLevel,
    cumulativeAq: input.totalScore,
    dimensions: input.dimensions,
  });
  if (currentDecision.promoted) {
    return null;
  }

  const targetLevel = (input.currentLevel + 1) as 2 | 3 | 4 | 5;
  const threshold = CONTINUOUS_PROMOTION_THRESHOLDS[targetLevel];
  const maxGap = Math.max(0, input.maxGap);
  for (let gap = 1; gap <= maxGap; gap += 1) {
    const decision = evaluateContinuousPromotion({
      currentLevel: input.currentLevel,
      cumulativeAq: input.totalScore + gap,
      dimensions: input.dimensions,
    });
    if (decision.promoted) {
      return { targetLevel, gap, threshold };
    }
  }

  return null;
}

function isContinuousLevel(level: number): level is ContinuousLevelValue {
  return level === 1 || level === 2 || level === 3 || level === 4 || level === 5;
}
