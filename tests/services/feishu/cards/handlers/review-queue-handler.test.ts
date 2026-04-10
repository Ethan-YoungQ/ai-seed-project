import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  reviewApproveHandler,
  reviewRejectHandler,
  reviewPageHandler
} from "../../../../../src/services/feishu/cards/handlers/review-queue-handler.js";
import { InvalidDecisionStateError } from "../../../../../src/domain/v2/errors.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  MemberLite,
  ReviewQueueEventRow
} from "../../../../../src/services/feishu/cards/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeCtx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-op-1",
    triggerId: "t-1",
    actionName: "review_approve",
    actionPayload: { action: "review_approve", eventId: "evt-1" },
    messageId: "om-1",
    chatId: "oc-op-dm",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "review-queue-v1",
    ...overrides
  };
}

function operatorMember(): MemberLite {
  return {
    id: "m-op-1",
    displayName: "运营员甲",
    roleType: "operator",
    isParticipant: false,
    isExcludedFromBoard: true,
    currentLevel: 0
  };
}

function studentMember(): MemberLite {
  return {
    id: "m-stu-1",
    displayName: "学员乙",
    roleType: "student",
    isParticipant: true,
    isExcludedFromBoard: false,
    currentLevel: 1
  };
}

function makeQueueEvent(i: number): ReviewQueueEventRow {
  return {
    eventId: `evt-${i}`,
    memberId: `m-${i}`,
    memberName: `学员${i}`,
    itemCode: "K3",
    scoreDelta: 3,
    textExcerpt: `摘要${i}`,
    llmReason: `理由${i}`,
    createdAt: "2026-04-10T12:00:00.000Z"
  };
}

function fakeDeps(
  overrides: Partial<CardHandlerDeps> = {},
  memberOverride?: MemberLite | null
): CardHandlerDeps {
  const member = memberOverride === undefined ? operatorMember() : memberOverride;
  return {
    repo: {
      findMemberByOpenId: vi.fn(() => member),
      insertPeerReviewVote: vi.fn(),
      insertReactionTrackedMessage: vi.fn(),
      listPriorQuizSelections: vi.fn(() => Promise.resolve([])),
      insertCardInteraction: vi.fn(async (row) => ({ id: "ci-1", ...row } as never)),
      findLiveCard: vi.fn(() => null),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(async () => [makeQueueEvent(1)]),
      countReviewRequiredEvents: vi.fn(async () => 1)
    },
    ingestor: { ingest: vi.fn() },
    aggregator: {
      applyDecision: vi.fn(async () => ({
        eventId: "evt-1",
        previousStatus: "review_required" as const,
        newStatus: "approved" as const,
        memberId: "m-1",
        itemCode: "K3",
        scoreDelta: 3
      }))
    },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    adminApiClient: { patchMember: vi.fn(), listMembers: vi.fn() },
    config: {
      groupChatId: "oc-group",
      campId: "camp-1",
      cardVersionCurrent: "review-queue-v1",
      cardVersionLegacy: "v0",
      radarImageBaseUrl: "https://cdn.example.com"
    },
    requestReappeal: vi.fn(),
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "uuid-1",
    ...overrides
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── review_approve ──────────────────────────────────────────────────────────

describe("reviewApproveHandler", () => {
  test("approve happy path: calls applyDecision, writes interaction, returns success toast", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({ actionPayload: { action: "review_approve", eventId: "evt-1" } });

    const result = await reviewApproveHandler(ctx, deps);

    expect(deps.aggregator.applyDecision).toHaveBeenCalledWith("evt-1", "approved");
    expect(deps.repo.insertCardInteraction).toHaveBeenCalledOnce();
    expect(result.toast?.type).toBe("success");
    expect(result.toast?.content).toContain("通过");
  });

  test("non-operator gets rejected with error toast, no applyDecision call", async () => {
    const deps = fakeDeps({}, studentMember());
    const ctx = fakeCtx({ actionPayload: { action: "review_approve", eventId: "evt-1" } });

    const result = await reviewApproveHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(deps.aggregator.applyDecision).not.toHaveBeenCalled();
  });

  test("double-review 409: InvalidDecisionStateError maps to error toast, does NOT throw", async () => {
    const deps = fakeDeps({
      aggregator: {
        applyDecision: vi.fn().mockRejectedValue(
          new InvalidDecisionStateError("evt-1", "approved")
        )
      }
    });
    const ctx = fakeCtx({ actionPayload: { action: "review_approve", eventId: "evt-1" } });

    const result = await reviewApproveHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("其他运营");
  });

  test("missing eventId returns error toast without calling applyDecision", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({ actionPayload: { action: "review_approve" } });

    const result = await reviewApproveHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(deps.aggregator.applyDecision).not.toHaveBeenCalled();
  });

  test("unknown member returns error toast", async () => {
    const deps = fakeDeps({}, null);
    const ctx = fakeCtx({ actionPayload: { action: "review_approve", eventId: "evt-1" } });

    const result = await reviewApproveHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(deps.aggregator.applyDecision).not.toHaveBeenCalled();
  });
});

