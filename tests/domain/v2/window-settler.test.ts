import { describe, expect, test, vi } from "vitest";

import {
  settleWindow,
  type SettlerDependencies,
  type SettleOptions,
  type WindowRecord,
  type MemberLevelRecord,
  type PromotionRecord,
  type WindowSnapshotRecord
} from "../../../src/domain/v2/window-settler.js";
import type { DimensionScoreRow } from "../../../src/domain/v2/rank-context.js";

function makeFake(state: {
  window: WindowRecord;
  eligibleMemberIds: string[];
  periodScores: Map<string, DimensionScoreRow[]>;
  prevSnapshots: Map<string, WindowSnapshotRecord>;
  prevPromotions: Map<string, PromotionRecord>;
  memberLevels: Map<string, MemberLevelRecord>;
  attended: Set<string>;
  homeworkAllSubmitted: Set<string>;
  elapsedScoringPeriods: number;
  throwDuringPromotionWrite?: boolean;
}): SettlerDependencies {
  const writtenSnapshots: WindowSnapshotRecord[] = [];
  const writtenPromotions: PromotionRecord[] = [];
  const levelUpdates: MemberLevelRecord[] = [];
  let windowState: WindowRecord = { ...state.window };
  let promotionsWritten = 0;

  const deps: SettlerDependencies = {
    fetchWindow: vi.fn().mockImplementation(async () => windowState),
    updateWindowSettlementState: vi.fn().mockImplementation(async (_id, next) => {
      windowState = { ...windowState, settlementState: next };
    }),
    listEligibleStudentIds: vi.fn().mockResolvedValue(state.eligibleMemberIds),
    fetchPeriodDimensionScores: vi
      .fn()
      .mockImplementation(async (memberId: string, _periodIds: string[]) => {
        return state.periodScores.get(memberId) ?? [];
      }),
    fetchPreviousSnapshot: vi
      .fn()
      .mockImplementation(async (memberId: string) => {
        return state.prevSnapshots.get(memberId) ?? null;
      }),
    fetchPreviousPromotionRecord: vi
      .fn()
      .mockImplementation(async (memberId: string) => {
        return state.prevPromotions.get(memberId) ?? null;
      }),
    fetchMemberLevel: vi
      .fn()
      .mockImplementation(async (memberId: string) => {
        return (
          state.memberLevels.get(memberId) ?? {
            memberId,
            currentLevel: 1,
            levelAttainedAt: "2026-04-01T00:00:00Z",
            lastWindowId: null,
            updatedAt: "2026-04-01T00:00:00Z"
          }
        );
      }),
    computeAttendance: vi
      .fn()
      .mockImplementation(async (memberId: string) => state.attended.has(memberId)),
    computeHomeworkAllSubmitted: vi
      .fn()
      .mockImplementation(async (memberId: string) =>
        state.homeworkAllSubmitted.has(memberId)
      ),
    fetchAllEligibleDimensionScores: vi.fn().mockImplementation(async () => {
      const all: DimensionScoreRow[] = [];
      for (const rows of state.periodScores.values()) {
        all.push(...rows);
      }
      return all;
    }),
    fetchElapsedScoringPeriods: vi
      .fn()
      .mockResolvedValue(state.elapsedScoringPeriods),
    insertWindowSnapshot: vi
      .fn()
      .mockImplementation(async (snap: WindowSnapshotRecord) => {
        writtenSnapshots.push(snap);
      }),
    insertPromotionRecord: vi
      .fn()
      .mockImplementation(async (rec: PromotionRecord) => {
        promotionsWritten += 1;
        if (
          state.throwDuringPromotionWrite &&
          promotionsWritten === 1
        ) {
          throw new Error("simulated write failure");
        }
        writtenPromotions.push(rec);
      }),
    updateMemberLevel: vi
      .fn()
      .mockImplementation(async (rec: MemberLevelRecord) => {
        levelUpdates.push(rec);
      }),
    now: () => "2026-04-10T00:00:00Z"
  };

  return Object.assign(deps, {
    __state: () => ({ windowState, writtenSnapshots, writtenPromotions, levelUpdates })
  });
}

