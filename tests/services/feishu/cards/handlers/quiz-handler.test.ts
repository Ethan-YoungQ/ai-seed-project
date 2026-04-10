import { describe, expect, test, vi } from "vitest";

import {
  quizSelectHandler,
  quizSubmitHandler,
  QUIZ_SET_RESOLVER_KEY,
  type QuizDepsExtension,
  type ResolvedQuizSet
} from "../../../../../src/services/feishu/cards/handlers/quiz-handler.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  MemberLite,
  QuizSelection
} from "../../../../../src/services/feishu/cards/types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function fakeCtx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-student-1",
    triggerId: "t-1",
    actionName: "quiz_select",
    actionPayload: {},
    messageId: "om-1",
    chatId: "oc-group",
    receivedAt: "2026-04-10T12:00:00.000Z",
    currentVersion: "quiz-v1",
    ...overrides
  };
}

function fakeMember(partial: Partial<MemberLite> = {}): MemberLite {
  return {
    id: "m-1",
    displayName: "Alice",
    roleType: "student",
    isParticipant: true,
    isExcludedFromBoard: false,
    currentLevel: 2,
    ...partial
  };
}

function fakeDeps(
  overrides: Partial<CardHandlerDeps> & Partial<QuizDepsExtension> = {}
): CardHandlerDeps & QuizDepsExtension {
  const base: CardHandlerDeps = {
    repo: {
      findMemberByOpenId: vi.fn(async () => fakeMember()),
      listPriorQuizSelections: vi.fn(async () => []),
      insertCardInteraction: vi.fn(async (row) => ({ ...row, id: "ci-1" } as never)),
      insertPeerReviewVote: vi.fn(),
      insertReactionTrackedMessage: vi.fn(),
      findLiveCard: vi.fn(),
      updateLiveCardState: vi.fn(),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(async () => []),
      countReviewRequiredEvents: vi.fn(async () => 0)
    },
    ingestor: { ingest: vi.fn(async () => ({ eventId: "ev-1", effectiveDelta: 0, status: "approved" as const })) },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    adminApiClient: { patchMember: vi.fn(), listMembers: vi.fn() },
    config: {
      groupChatId: "oc-group",
      campId: "camp-1",
      cardVersionCurrent: "quiz-v1",
      cardVersionLegacy: "quiz-v0",
      radarImageBaseUrl: "https://cdn.example.com"
    },
    requestReappeal: vi.fn(),
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    uuid: () => "uuid-1"
  };

  const quizResolver: QuizDepsExtension = {
    [QUIZ_SET_RESOLVER_KEY]: vi.fn(async (setCode: string): Promise<ResolvedQuizSet | null> => {
      if (setCode === "W1-Q1") {
        return {
          questions: [
            { id: "q1", text: "Q1?", options: [{ id: "a", text: "A", isCorrect: true }, { id: "b", text: "B", isCorrect: false }] },
            { id: "q2", text: "Q2?", options: [{ id: "a", text: "A", isCorrect: false }, { id: "b", text: "B", isCorrect: true }] }
          ]
        };
      }
      return null;
    })
  };

  return { ...base, ...quizResolver, ...overrides } as CardHandlerDeps & QuizDepsExtension;
}

// ---------------------------------------------------------------------------
// quizSelectHandler tests
// ---------------------------------------------------------------------------

describe("quizSelectHandler", () => {
  test("quiz_select writes interaction row and returns toast '已选 A'", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      actionName: "quiz_select",
      actionPayload: { action: "quiz_select", setCode: "W1-Q1", questionId: "q1", optionId: "a" }
    });

    const result = await quizSelectHandler(ctx, deps);

    expect(deps.repo.insertCardInteraction).toHaveBeenCalledOnce();
    expect(result.toast?.type).toBe("info");
    expect(result.toast?.content).toContain("已选");
    expect(result.toast?.content).toContain("A");
  });

  test("quiz_select is idempotent: returns already_exists toast on double click without inserting again", async () => {
    const priorSelection: QuizSelection = {
      questionId: "q1",
      optionId: "a",
      selectedAt: "2026-04-10T11:00:00.000Z"
    };
    const deps = fakeDeps();
    vi.mocked(deps.repo.listPriorQuizSelections).mockResolvedValueOnce([priorSelection]);

    const ctx = fakeCtx({
      actionPayload: { action: "quiz_select", setCode: "W1-Q1", questionId: "q1", optionId: "a" }
    });

    const result = await quizSelectHandler(ctx, deps);

    expect(deps.repo.insertCardInteraction).not.toHaveBeenCalled();
    expect(result.toast?.type).toBe("info");
    expect(result.toast?.content).toContain("already_exists");
  });
});

