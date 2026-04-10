import { describe, expect, test } from "vitest";
import {
  buildGraduationCard,
  GRADUATION_TEMPLATE_ID,
  type GraduationState
} from "../../../../../src/services/feishu/cards/templates/graduation-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function makeState(overrides: Partial<GraduationState> = {}): GraduationState {
  return {
    campName: "AI 超能力训练营",
    totalPeriods: 8,
    graduatedAt: "2026-06-01T18:00:00.000Z",
    ...overrides
  };
}

describe("graduation-v1 template", () => {
  test("GRADUATION_TEMPLATE_ID is 'graduation-v1'", () => {
    expect(GRADUATION_TEMPLATE_ID).toBe("graduation-v1");
  });

  test("header contains campName and 结业典礼", () => {
    const card = buildGraduationCard(makeState({ campName: "测试营" }));
    const json = JSON.stringify(card);
    expect(json).toContain("测试营");
    expect(json).toContain("结业典礼");
  });

  test("body contains totalPeriods and graduatedAt", () => {
    const card = buildGraduationCard(makeState({ totalPeriods: 12 }));
    const json = JSON.stringify(card);
    expect(json).toContain("12");
    expect(json).toContain("2026-06-01T18:00:00.000Z");
  });

  test("card stays within size budget", () => {
    const card = buildGraduationCard(makeState());
    expect(() => assertCardSize(card)).not.toThrow();
  });
});
