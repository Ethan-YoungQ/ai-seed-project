import { describe, expect, it } from "vitest";

import {
  applyV3CategoryPeriodCap,
  computeV3CategoryCapRemaining,
} from "../../../src/domain/v3/scoring-caps.js";
import { V3_CATEGORY_PERIOD_CAPS } from "../../../src/domain/v3/scoring-rules.js";

describe("v3 scoring period caps", () => {
  it("keeps v2-derived cap values explicit for each score category", () => {
    expect(V3_CATEGORY_PERIOD_CAPS).toEqual({
      daily_participation: 3,
      ai_artifact: 8,
      ai_practice_reflection: 6,
      prompt_or_method: 5,
      resource_recommendation: 4,
      peer_help: 6,
      formal_task: 10,
      operator_adjustment: null,
    });
  });

  it("caps positive score at the remaining category allowance", () => {
    expect(applyV3CategoryPeriodCap({
      category: "ai_artifact",
      requestedScoreDelta: 5,
      approvedCategoryScore: 6,
    })).toEqual({
      status: "approved",
      scoreDelta: 2,
      capRemainingBefore: 2,
      capped: true,
    });
  });

  it("turns positive score into no_score after category cap is exhausted", () => {
    expect(applyV3CategoryPeriodCap({
      category: "ai_artifact",
      requestedScoreDelta: 4,
      approvedCategoryScore: 8,
    })).toEqual({
      status: "no_score",
      scoreDelta: 0,
      capRemainingBefore: 0,
      capped: true,
    });
  });

  it("does not cap operator adjustments or negative corrections", () => {
    expect(applyV3CategoryPeriodCap({
      category: "operator_adjustment",
      requestedScoreDelta: -5,
      approvedCategoryScore: 99,
    })).toEqual({
      status: "approved",
      scoreDelta: -5,
      capRemainingBefore: null,
      capped: false,
    });
  });

  it("computes remaining allowance from approved category score", () => {
    expect(computeV3CategoryCapRemaining("formal_task", 7)).toBe(3);
    expect(computeV3CategoryCapRemaining("formal_task", 12)).toBe(0);
    expect(computeV3CategoryCapRemaining("operator_adjustment", 99)).toBeNull();
  });
});
