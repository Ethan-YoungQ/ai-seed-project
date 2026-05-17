export type ContinuousLevelValue = 1 | 2 | 3 | 4 | 5;
export type ContinuousDimensionTotals = { K: number; H: number; C: number; S: number; G: number };
export type ContinuousPromotionPath =
  | "lv2_main_csg"
  | "lv2_strong_practice"
  | "lv2_multidimensional"
  | "cumulative_threshold";

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
      pathTaken: ContinuousPromotionPath;
      cumulativeAq: number;
    }
  | {
      promoted: false;
      fromLevel: ContinuousLevelValue;
      toLevel: ContinuousLevelValue;
      threshold: number | null;
      pathTaken: null;
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
      pathTaken: null,
      cumulativeAq: input.cumulativeAq,
    };
  }

  const nextLevel = (input.currentLevel + 1) as 2 | 3 | 4 | 5;
  const threshold = CONTINUOUS_PROMOTION_THRESHOLDS[nextLevel];
  const pathTaken = resolveContinuousPromotionPath(input.currentLevel, input.cumulativeAq, input.dimensions);
  if (pathTaken) {
    return {
      promoted: true,
      fromLevel: input.currentLevel,
      toLevel: nextLevel,
      threshold,
      pathTaken,
      cumulativeAq: input.cumulativeAq,
    };
  }

  return {
    promoted: false,
    fromLevel: input.currentLevel,
    toLevel: input.currentLevel,
    threshold,
    pathTaken: null,
    cumulativeAq: input.cumulativeAq,
  };
}

function resolveContinuousPromotionPath(
  currentLevel: ContinuousLevelValue,
  cumulativeAq: number,
  dimensions: ContinuousDimensionTotals = { K: 0, H: 0, C: 0, S: 0, G: 0 },
): ContinuousPromotionPath | null {
  if (currentLevel === 1) {
    if (meetsLv2MainPath(cumulativeAq, dimensions)) return "lv2_main_csg";
    if (meetsLv2StrongPracticePath(cumulativeAq, dimensions)) return "lv2_strong_practice";
    if (meetsLv2MultidimensionalPath(cumulativeAq, dimensions)) return "lv2_multidimensional";
    return null;
  }
  return cumulativeAq >= CONTINUOUS_PROMOTION_THRESHOLDS[(currentLevel + 1) as 3 | 4 | 5]
    ? "cumulative_threshold"
    : null;
}

function countDimensionsAtLeast(
  dimensions: ContinuousDimensionTotals,
  cutoff: number,
): number {
  return Object.values(dimensions).filter((score) => score >= cutoff).length;
}

function countCsgDimensionsAtLeast(
  dimensions: ContinuousDimensionTotals,
  cutoff: number,
): number {
  return [dimensions.C, dimensions.S, dimensions.G]
    .filter((score) => score >= cutoff).length;
}

function hasAnyCsgSignal(dimensions: ContinuousDimensionTotals): boolean {
  return dimensions.C > 0 || dimensions.S > 0 || dimensions.G > 0;
}

function meetsLv2MainPath(
  cumulativeAq: number,
  dimensions: ContinuousDimensionTotals,
): boolean {
  return cumulativeAq >= 24 && hasAnyCsgSignal(dimensions);
}

function meetsLv2StrongPracticePath(
  cumulativeAq: number,
  dimensions: ContinuousDimensionTotals,
): boolean {
  return cumulativeAq >= CONTINUOUS_PROMOTION_THRESHOLDS[2] &&
    countDimensionsAtLeast(dimensions, 8) >= 1;
}

function meetsLv2MultidimensionalPath(
  cumulativeAq: number,
  dimensions: ContinuousDimensionTotals,
): boolean {
  return cumulativeAq >= 20 &&
    countDimensionsAtLeast(dimensions, 5) >= 2 &&
    countCsgDimensionsAtLeast(dimensions, 5) >= 1;
}
