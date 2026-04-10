import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  dailyCheckinK3Handler,
  dailyCheckinK4Handler,
  dailyCheckinC1Handler,
  dailyCheckinC3Handler,
  dailyCheckinG2Handler,
  dailyCheckinH2Handler
} from "../../../../../src/services/feishu/cards/handlers/daily-checkin-handler.js";
import {
  registerTemplate,
  clearTemplateRegistry
} from "../../../../../src/services/feishu/cards/renderer.js";
import {
  DAILY_CHECKIN_TEMPLATE_ID,
  buildDailyCheckinCard,
  emptyDailyCheckinState
} from "../../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  LiveCardRow,
  MemberLite
} from "../../../../../src/services/feishu/cards/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeCtx(overrides: Partial<CardActionContext> = {}): CardActionContext {
  return {
    operatorOpenId: "ou-stu-alice",
    triggerId: "t-1",
    actionName: "daily_checkin_k3_submit",
    actionPayload: { text: "今天学习了 Claude 的 system prompt 设计思路,觉得非常有启发性,准备应用到工作中" },
    messageId: "om-1",
    chatId: "oc-1",
    receivedAt: "2026-04-10T10:00:00.000Z",
    currentVersion: "daily-checkin-v1",
    ...overrides
  };
}

function seedLiveCardRow(): LiveCardRow {
  return {
    id: "flc-1",
    cardType: "daily_checkin",
    feishuMessageId: "om-1",
    feishuChatId: "oc-1",
    campId: "camp-1",
    periodId: "p-1",
    windowId: null,
    cardVersion: "daily-checkin-v1",
    stateJson: emptyDailyCheckinState({
      periodNumber: 3,
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-1"
    }),
    sentAt: "2026-04-10T09:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T09:00:00.000Z",
    closedReason: null
  };
}

function fakeDeps(): CardHandlerDeps & {
  interactions: Array<Record<string, unknown>>;
  ingestCalls: Array<Record<string, unknown>>;
  liveRow: LiveCardRow;
} {
  const interactions: Array<Record<string, unknown>> = [];
  const ingestCalls: Array<Record<string, unknown>> = [];
  const liveRow = seedLiveCardRow();

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
      insertCardInteraction: vi.fn(async (row) => {
        const saved = { id: "ci-1", ...row } as unknown as import("../../../../../src/services/feishu/cards/types.js").CardInteractionRow;
        interactions.push(saved as unknown as Record<string, unknown>);
        return saved;
      }),
      findLiveCard: vi.fn((cardType: string, chatId: string) => {
        if (cardType === "daily_checkin" && chatId === "oc-1") return liveRow;
        return null;
      }),
      updateLiveCardState: vi.fn((id: string, nextState: unknown) => {
        if (id === liveRow.id) {
          liveRow.stateJson = nextState;
        }
      }),
      insertLiveCard: vi.fn(),
      closeLiveCard: vi.fn(),
      findEventById: vi.fn(),
      listReviewRequiredEvents: vi.fn(() => Promise.resolve([])),
      countReviewRequiredEvents: vi.fn(() => Promise.resolve(0)),
      listPriorQuizSelections: vi.fn(() => Promise.resolve([])),
      insertPeerReviewVote: vi.fn(),
      insertReactionTrackedMessage: vi.fn()
    },
    ingestor: {
      ingest: vi.fn(async (req) => {
        ingestCalls.push(req as unknown as Record<string, unknown>);
        return {
          eventId: "evt-1",
          effectiveDelta: 1,
          status: "pending" as const
        };
      })
    },
    aggregator: { applyDecision: vi.fn() },
    feishuClient: { patchCard: vi.fn(), sendCard: vi.fn() },
    adminApiClient: { patchMember: vi.fn(), listMembers: vi.fn() },
    config: {
      groupChatId: "oc-group",
      campId: "camp-1",
      cardVersionCurrent: "daily-checkin-v1",
      cardVersionLegacy: "v0",
      radarImageBaseUrl: "https://cdn.example.com"
    },
    requestReappeal: vi.fn(),
    clock: () => new Date("2026-04-10T10:00:00.000Z"),
    uuid: () => "ci-1"
  };

  return Object.assign(deps, { interactions, ingestCalls, liveRow });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearTemplateRegistry();
  registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dailyCheckinK3Handler", () => {
  test("K3 happy path: validates, writes interaction, ingests K3, merges pending, returns card", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({ actionName: "daily_checkin_k3_submit" });

    const result = await dailyCheckinK3Handler(ctx, deps);

    expect(result.newCardJson).toBeDefined();
    expect(result.toast).toBeUndefined();

    // ingest was called with K3
    expect(deps.ingestCalls).toHaveLength(1);
    expect(deps.ingestCalls[0]).toMatchObject({ itemCode: "K3" });

    // member merged into pending
    const state = deps.liveRow.stateJson as ReturnType<typeof emptyDailyCheckinState>;
    expect(state.items.K3.pending).toContain("m-alice");

    // updateLiveCardState was called
    expect(deps.repo.updateLiveCardState).toHaveBeenCalledOnce();
  });
});

