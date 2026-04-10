import { describe, expect, test } from "vitest";
import {
  buildPeriodOpenCard,
  PERIOD_OPEN_TEMPLATE_ID,
  type PeriodOpenState
} from "../../../../../src/services/feishu/cards/templates/period-open-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function makeState(overrides: Partial<PeriodOpenState> = {}): PeriodOpenState {
  return {
    periodNumber: 2,
    campName: "AI 超能力训练营",
    openedAt: "2026-04-10T09:00:00.000Z",
    ...overrides
  };
}

describe("period-open-v1 template", () => {
  test("PERIOD_OPEN_TEMPLATE_ID is 'period-open-v1'", () => {
    expect(PERIOD_OPEN_TEMPLATE_ID).toBe("period-open-v1");
  });

  test("header contains period number and 已开启", () => {
    const card = buildPeriodOpenCard(makeState({ periodNumber: 3 }));
    const json = JSON.stringify(card);
    expect(json).toContain("第 3 期已开启");
  });

  test("body contains campName and openedAt", () => {
    const state = makeState({
      campName: "超级训练营",
      openedAt: "2026-04-10T09:00:00.000Z"
    });
    const card = buildPeriodOpenCard(state);
    const json = JSON.stringify(card);
    expect(json).toContain("超级训练营");
    expect(json).toContain("2026-04-10T09:00:00.000Z");
  });

  test("card stays within size budget", () => {
    const card = buildPeriodOpenCard(makeState());
    expect(() => assertCardSize(card)).not.toThrow();
  });
});
