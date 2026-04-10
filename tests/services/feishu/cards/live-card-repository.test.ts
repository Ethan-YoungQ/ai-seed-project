import Database from "better-sqlite3";
import { beforeEach, describe, expect, test } from "vitest";

import { SqliteRepository } from "../../../../src/storage/sqlite-repository.js";
import { LiveCardRepository } from "../../../../src/services/feishu/cards/live-card-repository.js";
import { emptyDailyCheckinState } from "../../../../src/services/feishu/cards/types.js";
import type { DailyCheckinState, LiveCardRow } from "../../../../src/services/feishu/cards/types.js";

function fresh(): { repo: SqliteRepository; live: LiveCardRepository } {
  const repo = new SqliteRepository(":memory:");
  const live = new LiveCardRepository(repo);
  return { repo, live };
}

function sampleRow(overrides: Partial<LiveCardRow> = {}): LiveCardRow {
  const base: LiveCardRow = {
    id: "flc-1",
    cardType: "daily_checkin",
    feishuMessageId: "om-1",
    feishuChatId: "oc-1",
    campId: "camp-1",
    periodId: "p-1",
    windowId: null,
    cardVersion: "daily-checkin-v1",
    stateJson: emptyDailyCheckinState({
      postedAt: "2026-04-10T09:00:00.000Z",
      periodId: "p-1",
      periodNumber: 1
    }) satisfies DailyCheckinState,
    sentAt: "2026-04-10T09:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T09:00:00.000Z",
    closedReason: null
  };
  return { ...base, ...overrides };
}

describe("LiveCardRepository", () => {
  let repo: SqliteRepository;
  let live: LiveCardRepository;

  beforeEach(() => {
    ({ repo, live } = fresh());
  });

  test("schema: feishu_live_cards table is created on construction", () => {
    const db = (repo as unknown as { db: Database.Database }).db;
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='feishu_live_cards'")
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("feishu_live_cards");
  });

  test("insert + find roundtrips DailyCheckinState", () => {
    const row = sampleRow();
    live.insert(row);
    const found = live.findActive("daily_checkin", "oc-1");
    expect(found?.id).toBe("flc-1");
    const state = found?.stateJson as DailyCheckinState;
    expect(state.items.K3.pending).toEqual([]);
    expect(state.items.K3.approved).toEqual([]);
    expect(state.postedAt).toBe("2026-04-10T09:00:00.000Z");
  });

  test("updateState is transactional and bumps last_patched_at", () => {
    const row = sampleRow();
    live.insert(row);
    const nextState: DailyCheckinState = emptyDailyCheckinState({
      postedAt: row.sentAt,
      periodId: "p-1",
      periodNumber: 1
    });
    nextState.items.K3.pending.push("m-1");
    nextState.items.H2.pending.push("m-2");
    live.updateState("flc-1", nextState, "2026-04-10T10:05:00.000Z");
    const found = live.findActive("daily_checkin", "oc-1");
    expect((found?.stateJson as DailyCheckinState).items.K3.pending).toContain("m-1");
    expect((found?.stateJson as DailyCheckinState).items.H2.pending).toContain("m-2");
    expect(found?.lastPatchedAt).toBe("2026-04-10T10:05:00.000Z");
  });

  test("close marks closed_reason and hides from findActive", () => {
    live.insert(sampleRow());
    live.close("flc-1", "expired");
    expect(live.findActive("daily_checkin", "oc-1")).toBeNull();
  });

  test("listExpiringWithinDays returns cards that will expire soon", () => {
    live.insert(sampleRow({ id: "flc-a", expiresAt: "2026-04-11T00:00:00.000Z" }));
    live.insert(sampleRow({
      id: "flc-b",
      feishuMessageId: "om-2",
      expiresAt: "2026-05-01T00:00:00.000Z"
    }));
    const now = new Date("2026-04-10T00:00:00.000Z");
    const expiring = live.listExpiringWithinDays(now, 2);
    expect(expiring.map((r) => r.id)).toEqual(["flc-a"]);
  });

  test("findActive ignores closed rows", () => {
    live.insert(sampleRow({ id: "flc-old" }));
    live.close("flc-old", "replaced_by_new");
    expect(live.findActive("daily_checkin", "oc-1")).toBeNull();
    live.insert(sampleRow({ id: "flc-new", feishuMessageId: "om-2" }));
    expect(live.findActive("daily_checkin", "oc-1")?.id).toBe("flc-new");
  });
});
