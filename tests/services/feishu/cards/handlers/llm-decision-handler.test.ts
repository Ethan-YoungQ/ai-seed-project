import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  llmDecisionAppealHandler
} from "../../../../../src/services/feishu/cards/handlers/llm-decision-handler.js";
import {
  registerTemplate,
  clearTemplateRegistry
} from "../../../../../src/services/feishu/cards/renderer.js";
import {
  LLM_DECISION_TEMPLATE_ID,
  buildLlmDecisionCard,
  type LlmDecisionCardState
} from "../../../../../src/services/feishu/cards/templates/llm-decision-v1.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  LiveCardRow,
  MemberLite
} from "../../../../../src/services/feishu/cards/types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fakeCtx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-stu-alice",
    triggerId: "t-1",
    actionName: "llm_decision_appeal",
    actionPayload: { action: "llm_decision_appeal", eventId: "evt-1" },
    messageId: "om-dm-1",
    chatId: "oc-dm-alice",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: LLM_DECISION_TEMPLATE_ID,
    ...overrides
  };
}

function approvedState(): LlmDecisionCardState {
  return {
    eventId: "evt-1",
    memberId: "m-alice",
    memberName: "Alice",
    itemCode: "K3",
    decision: "approved",
    score: 3,
    reason: "Great summary.",
    decidedAt: "2026-04-10T12:00:00.000Z"
  };
}

function rejectedState(): LlmDecisionCardState {
  return {
    eventId: "evt-2",
    memberId: "m-alice",
    memberName: "Alice",
    itemCode: "K4",
    decision: "rejected",
    score: 0,
    reason: "Too short.",
    decidedAt: "2026-04-10T12:00:00.000Z"
  };
}

function makeLiveRow(state: LlmDecisionCardState): LiveCardRow {
  return {
    id: "flc-dm-1",
    cardType: "llm_decision",
    feishuMessageId: "om-dm-1",
    feishuChatId: "oc-dm-alice",
    campId: "camp-1",
    periodId: null,
    windowId: null,
    cardVersion: LLM_DECISION_TEMPLATE_ID,
    stateJson: state,
    sentAt: "2026-04-10T12:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T12:00:00.000Z",
    closedReason: null
  };
}

function fakeMember(): MemberLite {
  return {
    id: "m-alice",
    displayName: "Alice",
    roleType: "student",
    isParticipant: true,
    isExcludedFromBoard: false,
    currentLevel: 1
  };
}

function fakeDeps(
  liveRow: LiveCardRow | null,
  overrides: Partial<CardHandlerDeps> = {}
): CardHandlerDeps {
  const requestReappeal = vi.fn(() => Promise.resolve());
  return {
    repo: {
      findMemberByOpenId: vi.fn(() => fakeMember()),
      insertPeerReviewVote: vi.fn(),
      insertReactionTrackedMessage: vi.fn(),
      listPriorQuizSelections: vi.fn(() => Promise.resolve([])),
      insertCardInteraction: vi.fn(async (row) => ({ id: "ci-1", ...row } as never)),
      findLiveCard: vi.fn(() => liveRow),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => Promise.resolve([])),
      countReviewRequiredEvents: vi.fn(() => Promise.resolve(0))
    },
    ingestor: { ingest: vi.fn() },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    adminApiClient: { patchMember: vi.fn(), listMembers: vi.fn() },
    config: {
      groupChatId: "oc-group",
      campId: "camp-1",
      cardVersionCurrent: LLM_DECISION_TEMPLATE_ID,
      cardVersionLegacy: "v0",
      radarImageBaseUrl: "https://cdn.example.com"
    },
    requestReappeal,
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "uuid-1",
    ...overrides
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearTemplateRegistry();
  registerTemplate(LLM_DECISION_TEMPLATE_ID, buildLlmDecisionCard);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("llmDecisionAppealHandler", () => {
  test("approved card cannot be appealed — returns error toast", async () => {
    const state = approvedState();
    const liveRow = makeLiveRow(state);
    const deps = fakeDeps(liveRow);
    const ctx = fakeCtx({
      actionPayload: { action: "llm_decision_appeal", eventId: state.eventId }
    });

    const result = await llmDecisionAppealHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(deps.requestReappeal).not.toHaveBeenCalled();
  });

  test("missing eventId in payload returns error toast without calling requestReappeal", async () => {
    const state = rejectedState();
    const liveRow = makeLiveRow(state);
    const deps = fakeDeps(liveRow);
    const ctx = fakeCtx({
      actionPayload: { action: "llm_decision_appeal" } // no eventId
    });

    const result = await llmDecisionAppealHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(deps.requestReappeal).not.toHaveBeenCalled();
  });

  test("rejected card with valid eventId calls requestReappeal and writes card_interaction", async () => {
    const state = rejectedState();
    const liveRow = makeLiveRow(state);
    const deps = fakeDeps(liveRow);
    const ctx = fakeCtx({
      actionPayload: { action: "llm_decision_appeal", eventId: state.eventId }
    });

    const result = await llmDecisionAppealHandler(ctx, deps);

    expect(deps.requestReappeal).toHaveBeenCalledOnce();
    expect(deps.requestReappeal).toHaveBeenCalledWith(state.eventId);
    expect(deps.repo.insertCardInteraction).toHaveBeenCalledOnce();
    expect(result.toast?.type).toBe("success");
  });

  test("success toast is returned and no newCardJson needed", async () => {
    const state = rejectedState();
    const liveRow = makeLiveRow(state);
    const deps = fakeDeps(liveRow);
    const ctx = fakeCtx({
      actionPayload: { action: "llm_decision_appeal", eventId: state.eventId }
    });

    const result = await llmDecisionAppealHandler(ctx, deps);

    expect(result.toast?.type).toBe("success");
    expect(result.newCardJson).toBeUndefined();
  });
});