// ─── review_reject ───────────────────────────────────────────────────────────

describe("reviewRejectHandler", () => {
  test("reject happy path: calls applyDecision with rejected, returns success toast", async () => {
    const deps = fakeDeps({
      aggregator: {
        applyDecision: vi.fn(async () => ({
          eventId: "evt-1",
          previousStatus: "review_required" as const,
          newStatus: "rejected" as const,
          memberId: "m-1",
          itemCode: "K3",
          scoreDelta: 0
        }))
      }
    });
    const ctx = fakeCtx({
      actionName: "review_reject",
      actionPayload: { action: "review_reject", eventId: "evt-1" }
    });

    const result = await reviewRejectHandler(ctx, deps);

    expect(deps.aggregator.applyDecision).toHaveBeenCalledWith("evt-1", "rejected");
    expect(result.toast?.type).toBe("success");
    expect(result.toast?.content).toContain("拒绝");
  });

  test("non-operator gets error toast on reject", async () => {
    const deps = fakeDeps({}, studentMember());
    const ctx = fakeCtx({
      actionName: "review_reject",
      actionPayload: { action: "review_reject", eventId: "evt-1" }
    });

    const result = await reviewRejectHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(deps.aggregator.applyDecision).not.toHaveBeenCalled();
  });
});

// ─── review_page ─────────────────────────────────────────────────────────────

describe("reviewPageHandler", () => {
  test("pagination: loads page 2 using correct offset and returns updated card", async () => {
    const events = [makeQueueEvent(11), makeQueueEvent(12)];
    const deps = fakeDeps({
      repo: {
        findMemberByOpenId: vi.fn(() => operatorMember()),
        insertPeerReviewVote: vi.fn(),
        insertReactionTrackedMessage: vi.fn(),
        listPriorQuizSelections: vi.fn(() => Promise.resolve([])),
        insertCardInteraction: vi.fn(async (row) => ({ id: "ci-1", ...row } as never)),
        findLiveCard: vi.fn(() => null),
        updateLiveCardState: vi.fn(),
        insertLiveCard: vi.fn(),
        closeLiveCard: vi.fn(),
        findEventById: vi.fn(),
        listReviewRequiredEvents: vi.fn(async () => events),
        countReviewRequiredEvents: vi.fn(async () => 15)
      }
    });
    const ctx = fakeCtx({
      actionName: "review_page",
      actionPayload: { action: "review_page", page: 2 }
    });

    const result = await reviewPageHandler(ctx, deps);

    expect(result.newCardJson).toBeDefined();
    expect(result.toast).toBeUndefined();
    expect(deps.repo.listReviewRequiredEvents).toHaveBeenCalledWith({
      limit: 10,
      offset: 10
    });
  });
});
