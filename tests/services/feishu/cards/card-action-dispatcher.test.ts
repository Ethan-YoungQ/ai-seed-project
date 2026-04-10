import { describe, expect, test, vi } from "vitest";

import {
  CardActionDispatcher,
  type DispatchInput
} from "../../../../src/services/feishu/cards/card-action-dispatcher.js";
import type {
  CardHandler,
  CardHandlerDeps,
  FeishuCardJson
} from "../../../../src/services/feishu/cards/types.js";
import {
  NotEligibleError,
  PerPeriodCapExceededError,
  InvalidDecisionStateError
} from "../../../../src/domain/v2/errors.js";

function fakeDeps(): CardHandlerDeps {
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

const dummyCard: FeishuCardJson = {
  schema: "2.0",
  header: {},
  body: { elements: [] }
};

const baseInput: DispatchInput = {
  cardType: "quiz",
  actionName: "submit",
  payload: { text: "hello" },
  operatorOpenId: "ou-op",
  triggerId: "t-1",
  messageId: "om-1",
  chatId: "oc-1",
  receivedAt: "2026-04-10T12:00:00.000Z",
  currentVersion: "quiz-v1"
};

describe("CardActionDispatcher", () => {
  test("routes to registered handler by (cardType, actionName)", async () => {
    const handler: CardHandler = vi.fn(async () => ({ newCardJson: dummyCard }));
    const d = new CardActionDispatcher(fakeDeps());
    d.register("quiz", "submit", handler);
    const result = await d.dispatch(baseInput);
    expect(handler).toHaveBeenCalledOnce();
    expect(result.newCardJson).toBe(dummyCard);
  });

  test("unknown (cardType, actionName) returns toast with 'unknown_action'", async () => {
    const d = new CardActionDispatcher(fakeDeps());
    const result = await d.dispatch({ ...baseInput, actionName: "ghost" });
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toMatch(/unknown_action|未知操作/);
  });

  test("NotEligibleError → toast 'not_eligible'", async () => {
    const handler: CardHandler = vi.fn(async () => { throw new NotEligibleError("m-1"); });
    const d = new CardActionDispatcher(fakeDeps());
    d.register("quiz", "submit", handler);
    const result = await d.dispatch(baseInput);
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("不在本营");
  });

  test("PerPeriodCapExceededError → toast 'cap_exceeded' but type=info", async () => {
    const handler: CardHandler = vi.fn(async () => { throw new PerPeriodCapExceededError("m-1", "K3", 3); });
    const d = new CardActionDispatcher(fakeDeps());
    d.register("quiz", "submit", handler);
    const result = await d.dispatch(baseInput);
    expect(result.toast?.type).toBe("info");
    expect(result.toast?.content).toContain("满额");
  });

  test("InvalidDecisionStateError → toast warn, content references operator", async () => {
    const handler: CardHandler = vi.fn(async () => { throw new InvalidDecisionStateError("evt-1", "approved"); });
    const d = new CardActionDispatcher(fakeDeps());
    d.register("quiz", "submit", handler);
    const result = await d.dispatch(baseInput);
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("已被");
  });

  test("Unknown Error is caught and returns a generic error toast", async () => {
    const handler: CardHandler = vi.fn(async () => { throw new Error("unexpected crash"); });
    const d = new CardActionDispatcher(fakeDeps());
    d.register("quiz", "submit", handler);
    const result = await d.dispatch(baseInput);
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toMatch(/未知错误|error/i);
  });

  test("Handler returning neither newCardJson nor toast is an error", async () => {
    const handler: CardHandler = vi.fn(async () => ({} as never));
    const d = new CardActionDispatcher(fakeDeps());
    d.register("quiz", "submit", handler);
    const result = await d.dispatch(baseInput);
    expect(result.toast?.type).toBe("error");
  });
});
