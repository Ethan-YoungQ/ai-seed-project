import { describe, expect, it } from "vitest";

import {
  calculateCatchUpBonus,
  findNearPromotionNudge,
} from "../../../src/domain/v2/catch-up.js";

describe("catch-up promotion support", () => {
  it("adds a conservative 1.5x catch-up bonus for high-value Lv1 work in period 3+", () => {
    const bonus = calculateCatchUpBonus({
      activePeriodNumber: 3,
      currentLevel: 1,
      category: "ai_artifact",
      scoreDelta: 4,
      existingPeriodCatchUpBonus: 0,
    });

    expect(bonus).toMatchObject({
      eligible: true,
      bonusScore: 2,
      multiplier: 1.5,
    });
  });

  it("uses 1.2x for formal tasks and does not boost daily participation", () => {
    expect(calculateCatchUpBonus({
      activePeriodNumber: 3,
      currentLevel: 1,
      category: "formal_task",
      scoreDelta: 10,
      existingPeriodCatchUpBonus: 0,
    }).bonusScore).toBe(2);

    expect(calculateCatchUpBonus({
      activePeriodNumber: 3,
      currentLevel: 1,
      category: "daily_participation",
      scoreDelta: 1,
      existingPeriodCatchUpBonus: 0,
    })).toMatchObject({
      eligible: false,
      bonusScore: 0,
      reason: "category_not_boosted",
    });
  });

  it("caps catch-up bonus at 8 AQ per active period", () => {
    const bonus = calculateCatchUpBonus({
      activePeriodNumber: 3,
      currentLevel: 1,
      category: "prompt_or_method",
      scoreDelta: 6,
      existingPeriodCatchUpBonus: 7,
    });

    expect(bonus).toMatchObject({
      eligible: true,
      bonusScore: 1,
      remainingPeriodBonus: 1,
    });
  });

  it("does not boost members who already reached Lv2", () => {
    expect(calculateCatchUpBonus({
      activePeriodNumber: 3,
      currentLevel: 2,
      category: "ai_artifact",
      scoreDelta: 5,
      existingPeriodCatchUpBonus: 0,
    })).toMatchObject({
      eligible: false,
      bonusScore: 0,
      reason: "not_lv1",
    });
  });

  it("finds a near-promotion reminder only when the next level is close but not already satisfied", () => {
    expect(findNearPromotionNudge({
      currentLevel: 1,
      totalScore: 19,
      dimensions: { K: 5, H: 5, C: 0, S: 0, G: 5 },
      maxGap: 5,
    })).toMatchObject({
      targetLevel: 2,
      gap: 1,
    });

    expect(findNearPromotionNudge({
      currentLevel: 1,
      totalScore: 35,
      dimensions: { K: 22, H: 13, C: 0, S: 0, G: 0 },
      maxGap: 5,
    })).toBeNull();
  });
});
