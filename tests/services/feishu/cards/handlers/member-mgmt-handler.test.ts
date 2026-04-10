import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  memberToggleHiddenHandler,
  memberChangeRoleHandler
} from "../../../../../src/services/feishu/cards/handlers/member-mgmt-handler.js";
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
    actionName: "member_toggle_hidden",
    actionPayload: { action: "member_toggle_hidden", memberId: "m-1", hidden: true },
    messageId: "om-1",
    chatId: "oc-op-dm",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "member-mgmt-v1",
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

function fakeMemberList(): MemberLite[] {
  return [
    operatorMember(),
    { id: "m-2", displayName: "学员甲", roleType: "student", isParticipant: true, isExcludedFromBoard: false, currentLevel: 2 }
  ];
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
    ingestor: { ingest: vi.fn() },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    adminApiClient: {
      patchMember: vi.fn(async (_, body) => ({
        id: "m-1",
        displayName: "学员甲",
        roleType: (body.roleType as MemberLite["roleType"]) ?? "student",
        isParticipant: true,
        isExcludedFromBoard: body.hiddenFromBoard ?? false,
        currentLevel: 1
      })),
      listMembers: vi.fn(async () => fakeMemberList())
    },
    config: {
      groupChatId: "oc-group",
      campId: "camp-1",
      cardVersionCurrent: "member-mgmt-v1",
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

// ─── member_toggle_hidden ────────────────────────────────────────────────────

describe("memberToggleHiddenHandler", () => {
  test("toggle hidden happy path: calls patchMember, returns updated card", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      actionPayload: { action: "member_toggle_hidden", memberId: "m-2", hidden: true }
    });

    const result = await memberToggleHiddenHandler(ctx, deps);

    expect(deps.adminApiClient.patchMember).toHaveBeenCalledWith("m-2", {
      hiddenFromBoard: true
    });
    expect(deps.adminApiClient.listMembers).toHaveBeenCalledOnce();
    expect(result.newCardJson).toBeDefined();
    expect(result.toast).toBeUndefined();
  });

  test("non-operator gets error toast, patchMember not called", async () => {
    const deps = fakeDeps({}, studentMember());
    const ctx = fakeCtx({
      actionPayload: { action: "member_toggle_hidden", memberId: "m-2", hidden: true }
    });

    const result = await memberToggleHiddenHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(deps.adminApiClient.patchMember).not.toHaveBeenCalled();
  });

  test("missing memberId returns error toast", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      actionPayload: { action: "member_toggle_hidden", hidden: true }
    });

    const result = await memberToggleHiddenHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(deps.adminApiClient.patchMember).not.toHaveBeenCalled();
  });
});

// ─── member_change_role ───────────────────────────────────────────────────────

describe("memberChangeRoleHandler", () => {
  test("change role happy path: calls patchMember with new roleType, returns updated card", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      actionName: "member_change_role",
      actionPayload: { action: "member_change_role", memberId: "m-2", roleType: "trainer" }
    });

    const result = await memberChangeRoleHandler(ctx, deps);

    expect(deps.adminApiClient.patchMember).toHaveBeenCalledWith("m-2", {
      roleType: "trainer"
    });
    expect(result.newCardJson).toBeDefined();
  });

  test("invalid role type returns error toast without calling patchMember", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      actionName: "member_change_role",
      actionPayload: { action: "member_change_role", memberId: "m-2", roleType: "superadmin" }
    });

    const result = await memberChangeRoleHandler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(deps.adminApiClient.patchMember).not.toHaveBeenCalled();
  });
});