describe("dailyCheckinK4Handler", () => {
  test("K4 handler follows the same shape and ingests K4", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      operatorOpenId: "ou-stu-bob",
      actionName: "daily_checkin_k4_submit"
    });

    const result = await dailyCheckinK4Handler(ctx, deps);

    expect(result.newCardJson).toBeDefined();
    expect(deps.ingestCalls[0]).toMatchObject({ itemCode: "K4" });

    const state = deps.liveRow.stateJson as ReturnType<typeof emptyDailyCheckinState>;
    expect(state.items.K4.pending).toContain("m-bob");
  });
});

describe("dailyCheckinC1Handler + dailyCheckinC3Handler", () => {
  test("C1/C3 handlers both ingest their codes", async () => {
    const depsC1 = fakeDeps();
    await dailyCheckinC1Handler(
      fakeCtx({ operatorOpenId: "ou-stu-carol", actionName: "daily_checkin_c1_submit" }),
      depsC1
    );
    expect(depsC1.ingestCalls[0]).toMatchObject({ itemCode: "C1" });

    const depsC3 = fakeDeps();
    await dailyCheckinC3Handler(
      fakeCtx({ operatorOpenId: "ou-stu-dave", actionName: "daily_checkin_c3_submit" }),
      depsC3
    );
    expect(depsC3.ingestCalls[0]).toMatchObject({ itemCode: "C3" });
  });
});

describe("dailyCheckinG2Handler", () => {
  test("G2 handler uses validateG2Submission and rejects without URL", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      actionName: "daily_checkin_g2_submit",
      // text is long enough but missing URL
      actionPayload: { text: "推荐一篇很棒的文章,讲了很多关于 AI 的知识,大家应该去看看哦" }
    });

    const result = await dailyCheckinG2Handler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("URL");
    expect(result.newCardJson).toBeUndefined();
    expect(deps.ingestCalls).toHaveLength(0);
  });

  test("G2 happy path accepts http URL", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      actionName: "daily_checkin_g2_submit",
      actionPayload: {
        text: "推荐文章 https://example.com/ai-guide 讲解 Claude 使用非常清晰,值得收藏"
      }
    });

    const result = await dailyCheckinG2Handler(ctx, deps);

    expect(result.newCardJson).toBeDefined();
    expect(result.toast).toBeUndefined();
    expect(deps.ingestCalls[0]).toMatchObject({ itemCode: "G2" });
  });
});

describe("validation rejection", () => {
  test("short text returns text_too_short toast and does NOT ingest", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      actionPayload: { text: "太短了" }
    });

    const result = await dailyCheckinK3Handler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("20");
    expect(result.newCardJson).toBeUndefined();
    expect(deps.ingestCalls).toHaveLength(0);
  });
});

