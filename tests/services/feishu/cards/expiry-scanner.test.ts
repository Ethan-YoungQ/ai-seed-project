import { describe, expect, test, vi } from "vitest";

import { scanAndCloseExpiring } from "../../../../src/services/feishu/cards/expiry-scanner.js";
import type { LiveCardRepository } from "../../../../src/services/feishu/cards/live-card-repository.js";
import type { LiveCardRow } from "../../../../src/services/feishu/cards/types.js";

function makeRow(overrides: Partial<LiveCardRow> = {}): LiveCardRow {
  return {
    id: "flc-1",
    cardType: "daily_checkin",
    feishuMessageId: "om-1",
    feishuChatId: "oc-1",
    campId: "camp-1",
    periodId: "p-1",
    windowId: null,
    cardVersion: "daily-checkin-v1",
    stateJson: {},
    sentAt: "2026-04-10T00:00:00.000Z",
    lastPatchedAt: null,
    expiresAt: "2026-04-24T00:00:00.000Z",
    closedReason: null,
    ...overrides
  };
}

function makeLive(rows: LiveCardRow[]): LiveCardRepository {
  return {
    listExpiringWithinDays: vi.fn((_now: Date, _days: number) => rows),
    close: vi.fn(),
    insert: vi.fn(),
    findActive: vi.fn(),
    findById: vi.fn(),
    updateState: vi.fn(),
    withTransaction: vi.fn()
  } as unknown as LiveCardRepository;
}

const NOW = new Date("2026-04-22T12:00:00.000Z");

describe("scanAndCloseExpiring", () => {
  test("no expiring cards → closedCount is 0", () => {
    const live = makeLive([]);
    const result = scanAndCloseExpiring({ live, clock: () => NOW });

    expect(result.closedCount).toBe(0);
    expect(result.closedIds).toEqual([]);
    expect(result.scannedAt).toBe(NOW.toISOString());
  });

  test("one card expiring within 2 days → closed with reason 'expired'", () => {
    const row = makeRow({ id: "flc-soon", expiresAt: "2026-04-23T12:00:00.000Z" });
    const live = makeLive([row]);

    const result = scanAndCloseExpiring({ live, clock: () => NOW });

    expect(result.closedCount).toBe(1);
    expect(result.closedIds).toContain("flc-soon");
    expect(live.close).toHaveBeenCalledWith("flc-soon", "expired");
  });

  test("card expiring in 3 days → NOT closed (listExpiringWithinDays filters it)", () => {
    // The repository only returns cards that expire within 2 days.
    // We simulate the repo returning nothing (as it would for 3-day cards).
    const live = makeLive([]);
    const result = scanAndCloseExpiring({ live, clock: () => NOW });

    expect(result.closedCount).toBe(0);
    expect(live.close).not.toHaveBeenCalled();
  });

  test("multiple expiring cards → all closed, all ids captured", () => {
    const rows = [
      makeRow({ id: "flc-a", feishuMessageId: "om-a", expiresAt: "2026-04-23T00:00:00.000Z" }),
      makeRow({ id: "flc-b", feishuMessageId: "om-b", expiresAt: "2026-04-24T00:00:00.000Z" })
    ];
    const live = makeLive(rows);

    const result = scanAndCloseExpiring({ live, clock: () => NOW });

    expect(result.closedCount).toBe(2);
    expect(result.closedIds).toEqual(["flc-a", "flc-b"]);
    expect(live.close).toHaveBeenCalledTimes(2);
  });
});
