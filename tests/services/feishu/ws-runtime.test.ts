import { beforeEach, describe, expect, test, vi } from "vitest";

const larkMock = vi.hoisted(() => ({
  handlers: {} as Record<string, (data: unknown) => Promise<unknown>>,
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@larksuiteoapi/node-sdk", () => ({
  EventDispatcher: vi.fn().mockImplementation(() => ({
    register: vi.fn((handlers: Record<string, (data: unknown) => Promise<unknown>>) => {
      larkMock.handlers = handlers;
      return { handlers };
    }),
  })),
  WSClient: vi.fn().mockImplementation(() => ({
    start: larkMock.start,
    stop: larkMock.stop,
  })),
  LoggerLevel: { info: "info" },
}));

import type { FeishuConfig } from "../../../src/services/feishu/config.js";
import { LarkFeishuWsRuntime, normalizeCardActionTriggerData } from "../../../src/services/feishu/ws-runtime.js";

function makeConfig(overrides: Partial<FeishuConfig> = {}): FeishuConfig {
  return {
    enabled: true,
    appId: "cli_a",
    appSecret: "secret",
    eventMode: "long_connection",
    botChatId: "oc-group",
    botReceiveIdType: "chat_id",
    phaseOne: {},
    base: {
      enabled: false,
      tables: {},
    },
    ...overrides,
  };
}

beforeEach(() => {
  larkMock.handlers = {};
  larkMock.start.mockClear();
  larkMock.stop.mockClear();
});

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

describe("LarkFeishuWsRuntime reaction events", () => {
  test("routes normalized reaction event to onMessage with non-empty chatId and reaction messageType", async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const runtime = new LarkFeishuWsRuntime(makeConfig(), onMessage);
    await runtime.start();

    await larkMock.handlers["im.message.reaction.created_v1"]({
      event: {
        message_id: "om-source",
        user_id: { open_id: "ou-actor" },
        reaction_type: { emoji_type: "THUMBSUP" },
        create_time: "1775210400000",
      },
    });

    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "reaction:om-source:ou-actor",
      memberId: "ou-actor",
      chatId: "oc-group",
      chatType: "group",
      messageType: "reaction",
      rawText: "[表情回应: THUMBSUP]",
      cleanedText: "[表情回应: THUMBSUP]",
      eventTime: new Date(1775210400000).toISOString(),
      eventUrl: "feishu://reaction/om-source",
    }));
  });

  test("does not call onMessage for reaction events when botChatId is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const runtime = new LarkFeishuWsRuntime(makeConfig({ botChatId: undefined }), onMessage);
    await runtime.start();

    await larkMock.handlers["im.message.reaction.created_v1"]({
      event: {
        message_id: "om-source",
        user_id: { open_id: "ou-actor" },
        reaction_type: { emoji_type: "THUMBSUP" },
        create_time: "1775210400000",
      },
    });

    expect(onMessage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("missing botChatId"));

    warn.mockRestore();
  });
});
