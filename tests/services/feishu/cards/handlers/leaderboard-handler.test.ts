import { describe, expect, test, vi } from "vitest";
import {
  leaderboardRefreshHandler,
  LEADERBOARD_READER_KEY,
  type LeaderboardDepsExtension
} from "../../../../../src/services/feishu/cards/handlers/leaderboard-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  LeaderboardState,
  LiveCardRow,
  MemberLite
} from "../../../../../src/services/feishu/cards/types.js";

function makeLeaderboardState(): LeaderboardState {
  return {
    settledWindowId: "w-1",
    generatedAt: "2026-04-10T12:00:00.000Z",
    topN: [
      {
        memberId: "m-alice",
        displayName: "Alice",
        cumulativeAq: 120,
        latestWindowAq: 30,
        currentLevel: 3,
        dims: { K: 25, H: 20, C: 30, S: 25, G: 20 }
      }
    ],
    radarImageUrl: null
  };
}

function fakeCtx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-stu-alice",
    triggerId: "t-1",
    actionName: "leaderboard_refresh",
    actionPayload: {},
    messageId: "om-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T10:00:00.000Z",
    currentVersion: "leaderboard-v1",
    ...overrides
  };
}

function fakeDeps(liveRow?: LiveCardRow | null): CardHandlerDeps {
  const row = liveRow !== undefined ? liveRow : {
    id: "flc-1",
    cardType: "leaderboard" as const,
    feishuMessageId: "om-1",
    feishuChatId: "oc-1",
    campId: "camp-1",
    periodId: null,
    windowId: "w-1",
    cardVersion: "leaderboard-v1",
    stateJson: makeLeaderboardState(),
    sentAt: "2026-04-10T09:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T09:00:00.000Z",
    closedReason: null
  } satisfies LiveCardRow;

  return {
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
      insertCardInteraction: vi.fn(async (r) => ({ id: "ci-1", ...r }) as unknown as import("../../../../../src/services/feishu/cards/types.js").CardInteractionRow),
      insertReactionTrackedMessage: vi.fn(),
      listPriorQuizSelections: vi.fn(() => Promise.resolve([])),
      findLiveCard: vi.fn(() => row),
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
      cardVersionCurrent: "leaderboard-v1",
      cardVersionLegacy: "v0",
      radarImageBaseUrl: "https://cdn.example.com"
    },
    requestReappeal: vi.fn(),
    clock: () => new Date("2026-04-10T10:00:00.000Z"),
    uuid: () => "uuid-lb-1"
  };
}

describe("leaderboardRefreshHandler", () => {
  test("fallback: reads state from live card row and returns patched card", async () => {
    const deps = fakeDeps();
    const result = await leaderboardRefreshHandler(fakeCtx(), deps);

    expect(result.newCardJson).toBeDefined();
    expect(result.toast).toBeUndefined();
    const json = JSON.stringify(result.newCardJson);
    expect(json).toContain("Alice");
    expect(json).toContain("120");
  });

  test("fallback: missing live card returns error toast", async () => {
    const deps = fakeDeps(null);
    const result = await leaderboardRefreshHandler(fakeCtx(), deps);

    expect(result.toast?.type).toBe("error");
    expect(result.newCardJson).toBeUndefined();
  });

  test("with injected reader: calls reader and returns patched card", async () => {
    const deps = fakeDeps();
    const customState = makeLeaderboardState();
    customState.topN[0].cumulativeAq = 999;

    const depsWithReader = Object.assign(deps, {
      [LEADERBOARD_READER_KEY]: vi.fn(async () => customState)
    } satisfies LeaderboardDepsExtension);

    const result = await leaderboardRefreshHandler(fakeCtx(), depsWithReader);

    expect(result.newCardJson).toBeDefined();
    const json = JSON.stringify(result.newCardJson);
    expect(json).toContain("999");
  });
});
