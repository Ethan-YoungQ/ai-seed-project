import { describe, expect, test } from "vitest";

import {
  renderCard,
  assertCardSize,
  registerTemplate,
  clearTemplateRegistry,
  CARD_SIZE_LIMIT_BYTES,
  CARD_SIZE_BUDGET_BYTES
} from "../../../../src/services/feishu/cards/renderer.js";
import type {
  FeishuCardJson,
  CardActionContext
} from "../../../../src/services/feishu/cards/types.js";

function fakeCtx(): CardActionContext {
  return {
    operatorOpenId: "ou-op",
    triggerId: "t-1",
    actionName: "unused",
    actionPayload: {},
    messageId: "om-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "test-v1"
  };
}

describe("renderer", () => {
  test("registerTemplate + renderCard dispatches to registered builder", () => {
    clearTemplateRegistry();
    registerTemplate("dummy-v1", (state: { title: string }) => ({
      schema: "2.0",
      header: { title: { tag: "plain_text", content: state.title }, template: "blue" },
      body: { elements: [] }
    }));

    const card = renderCard("dummy-v1", { title: "hello" }, fakeCtx());
    expect(card.schema).toBe("2.0");
    expect((card.header as any).title.content).toBe("hello");
  });

  test("renderCard throws for unregistered template id", () => {
    clearTemplateRegistry();
    expect(() => renderCard("missing-v1", {}, fakeCtx())).toThrow(
      /template not registered: missing-v1/i
    );
  });

  test("assertCardSize accepts cards under the budget", () => {
    const card: FeishuCardJson = {
      schema: "2.0",
      header: {},
      body: { elements: [{ tag: "markdown", content: "small" }] }
    };
    expect(() => assertCardSize(card)).not.toThrow();
  });

  test("assertCardSize throws when over CARD_SIZE_BUDGET_BYTES", () => {
    const big = "x".repeat(CARD_SIZE_BUDGET_BYTES + 1);
    const card: FeishuCardJson = {
      schema: "2.0",
      header: {},
      body: { elements: [{ tag: "markdown", content: big }] }
    };
    expect(() => assertCardSize(card)).toThrow(/card payload exceeds/i);
  });

  test("CARD_SIZE_BUDGET_BYTES stays under Feishu's 30 KB hard limit", () => {
    expect(CARD_SIZE_BUDGET_BYTES).toBeLessThanOrEqual(CARD_SIZE_LIMIT_BYTES);
    expect(CARD_SIZE_LIMIT_BYTES).toBe(30 * 1024);
  });
});
