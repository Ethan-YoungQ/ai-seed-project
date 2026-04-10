/**
 * C4 — Sync burst exit checkpoint
 *
 * Validates 14 concurrent clicks on the daily-checkin card.
 * Distributed as: K3×3, K4×3, C1×3, C3×3, G2×2 (H2 deferred to Phase E).
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  dailyCheckinK3Handler,
  dailyCheckinK4Handler,
  dailyCheckinC1Handler,
  dailyCheckinC3Handler,
  dailyCheckinG2Handler
} from "../../../../../src/services/feishu/cards/handlers/daily-checkin-handler.js";
import {
  registerTemplate,
  clearTemplateRegistry,
  CARD_SIZE_BUDGET_BYTES
} from "../../../../../src/services/feishu/cards/renderer.js";
import {
  DAILY_CHECKIN_TEMPLATE_ID,
  buildDailyCheckinCard,
  emptyDailyCheckinState
} from "../../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import { CardActionDispatcher } from "../../../../../src/services/feishu/cards/card-action-dispatcher.js";
import { SqliteRepository } from "../../../../../src/storage/sqlite-repository.js";
import { LiveCardRepository } from "../../../../../src/services/feishu/cards/live-card-repository.js";
import type {
  CardHandlerDeps,
  CardInteractionRow,
  LiveCardRow,
  MemberLite
} from "../../../../../src/services/feishu/cards/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAT_ID = "oc-burst-1";
const MESSAGE_ID = "om-burst-1";
const CARD_VERSION = "daily-checkin-v1";
const NOW_ISO = "2026-04-10T10:00:00.000Z";

// G2 text must contain a URL
const G2_TEXT =
  "推荐 https://example.com/ai-guide 这篇讲 Claude 使用非常清晰值得反复阅读";

// Standard text for K3/K4/C1/C3 — at least 20 chars
const STD_TEXT =
  "这里是一段至少 20 字的学习笔记用来通过软验证规则,内容足以描述今天的收获";

// 14 unique openIds
const OPEN_IDS = Array.from({ length: 14 }, (_, i) => `ou-stu-${i + 1}`);

// ---------------------------------------------------------------------------
// Click plan: 14 total, K3×3, K4×3, C1×3, C3×3, G2×2
// ---------------------------------------------------------------------------

interface ClickSpec {
  openId: string;
  actionName: string;
  text: string;
}

const CLICK_PLAN: ClickSpec[] = [
  // K3 × 3
  { openId: OPEN_IDS[0], actionName: "daily_checkin_k3_submit", text: STD_TEXT },
  { openId: OPEN_IDS[1], actionName: "daily_checkin_k3_submit", text: STD_TEXT },
  { openId: OPEN_IDS[2], actionName: "daily_checkin_k3_submit", text: STD_TEXT },
  // K4 × 3
  { openId: OPEN_IDS[3], actionName: "daily_checkin_k4_submit", text: STD_TEXT },
  { openId: OPEN_IDS[4], actionName: "daily_checkin_k4_submit", text: STD_TEXT },
  { openId: OPEN_IDS[5], actionName: "daily_checkin_k4_submit", text: STD_TEXT },
  // C1 × 3
  { openId: OPEN_IDS[6], actionName: "daily_checkin_c1_submit", text: STD_TEXT },
  { openId: OPEN_IDS[7], actionName: "daily_checkin_c1_submit", text: STD_TEXT },
  { openId: OPEN_IDS[8], actionName: "daily_checkin_c1_submit", text: STD_TEXT },
  // C3 × 3
  { openId: OPEN_IDS[9], actionName: "daily_checkin_c3_submit", text: STD_TEXT },
  { openId: OPEN_IDS[10], actionName: "daily_checkin_c3_submit", text: STD_TEXT },
  { openId: OPEN_IDS[11], actionName: "daily_checkin_c3_submit", text: STD_TEXT },
  // G2 × 2
  { openId: OPEN_IDS[12], actionName: "daily_checkin_g2_submit", text: G2_TEXT },
  { openId: OPEN_IDS[13], actionName: "daily_checkin_g2_submit", text: G2_TEXT }
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMemberLite(openId: string): MemberLite {
  const suffix = openId.replace("ou-stu-", "");
  return {
    id: `m-${suffix}`,
    displayName: `Student ${suffix}`,
    roleType: "student" as const,
    isParticipant: true,
    isExcludedFromBoard: false,
    currentLevel: 1
  };
}

function seedLiveCardRow(): LiveCardRow {
  return {
    id: "flc-burst-1",
    cardType: "daily_checkin",
    feishuMessageId: MESSAGE_ID,
    feishuChatId: CHAT_ID,
    campId: "camp-1",
    periodId: "p-1",
    windowId: null,
    cardVersion: CARD_VERSION,
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

// ---------------------------------------------------------------------------
// Shared state for each test
// ---------------------------------------------------------------------------

let sqliteRepo: SqliteRepository;
let live: LiveCardRepository;
let interactionRows: CardInteractionRow[];
let ingestCalls: Array<Record<string, unknown>>;
let dispatcher: CardActionDispatcher;

beforeEach(() => {
  clearTemplateRegistry();
  registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);

  // Real repositories backed by in-memory SQLite
  sqliteRepo = new SqliteRepository(":memory:");
  live = new LiveCardRepository(sqliteRepo);

  // Seed a live card row
  live.insert(seedLiveCardRow());

  // Tracking arrays for assertions
  interactionRows = [];
  ingestCalls = [];

  // Build deps — all CardHandlerDeps fields present
  const deps: CardHandlerDeps = {
    repo: {
      findMemberByOpenId: vi.fn((openId: string) =>
        openId.startsWith("ou-stu-") ? buildMemberLite(openId) : null
      ),
      insertCardInteraction: vi.fn(async (row) => {
        const saved = { id: "ci-burst", ...row } as unknown as CardInteractionRow;
        interactionRows.push(saved);
        return saved;
      }),
      findLiveCard: vi.fn((cardType: string, chatId: string) =>
        live.findActive(cardType as import("../../../../../src/services/feishu/cards/types.js").CardType, chatId)
      ),
      updateLiveCardState: vi.fn((id: string, nextState: unknown, at: string) => {
        live.updateState(id, nextState, at);
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
          eventId: `evt-${ingestCalls.length}`,
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
      cardVersionCurrent: CARD_VERSION,
      cardVersionLegacy: "v0",
      radarImageBaseUrl: "https://cdn.example.com"
    },
    requestReappeal: vi.fn(),
    clock: () => new Date(NOW_ISO),
    uuid: vi.fn(() => `uuid-${Math.random().toString(36).slice(2)}`)
  };

  // Create dispatcher and register all 5 handlers
  dispatcher = new CardActionDispatcher(deps);
  dispatcher.register("daily_checkin", "daily_checkin_k3_submit", dailyCheckinK3Handler);
  dispatcher.register("daily_checkin", "daily_checkin_k4_submit", dailyCheckinK4Handler);
  dispatcher.register("daily_checkin", "daily_checkin_c1_submit", dailyCheckinC1Handler);
  dispatcher.register("daily_checkin", "daily_checkin_c3_submit", dailyCheckinC3Handler);
  dispatcher.register("daily_checkin", "daily_checkin_g2_submit", dailyCheckinG2Handler);
});

// ---------------------------------------------------------------------------
// Helper: fire all 14 clicks concurrently
// ---------------------------------------------------------------------------

async function fireAllClicks() {
  return Promise.all(
    CLICK_PLAN.map((spec) =>
      dispatcher.dispatch({
        cardType: "daily_checkin",
        actionName: spec.actionName,
        payload: { text: spec.text },
        operatorOpenId: spec.openId,
        triggerId: `trigger-${spec.openId}`,
        messageId: MESSAGE_ID,
        chatId: CHAT_ID,
        receivedAt: NOW_ISO,
        currentVersion: CARD_VERSION
      })
    )
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("14-click burst checkpoint (S1 exit gate)", () => {
  test("14 concurrent clicks all succeed with no exceptions", async () => {
    const results = await fireAllClicks();

    expect(results).toHaveLength(14);
    for (const result of results) {
      expect(result.newCardJson).toBeDefined();
      expect(result.toast).toBeUndefined();
    }
  });

  test("all 14 card_interactions rows are recorded", async () => {
    await fireAllClicks();

    expect(interactionRows).toHaveLength(14);

    const memberIds = interactionRows.map((r) => r.memberId);
    const uniqueMemberIds = new Set(memberIds);
    expect(uniqueMemberIds.size).toBe(14);
  });

  test("live card state reflects all 14 pending memberIds across 5 items", async () => {
    await fireAllClicks();

    const finalCard = live.findActive("daily_checkin", CHAT_ID);
    expect(finalCard).not.toBeNull();

    const state = finalCard!.stateJson as import("../../../../../src/services/feishu/cards/templates/daily-checkin-v1.js").DailyCheckinState;

    const totalPending =
      state.items.K3.pending.length +
      state.items.K4.pending.length +
      state.items.C1.pending.length +
      state.items.C3.pending.length +
      state.items.G2.pending.length;

    expect(totalPending).toBe(14);
  });

  test("all 14 rendered cards fit within the 25 KB budget", async () => {
    const results = await fireAllClicks();

    for (const result of results) {
      if (!result.newCardJson) continue;
      const size = Buffer.byteLength(JSON.stringify(result.newCardJson), "utf8");
      expect(size).toBeLessThan(CARD_SIZE_BUDGET_BYTES);
    }
  });

  test("EventIngestor receives 14 distinct ingest calls", async () => {
    await fireAllClicks();

    expect(ingestCalls).toHaveLength(14);

    const sourceRefs = ingestCalls.map((c) => (c as { sourceRef: string }).sourceRef);
    const uniqueSourceRefs = new Set(sourceRefs);
    expect(uniqueSourceRefs.size).toBe(14);
  });
});
