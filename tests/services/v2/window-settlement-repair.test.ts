import { describe, expect, test } from "vitest";

import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";
import { buildCompletedWindowSettlementBackfillRuntime } from "../../../src/v2-production-wiring.js";

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

describe("completed window settlement backfill", () => {
  test("settles completed open windows exactly once", async () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const p1 = seedPeriod(repo, campId, 1);
    const p2 = seedPeriod(repo, campId, 2);
    repo.insertWindowShell({
      code: "W1",
      campId,
      isFinal: false,
      createdAt: "2026-04-11T00:00:00.000Z",
    });
    const window = repo.findWindowByCode(campId, "W1")!;
    repo.attachFirstPeriod(window.id, p1.id);
    repo.attachLastPeriod(window.id, p2.id);

    const settled: string[] = [];
    const runtime = buildCompletedWindowSettlementBackfillRuntime(repo, campId, {
      async settle(windowId: string) {
        settled.push(windowId);
        repo.markWindowSettled(windowId, "2026-05-21T00:00:00.000Z");
        return { windowId, settledAt: "2026-05-21T00:00:00.000Z" };
      },
    });

    await expect(runtime.backfillCompletedUnsettledWindows()).resolves.toEqual({
      completedWindows: 1,
      settledWindows: 1,
    });
    expect(settled).toEqual([window.id]);
    await expect(runtime.backfillCompletedUnsettledWindows()).resolves.toEqual({
      completedWindows: 0,
      settledWindows: 0,
    });

    repo.close();
  });
});
