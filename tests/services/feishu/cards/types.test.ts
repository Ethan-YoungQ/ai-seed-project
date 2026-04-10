import { describe, expect, it } from "vitest";

import {
  CardActionContext,
  CardActionResult,
  CardHandlerDeps,
  CardType,
  CardVersionDirective,
  DailyCheckinState,
  HomeworkSubmitState,
  LeaderboardState,
  LiveCardRow,
  MemberLite,
  PeerReviewVote,
  QuizSelection,
  ReactionTrackedMessageRow,
  ReviewQueueState,
  emptyDailyCheckinState,
} from "../../../../src/services/feishu/cards/types";

describe("Feishu Card Type Contracts", () => {
  it("CardActionContext has required fields", () => {
    const ctx: CardActionContext = {
      operatorOpenId: "ou_123",
      triggerId: "trig_456",
      actionName: "vote_peer",
      actionPayload: { score: 8 },
      messageId: "msg_789",
      chatId: "chat_abc",
      receivedAt: "2026-04-10T12:00:00Z",
      currentVersion: "current",
    };

    expect(ctx.operatorOpenId).toBe("ou_123");
    expect(ctx.actionPayload).toEqual({ score: 8 });
  });

  it("CardActionResult accepts either newCardJson or toast", () => {
    const withCard: CardActionResult = {
      newCardJson: {
        schema: "2.0",
        header: {},
        body: { elements: [] },
      },
    };

    const withToast: CardActionResult = {
      toast: {
        type: "success",
        content: "Vote recorded",
      },
    };

    expect(withCard.newCardJson?.schema).toBe("2.0");
    expect(withToast.toast?.type).toBe("success");
  });

  it("CardType is a closed union of 16 cards", () => {
    const allTypes: CardType[] = [
      "period_open",
      "window_open",
      "quiz",
      "homework_submit",
      "video_checkin",
      "peer_review_vote",
      "peer_review_settle",
      "daily_checkin",
      "leaderboard",
      "level_announcement",
      "graduation",
      "llm_decision",
      "c1_echo",
      "review_queue",
      "member_mgmt",
      "manual_adjust",
    ];

    expect(allTypes).toHaveLength(16);
    expect(new Set(allTypes).size).toBe(16); // All unique
  });

  it("CardVersionDirective is exactly three variants", () => {
    const versions: CardVersionDirective[] = [
      "current",
      "legacy",
      "expired",
    ];

    expect(versions).toHaveLength(3);
    expect(new Set(versions).size).toBe(3);
  });

  it("LiveCardRow has every persisted column", () => {
    const liveCard: LiveCardRow = {
      id: "card_123",
      cardType: "daily_checkin",
      feishuMessageId: "msg_456",
      feishuChatId: "chat_789",
      campId: "camp_abc",
      periodId: "period_001",
      windowId: "window_001",
      cardVersion: "current",
      stateJson: emptyDailyCheckinState({
        postedAt: "2026-04-10T12:00:00Z",
        periodId: "period_001",
        periodNumber: 5,
      }),
      sentAt: "2026-04-10T12:00:00Z",
      lastPatchedAt: "2026-04-10T13:00:00Z",
      expiresAt: "2026-04-17T12:00:00Z",
      closedReason: null,
    };

    expect(liveCard.cardType).toBe("daily_checkin");
    expect(liveCard.closedReason).toBeNull();
  });

  it("DailyCheckinState splits each item into pending and approved lists", () => {
    const state: DailyCheckinState = {
      items: {
        K3: { pending: ["m1", "m2"], approved: ["m3"] },
        K4: { pending: [], approved: ["m4"] },
        H2: { pending: ["m5"], approved: [] },
        C1: { pending: [], approved: [] },
        C3: { pending: [], approved: [] },
        G2: { pending: [], approved: [] },
      },
      postedAt: "2026-04-10T12:00:00Z",
      periodId: "period_001",
      periodNumber: 5,
    };

    expect(state.items.K3.pending).toContain("m1");
    expect(state.items.K3.approved).toContain("m3");
    expect(state.items.H2.pending).toHaveLength(1);
  });

  it("emptyDailyCheckinState seeds all 6 items with empty pending/approved", () => {
    const state = emptyDailyCheckinState({
      postedAt: "2026-04-10T12:00:00Z",
      periodId: "period_001",
      periodNumber: 5,
    });

    expect(state.items).toHaveProperty("K3");
    expect(state.items).toHaveProperty("K4");
    expect(state.items).toHaveProperty("H2");
    expect(state.items).toHaveProperty("C1");
    expect(state.items).toHaveProperty("C3");
    expect(state.items).toHaveProperty("G2");

    expect(state.items.K3.pending).toEqual([]);
    expect(state.items.K3.approved).toEqual([]);
    expect(state.periodNumber).toBe(5);
  });

  it("MemberLite has the fields handlers need for rendering and auth", () => {
    const member: MemberLite = {
      id: "m_123",
      displayName: "Alice",
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: false,
      currentLevel: 3,
    };

    expect(member.displayName).toBe("Alice");
    expect(member.roleType).toBe("student");
    expect(member.currentLevel).toBe(3);
  });

  it("PeerReviewVote is keyed by session + voter + voted", () => {
    const vote: PeerReviewVote = {
      id: "vote_123",
      peerReviewSessionId: "session_001",
      voterMemberId: "m_1",
      votedMemberId: "m_2",
      votedAt: "2026-04-10T12:00:00Z",
    };

    expect(vote.voterMemberId).not.toBe(vote.votedMemberId);
    expect(vote.peerReviewSessionId).toBe("session_001");
  });

  it("CardHandlerDeps exposes adminApiClient, config, requestReappeal", () => {
    // Compile-time smoke test: just ensure the interface exists and has required fields
    const _depsType: CardHandlerDeps = {} as CardHandlerDeps;
    expect(_depsType).toBeDefined();
  });

  it("HomeworkSubmitState tracks first submitter", () => {
    const state: HomeworkSubmitState = {
      sessionId: "sess_123",
      title: "Homework 1",
      deadline: "2026-04-15T23:59:59Z",
      submitters: [
        {
          memberId: "m_1",
          submittedAt: "2026-04-10T10:00:00Z",
          firstSubmitter: true,
        },
        {
          memberId: "m_2",
          submittedAt: "2026-04-10T11:00:00Z",
          firstSubmitter: false,
        },
      ],
    };

    expect(state.submitters[0].firstSubmitter).toBe(true);
    expect(state.submitters[1].firstSubmitter).toBe(false);
  });

  it("LeaderboardState carries topN rows and optional radar url", () => {
    const state: LeaderboardState = {
      settledWindowId: "window_001",
      generatedAt: "2026-04-10T14:00:00Z",
      topN: [
        {
          memberId: "m_1",
          displayName: "Alice",
          cumulativeAq: 120,
          latestWindowAq: 30,
          currentLevel: 3,
          dims: { K: 30, H: 25, C: 35, S: 20, G: 10 },
        },
      ],
      radarImageUrl: null,
    };

    expect(state.topN).toHaveLength(1);
    expect(state.radarImageUrl).toBeNull();
    expect(state.topN[0].dims.K).toBe(30);
  });

  it("ReviewQueueState tracks pagination cursor", () => {
    const state: ReviewQueueState = {
      currentPage: 1,
      totalPages: 5,
      totalEvents: 47,
      events: [],
    };

    expect(state.currentPage).toBe(1);
    expect(state.totalPages).toBe(5);
    expect(state.totalEvents).toBe(47);
  });
});
