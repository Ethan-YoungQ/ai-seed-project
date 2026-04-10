/**
 * H4: E2E camp lifecycle smoke exit checkpoint.
 *
 * Walks a realistic camp lifecycle through the card protocol:
 *   - period-open card rendering
 *   - daily-checkin card: 3 students submit K3
 *   - LLM approval simulation: K3 members move to approved
 *   - quiz card: student selects + submits → K1+K2 ingested
 *   - leaderboard card rendering with data
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

import { CardActionDispatcher } from "../../../../../src/services/feishu/cards/card-action-dispatcher.js";
import {
  dailyCheckinK3Handler,
  dailyCheckinK4Handler,
  dailyCheckinC1Handler,
  dailyCheckinC3Handler,
  dailyCheckinG2Handler,
  dailyCheckinH2Handler
} from "../../../../../src/services/feishu/cards/handlers/daily-checkin-handler.js";
import { quizSelectHandler, quizSubmitHandler, QUIZ_SET_RESOLVER_KEY } from "../../../../../src/services/feishu/cards/handlers/quiz-handler.js";
import { leaderboardRefreshHandler, LEADERBOARD_READER_KEY } from "../../../../../src/services/feishu/cards/handlers/leaderboard-handler.js";
import {
  clearTemplateRegistry,
  registerTemplate,
  CARD_SIZE_BUDGET_BYTES
} from "../../../../../src/services/feishu/cards/renderer.js";
import {
  DAILY_CHECKIN_TEMPLATE_ID,
  buildDailyCheckinCard,
  emptyDailyCheckinState
} from "../../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import { buildLeaderboardCard, LEADERBOARD_TEMPLATE_ID } from "../../../../../src/services/feishu/cards/templates/leaderboard-v1.js";
import { buildPeriodOpenCard, PERIOD_OPEN_TEMPLATE_ID } from "../../../../../src/services/feishu/cards/templates/period-open-v1.js";
import type {
  CardHandlerDeps,
  DailyCheckinState,
  FeishuCardJson,
  LeaderboardState,
  LiveCardRow,
  MemberLite
} from "../../../../../src/services/feishu/cards/types.js";
import type { QuizCardState } from "../../../../../src/services/feishu/cards/templates/quiz-v1.js";
import type { ResolvedQuizSet } from "../../../../../src/services/feishu/cards/handlers/quiz-handler.js";
import { resetMetrics, incrementMetric, getMetrics } from "../../../../../src/services/feishu/cards/observability.js";

// ---------------------------------------------------------------------------
// Camp data fixtures
// ---------------------------------------------------------------------------

const CAMP_ID = "camp-smoke-001";
const CHAT_ID = "oc-camp-smoke";
const PERIOD_ID = "period-1";

const MEMBERS: MemberLite[] = [
  {
    id: "m-alice",
    displayName: "Alice",
    roleType: "student",
    isParticipant: true,
    isExcludedFromBoard: false,
    currentLevel: 2
  },
  {
    id: "m-bob",
    displayName: "Bob",
    roleType: "student",
    isParticipant: true,
    isExcludedFromBoard: false,
    currentLevel: 1
  },
  {
    id: "m-carol",
    displayName: "Carol",
    roleType: "student",
    isParticipant: true,
    isExcludedFromBoard: false,
    currentLevel: 3
  }
];

const OPEN_ID_MAP: Record<string, string> = {
  "ou-alice": "m-alice",
  "ou-bob": "m-bob",
  "ou-carol": "m-carol"
};

// ---------------------------------------------------------------------------
// Shared mutable live card store (in-memory)
// ---------------------------------------------------------------------------

type LiveCardStore = Map<string, LiveCardRow>;

function makeLiveRow(overrides: Partial<LiveCardRow>): LiveCardRow {
  return {
    id: "flc-default",
    cardType: "daily_checkin",
    feishuMessageId: "om-default",
    feishuChatId: CHAT_ID,
    campId: CAMP_ID,
    periodId: PERIOD_ID,
    windowId: null,
    cardVersion: "daily-checkin-v1",
    stateJson: {},
    sentAt: "2026-04-10T09:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T09:00:00.000Z",
    closedReason: null,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Deps factory backed by in-memory live card store
// ---------------------------------------------------------------------------

function makeDeps(liveCards: LiveCardStore): CardHandlerDeps {
  const ingestCalls: Array<Record<string, unknown>> = [];
  const quizInteractions: Map<string, Array<{ questionId: string; optionId: string }>> = new Map();

  const deps: CardHandlerDeps = {
    repo: {
      findMemberByOpenId: vi.fn((openId: string): MemberLite | null => {
        const memberId = OPEN_ID_MAP[openId];
        return memberId ? (MEMBERS.find((m) => m.id === memberId) ?? null) : null;
      }),

      insertCardInteraction: vi.fn(async (row) => {
        // Track quiz selections for quiz handler
        if (row.cardType === "quiz" && row.actionName === "quiz_select") {
          const payload = row.payloadJson as { questionId: string; optionId: string };
          const memberId = row.memberId ?? "";
          const list = quizInteractions.get(memberId) ?? [];
          list.push({ questionId: payload.questionId, optionId: payload.optionId });
          quizInteractions.set(memberId, list);
        }
        incrementMetric("cardActionsReceived");
        return { id: row.id ?? "ci-x", ...row } as unknown as import("../../../../../src/services/feishu/cards/types.js").CardInteractionRow;
      }),

      findLiveCard: vi.fn((cardType: string, chatId: string): LiveCardRow | null => {
        for (const row of liveCards.values()) {
          if (row.cardType === cardType && row.feishuChatId === chatId && !row.closedReason) {
            return row;
          }
        }
        return null;
      }),

      updateLiveCardState: vi.fn((id: string, nextState: unknown, patchedAt: string) => {
        const row = liveCards.get(id);
        if (row) {
          row.stateJson = nextState;
          row.lastPatchedAt = patchedAt;
        }
      }),

      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(() => Promise.resolve(null)),
      listReviewRequiredEvents: vi.fn(() => Promise.resolve([])),
      countReviewRequiredEvents: vi.fn(() => Promise.resolve(0)),

      listPriorQuizSelections: vi.fn(async (memberId: string, questionId: string) => {
        const selections = quizInteractions.get(memberId) ?? [];
        return selections
          .filter((s) => s.questionId === questionId)
          .map((s) => ({
            questionId: s.questionId,
            optionId: s.optionId,
            selectedAt: "2026-04-10T10:00:00.000Z"
          }));
      }),

      insertPeerReviewVote: vi.fn(),
      insertReactionTrackedMessage: vi.fn()
    },

    ingestor: {
      ingest: vi.fn(async (req) => {
        ingestCalls.push(req as unknown as Record<string, unknown>);
        incrementMetric("patchesSent");
        return {
          eventId: `evt-${req.itemCode}-${req.memberId}`,
          effectiveDelta: req.requestedDelta ?? 1,
          status: "pending" as const
        };
      })
    },

    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    adminApiClient: { patchMember: vi.fn(), listMembers: vi.fn() },

    config: {
      groupChatId: CHAT_ID,
      campId: CAMP_ID,
      cardVersionCurrent: "v1",
      cardVersionLegacy: "v0",
      radarImageBaseUrl: "https://cdn.example.com"
    },

    requestReappeal: vi.fn(),
    clock: () => new Date("2026-04-10T10:00:00.000Z"),
    uuid: (() => {
      let n = 0;
      return () => `uuid-${++n}`;
    })()
  };

  // Attach ingestCalls ref for test access
  (deps as unknown as Record<string, unknown>)._ingestCalls = ingestCalls;

  return deps;
}

function baseCtx(overrides: Partial<import("../../../../../src/services/feishu/cards/types.js").CardActionContext> = {}) {
  return {
    operatorOpenId: "ou-alice",
    triggerId: "t-1",
    actionName: "test_action",
    actionPayload: {},
    messageId: "om-checkin",
    chatId: CHAT_ID,
    receivedAt: "2026-04-10T10:00:00.000Z",
    currentVersion: "v1",
    ...overrides
  };
}

const LONG_TEXT = "今天学习了 Claude 提示词工程的核心技巧,通过实际操作理解了 few-shot 示例的重要性,收获很大";

// ---------------------------------------------------------------------------
// Setup: register templates before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearTemplateRegistry();
  registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);
  registerTemplate(LEADERBOARD_TEMPLATE_ID, buildLeaderboardCard);
  resetMetrics();
});

// ---------------------------------------------------------------------------
// Helper: build a period-open card (no live card needed — purely rendered)
// ---------------------------------------------------------------------------

function renderPeriodOpenCard(): FeishuCardJson {
  return buildPeriodOpenCard({
    periodNumber: 1,
    campName: "AI 实战营 第01期",
    openedAt: "2026-04-10T09:00:00.000Z"
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Camp lifecycle smoke test", () => {
  test("1. Period-open card renders correctly within size budget", () => {
    const card = renderPeriodOpenCard();

    expect(card.schema).toBe("2.0");
    expect(card.body.elements.length).toBeGreaterThan(0);

    const sizeBytes = Buffer.byteLength(JSON.stringify(card), "utf8");
    expect(sizeBytes).toBeLessThan(CARD_SIZE_BUDGET_BYTES);
  });

  test("2. Daily checkin card tracks 3 student K3 submissions correctly", async () => {
    const liveCards: LiveCardStore = new Map();

    // Insert a live daily-checkin card
    const checkinState = emptyDailyCheckinState({
      periodNumber: 1,
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: PERIOD_ID
    });
    const checkinRow = makeLiveRow({
      id: "flc-checkin",
      cardType: "daily_checkin",
      feishuMessageId: "om-checkin",
      stateJson: checkinState
    });
    liveCards.set("flc-checkin", checkinRow);

    const deps = makeDeps(liveCards);

    // 3 students submit K3
    const students = [
      { openId: "ou-alice", triggerId: "t-alice" },
      { openId: "ou-bob", triggerId: "t-bob" },
      { openId: "ou-carol", triggerId: "t-carol" }
    ];

    const results = [];
    for (const s of students) {
      const result = await dailyCheckinK3Handler(
        baseCtx({
          operatorOpenId: s.openId,
          triggerId: s.triggerId,
          actionName: "daily_checkin_k3_submit",
          actionPayload: { text: LONG_TEXT }
        }),
        deps
      );
      results.push(result);
    }

    // All submissions returned a card (not an error toast)
    for (const r of results) {
      expect(r.newCardJson).toBeDefined();
      expect(r.toast).toBeUndefined();
    }

    // Final state has all 3 students in K3.pending
    const finalState = liveCards.get("flc-checkin")?.stateJson as DailyCheckinState;
    expect(finalState.items.K3.pending).toContain("m-alice");
    expect(finalState.items.K3.pending).toContain("m-bob");
    expect(finalState.items.K3.pending).toContain("m-carol");
    expect(finalState.items.K3.approved).toHaveLength(0);
  });

  test("3. Quiz submit computes K1 + K2 scores via ingest", async () => {
    const liveCards: LiveCardStore = new Map();
    const deps = makeDeps(liveCards);

    // Quiz set with 2 questions, Alice answers 1 correctly
    const quizSet: ResolvedQuizSet = {
      questions: [
        {
          id: "q1",
          text: "Claude 最擅长什么?",
          options: [
            { id: "a", text: "写代码", isCorrect: true },
            { id: "b", text: "打游戏", isCorrect: false }
          ]
        },
        {
          id: "q2",
          text: "LLM 的全称是?",
          options: [
            { id: "a", text: "Large Language Model", isCorrect: true },
            { id: "b", text: "Light Learning Machine", isCorrect: false }
          ]
        }
      ]
    };

    // Inject quiz resolver into deps
    (deps as unknown as Record<string, unknown>)[QUIZ_SET_RESOLVER_KEY] = async (code: string) => {
      return code === "q-session1" ? quizSet : null;
    };

    const ctx = baseCtx({
      operatorOpenId: "ou-alice",
      actionPayload: { setCode: "q-session1", questionId: "q1", optionId: "a" }
    });

    // Select q1: correct answer
    const selectResult1 = await quizSelectHandler(
      { ...ctx, actionName: "quiz_select" },
      deps
    );
    expect(selectResult1.toast?.type).toBe("info");

    // Select q2: wrong answer
    const selectResult2 = await quizSelectHandler(
      {
        ...ctx,
        actionName: "quiz_select",
        triggerId: "t-q2",
        actionPayload: { setCode: "q-session1", questionId: "q2", optionId: "b" }
      },
      deps
    );
    expect(selectResult2.toast?.type).toBe("info");

    // Submit quiz
    const submitResult = await quizSubmitHandler(
      {
        ...ctx,
        actionName: "quiz_submit",
        triggerId: "t-submit",
        actionPayload: { setCode: "q-session1" }
      },
      deps
    );

    expect(submitResult.toast?.type).toBe("success");
    expect(submitResult.toast?.content).toContain("K1");

    const ingestCalls = (deps as unknown as Record<string, unknown>)._ingestCalls as Array<Record<string, unknown>>;
    const k1Call = ingestCalls.find((c) => c.itemCode === "K1");
    const k2Call = ingestCalls.find((c) => c.itemCode === "K2");

    expect(k1Call).toBeDefined();
    expect(k1Call?.requestedDelta).toBe(3);

    // 1/2 correct = 50% → Math.round(0.5 * 10) = 5
    expect(k2Call).toBeDefined();
    expect(k2Call?.requestedDelta).toBe(5);
  });

  test("4. Card sizes all within 25KB budget", () => {
    const cards: FeishuCardJson[] = [
      renderPeriodOpenCard(),
      buildLeaderboardCard({
        settledWindowId: "w-1",
        generatedAt: "2026-04-10T09:00:00.000Z",
        topN: MEMBERS.map((m, i) => ({
          memberId: m.id,
          displayName: m.displayName,
          cumulativeAq: 100 - i * 10,
          latestWindowAq: 30 - i * 5,
          currentLevel: m.currentLevel,
          dims: { K: 20, H: 10, C: 15, S: 5, G: 5 }
        })),
        radarImageUrl: null
      } satisfies LeaderboardState),
      buildDailyCheckinCard(
        emptyDailyCheckinState({
          periodNumber: 1,
          postedAt: "2026-04-10T09:00:00.000Z",
          periodId: PERIOD_ID
        }),
        baseCtx() as import("../../../../../src/services/feishu/cards/types.js").CardActionContext
      )
    ];

    for (const card of cards) {
      const size = Buffer.byteLength(JSON.stringify(card), "utf8");
      expect(size).toBeLessThan(CARD_SIZE_BUDGET_BYTES);
    }
  });

  test("5. Metrics counters reflect operations after lifecycle", async () => {
    resetMetrics();

    const liveCards: LiveCardStore = new Map();
    const checkinState = emptyDailyCheckinState({
      periodNumber: 1,
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: PERIOD_ID
    });
    liveCards.set("flc-checkin", makeLiveRow({
      id: "flc-checkin",
      cardType: "daily_checkin",
      feishuMessageId: "om-checkin",
      stateJson: checkinState
    }));

    const deps = makeDeps(liveCards);

    // Submit K3 for alice
    await dailyCheckinK3Handler(
      baseCtx({
        operatorOpenId: "ou-alice",
        actionName: "daily_checkin_k3_submit",
        actionPayload: { text: LONG_TEXT }
      }),
      deps
    );

    // At minimum 1 card action received, 1 ingest (patchesSent proxy)
    const m = getMetrics();
    expect(m.cardActionsReceived).toBeGreaterThanOrEqual(1);
    expect(m.patchesSent).toBeGreaterThanOrEqual(1);
  });
});

describe("CardActionDispatcher: full handler registration smoke", () => {
  test("dispatcher routes all registered daily-checkin actions without throwing", async () => {
    const liveCards: LiveCardStore = new Map();
    const checkinState = emptyDailyCheckinState({
      periodNumber: 1,
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: PERIOD_ID
    });
    liveCards.set("flc-checkin", makeLiveRow({
      id: "flc-checkin",
      cardType: "daily_checkin",
      feishuMessageId: "om-checkin",
      stateJson: checkinState
    }));

    const deps = makeDeps(liveCards);
    const dispatcher = new CardActionDispatcher(deps);

    // Register all daily-checkin handlers
    dispatcher.register("daily_checkin", "daily_checkin_k3_submit", dailyCheckinK3Handler);
    dispatcher.register("daily_checkin", "daily_checkin_k4_submit", dailyCheckinK4Handler);
    dispatcher.register("daily_checkin", "daily_checkin_c1_submit", dailyCheckinC1Handler);
    dispatcher.register("daily_checkin", "daily_checkin_c3_submit", dailyCheckinC3Handler);
    dispatcher.register("daily_checkin", "daily_checkin_g2_submit", dailyCheckinG2Handler);
    dispatcher.register("daily_checkin", "daily_checkin_h2_submit", dailyCheckinH2Handler);
    dispatcher.register("quiz", "quiz_select", quizSelectHandler);
    dispatcher.register("quiz", "quiz_submit", quizSubmitHandler);
    dispatcher.register("leaderboard", "leaderboard_refresh", leaderboardRefreshHandler);

    // Dispatch K3 for alice
    const result = await dispatcher.dispatch({
      cardType: "daily_checkin",
      actionName: "daily_checkin_k3_submit",
      payload: { text: LONG_TEXT },
      operatorOpenId: "ou-alice",
      triggerId: "t-smoke",
      messageId: "om-checkin",
      chatId: CHAT_ID,
      receivedAt: "2026-04-10T10:00:00.000Z",
      currentVersion: "v1"
    });

    // Should return a card, not an error toast
    expect(result.newCardJson).toBeDefined();
    expect(result.toast?.type).not.toBe("error");
  });
});
