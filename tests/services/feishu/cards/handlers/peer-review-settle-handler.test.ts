import { describe, expect, test, vi } from "vitest";
import { peerReviewSettleHandler } from "../../../../../src/services/feishu/cards/handlers/peer-review-settle-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  MemberLite
} from "../../../../../src/services/feishu/cards/types.js";

function fakeCtx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-op-1",
    triggerId: "t-1",
    actionName: "peer_review_settle",
    actionPayload: {
      sessionId: "pr-session-001",
      items: [
        { memberId: "m-alice", s1Delta: 5, s2Delta: 2 },
        { memberId: "m-bob", s1Delta: 3, s2Delta: 0 }
      ]
    },
    messageId: "om-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T10:00:00.000Z",
    currentVersion: "peer-review-settle-v1",
    ...overrides
  };
}

function fakeDeps(): CardHandlerDeps & { ingestCalls: Array<Record<string, unknown>> } {
  const ingestCalls: Array<Record<string, unknown>> = [];

  const deps: CardHandlerDeps = {
    repo: {
      findMemberByOpenId: vi.fn((openId: string) =>
        openId.startsWith("ou-stu-")
          ? ({
              id: `m-${openId.replace("ou-stu-", "")}`,
              displayName: `Student ${openId.replace("ou-stu-", "")}`,
              roleType: "student" as const,
              isParticipant: true,
              isExcludedFromBoard: false,
              currentLevel: 1
            } satisfies MemberLite)
          : null
      ),
      insertPeerReviewVote: vi.fn(),
      insertCardInteraction: vi.fn(async (row) => ({ id: "ci-1", ...row }) as unknown as import("../../../../../src/services/feishu/cards/types.js").CardInteractionRow),
      insertReactionTrackedMessage: vi.fn(),
      listPriorQuizSelections: vi.fn(() => Promise.resolve([])),
      findLiveCard: vi.fn(() => null),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => Promise.resolve([])),
      countReviewRequiredEvents: vi.fn(() => Promise.resolve(0))
    },
    ingestor: {
      ingest: vi.fn(async (req) => {
        ingestCalls.push(req as unknown as Record<string, unknown>);
        return { eventId: "evt-1", effectiveDelta: 1, status: "pending" as const };
      })
    },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    adminApiClient: { patchMember: vi.fn(), listMembers: vi.fn() },
    config: {
      groupChatId: "oc-group",
      campId: "camp-1",
      cardVersionCurrent: "peer-review-settle-v1",
      cardVersionLegacy: "v0",
      radarImageBaseUrl: "https://cdn.example.com"
    },
    requestReappeal: vi.fn(),
    clock: () => new Date("2026-04-10T10:00:00.000Z"),
    uuid: () => "uuid-settle-1"
  };

  return Object.assign(deps, { ingestCalls });
}

describe("peerReviewSettleHandler", () => {
  test("happy path: fires S1 ingest for members with s1Delta > 0", async () => {
    const deps = fakeDeps();
    const result = await peerReviewSettleHandler(fakeCtx(), deps);

    expect(result.toast?.type).toBe("success");
    const s1Calls = deps.ingestCalls.filter((c) => c["itemCode"] === "S1");
    expect(s1Calls).toHaveLength(2); // both alice and bob have s1Delta > 0
    expect(s1Calls[0]).toMatchObject({ memberId: "m-alice", itemCode: "S1", requestedDelta: 5 });
    expect(s1Calls[1]).toMatchObject({ memberId: "m-bob", itemCode: "S1", requestedDelta: 3 });
  });

  test("fires S2 ingest only for members with s2Delta > 0", async () => {
    const deps = fakeDeps();
    await peerReviewSettleHandler(fakeCtx(), deps);

    const s2Calls = deps.ingestCalls.filter((c) => c["itemCode"] === "S2");
    // only alice has s2Delta=2, bob has s2Delta=0
    expect(s2Calls).toHaveLength(1);
    expect(s2Calls[0]).toMatchObject({ memberId: "m-alice", itemCode: "S2", requestedDelta: 2 });
  });

  test("missing items array returns error toast without ingesting", async () => {
    const deps = fakeDeps();
    const result = await peerReviewSettleHandler(
      fakeCtx({ actionPayload: { sessionId: "pr-session-001" } }),
      deps
    );

    expect(result.toast?.type).toBe("error");
    expect(deps.ingestCalls).toHaveLength(0);
  });
});
