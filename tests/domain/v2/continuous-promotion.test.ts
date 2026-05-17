import { describe, expect, it } from "vitest";

import {
  CONTINUOUS_PROMOTION_THRESHOLDS,
  evaluateContinuousPromotion,
} from "../../../src/domain/v2/continuous-promotion";

describe("continuous promotion", () => {
  it("does not promote Lv1 students on final-halved 16 AQ alone", () => {
    expect(CONTINUOUS_PROMOTION_THRESHOLDS[2]).toBe(32);

    for (const cumulativeAq of [16, 17]) {
      expect(evaluateContinuousPromotion({
        currentLevel: 1,
        cumulativeAq,
        dimensions: { K: 2, H: 11, C: 0, S: 3, G: 0 },
      })).toEqual({
        promoted: false,
        fromLevel: 1,
        toLevel: 1,
        threshold: 32,
        cumulativeAq,
      });
    }
  });

  it("promotes Lv1 students through the Lv2 main path with 24 AQ and any C/S/G signal", () => {
    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 24,
      dimensions: { K: 23, H: 0, C: 1, S: 0, G: 0 },
    })).toMatchObject({
      promoted: true,
      fromLevel: 1,
      toLevel: 2,
      threshold: 32,
    });
  });

  it("does not promote through the Lv2 main path when 24 AQ has no C/S/G signal", () => {
    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 24,
      dimensions: { K: 12, H: 12, C: 0, S: 0, G: 0 },
    })).toEqual({
      promoted: false,
      fromLevel: 1,
      toLevel: 1,
      threshold: 32,
      cumulativeAq: 24,
    });
  });

  it("promotes Lv1 students through the Lv2 strong-practice path with 32 AQ and one 8-point dimension", () => {
    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 32,
      dimensions: { K: 8, H: 24, C: 0, S: 0, G: 0 },
    })).toMatchObject({
      promoted: true,
      fromLevel: 1,
      toLevel: 2,
      threshold: 32,
    });
  });

  it("does not promote through the Lv2 strong-practice path when 32 AQ has no 8-point dimension or C/S/G signal", () => {
    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 32,
      dimensions: { K: 7, H: 7, C: 0, S: 0, G: 0 },
    })).toEqual({
      promoted: false,
      fromLevel: 1,
      toLevel: 1,
      threshold: 32,
      cumulativeAq: 32,
    });
  });

  it("promotes Lv1 students through the Lv2 multidimensional path with 20 AQ, two 5-point dimensions, and one C/S/G dimension", () => {
    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 20,
      dimensions: { K: 15, H: 0, C: 5, S: 0, G: 0 },
    })).toMatchObject({
      promoted: true,
      fromLevel: 1,
      toLevel: 2,
      threshold: 32,
    });
  });

  it("does not promote through the Lv2 multidimensional path with fewer than two 5-point dimensions", () => {
    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 20,
      dimensions: { K: 4, H: 4, C: 5, S: 4, G: 3 },
    })).toEqual({
      promoted: false,
      fromLevel: 1,
      toLevel: 1,
      threshold: 32,
      cumulativeAq: 20,
    });
  });

  it("does not promote Lv1 students through the multidimensional path without a 5-point C/S/G dimension", () => {
    expect(evaluateContinuousPromotion({
      currentLevel: 1,
      cumulativeAq: 20,
      dimensions: { K: 10, H: 10, C: 0, S: 0, G: 0 },
    })).toEqual({
      promoted: false,
      fromLevel: 1,
      toLevel: 1,
      threshold: 32,
      cumulativeAq: 20,
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
