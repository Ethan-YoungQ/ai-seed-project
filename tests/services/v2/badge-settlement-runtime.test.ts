import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";
import { describe, expect, test } from "vitest";

import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";
import { buildBadgeSettlementRuntime } from "../../../src/v2-production-wiring.js";

function seedPeriod(repo: SqliteRepository, campId: string, number: number) {
  const period = {
    id: `period-${campId}-${number}`,
    campId,
    number,
    isIceBreaker: number === 1,
    startedAt: `2026-04-${10 + number}T00:00:00.000Z`,
    openedByOpId: null,
    createdAt: `2026-04-${10 + number}T00:00:00.000Z`,
    updatedAt: `2026-04-${10 + number}T00:00:00.000Z`,
  };
  repo.insertPeriod(period);
  return period;
}

function seedWindow(repo: SqliteRepository, campId: string, code: string, periodId: string) {
  repo.insertWindowShell({
    code,
    campId,
    isFinal: false,
    createdAt: "2026-04-11T00:00:00.000Z",
  });
  const window = repo.findWindowByCode(campId, code)!;
  repo.attachLastPeriod(window.id, periodId);
  repo.markWindowSettled(window.id, "2026-04-18T00:00:00.000Z");
  return window;
}

function seedSnapshot(input: {
  repo: SqliteRepository;
  windowId: string;
  memberId: string;
  windowAq: number;
  cumulativeAq: number;
  k: number;
  h: number;
  c: number;
  s: number;
  g: number;
}) {
  input.repo.insertWindowSnapshot({
    id: randomUUID(),
    windowId: input.windowId,
    memberId: input.memberId,
    windowAq: input.windowAq,
    cumulativeAq: input.cumulativeAq,
    kScore: input.k,
    hScore: input.h,
    cScore: input.c,
    sScore: input.s,
    gScore: input.g,
    growthBonus: 0,
    consecMissedOnEntry: 0,
    snapshotAt: "2026-04-18T00:00:00.000Z",
  });
}

describe("buildBadgeSettlementRuntime", () => {
  test("backfills settled windows and stays idempotent", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const db = (repo as unknown as { db: Database.Database }).db;
    db.prepare(
      `INSERT INTO members
        (id, camp_id, name, display_name, department, role_type, is_participant, is_excluded_from_board, status)
       VALUES (?, ?, ?, ?, ?, 'student', 1, 0, 'active')`
    ).run("user-bob", campId, "Bob", "Bob", "default");
    const p2 = seedPeriod(repo, campId, 2);
    const w1 = seedWindow(repo, campId, "W1", p2.id);

    seedSnapshot({
      repo,
      windowId: w1.id,
      memberId: "user-alice",
      windowAq: 40,
      cumulativeAq: 40,
      k: 9,
      h: 8,
      c: 7,
      s: 6,
      g: 5,
    });
    seedSnapshot({
      repo,
      windowId: w1.id,
      memberId: "user-bob",
      windowAq: 30,
      cumulativeAq: 30,
      k: 12,
      h: 4,
      c: 4,
      s: 4,
      g: 4,
    });

    const runtime = buildBadgeSettlementRuntime(repo, campId, {
      now: () => "2026-05-21T00:00:00.000Z",
    });

    expect(runtime.backfillSettledWindows()).toEqual({
      settledWindows: 1,
      insertedBadges: 2,
    });
    expect(runtime.backfillSettledWindows()).toEqual({
      settledWindows: 1,
      insertedBadges: 0,
    });

    const badges = repo.listMemberBadges(campId);
    expect(badges.get("user-alice")?.map((badge) => badge.badgeId)).toEqual(["b1-mvp"]);
    expect(badges.get("user-bob")?.map((badge) => badge.badgeId)).toEqual(["b3-K"]);

    repo.close();
  });
});
