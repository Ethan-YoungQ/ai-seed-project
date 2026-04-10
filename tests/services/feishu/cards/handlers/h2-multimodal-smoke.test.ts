/**
 * E3 — H2 Multimodal smoke test (exit checkpoint)
 *
 * Integration test using real SqliteRepository + LiveCardRepository.
 * Verifies that the full H2 multimodal submission path works end-to-end:
 *   - card_interaction written
 *   - EventIngestor called with fileKey in payload
 *   - live card state updated with member in H2.pending
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

import { dailyCheckinH2Handler } from "../../../../../src/services/feishu/cards/handlers/daily-checkin-handler.js";
import {
  registerTemplate,
  clearTemplateRegistry
} from "../../../../../src/services/feishu/cards/renderer.js";
import {
  DAILY_CHECKIN_TEMPLATE_ID,
  buildDailyCheckinCard,
  emptyDailyCheckinState,
  type DailyCheckinState
} from "../../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import { SqliteRepository } from "../../../../../src/storage/sqlite-repository.js";
import { LiveCardRepository } from "../../../../../src/services/feishu/cards/live-card-repository.js";
import type {
  CardActionContext,
  CardHandlerDeps,
  CardInteractionRow,
  LiveCardRow,
  MemberLite
} from "../../../../../src/services/feishu/cards/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAT_ID = "oc-h2-smoke-1";
const MESSAGE_ID = "om-h2-smoke-1";
const CARD_VERSION = "daily-checkin-v1";
const NOW_ISO = "2026-04-10T10:00:00.000Z";
const ALICE_OPEN_ID = "ou-stu-alice";
const ALICE_MEMBER_ID = "m-alice";

// Valid H2 text (at least 20 substantive characters)
const VALID_H2_TEXT =
  "今天用 Claude 实操了自动化工作流,截图展示了完整的分步骤操作过程";
const VALID_FILE_KEY = "file-screenshot-abc-123";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAliceMember(): MemberLite {
  return {
    id: ALICE_MEMBER_ID,
    displayName: "Alice",
    roleType: "student" as const,
    isParticipant: true,
    isExcludedFromBoard: false,
    currentLevel: 1
  };
}

function seedLiveCardRow(): LiveCardRow {
  return {
    id: "flc-h2-smoke-1",
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

function makeCtx(
  overrides: Partial<CardActionContext> = {}
): CardActionContext {
  return {
    operatorOpenId: ALICE_OPEN_ID,
    triggerId: "t-h2-smoke",
    actionName: "daily_checkin_h2_submit",
    actionPayload: {
      text: VALID_H2_TEXT,
      file_key: VALID_FILE_KEY
    },
    messageId: MESSAGE_ID,
    chatId: CHAT_ID,
    receivedAt: NOW_ISO,
    currentVersion: CARD_VERSION,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let sqliteRepo: SqliteRepository;
let live: LiveCardRepository;
let interactionRows: CardInteractionRow[];
let ingestCalls: Array<Record<string, unknown>>;
let deps: CardHandlerDeps;

beforeEach(() => {
  clearTemplateRegistry();
  registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);

  // Real repositories backed by in-memory SQLite
  sqliteRepo = new SqliteRepository(":memory:");
  live = new LiveCardRepository(sqliteRepo);
  live.insert(seedLiveCardRow());

  interactionRows = [];
  ingestCalls = [];

  deps = {
    repo: {
      findMemberByOpenId: vi.fn((openId: string) =>
        openId === ALICE_OPEN_ID ? buildAliceMember() : null
      ),
      insertCardInteraction: vi.fn(async (row) => {
        const saved = { id: "ci-h2", ...row } as unknown as CardInteractionRow;
        interactionRows.push(saved);
        return saved;
      }),
      findLiveCard: vi.fn((cardType: string, chatId: string) =>
        live.findActive(
          cardType as import("../../../../../src/services/feishu/cards/types.js").CardType,
          chatId
        )
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
          eventId: "evt-h2-smoke",
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
    uuid: vi.fn(() => "uuid-h2-smoke")
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("H2 multimodal smoke test (E3 exit checkpoint)", () => {
  test("valid H2 submit: card_interaction written with correct fields", async () => {
    const ctx = makeCtx();

    const result = await dailyCheckinH2Handler(ctx, deps);

    expect(result.newCardJson).toBeDefined();
    expect(result.toast).toBeUndefined();

    // card_interaction recorded
    expect(interactionRows).toHaveLength(1);
    expect(interactionRows[0]).toMatchObject({
      memberId: ALICE_MEMBER_ID,
      cardType: "daily_checkin",
      actionName: "daily_checkin_h2_submit",
      rejectedReason: null
    });
  });

  test("valid H2 submit: EventIngestor called with fileKey in payload", async () => {
    const ctx = makeCtx();

    await dailyCheckinH2Handler(ctx, deps);

    expect(ingestCalls).toHaveLength(1);
    expect(ingestCalls[0]).toMatchObject({
      memberId: ALICE_MEMBER_ID,
      itemCode: "H2",
      payload: {
        text: VALID_H2_TEXT,
        fileKey: VALID_FILE_KEY
      }
    });
  });

  test("valid H2 submit: live card state updated with member in H2.pending", async () => {
    const ctx = makeCtx();

    await dailyCheckinH2Handler(ctx, deps);

    const finalCard = live.findActive("daily_checkin", CHAT_ID);
    expect(finalCard).not.toBeNull();

    const state = finalCard!.stateJson as DailyCheckinState;
    expect(state.items.H2.pending).toContain(ALICE_MEMBER_ID);
    // Other items unchanged
    expect(state.items.K3.pending).toHaveLength(0);
    expect(state.items.K4.pending).toHaveLength(0);
  });
});