describe("settleWindow", () => {
  test("happy path W1 single member gets promoted Lv1 -> Lv2 primary", async () => {
    const window: WindowRecord = {
      id: "window-w1",
      campId: "c1",
      code: "W1",
      firstPeriodId: "p-1",
      lastPeriodId: "p-2",
      isFinal: false,
      settlementState: "open",
      settledAt: null
    };
    const deps = makeFake({
      window,
      eligibleMemberIds: ["m-1"],
      periodScores: new Map([
        [
          "m-1",
          [
            { memberId: "m-1", dimension: "K", cumulativeScore: 9 },
            { memberId: "m-1", dimension: "H", cumulativeScore: 7 },
            { memberId: "m-1", dimension: "C", cumulativeScore: 6 },
            { memberId: "m-1", dimension: "S", cumulativeScore: 5 },
            { memberId: "m-1", dimension: "G", cumulativeScore: 5 }
          ]
        ]
      ]),
      prevSnapshots: new Map(),
      prevPromotions: new Map(),
      memberLevels: new Map([
        [
          "m-1",
          {
            memberId: "m-1",
            currentLevel: 1,
            levelAttainedAt: "2026-04-01",
            lastWindowId: null,
            updatedAt: "2026-04-01"
          }
        ]
      ]),
      attended: new Set(),
      homeworkAllSubmitted: new Set(),
      elapsedScoringPeriods: 2
    });

    const result = await settleWindow("window-w1", deps);

    expect(result.ok).toBe(true);
    expect(result.settledMemberCount).toBe(1);
    const state = (deps as unknown as { __state: () => { windowState: WindowRecord; writtenSnapshots: WindowSnapshotRecord[]; writtenPromotions: PromotionRecord[]; levelUpdates: MemberLevelRecord[] } }).__state();
    expect(state.windowState.settlementState).toBe("settled");
    expect(state.writtenSnapshots).toHaveLength(1);
    expect(state.writtenSnapshots[0].windowAq).toBe(32);
    expect(state.writtenSnapshots[0].growthBonus).toBe(0);
    expect(state.writtenPromotions).toHaveLength(1);
    expect(state.writtenPromotions[0].promoted).toBe(1);
    expect(state.writtenPromotions[0].toLevel).toBe(2);
    expect(state.levelUpdates).toHaveLength(1);
  });

  test("W2 with growth bonus applied", async () => {
    const window: WindowRecord = {
      id: "window-w2",
      campId: "c1",
      code: "W2",
      firstPeriodId: "p-3",
      lastPeriodId: "p-4",
      isFinal: false,
      settlementState: "open",
      settledAt: null
    };
    const deps = makeFake({
      window,
      eligibleMemberIds: ["m-1"],
      periodScores: new Map([
        [
          "m-1",
          [
            { memberId: "m-1", dimension: "K", cumulativeScore: 15 },
            { memberId: "m-1", dimension: "H", cumulativeScore: 15 },
            { memberId: "m-1", dimension: "C", cumulativeScore: 10 },
            { memberId: "m-1", dimension: "S", cumulativeScore: 5 },
            { memberId: "m-1", dimension: "G", cumulativeScore: 5 }
          ]
        ]
      ]),
      prevSnapshots: new Map([
        [
          "m-1",
          {
            id: "snap-w1-m1",
            windowId: "window-w1",
            memberId: "m-1",
            windowAq: 32,
            cumulativeAq: 32,
            kScore: 8,
            hScore: 8,
            cScore: 8,
            sScore: 4,
            gScore: 4,
            growthBonus: 0,
            consecMissedOnEntry: 0,
            snapshotAt: "2026-04-05"
          }
        ]
      ]),
      prevPromotions: new Map([
        [
          "m-1",
          {
            id: "prom-w1-m1",
            windowId: "window-w1",
            memberId: "m-1",
            evaluatedAt: "2026-04-05",
            fromLevel: 1,
            toLevel: 2,
            promoted: 1,
            pathTaken: "primary",
            reason: "{}"
          }
        ]
      ]),
      memberLevels: new Map([
        [
          "m-1",
          {
            memberId: "m-1",
            currentLevel: 2,
            levelAttainedAt: "2026-04-05",
            lastWindowId: "window-w1",
            updatedAt: "2026-04-05"
          }
        ]
      ]),
      attended: new Set(),
      homeworkAllSubmitted: new Set(["m-1"]),
      elapsedScoringPeriods: 4
    });

    const result = await settleWindow("window-w2", deps);
    expect(result.ok).toBe(true);
    const state = (deps as unknown as { __state: () => { writtenSnapshots: WindowSnapshotRecord[] } }).__state();
    // current before bonus: 15+15+10+5+5 = 50; prev 32, ratio 50/32=1.5625 -> leap +10
    expect(state.writtenSnapshots[0].growthBonus).toBe(10);
    expect(state.writtenSnapshots[0].windowAq).toBe(60);
  });

  test("W2 with protection discount when previous promotion was missed", async () => {
    const window: WindowRecord = {
      id: "window-w2",
      campId: "c1",
      code: "W2",
      firstPeriodId: "p-3",
      lastPeriodId: "p-4",
      isFinal: false,
      settlementState: "open",
      settledAt: null
    };
    const deps = makeFake({
      window,
      eligibleMemberIds: ["m-1"],
      periodScores: new Map([
        [
          "m-1",
          [
            { memberId: "m-1", dimension: "K", cumulativeScore: 8 },
            { memberId: "m-1", dimension: "H", cumulativeScore: 7 },
            { memberId: "m-1", dimension: "C", cumulativeScore: 6 },
            { memberId: "m-1", dimension: "S", cumulativeScore: 4 },
            { memberId: "m-1", dimension: "G", cumulativeScore: 3 }
          ]
        ]
      ]),
      prevSnapshots: new Map([
        [
          "m-1",
          {
            id: "snap-w1-m1",
            windowId: "window-w1",
            memberId: "m-1",
            windowAq: 24,
            cumulativeAq: 24,
            kScore: 6,
            hScore: 6,
            cScore: 6,
            sScore: 3,
            gScore: 3,
            growthBonus: 0,
            consecMissedOnEntry: 0,
            snapshotAt: "2026-04-05"
          }
        ]
      ]),
      prevPromotions: new Map([
        [
          "m-1",
          {
            id: "prom-w1-m1",
            windowId: "window-w1",
            memberId: "m-1",
            evaluatedAt: "2026-04-05",
            fromLevel: 1,
            toLevel: 1,
            promoted: 0,
            pathTaken: "none",
            reason: "{}"
          }
        ]
      ]),
      memberLevels: new Map([
        [
          "m-1",
          {
            memberId: "m-1",
            currentLevel: 1,
            levelAttainedAt: "2026-04-01",
            lastWindowId: "window-w1",
            updatedAt: "2026-04-05"
          }
        ]
      ]),
      attended: new Set(),
      homeworkAllSubmitted: new Set(),
      elapsedScoringPeriods: 4
    });

    const result = await settleWindow("window-w2", deps);
    expect(result.ok).toBe(true);
    const state = (deps as unknown as { __state: () => { writtenSnapshots: WindowSnapshotRecord[]; writtenPromotions: PromotionRecord[] } }).__state();
    expect(state.writtenSnapshots[0].consecMissedOnEntry).toBe(1);
    // windowAq 28 passes discounted threshold ceil(32*0.85)=28
    expect(state.writtenPromotions[0].pathTaken).toBe("protection_discounted");
  });

  test("non-eligible member is skipped via listEligibleStudentIds", async () => {
    const window: WindowRecord = {
      id: "window-w1",
      campId: "c1",
      code: "W1",
      firstPeriodId: "p-1",
      lastPeriodId: "p-2",
      isFinal: false,
      settlementState: "open",
      settledAt: null
    };
    const deps = makeFake({
      window,
      eligibleMemberIds: [],
      periodScores: new Map(),
      prevSnapshots: new Map(),
      prevPromotions: new Map(),
      memberLevels: new Map(),
      attended: new Set(),
      homeworkAllSubmitted: new Set(),
      elapsedScoringPeriods: 2
    });

    const result = await settleWindow("window-w1", deps);
    expect(result.ok).toBe(true);
    expect(result.settledMemberCount).toBe(0);
    const state = (deps as unknown as { __state: () => { writtenSnapshots: WindowSnapshotRecord[] } }).__state();
    expect(state.writtenSnapshots).toHaveLength(0);
  });

  test("idempotent on already-settled window (skipped)", async () => {
    const window: WindowRecord = {
      id: "window-w1",
      campId: "c1",
      code: "W1",
      firstPeriodId: "p-1",
      lastPeriodId: "p-2",
      isFinal: false,
      settlementState: "settled",
      settledAt: "2026-04-09T00:00:00Z"
    };
    const deps = makeFake({
      window,
      eligibleMemberIds: ["m-1"],
      periodScores: new Map(),
      prevSnapshots: new Map(),
      prevPromotions: new Map(),
      memberLevels: new Map(),
      attended: new Set(),
      homeworkAllSubmitted: new Set(),
      elapsedScoringPeriods: 2
    });

    const result = await settleWindow("window-w1", deps);
    expect(result.ok).toBe(true);
    expect(result.alreadySettled).toBe(true);
    expect(deps.listEligibleStudentIds).not.toHaveBeenCalled();
  });

  test("transaction-like atomicity: reverts to 'open' on mid-flight error", async () => {
    const window: WindowRecord = {
      id: "window-w1",
      campId: "c1",
      code: "W1",
      firstPeriodId: "p-1",
      lastPeriodId: "p-2",
      isFinal: false,
      settlementState: "open",
      settledAt: null
    };
    const deps = makeFake({
      window,
      eligibleMemberIds: ["m-1", "m-2"],
      periodScores: new Map([
        [
          "m-1",
          [
            { memberId: "m-1", dimension: "K", cumulativeScore: 9 },
            { memberId: "m-1", dimension: "H", cumulativeScore: 7 },
            { memberId: "m-1", dimension: "C", cumulativeScore: 6 },
            { memberId: "m-1", dimension: "S", cumulativeScore: 5 },
            { memberId: "m-1", dimension: "G", cumulativeScore: 5 }
          ]
        ],
        [
          "m-2",
          [
            { memberId: "m-2", dimension: "K", cumulativeScore: 9 },
            { memberId: "m-2", dimension: "H", cumulativeScore: 7 },
            { memberId: "m-2", dimension: "C", cumulativeScore: 6 },
            { memberId: "m-2", dimension: "S", cumulativeScore: 5 },
            { memberId: "m-2", dimension: "G", cumulativeScore: 5 }
          ]
        ]
      ]),
      prevSnapshots: new Map(),
      prevPromotions: new Map(),
      memberLevels: new Map(),
      attended: new Set(),
      homeworkAllSubmitted: new Set(),
      elapsedScoringPeriods: 2,
      throwDuringPromotionWrite: true
    });

    await expect(settleWindow("window-w1", deps)).rejects.toThrow(
      /simulated write failure/
    );
    const state = (deps as unknown as { __state: () => { windowState: WindowRecord } }).__state();
    expect(state.windowState.settlementState).toBe("open");
  });
});
