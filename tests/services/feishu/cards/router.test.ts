import Fastify from "fastify";
import { describe, expect, test, vi } from "vitest";

import { feishuCardsPlugin } from "../../../../src/services/feishu/cards/router.js";
import { CardActionDispatcher } from "../../../../src/services/feishu/cards/card-action-dispatcher.js";
import type { CardHandler, CardHandlerDeps } from "../../../../src/services/feishu/cards/types.js";

function emptyDeps(): CardHandlerDeps {
  return {
    repo: {
      insertCardInteraction: vi.fn(() => "inserted" as const),
      findLiveCard: vi.fn(),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => []),
      countReviewRequiredEvents: vi.fn(() => 0),
      findMemberByOpenId: vi.fn(),
      listPriorQuizSelections: vi.fn(() => []),
      insertPeerReviewVote: vi.fn(() => "inserted" as const),
      insertReactionTrackedMessage: vi.fn()
    },
    ingestor: { ingest: vi.fn() },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    adminApiClient: { patchMember: vi.fn(), listMembers: vi.fn() },
    config: {
      groupChatId: "oc-group",
      campId: "camp-1",
      cardVersionCurrent: "v1",
      cardVersionLegacy: "v0",
      radarImageBaseUrl: "https://cdn.example.com"
    },
    requestReappeal: vi.fn(),
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "u-1"
  };
}

async function buildApp() {
  const dispatcher = new CardActionDispatcher(emptyDeps());
  const okHandler: CardHandler = async () => ({
    newCardJson: { schema: "2.0", header: {}, body: { elements: [] } }
  });
  // Register with full action name (with card-type prefix) as used in production.
  // The router resolves cardType from the prefix and passes the full name to dispatch.
  dispatcher.register("quiz", "quiz_submit", okHandler);

  const app = Fastify();
  await app.register(feishuCardsPlugin, {
    dispatcher,
    currentVersion: () => "quiz-v1"
  });
  return app;
}

/** Feishu card action callback payload in the official v2 nested format */
function makeCardActionPayload(
  actionName: string,
  actionValue: Record<string, unknown> = {}
) {
  return {
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      token: "verify-token",
      app_id: "cli_app1"
    },
    event: {
      operator: { open_id: "ou-op" },
      token: "t-1",
      action: { name: actionName, value: actionValue, tag: "button" },
      context: { open_message_id: "om-1", open_chat_id: "oc-1" }
    }
  };
}

describe("feishuCardsPlugin routes", () => {
  test("POST /api/v2/feishu/card-action returns newCardJson wrapped in {type,data} on known handler", async () => {
    const app = await buildApp();
    // The handler is registered for cardType="quiz", actionName="submit".
    // Action name "quiz_submit" resolves to cardType "quiz" via prefix.
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: makeCardActionPayload("quiz_submit", { text: "hi" })
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    // Response must be wrapped: { card: { type: "raw", data: <FeishuCardJson> } }
    expect(body.card?.type).toBe("raw");
    expect(body.card?.data?.schema).toBe("2.0");
    await app.close();
  });

  test("POST /api/v2/feishu/card-action returns toast on unknown action within known card type", async () => {
    const app = await buildApp();
    // "quiz_nonexistent" resolves to cardType "quiz" but no handler for "quiz_nonexistent"
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: makeCardActionPayload("quiz_nonexistent")
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().toast?.type).toBe("error");
    await app.close();
  });

  test("POST /api/v2/feishu/card-action returns 400 on unresolvable card type", async () => {
    const app = await buildApp();
    // Action name without a known prefix cannot be resolved to a card type
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: makeCardActionPayload("unknown_action_xyz")
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("unresolvable_card_type");
    await app.close();
  });

  test("POST /api/v2/feishu/card-action rejects invalid body (missing event) with 400", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: { operator: { open_id: "ou-op" } }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  test("POST /api/v2/feishu/card-action resolves card type from action.value.action fallback", async () => {
    const app = await buildApp();
    // When action name has no known prefix, fallback checks action.value.action field.
    // "bare_action" has no prefix match → fallback to action.value.action = "quiz_submit"
    // → resolves to cardType "quiz". The handler is registered for ("quiz", "bare_action")
    // which doesn't exist so we get a toast error — but the card TYPE was resolved correctly
    // (400 would only happen if cardType is truly unresolvable).
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: makeCardActionPayload("bare_action", { action: "quiz_submit" })
    });
    // cardType resolves via fallback → reaches dispatcher → unknown action → toast error
    expect(response.statusCode).toBe(200);
    expect(response.json().toast?.type).toBe("error");
    await app.close();
  });

  test("POST /api/v2/feishu/commands/:name routes to command dispatcher", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/commands/ping",
      payload: {
        sender: { open_id: "ou-op" },
        chat: { chat_id: "oc-1" },
        message: { message_id: "om-1", text: "/ping" }
      }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("unknown_command");
    await app.close();
  });
});
