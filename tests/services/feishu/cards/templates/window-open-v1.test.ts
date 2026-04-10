import { describe, expect, test } from "vitest";
import {
  buildWindowOpenCard,
  WINDOW_OPEN_TEMPLATE_ID,
  type WindowOpenState
} from "../../../../../src/services/feishu/cards/templates/window-open-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";

function makeState(overrides: Partial<WindowOpenState> = {}): WindowOpenState {
  return {
    windowCode: "W1",
    periodNumber: 2,
    openedAt: "2026-04-10T09:00:00.000Z",
    ...overrides
  };
}

describe("window-open-v1 template", () => {
  test("WINDOW_OPEN_TEMPLATE_ID is 'window-open-v1'", () => {
    expect(WINDOW_OPEN_TEMPLATE_ID).toBe("window-open-v1");
  });

  test("header contains windowCode and 窗口已开启", () => {
    const card = buildWindowOpenCard(makeState({ windowCode: "W2" }));
    const json = JSON.stringify(card);
    expect(json).toContain("W2");
    expect(json).toContain("窗口已开启");
  });

  test("body contains periodNumber and openedAt", () => {
    const card = buildWindowOpenCard(makeState({ periodNumber: 5 }));
    const json = JSON.stringify(card);
    expect(json).toContain("第 5 期");
    expect(json).toContain("2026-04-10T09:00:00.000Z");
  });

  test("card stays within size budget", () => {
    const card = buildWindowOpenCard(makeState());
    expect(() => assertCardSize(card)).not.toThrow();
  });
});
