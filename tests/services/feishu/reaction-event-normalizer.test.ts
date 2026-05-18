import { describe, expect, it } from "vitest";

import { normalizeReactionEvent } from "../../../src/services/feishu/reaction-event-normalizer.js";

describe("normalizeReactionEvent", () => {
  it("normalizes nested reaction payloads", () => {
    const normalized = normalizeReactionEvent({
      event: {
        message_id: "om-nested",
        user_id: { open_id: "ou-user" },
        chat_id: "oc-chat",
        reaction_type: { emoji_type: "THUMBSUP" },
        create_time: "1775210400000",
      },
    });

    expect(normalized).toEqual({
      messageId: "om-nested",
      actorOpenId: "ou-user",
      chatId: "oc-chat",
      emoji: "THUMBSUP",
      occurredAt: new Date(1775210400000).toISOString(),
    });
  });

  it("normalizes flat reaction payloads with operator actor", () => {
    const normalized = normalizeReactionEvent({
      message_id: "om-flat",
      operator: { operator_id: "ou-operator" },
      open_chat_id: "oc-open-flat",
      reaction_type: { emoji_type: "SMILE" },
      create_time: "1775210401000",
    });

    expect(normalized).toEqual({
      messageId: "om-flat",
      actorOpenId: "ou-operator",
      chatId: "oc-open-flat",
      emoji: "SMILE",
      occurredAt: new Date(1775210401000).toISOString(),
    });
  });

  it("normalizes nested context open chat id", () => {
    const normalized = normalizeReactionEvent({
      event: {
        message_id: "om-context",
        user_id: { open_id: "ou-user" },
        context: { open_chat_id: "oc-context" },
        reaction_type: { emoji_type: "HEART" },
        create_time: "1775210402000",
      },
    });

    expect(normalized?.chatId).toBe("oc-context");
  });

  it("returns null when message id is missing", () => {
    const normalized = normalizeReactionEvent({
      event: {
        user_id: { open_id: "ou-user" },
        reaction_type: { emoji_type: "THUMBSUP" },
        create_time: "1775210400000",
      },
    });

    expect(normalized).toBeNull();
  });

  it("returns null when actor is missing", () => {
    const normalized = normalizeReactionEvent({
      event: {
        message_id: "om-nested",
        reaction_type: { emoji_type: "THUMBSUP" },
        create_time: "1775210400000",
      },
    });

    expect(normalized).toBeNull();
  });

  it("falls back to now when create_time is not a millisecond string", () => {
    const normalized = normalizeReactionEvent(
      {
        event: {
          message_id: "om-nested",
          user_id: { open_id: "ou-user" },
          reaction_type: { emoji_type: "THUMBSUP" },
          create_time: "not-ms",
        },
      },
      () => new Date("2026-05-18T01:02:03.000Z"),
    );

    expect(normalized?.occurredAt).toBe("2026-05-18T01:02:03.000Z");
  });
});
