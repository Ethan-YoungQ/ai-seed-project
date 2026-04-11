import { describe, expect, test, vi } from "vitest";
import { videoCheckinCompleteHandler } from "../../../../../src/services/feishu/cards/handlers/video-checkin-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  MemberLite
} from "../../../../../src/services/feishu/cards/types.js";

function fakeCtx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-stu-alice",
    triggerId: "t-1",
    actionName: "video_checkin_complete",
    actionPayload: { periodNumber: 1 },
    messageId: "om-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T10:00:00.000Z",
    currentVersion: "video-checkin-v1",
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
      insertCardInteraction: vi.fn(async (row) => ({ id: "ci-1", ...row }) as unknown as import("../../../../../src/services/feishu/cards/types.js").CardInteractionRow),
      insertPeerReviewVote: vi.fn(),
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
      cardVersionCurrent: "video-checkin-v1",
      cardVersionLegacy: "v0",
      radarImageBaseUrl: "https://cdn.example.com"
    },
    requestReappeal: vi.fn(),
    clock: () => new Date("2026-04-10T10:00:00.000Z"),
    uuid: () => "uuid-1"
  };

  return Object.assign(deps, { ingestCalls });
}

describe("videoCheckinCompleteHandler", () => {
  test("happy path: ingests G1 and returns success toast", async () => {
    const deps = fakeDeps();
    const result = await videoCheckinCompleteHandler(fakeCtx(), deps);

    expect(result.toast?.type).toBe("success");
    expect(result.toast?.content).toContain("G1");
    expect(deps.ingestCalls).toHaveLength(1);
    expect(deps.ingestCalls[0]).toMatchObject({ itemCode: "G1", memberId: "m-alice" });
  });

  test("unknown member returns error toast and does not ingest", async () => {
    const deps = fakeDeps();
    const result = await videoCheckinCompleteHandler(
      fakeCtx({ operatorOpenId: "ou-unknown" }),
      deps
    );

    expect(result.toast?.type).toBe("error");
    expect(deps.ingestCalls).toHaveLength(0);
  });

  test("ingest sourceRef is the idempotent triggerId", async () => {
    const deps = fakeDeps();
    await videoCheckinCompleteHandler(fakeCtx(), deps);

    expect(deps.ingestCalls[0]).toMatchObject({ sourceRef: "t-1" });
  });
});
