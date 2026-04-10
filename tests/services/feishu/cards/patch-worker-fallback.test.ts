/**
 * D4: Integration test for the 230031 expired-card fallback flow.
 *
 * Uses real SqliteRepository (in-memory) + real LiveCardRepository to validate
 * the complete recovery path:
 *   1. Insert live card row.
 *   2. Call notifySub2CardPatch with a feishuClient that throws 230031.
 *   3. Verify result.status === "needsSend" and closedRowId is set.
 *   4. Simulate caller sending a fresh card and inserting a new live row.
 *   5. Verify the new row is findable and carries the delta-applied state.
 */

import { beforeEach, describe, expect, test } from "vitest";

import { SqliteRepository } from "../../../../src/storage/sqlite-repository.js";
import { LiveCardRepository } from "../../../../src/services/feishu/cards/live-card-repository.js";
import {
  notifySub2CardPatch,
  type PatchWorkerDeps
} from "../../../../src/services/feishu/cards/patch-worker.js";
import {
  registerTemplate,
  clearTemplateRegistry
} from "../../../../src/services/feishu/cards/renderer.js";
import {
  DAILY_CHECKIN_TEMPLATE_ID,
  buildDailyCheckinCard,
  emptyDailyCheckinState,
  type DailyCheckinState
} from "../../../../src/services/feishu/cards/templates/daily-checkin-v1.js";
import type { LiveCardRow } from "../../../../src/services/feishu/cards/types.js";

// ─── Error fixture ────────────────────────────────────────────────────────────

const EXPIRED_ERROR = Object.assign(new Error("message too old"), { code: 230031 });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeInitialState(): DailyCheckinState {
  return emptyDailyCheckinState({
    periodNumber: 2,
    postedAt: "2026-04-10T09:00:00.000Z",
    periodId: "p-2"
  });
}

function makeRow(overrides: Partial<LiveCardRow> = {}): LiveCardRow {
  return {
    id: "flc-orig",
    cardType: "daily_checkin",
    feishuMessageId: "om-original",
    feishuChatId: "oc-group",
    campId: "camp-1",
    periodId: "p-2",
    windowId: null,
    cardVersion: DAILY_CHECKIN_TEMPLATE_ID,
    stateJson: makeInitialState(),
    sentAt: "2026-04-10T09:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T09:00:00.000Z",
    closedReason: null,
    ...overrides
  };
}

function makePatcherDeps(live: LiveCardRepository): PatchWorkerDeps {
  return {
    live: {
      findActive: (ct, chatId) => live.findActive(ct as import("../../../../src/services/feishu/cards/types.js").CardType, chatId),
      updateState: (id, state, patchedAt) => live.updateState(id, state, patchedAt),
      close: (id, reason) => live.close(id, reason as LiveCardRow["closedReason"])
    },
    feishuClient: {
      patchCard: () => { throw EXPIRED_ERROR; }
    },
    deadLetter: { insert: () => { /* no-op */ } },
    clock: () => new Date("2026-04-10T12:00:00.000Z"),
    sleep: () => Promise.resolve(),
    templateIdFor: (ct) => (ct === "daily_checkin" ? DAILY_CHECKIN_TEMPLATE_ID : null),
    maxAttempts: 1
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function fresh(): { sqliteRepo: SqliteRepository; live: LiveCardRepository } {
  const sqliteRepo = new SqliteRepository(":memory:");
  const live = new LiveCardRepository(sqliteRepo);
  return { sqliteRepo, live };
}

beforeEach(() => {
  clearTemplateRegistry();
  registerTemplate(DAILY_CHECKIN_TEMPLATE_ID, buildDailyCheckinCard);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("230031 fallback exit checkpoint (D4)", () => {
  test("230031 error closes original row and returns needsSend with closedRowId", async () => {
    const { live } = fresh();

    // Insert live card
    live.insert(makeRow());

    const deps = makePatcherDeps(live);
    const delta = (prev: DailyCheckinState) => prev; // identity

    const result = await notifySub2CardPatch<DailyCheckinState>(
      "daily_checkin",
      "oc-group",
      delta,
      deps
    );

    expect(result.status).toBe("needsSend");
    if (result.status !== "needsSend") throw new Error("type guard");

    expect(result.closedRowId).toBe("flc-orig");

    // Closed row is no longer findable as active
    expect(live.findActive("daily_checkin", "oc-group")).toBeNull();

    // But findById still works and shows the closed reason
    const closed = live.findById("flc-orig");
    expect(closed?.closedReason).toBe("expired");
  });

  test("full recovery: close expired row → sendCard → insert new row → findable", async () => {
    const { live } = fresh();

    // Insert original row
    live.insert(makeRow());

    const deps = makePatcherDeps(live);

    const delta = (prev: DailyCheckinState): DailyCheckinState => ({
      ...prev,
      items: {
        ...prev.items,
        K3: { pending: ["m-alice"], approved: [] }
      }
    });

    const result = await notifySub2CardPatch<DailyCheckinState>(
      "daily_checkin",
      "oc-group",
      delta,
      deps
    );

    expect(result.status).toBe("needsSend");

    // Simulate caller computing the delta-applied state and sending a fresh card
    const closedRow = live.findById("flc-orig");
    expect(closedRow).not.toBeNull();
    const oldState = closedRow!.stateJson as DailyCheckinState;
    const freshState = delta(oldState);

    // Caller inserts new live row after sendCard returns a new messageId
    const newRow: LiveCardRow = {
      ...makeRow(),
      id: "flc-new",
      feishuMessageId: "om-fresh",
      stateJson: freshState
    };
    live.insert(newRow);

    // New row is findable as the active card
    const active = live.findActive("daily_checkin", "oc-group");
    expect(active?.id).toBe("flc-new");
  });

  test("new row after recovery has delta-applied state", async () => {
    const { live } = fresh();
    live.insert(makeRow());

    const deps = makePatcherDeps(live);

    const delta = (prev: DailyCheckinState): DailyCheckinState => ({
      ...prev,
      items: {
        ...prev.items,
        G2: { pending: [], approved: ["m-eve"] }
      }
    });

    await notifySub2CardPatch<DailyCheckinState>("daily_checkin", "oc-group", delta, deps);

    // Recover: apply delta to old state and insert new row
    const oldState = live.findById("flc-orig")!.stateJson as DailyCheckinState;
    const freshState = delta(oldState);
    live.insert({
      ...makeRow(),
      id: "flc-new2",
      feishuMessageId: "om-fresh2",
      stateJson: freshState
    });

    const found = live.findActive("daily_checkin", "oc-group");
    const foundState = found?.stateJson as DailyCheckinState;
    expect(foundState.items.G2.approved).toContain("m-eve");
    expect(foundState.items.G2.pending).not.toContain("m-eve");
  });

  test("missing active row returns needsSend with null closedRowId without touching DB", async () => {
    const { live } = fresh();
    // No row inserted - empty DB

    const deps = makePatcherDeps(live);
    const delta = (prev: DailyCheckinState) => prev;

    const result = await notifySub2CardPatch<DailyCheckinState>(
      "daily_checkin",
      "oc-group",
      delta,
      deps
    );

    expect(result.status).toBe("needsSend");
    if (result.status !== "needsSend") throw new Error("type guard");
    expect(result.closedRowId).toBeNull();
  });
});
