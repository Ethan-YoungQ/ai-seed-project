import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  manualAdjustConfirmHandler
} from "../../../../../src/services/feishu/cards/handlers/manual-adjust-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  MemberLite
} from "../../../../../src/services/feishu/cards/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeCtx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-op-1",
    triggerId: "t-1",
    actionName: "manual_adjust_confirm",
    actionPayload: {
      action: "manual_adjust_confirm",
      memberId: "m-1",
      itemCode: "K3",
      delta: 3,
      note: "手动补分测试"
    },
    messageId: "om-1",
    chatId: "oc-op-dm",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "manual-adjust-v1",
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
      listReviewRequiredEvents: vi.fn(async () => []),
      countReviewRequiredEvents: vi.fn(async () => 0)
    },
    ingestor: {
      ingest: vi.fn(async () => ({
        eventId: "evt-manual-1",
        effectiveDelta: 3,
        status: "approved" as const
      }))
    },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    adminApiClient: { patchMember: vi.fn(), listMembers: vi.fn() },
    config: {
      groupChatId: "oc-group",
      campId: "camp-1",
      cardVersionCurrent: "manual-adjust-v1",
      cardVersionLegacy: "v0",
      radarImageBaseUrl: "https://cdn.example.com"
    },
    requestReappeal: vi.fn(),
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "uuid-manual-1",
    ...overrides
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("manualAdjustConfirmHandler", () => {
  test("happy path: calls ingestor.ingest with operator_manual sourceType, returns success toast", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx();

    const result = await manualAdjustConfirmHandler(ctx, deps);

    expect(deps.ingestor.ingest).toHaveBeenCalledOnce();
    const ingestCall = (deps.ingestor.ingest as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ingestCall.sourceType).toBe("operator_manual");
    expect(ingestCall.memberId).toBe("m-1");
    expect(ingestCall.itemCode).toBe("K3");
    expect(ingestCall.requestedDelta).toBe(3);
    expect(result.toast?.type).toBe("success");
  });

  test("non-operator gets error toast, ingest not called", async () => {
    const deps = fakeDeps({}, studentMember());
    const ctx = fakeCtx();

    const result = await manualAdjustConfirmHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(deps.ingestor.ingest).not.toHaveBeenCalled();
  });

  test("delta=0 returns validation error toast", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      actionPayload: {
        action: "manual_adjust_confirm",
        memberId: "m-1",
        itemCode: "K3",
        delta: 0,
        note: "备注"
      }
    });

    const result = await manualAdjustConfirmHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("0");
    expect(deps.ingestor.ingest).not.toHaveBeenCalled();
  });

  test("missing memberId returns error toast without calling ingest", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      actionPayload: {
        action: "manual_adjust_confirm",
        itemCode: "K3",
        delta: 3,
        note: "备注"
      }
    });

    const result = await manualAdjustConfirmHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(deps.ingestor.ingest).not.toHaveBeenCalled();
  });
});
