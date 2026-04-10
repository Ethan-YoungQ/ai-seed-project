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
  dispatcher.register("quiz", "submit", okHandler);

  const app = Fastify();
  await app.register(feishuCardsPlugin, {
    dispatcher,
    currentVersion: () => "quiz-v1"
  });
  return app;
}

describe("feishuCardsPlugin routes", () => {
  test("POST /api/v2/feishu/card-action returns newCardJson on known handler", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: {
        operator: { open_id: "ou-op" },
        trigger_id: "t-1",
        action: { name: "submit", value: { text: "hi" } },
        context: { open_message_id: "om-1", open_chat_id: "oc-1", url: "https://example.com" },
        card: { type: "quiz" }
      }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.card?.schema).toBe("2.0");
    await app.close();
  });

  test("POST /api/v2/feishu/card-action returns toast on unknown action", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: {
        operator: { open_id: "ou-op" },
        trigger_id: "t-2",
        action: { name: "nonexistent", value: {} },
        context: { open_message_id: "om-2", open_chat_id: "oc-2", url: "x" },
        card: { type: "quiz" }
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().toast?.type).toBe("error");
    await app.close();
  });

  test("POST /api/v2/feishu/card-action rejects invalid body with 400", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v2/feishu/card-action",
      payload: { operator: { open_id: "ou-op" } }
    });
    expect(response.statusCode).toBe(400);
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
