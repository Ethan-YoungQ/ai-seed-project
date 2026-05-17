import { describe, expect, test } from "vitest";

import { normalizeCardActionTriggerData } from "../../../src/services/feishu/ws-runtime.js";

describe("normalizeCardActionTriggerData", () => {
  test("normalizes flat long-connection card action data", () => {
    const normalized = normalizeCardActionTriggerData({
      operator: { open_id: "ou-operator" },
      action: {
        name: "dynamic_component_name",
        tag: "button",
        value: { action: "review_approve", eventId: "evt-1" },
      },
      open_message_id: "om-flat",
      open_chat_id: "oc-flat",
    });

    expect(normalized.operatorId).toBe("ou-operator");
    expect(normalized.messageId).toBe("om-flat");
    expect(normalized.chatId).toBe("oc-flat");
    expect(normalized.action.value.action).toBe("review_approve");
  });

  test("normalizes nested event/context card action data", () => {
    const normalized = normalizeCardActionTriggerData({
      schema: "2.0",
      event: {
        operator: { open_id: "ou-operator" },
        action: {
          name: "dynamic_component_name",
          tag: "button",
          value: { action: "review_reject", eventId: "evt-2" },
          form_value: { reason: "wrong item" },
        },
        context: {
          open_message_id: "om-nested",
          open_chat_id: "oc-nested",
        },
      },
    });

    expect(normalized.operatorId).toBe("ou-operator");
    expect(normalized.messageId).toBe("om-nested");
    expect(normalized.chatId).toBe("oc-nested");
    expect(normalized.action.value.action).toBe("review_reject");
    expect(normalized.action.form_value.reason).toBe("wrong item");
  });
});
