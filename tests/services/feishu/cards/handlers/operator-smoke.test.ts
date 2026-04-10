/**
 * F4 — Operator cards smoke exit checkpoint
 *
 * Integration test: registers all 3 operator handlers on a
 * CardActionDispatcher and dispatches approve/reject/page/member-toggle/
 * manual-adjust in sequence. Verifies all return appropriate responses.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

import { CardActionDispatcher } from "../../../../../src/services/feishu/cards/card-action-dispatcher.js";
import {
  reviewApproveHandler,
  reviewRejectHandler,
  reviewPageHandler
} from "../../../../../src/services/feishu/cards/handlers/review-queue-handler.js";
import {
  memberToggleHiddenHandler,
  memberChangeRoleHandler
} from "../../../../../src/services/feishu/cards/handlers/member-mgmt-handler.js";
import {
  manualAdjustConfirmHandler
} from "../../../../../src/services/feishu/cards/handlers/manual-adjust-handler.js";
import type {
  CardHandlerDeps,
  MemberLite,
  ReviewQueueEventRow
} from "../../../../../src/services/feishu/cards/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function operatorMember(): MemberLite {
  return {
    id: "m-op-smoke",
    displayName: "运营员烟测",
    roleType: "operator",
    isParticipant: false,
    isExcludedFromBoard: true,
    currentLevel: 0
  };
}

function makeQueueEvent(i: number): ReviewQueueEventRow {
  return {
    eventId: `evt-smoke-${i}`,
    memberId: `m-smoke-${i}`,
    memberName: `学员${i}`,
    itemCode: "K3",
    scoreDelta: 3,
    textExcerpt: `摘要${i}`,
    llmReason: `理由${i}`,
    createdAt: "2026-04-10T12:00:00.000Z"
  };
}

function buildSmokeDeps(): CardHandlerDeps {
  const memberList: MemberLite[] = [
    operatorMember(),
    {
      id: "m-smoke-1",
      displayName: "学员甲",
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: false,
      currentLevel: 1
    }
  ];

  return {
    repo: {
      findMemberByOpenId: vi.fn(() => operatorMember()),
      insertPeerReviewVote: vi.fn(),
      insertReactionTrackedMessage: vi.fn(),
      listPriorQuizSelections: vi.fn(() => Promise.resolve([])),
      insertCardInteraction: vi.fn(async (row) => ({ id: "ci-smoke", ...row } as never)),
      findLiveCard: vi.fn(() => null),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(async () => [makeQueueEvent(1), makeQueueEvent(2)]),
      countReviewRequiredEvents: vi.fn(async () => 15)
    },
    ingestor: {
      ingest: vi.fn(async () => ({
        eventId: "evt-manual-smoke",
        effectiveDelta: 5,
        status: "approved" as const
      }))
    },
    aggregator: {
      applyDecision: vi.fn(async (eventId, decision) => ({
        eventId,
        previousStatus: "review_required" as const,
        newStatus: decision,
        memberId: "m-smoke-1",
        itemCode: "K3",
        scoreDelta: 3
      }))
    },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    adminApiClient: {
      patchMember: vi.fn(async (memberId, body) => ({
        id: memberId,
        displayName: "学员甲",
        roleType: (body.roleType as MemberLite["roleType"]) ?? "student",
        isParticipant: true,
        isExcludedFromBoard: body.hiddenFromBoard ?? false,
        currentLevel: 1
      })),
      listMembers: vi.fn(async () => memberList)
    },
    config: {
      groupChatId: "oc-group",
      campId: "camp-smoke",
      cardVersionCurrent: "v1",
      cardVersionLegacy: "v0",
      radarImageBaseUrl: "https://cdn.example.com"
    },
    requestReappeal: vi.fn(),
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "uuid-smoke"
  };
}

function buildDispatcher(deps: CardHandlerDeps): CardActionDispatcher {
  const dispatcher = new CardActionDispatcher(deps);

  // Review queue handlers
  dispatcher.register("review_queue", "review_approve", reviewApproveHandler);
  dispatcher.register("review_queue", "review_reject", reviewRejectHandler);
  dispatcher.register("review_queue", "review_page", reviewPageHandler);

  // Member management handlers
  dispatcher.register("member_mgmt", "member_toggle_hidden", memberToggleHiddenHandler);
  dispatcher.register("member_mgmt", "member_change_role", memberChangeRoleHandler);

  // Manual adjust handler
  dispatcher.register("manual_adjust", "manual_adjust_confirm", manualAdjustConfirmHandler);

  return dispatcher;
}

const OP_OPEN_ID = "ou-op-smoke";
const BASE_CTX = {
  operatorOpenId: OP_OPEN_ID,
  triggerId: "t-smoke",
  messageId: "om-smoke",
  chatId: "oc-op-smoke",
  receivedAt: "2026-04-10T12:00:00.000Z",
  currentVersion: "v1"
};

// ─── Setup ────────────────────────────────────────────────────────────────────

let deps: CardHandlerDeps;
let dispatcher: CardActionDispatcher;

beforeEach(() => {
  deps = buildSmokeDeps();
  dispatcher = buildDispatcher(deps);
});

// ─── Smoke Tests ──────────────────────────────────────────────────────────────

describe("operator cards smoke test", () => {
  test("review queue: approve → reject → page all return appropriate responses", async () => {
    // approve
    const approveResult = await dispatcher.dispatch({
      ...BASE_CTX,
      cardType: "review_queue",
      actionName: "review_approve",
      payload: { action: "review_approve", eventId: "evt-smoke-1" }
    });
    expect(approveResult.toast?.type).toBe("success");
    expect(deps.aggregator.applyDecision).toHaveBeenCalledWith("evt-smoke-1", "approved");

    // reject
    const rejectResult = await dispatcher.dispatch({
      ...BASE_CTX,
      cardType: "review_queue",
      actionName: "review_reject",
      payload: { action: "review_reject", eventId: "evt-smoke-2" }
    });
    expect(rejectResult.toast?.type).toBe("success");
    expect(deps.aggregator.applyDecision).toHaveBeenCalledWith("evt-smoke-2", "rejected");

    // page navigation
    const pageResult = await dispatcher.dispatch({
      ...BASE_CTX,
      cardType: "review_queue",
      actionName: "review_page",
      payload: { action: "review_page", page: 2 }
    });
    expect(pageResult.newCardJson).toBeDefined();
    expect(pageResult.toast).toBeUndefined();
    expect(deps.repo.listReviewRequiredEvents).toHaveBeenCalledWith({
      limit: 10,
      offset: 10
    });
  });

  test("member management: toggle hidden + change role both return updated card", async () => {
    const toggleResult = await dispatcher.dispatch({
      ...BASE_CTX,
      cardType: "member_mgmt",
      actionName: "member_toggle_hidden",
      payload: {
        action: "member_toggle_hidden",
        memberId: "m-smoke-1",
        hidden: true
      }
    });
    expect(toggleResult.newCardJson).toBeDefined();
    expect(deps.adminApiClient.patchMember).toHaveBeenCalledWith("m-smoke-1", {
      hiddenFromBoard: true
    });

    const roleResult = await dispatcher.dispatch({
      ...BASE_CTX,
      cardType: "member_mgmt",
      actionName: "member_change_role",
      payload: {
        action: "member_change_role",
        memberId: "m-smoke-1",
        roleType: "observer"
      }
    });
    expect(roleResult.newCardJson).toBeDefined();
    expect(deps.adminApiClient.patchMember).toHaveBeenCalledWith("m-smoke-1", {
      roleType: "observer"
    });
  });

  test("manual adjust confirm returns success toast with ingest called as operator_manual", async () => {
    const result = await dispatcher.dispatch({
      ...BASE_CTX,
      cardType: "manual_adjust",
      actionName: "manual_adjust_confirm",
      payload: {
        action: "manual_adjust_confirm",
        memberId: "m-smoke-1",
        itemCode: "H2",
        delta: 5,
        note: "烟测补分"
      }
    });

    expect(result.toast?.type).toBe("success");
    expect(deps.ingestor.ingest).toHaveBeenCalledOnce();
    const call = (deps.ingestor.ingest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.sourceType).toBe("operator_manual");
    expect(call.memberId).toBe("m-smoke-1");
    expect(call.itemCode).toBe("H2");
    expect(call.requestedDelta).toBe(5);
  });
});
