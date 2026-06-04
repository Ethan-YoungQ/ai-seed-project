import { describe, expect, it } from "vitest";

import { shouldBackfillContinuousPromotion } from "../src/v2-production-wiring.js";

describe("v2 production wiring", () => {
  it("runs continuous promotion backfill by default and allows an explicit opt-out", () => {
    expect(shouldBackfillContinuousPromotion(undefined)).toBe(true);
    expect(shouldBackfillContinuousPromotion("true")).toBe(true);
    expect(shouldBackfillContinuousPromotion("false")).toBe(false);
    expect(shouldBackfillContinuousPromotion("FALSE")).toBe(false);
  });
});
