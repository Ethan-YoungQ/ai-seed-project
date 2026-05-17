import { describe, expect, it } from "vitest";

import {
  CONTINUOUS_PROMOTION_THRESHOLDS,
  evaluateContinuousPromotion,
} from "../../../src/domain/v2/continuous-promotion";

describe("continuous promotion", () => {
  it("promotes Lv1 students as soon as cumulative AQ reaches the calibrated Lv2 threshold", () => {
    expect(CONTINUOUS_PROMOTION_THRESHOLDS[2]).toBe(16);

    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 16,
    })).toMatchObject({
      promoted: true,
      fromLevel: 1,
      toLevel: 2,
      threshold: 16,
    });
  });

  it("does not promote when cumulative AQ is below the next threshold", () => {
    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 15,
    })).toEqual({
      promoted: false,
      fromLevel: 1,
      toLevel: 1,
      threshold: 16,
      cumulativeAq: 15,
    });
  });

  it("promotes only one level per evaluation to avoid restart-time level jumps", () => {
    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 90,
    })).toMatchObject({
      promoted: true,
      fromLevel: 1,
      toLevel: 2,
      threshold: 16,
    });
  });
});
