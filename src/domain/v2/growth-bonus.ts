export type GrowthBonusTier =
  | "none"
  | "small"
  | "significant"
  | "leap"
  | "high_base_floor";

export interface GrowthBonusInput {
  currentAqBeforeBonus: number;
  previousWindowAq: number;
  isFirstWindow: boolean;
}

export interface GrowthBonusResult {
  bonus: 0 | 3 | 6 | 10;
  tier: GrowthBonusTier;
}

const PREV_AQ_LOW_FLOOR = 30;
const PREV_AQ_HIGH_BASE_THRESHOLD = 140;
const HIGH_BASE_ABS_DIFF = 12;

const RATIO_LEAP = 1.5;
const RATIO_SIGNIFICANT = 1.3;
const RATIO_SMALL = 1.15;

export function computeGrowthBonus(
  input: GrowthBonusInput
): GrowthBonusResult {
  if (input.isFirstWindow) {
    return { bonus: 0, tier: "none" };
  }

  const { currentAqBeforeBonus, previousWindowAq } = input;
  const effectivePrevAq = Math.max(previousWindowAq, PREV_AQ_LOW_FLOOR);
  const ratio = currentAqBeforeBonus / effectivePrevAq;

  if (ratio >= RATIO_LEAP) {
    return { bonus: 10, tier: "leap" };
  }
  if (ratio >= RATIO_SIGNIFICANT) {
    return { bonus: 6, tier: "significant" };
  }
  if (ratio >= RATIO_SMALL) {
    return { bonus: 3, tier: "small" };
  }

  const absoluteDiff = currentAqBeforeBonus - previousWindowAq;
  if (
    previousWindowAq >= PREV_AQ_HIGH_BASE_THRESHOLD &&
    absoluteDiff >= HIGH_BASE_ABS_DIFF
  ) {
    return { bonus: 3, tier: "high_base_floor" };
  }

  return { bonus: 0, tier: "none" };
}