describe("missing live card", () => {
  test("missing active live card throws a clear error toast", async () => {
    const deps = fakeDeps();
    // Override findLiveCard to return null
    deps.repo.findLiveCard = vi.fn(() => null);

    const ctx = fakeCtx();
    const result = await dailyCheckinK3Handler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("打卡卡片");
    expect(result.newCardJson).toBeUndefined();
  });
});

describe("unknown member", () => {
  test("unknown member open id returns an error toast", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({ operatorOpenId: "ou-unknown-person" });

    const result = await dailyCheckinK3Handler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toMatch(/未找到|not found|成员/i);
    expect(result.newCardJson).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// E2: dailyCheckinH2Handler tests
// ---------------------------------------------------------------------------

describe("dailyCheckinH2Handler", () => {
  test("H2 happy path with valid text + file_key → ingest called with fileKey", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      operatorOpenId: "ou-stu-alice",
      actionName: "daily_checkin_h2_submit",
      actionPayload: {
        text: "今天用 Claude 实操了一个自动化工作流,截图展示了完整的流程步骤",
        file_key: "file-abc-123"
      }
    });

    const result = await dailyCheckinH2Handler(ctx, deps);

    expect(result.newCardJson).toBeDefined();
    expect(result.toast).toBeUndefined();
    expect(deps.ingestCalls).toHaveLength(1);
    expect(deps.ingestCalls[0]).toMatchObject({
      itemCode: "H2",
      payload: { fileKey: "file-abc-123" }
    });

    const state = deps.liveRow.stateJson as ReturnType<typeof emptyDailyCheckinState>;
    expect(state.items.H2.pending).toContain("m-alice");
  });

  test("H2 with empty file_key → rejected with toast", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      operatorOpenId: "ou-stu-alice",
      actionName: "daily_checkin_h2_submit",
      actionPayload: {
        text: "今天用 Claude 实操了一个自动化工作流,截图展示了完整的流程步骤",
        file_key: ""
      }
    });

    const result = await dailyCheckinH2Handler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(result.newCardJson).toBeUndefined();
    expect(deps.ingestCalls).toHaveLength(0);
  });

  test("H2 with short text → rejected with toast", async () => {
    const deps = fakeDeps();
    const ctx = fakeCtx({
      operatorOpenId: "ou-stu-alice",
      actionName: "daily_checkin_h2_submit",
      actionPayload: {
        text: "太短了",
        file_key: "file-abc-123"
      }
    });

    const result = await dailyCheckinH2Handler(ctx, deps);

    expect(result.toast?.type).toBe("error");
    expect(result.toast?.content).toContain("20");
    expect(result.newCardJson).toBeUndefined();
    expect(deps.ingestCalls).toHaveLength(0);
  });

  test("H2 member already in pending → idempotent, still returns card", async () => {
    const deps = fakeDeps();
    // Pre-seed member in pending
    (deps.liveRow.stateJson as ReturnType<typeof emptyDailyCheckinState>).items.H2.pending = [
      "m-alice"
    ];

    const ctx = fakeCtx({
      operatorOpenId: "ou-stu-alice",
      actionName: "daily_checkin_h2_submit",
      actionPayload: {
        text: "今天用 Claude 实操了一个自动化工作流,截图展示了完整的流程步骤",
        file_key: "file-abc-123"
      }
    });

    const result = await dailyCheckinH2Handler(ctx, deps);

    expect(result.newCardJson).toBeDefined();
    // still ingests (idempotency handled at ingestor level)
    expect(deps.ingestCalls).toHaveLength(1);

    const state = deps.liveRow.stateJson as ReturnType<typeof emptyDailyCheckinState>;
    // member appears only once in pending
    expect(state.items.H2.pending.filter((id) => id === "m-alice")).toHaveLength(1);
  });
});