// ---------------------------------------------------------------------------
// quizSubmitHandler tests
// ---------------------------------------------------------------------------

describe("quizSubmitHandler", () => {
  function submitCtx(setCode = "W1-Q1"): CardActionContext {
    return fakeCtx({
      actionName: "quiz_submit",
      actionPayload: { action: "quiz_submit", setCode }
    });
  }

  test("2 of 2 correct → K1=3, K2=10 ingested", async () => {
    const deps = fakeDeps();
    // Both questions answered correctly
    vi.mocked(deps.repo.listPriorQuizSelections)
      .mockResolvedValueOnce([{ questionId: "q1", optionId: "a", selectedAt: "2026-04-10T11:00:00.000Z" }])
      .mockResolvedValueOnce([{ questionId: "q2", optionId: "b", selectedAt: "2026-04-10T11:01:00.000Z" }]);

    const result = await quizSubmitHandler(submitCtx(), deps);

    expect(deps.ingestor.ingest).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(deps.ingestor.ingest).mock.calls;
    const k1Call = calls.find((c) => c[0].itemCode === "K1");
    const k2Call = calls.find((c) => c[0].itemCode === "K2");
    expect(k1Call?.[0].requestedDelta).toBe(3);
    expect(k2Call?.[0].requestedDelta).toBe(10);
    expect(result.toast?.type).toBe("success");
  });

  test("1 of 2 correct → K1=3, K2=5 ingested", async () => {
    const deps = fakeDeps();
    // q1 correct (a), q2 wrong (a instead of b)
    vi.mocked(deps.repo.listPriorQuizSelections)
      .mockResolvedValueOnce([{ questionId: "q1", optionId: "a", selectedAt: "2026-04-10T11:00:00.000Z" }])
      .mockResolvedValueOnce([{ questionId: "q2", optionId: "a", selectedAt: "2026-04-10T11:01:00.000Z" }]);

    const result = await quizSubmitHandler(submitCtx(), deps);

    const calls = vi.mocked(deps.ingestor.ingest).mock.calls;
    const k1Call = calls.find((c) => c[0].itemCode === "K1");
    const k2Call = calls.find((c) => c[0].itemCode === "K2");
    expect(k1Call?.[0].requestedDelta).toBe(3);
    expect(k2Call?.[0].requestedDelta).toBe(5);
    expect(result.toast?.type).toBe("success");
  });

  test("0 selections → warning toast, no ingest called", async () => {
    const deps = fakeDeps();
    // listPriorQuizSelections returns empty for all questions
    vi.mocked(deps.repo.listPriorQuizSelections).mockResolvedValue([]);

    const result = await quizSubmitHandler(submitCtx(), deps);

    expect(deps.ingestor.ingest).not.toHaveBeenCalled();
    expect(result.toast?.type).toBe("info");
    expect(result.toast?.content).toContain("请先选择");
  });

  test("unknown setCode → error toast returned, no ingest", async () => {
    const deps = fakeDeps();
    // Override resolver to return null for unknown set
    (deps as unknown as QuizDepsExtension)[QUIZ_SET_RESOLVER_KEY] = vi.fn(async () => null);

    const result = await quizSubmitHandler(submitCtx("UNKNOWN-SET"), deps);

    expect(deps.ingestor.ingest).not.toHaveBeenCalled();
    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("UNKNOWN-SET");
  });
});
