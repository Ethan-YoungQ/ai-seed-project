export type ContinuousLevelValue = 1 | 2 | 3 | 4 | 5;

export const CONTINUOUS_PROMOTION_THRESHOLDS: Record<2 | 3 | 4 | 5, number> = {
  2: 16,
  3: 64,
  4: 128,
  5: 224,
};

export type ContinuousPromotionDecision =
  | {
      promoted: true;
      fromLevel: ContinuousLevelValue;
      toLevel: 2 | 3 | 4 | 5;
      threshold: number;
      cumulativeAq: number;
    }
  | {
      promoted: false;
      fromLevel: ContinuousLevelValue;
      toLevel: ContinuousLevelValue;
      threshold: number | null;
      cumulativeAq: number;
    };

export function evaluateContinuousPromotion(input: {
  currentLevel: ContinuousLevelValue;
  cumulativeAq: number;
}): ContinuousPromotionDecision {
  if (input.currentLevel >= 5) {
    return {
      promoted: false,
      fromLevel: 5,
      toLevel: 5,
      threshold: null,
      cumulativeAq: input.cumulativeAq,
    };
  }

  const nextLevel = (input.currentLevel + 1) as 2 | 3 | 4 | 5;
  const threshold = CONTINUOUS_PROMOTION_THRESHOLDS[nextLevel];
  if (input.cumulativeAq >= threshold) {
    return {
      promoted: true,
      fromLevel: input.currentLevel,
      toLevel: nextLevel,
      threshold,
      cumulativeAq: input.cumulativeAq,
    };
  }

  return {
    promoted: false,
    fromLevel: input.currentLevel,
    toLevel: input.currentLevel,
    threshold,
    cumulativeAq: input.cumulativeAq,
  };
}
