import { describe, expect, test } from "vitest";
import { getDimensionColor, DIMENSION_LABELS, DIMENSION_COLORS } from "../../src/lib/colors";

describe("colors", () => {
  test("getDimensionColor returns correct color", () => {
    expect(getDimensionColor("K")).toBe("#00ff88");
    expect(getDimensionColor("H")).toBe("#ff6b35");
  });
  test("DIMENSION_LABELS has all 5 keys", () => {
    expect(Object.keys(DIMENSION_LABELS)).toHaveLength(5);
  });
  test("DIMENSION_COLORS has all 5 keys", () => {
    expect(Object.keys(DIMENSION_COLORS)).toHaveLength(5);
  });
});
