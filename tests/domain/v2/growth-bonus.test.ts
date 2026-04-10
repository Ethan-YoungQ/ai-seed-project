import { describe, expect, test } from "vitest";

import {
  computeGrowthBonus,
  type GrowthBonusInput,
  type GrowthBonusTier
} from "../../../src/domain/v2/growth-bonus.js";

interface Row {
  name: string;
  input: GrowthBonusInput;
  expectedBonus: 0 | 3 | 6 | 10;
  expectedTier: GrowthBonusTier;
}

const rows: Row[] = [
  {
    name: "first window yields no bonus regardless of AQ",
    input: { currentAqBeforeBonus: 200, previousWindowAq: 0, isFirstWindow: true },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "first window with zero current AQ",
    input: { currentAqBeforeBonus: 0, previousWindowAq: 0, isFirstWindow: true },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "low-base floor: prev=10 clamped to 30, 36/30=1.20 -> small +3",
    input: { currentAqBeforeBonus: 36, previousWindowAq: 10, isFirstWindow: false },
    expectedBonus: 3,
    expectedTier: "small"
  },
  {
    name: "low-base floor: prev=0 clamped to 30, 45/30=1.50 -> leap +10",
    input: { currentAqBeforeBonus: 45, previousWindowAq: 0, isFirstWindow: false },
    expectedBonus: 10,
    expectedTier: "leap"
  },
  {
    name: "ratio tier none: 110/100=1.10 < 1.15",
    input: { currentAqBeforeBonus: 110, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "ratio tier small: 115/100=1.15 exactly",
    input: { currentAqBeforeBonus: 115, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 3,
    expectedTier: "small"
  },
  {
    name: "ratio tier significant: 130/100=1.30 exactly",
    input: { currentAqBeforeBonus: 130, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 6,
    expectedTier: "significant"
  },
  {
    name: "ratio tier leap: 150/100=1.50 exactly",
    input: { currentAqBeforeBonus: 150, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 10,
    expectedTier: "leap"
  },
  {
    name: "ratio tier leap: 200/100=2.00 well above 1.50",
    input: { currentAqBeforeBonus: 200, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 10,
    expectedTier: "leap"
  },
  {
    name: "high-base floor: prev=140, diff=+12 -> high_base_floor +3",
    input: { currentAqBeforeBonus: 152, previousWindowAq: 140, isFirstWindow: false },
    expectedBonus: 3,
    expectedTier: "high_base_floor"
  },
  {
    name: "high-base floor: prev=200, diff=+11 -> no bonus (ratio 1.055 < 1.15 and diff < 12)",
    input: { currentAqBeforeBonus: 211, previousWindowAq: 200, isFirstWindow: false },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "high-base floor overridden by ratio tier when ratio wins (prev=140, cur=210, ratio=1.50)",
    input: { currentAqBeforeBonus: 210, previousWindowAq: 140, isFirstWindow: false },
    expectedBonus: 10,
    expectedTier: "leap"
  },
  {
    name: "high-base floor does NOT activate when prev < 140",
    input: { currentAqBeforeBonus: 151, previousWindowAq: 139, isFirstWindow: false },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "regression drop: current < previous yields no bonus",
    input: { currentAqBeforeBonus: 80, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "just below small tier: 114/100=1.14",
    input: { currentAqBeforeBonus: 114, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 0,
    expectedTier: "none"
  },
  {
    name: "just below leap tier: 149/100=1.49 -> significant +6",
    input: { currentAqBeforeBonus: 149, previousWindowAq: 100, isFirstWindow: false },
    expectedBonus: 6,
    expectedTier: "significant"
  }
];

describe("computeGrowthBonus", () => {
  test.each(rows)("$name", ({ input, expectedBonus, expectedTier }) => {
    const result = computeGrowthBonus(input);
    expect(result.bonus).toBe(expectedBonus);
    expect(result.tier).toBe(expectedTier);
  });

  test("returns a new object; does not mutate input", () => {
    const input: GrowthBonusInput = {
      currentAqBeforeBonus: 130,
      previousWindowAq: 100,
      isFirstWindow: false
    };
    const snapshot = { ...input };
    computeGrowthBonus(input);
    expect(input).toEqual(snapshot);
  });
});
