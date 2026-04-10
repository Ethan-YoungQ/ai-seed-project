import { describe, expect, test, vi } from "vitest";
import { peerReviewVoteHandler } from "../../../../../src/services/feishu/cards/handlers/peer-review-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  MemberLite,
  PeerReviewVote
} from "../../../../../src/services/feishu/cards/types.js";

function fakeCtx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-stu-alice",
    triggerId: "t-1",
    actionName: "peer_review_vote",
    actionPayload: { sessionId: "pr-session-001", votedMemberId: "m-bob" },
    messageId: "om-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T10:00:00.000Z",
    currentVersion: "peer-review-vote-v1",
    ...overrides
  };
}

function fakeDeps(): CardHandlerDeps & { voteCalls: Array<Partial<PeerReviewVote>> } {
  const voteCalls: Array<Partial<PeerReviewVote>> = [];

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
      insertPeerReviewVote: vi.fn(async (vote) => {
        voteCalls.push(vote);
        return { id: "vote-1", ...vote } as PeerReviewVote;
      }),
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
    ingestor: { ingest: vi.fn(async () => ({ eventId: "evt-1", effectiveDelta: 1, status: "pending" as const })) },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    adminApiClient: { patchMember: vi.fn(), listMembers: vi.fn() },
    config: {
      groupChatId: "oc-group",
      campId: "camp-1",
      cardVersionCurrent: "peer-review-vote-v1",
      cardVersionLegacy: "v0",
      radarImageBaseUrl: "https://cdn.example.com"
    },
    requestReappeal: vi.fn(),
    clock: () => new Date("2026-04-10T10:00:00.000Z"),
    uuid: () => "uuid-pr-1"
  };

  return Object.assign(deps, { voteCalls });
}

describe("peerReviewVoteHandler", () => {
  test("happy path: inserts vote and returns success toast", async () => {
    const deps = fakeDeps();
    const result = await peerReviewVoteHandler(fakeCtx(), deps);

    expect(result.toast?.type).toBe("success");
    expect(deps.voteCalls).toHaveLength(1);
    expect(deps.voteCalls[0]).toMatchObject({
      peerReviewSessionId: "pr-session-001",
      voterMemberId: "m-alice",
      votedMemberId: "m-bob"
    });
  });

  test("unknown member returns error toast without inserting vote", async () => {
    const deps = fakeDeps();
    const result = await peerReviewVoteHandler(
      fakeCtx({ operatorOpenId: "ou-unknown" }),
      deps
    );

    expect(result.toast?.type).toBe("error");
    expect(deps.voteCalls).toHaveLength(0);
  });

  test("missing votedMemberId returns error toast", async () => {
    const deps = fakeDeps();
    const result = await peerReviewVoteHandler(
      fakeCtx({ actionPayload: { sessionId: "pr-session-001" } }),
      deps
    );

    expect(result.toast?.type).toBe("error");
    expect(deps.voteCalls).toHaveLength(0);
  });
});
