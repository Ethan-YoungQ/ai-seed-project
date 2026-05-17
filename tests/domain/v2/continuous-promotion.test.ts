import { describe, expect, it } from "vitest";

import {
  CONTINUOUS_PROMOTION_THRESHOLDS,
  evaluateContinuousPromotion,
} from "../../../src/domain/v2/continuous-promotion";

describe("continuous promotion", () => {
  it("does not promote Lv1 students on final-halved 16 AQ alone", () => {
    expect(CONTINUOUS_PROMOTION_THRESHOLDS[2]).toBe(32);

    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 16,
      dimensions: { K: 2, H: 11, C: 0, S: 3, G: 0 },
    })).toEqual({
      promoted: false,
      fromLevel: 1,
      toLevel: 1,
      threshold: 32,
      cumulativeAq: 16,
    });
  });

  it("promotes Lv1 students only when current scores satisfy the original Lv2 primary path", () => {
    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 32,
      dimensions: { K: 8, H: 14, C: 5, S: 0, G: 5 },
    })).toMatchObject({
      promoted: true,
      fromLevel: 1,
      toLevel: 2,
      threshold: 32,
    });
  });

  it("does not promote when cumulative AQ is below the next threshold", () => {
    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 15,
      dimensions: { K: 15, H: 0, C: 0, S: 0, G: 0 },
    })).toEqual({
      promoted: false,
      fromLevel: 1,
      toLevel: 1,
      threshold: 32,
      cumulativeAq: 15,
    });
  });

  it("promotes only one level per evaluation to avoid restart-time level jumps", () => {
    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 90,
      dimensions: { K: 30, H: 20, C: 20, S: 10, G: 10 },
    })).toMatchObject({
      promoted: true,
      fromLevel: 1,
      toLevel: 2,
      threshold: 32,
    });
  });
});
