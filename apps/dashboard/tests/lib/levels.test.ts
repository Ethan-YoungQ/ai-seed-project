import { describe, expect, test } from "vitest";
import { getLevelConfig, getPromotionDirection, LEVEL_CONFIGS } from "../../src/lib/levels";

describe("levels", () => {
  test("getLevelConfig returns correct config for each level", () => {
    expect(getLevelConfig(1).name).toBe("AI 潜力股");
    expect(getLevelConfig(3).color).toBe("#3b82f6");
    expect(getLevelConfig(5).emoji).toBe("💎");
  });
  test("getLevelConfig falls back to level 1 for unknown", () => {
    expect(getLevelConfig(99).level).toBe(1);
  });
  test("getPromotionDirection returns correct direction", () => {
    expect(getPromotionDirection(1, 3)).toBe("promoted");
    expect(getPromotionDirection(3, 1)).toBe("demoted");
    expect(getPromotionDirection(2, 2)).toBe("held");
  });
  test("LEVEL_CONFIGS has 5 entries", () => {
    expect(LEVEL_CONFIGS).toHaveLength(5);
  });
});
