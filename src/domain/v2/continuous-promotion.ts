export type ContinuousLevelValue = 1 | 2 | 3 | 4 | 5;
export type ContinuousDimensionTotals = { K: number; H: number; C: number; S: number; G: number };

export const CONTINUOUS_PROMOTION_THRESHOLDS: Record<2 | 3 | 4 | 5, number> = {
  2: 32,
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
  dimensions?: ContinuousDimensionTotals;
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
  if (meetsContinuousPromotion(input.currentLevel, input.cumulativeAq, input.dimensions)) {
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

function meetsContinuousPromotion(
  currentLevel: ContinuousLevelValue,
  cumulativeAq: number,
  dimensions: ContinuousDimensionTotals = { K: 0, H: 0, C: 0, S: 0, G: 0 },
): boolean {
  if (currentLevel === 1) {
    return meetsLv2Primary(cumulativeAq, dimensions) ||
      meetsLv2Alternate(cumulativeAq, dimensions);
  }
  return cumulativeAq >= CONTINUOUS_PROMOTION_THRESHOLDS[(currentLevel + 1) as 3 | 4 | 5];
}

function countDimensionsAtLeast(
  dimensions: ContinuousDimensionTotals,
  cutoff: number,
): number {
  return Object.values(dimensions).filter((score) => score >= cutoff).length;
}

function meetsLv2Primary(
  cumulativeAq: number,
  dimensions: ContinuousDimensionTotals,
): boolean {
  return cumulativeAq >= CONTINUOUS_PROMOTION_THRESHOLDS[2] &&
    countDimensionsAtLeast(dimensions, 8) >= 1;
}

function meetsLv2Alternate(
  cumulativeAq: number,
  dimensions: ContinuousDimensionTotals,
): boolean {
  return cumulativeAq >= 56 &&
    countDimensionsAtLeast(dimensions, 5) >= 2;
}
