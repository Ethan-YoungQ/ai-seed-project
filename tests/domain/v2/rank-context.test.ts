import { describe, expect, test } from "vitest";

import {
  computeRankContext,
  type RankContextInput,
  type DimensionScoreRow
} from "../../../src/domain/v2/rank-context.js";

function row(
  memberId: string,
  dimension: "K" | "H" | "C" | "S" | "G",
  cumulativeScore: number
): DimensionScoreRow {
  return { memberId, dimension, cumulativeScore };
}

function baseInput(overrides: Partial<RankContextInput> = {}): RankContextInput {
  return {
    targetMemberId: "m-1",
    eligibleMemberIds: ["m-1"],
    scoreRows: [],
    elapsedScoringPeriods: 0,
    ...overrides
  };
}

describe("computeRankContext", () => {
  test("single eligible member: rank 1 in all dimensions", () => {
    const input = baseInput({
      scoreRows: [
        row("m-1", "K", 20),
        row("m-1", "H", 15),
        row("m-1", "C", 10),
        row("m-1", "S", 5),
        row("m-1", "G", 8)
      ],
      elapsedScoringPeriods: 2
    });
    const ctx = computeRankContext(input);
    expect(ctx.eligibleStudentCount).toBe(1);
    expect(ctx.elapsedScoringPeriods).toBe(2);
    expect(ctx.K).toEqual({ rank: 1, cumulativeScore: 20 });
    expect(ctx.H).toEqual({ rank: 1, cumulativeScore: 15 });
    expect(ctx.C).toEqual({ rank: 1, cumulativeScore: 10 });
    expect(ctx.S).toEqual({ rank: 1, cumulativeScore: 5 });
    expect(ctx.G).toEqual({ rank: 1, cumulativeScore: 8 });
    // With only 1 eligible, rank==count so bottom1 and bottom3 both contain the dim
    expect(ctx.dimensionsInBottom1.size).toBe(5);
    expect(ctx.dimensionsInTop3.size).toBe(5);
  });

  test("clean 5-member ranking across all dimensions", () => {
    const members = ["m-1", "m-2", "m-3", "m-4", "m-5"];
    const rows: DimensionScoreRow[] = [];
    // m-1 dominates K, m-2 dominates H, m-3 dominates C, m-4 dominates S, m-5 dominates G
    const kScores = [50, 40, 30, 20, 10];
    const hScores = [10, 50, 40, 30, 20];
    const cScores = [20, 10, 50, 40, 30];
    const sScores = [30, 20, 10, 50, 40];
    const gScores = [40, 30, 20, 10, 50];
    for (let i = 0; i < members.length; i += 1) {
      rows.push(row(members[i], "K", kScores[i]));
      rows.push(row(members[i], "H", hScores[i]));
      rows.push(row(members[i], "C", cScores[i]));
      rows.push(row(members[i], "S", sScores[i]));
      rows.push(row(members[i], "G", gScores[i]));
    }
    const ctx = computeRankContext({
      targetMemberId: "m-1",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 4
    });
    expect(ctx.eligibleStudentCount).toBe(5);
    expect(ctx.K.rank).toBe(1);
    expect(ctx.K.cumulativeScore).toBe(50);
    expect(ctx.H.rank).toBe(5);
    expect(ctx.C.rank).toBe(4);
    expect(ctx.S.rank).toBe(3);
    expect(ctx.G.rank).toBe(2);
    expect(ctx.dimensionsInTop3.has("K")).toBe(true);
    expect(ctx.dimensionsInTop3.has("G")).toBe(true);
    expect(ctx.dimensionsInTop3.has("S")).toBe(true);
    expect(ctx.dimensionsInTop3.has("H")).toBe(false);
    expect(ctx.dimensionsInTop3.has("C")).toBe(false);
    expect(ctx.dimensionsInBottom1.has("H")).toBe(true);
    expect(ctx.dimensionsInBottom3.has("H")).toBe(true);
    expect(ctx.dimensionsInBottom3.has("C")).toBe(true);
    expect(ctx.dimensionsInBottom3.has("S")).toBe(true);
  });

  test("tie-breaking: equal scores resolved by memberId ASC", () => {
    const members = ["m-a", "m-b", "m-c"];
    const rows: DimensionScoreRow[] = [
      row("m-a", "K", 30),
      row("m-b", "K", 30),
      row("m-c", "K", 30),
      row("m-a", "H", 10),
      row("m-b", "H", 10),
      row("m-c", "H", 10),
      row("m-a", "C", 0),
      row("m-b", "C", 0),
      row("m-c", "C", 0),
      row("m-a", "S", 5),
      row("m-b", "S", 5),
      row("m-c", "S", 5),
      row("m-a", "G", 20),
      row("m-b", "G", 20),
      row("m-c", "G", 20)
    ];
    const ctxA = computeRankContext({
      targetMemberId: "m-a",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 2
    });
    const ctxB = computeRankContext({
      targetMemberId: "m-b",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 2
    });
    const ctxC = computeRankContext({
      targetMemberId: "m-c",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 2
    });
    expect(ctxA.K.rank).toBe(1);
    expect(ctxB.K.rank).toBe(2);
    expect(ctxC.K.rank).toBe(3);
  });

  test("missing score rows for target member default to zero", () => {
    const ctx = computeRankContext({
      targetMemberId: "m-2",
      eligibleMemberIds: ["m-1", "m-2"],
      scoreRows: [row("m-1", "K", 30), row("m-1", "H", 30)],
      elapsedScoringPeriods: 1
    });
    expect(ctx.K.cumulativeScore).toBe(0);
    expect(ctx.K.rank).toBe(2);
    expect(ctx.H.cumulativeScore).toBe(0);
    expect(ctx.H.rank).toBe(2);
    expect(ctx.dimensionsInBottom1.has("K")).toBe(true);
  });

  test("10-member boundary: rank 3 is in Top3 but rank 4 is not", () => {
    const members = Array.from({ length: 10 }, (_, i) => `m-${i + 1}`);
    const rows: DimensionScoreRow[] = members.map((id, i) =>
      row(id, "K", 100 - i * 5)
    );
    // append 4 more dims all zero so the shape is valid
    for (const id of members) {
      rows.push(row(id, "H", 0));
      rows.push(row(id, "C", 0));
      rows.push(row(id, "S", 0));
      rows.push(row(id, "G", 0));
    }
    const ctxRank3 = computeRankContext({
      targetMemberId: "m-3",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 6
    });
    expect(ctxRank3.K.rank).toBe(3);
    expect(ctxRank3.dimensionsInTop3.has("K")).toBe(true);

    const ctxRank4 = computeRankContext({
      targetMemberId: "m-4",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 6
    });
    expect(ctxRank4.K.rank).toBe(4);
    expect(ctxRank4.dimensionsInTop3.has("K")).toBe(false);
    expect(ctxRank4.dimensionsInTop5.has("K")).toBe(true);
  });

  test("10-member boundary: bottom3 contains ranks 8, 9, 10", () => {
    const members = Array.from({ length: 10 }, (_, i) => `m-${i + 1}`);
    const rows: DimensionScoreRow[] = members.map((id, i) =>
      row(id, "G", 100 - i * 5)
    );
    for (const id of members) {
      rows.push(row(id, "K", 0));
      rows.push(row(id, "H", 0));
      rows.push(row(id, "C", 0));
      rows.push(row(id, "S", 0));
    }
    const ctxBottom = computeRankContext({
      targetMemberId: "m-10",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 8
    });
    expect(ctxBottom.G.rank).toBe(10);
    expect(ctxBottom.dimensionsInBottom1.has("G")).toBe(true);
    expect(ctxBottom.dimensionsInBottom3.has("G")).toBe(true);

    const ctxRank8 = computeRankContext({
      targetMemberId: "m-8",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 8
    });
    expect(ctxRank8.G.rank).toBe(8);
    expect(ctxRank8.dimensionsInBottom1.has("G")).toBe(false);
    expect(ctxRank8.dimensionsInBottom3.has("G")).toBe(true);
  });

  test("zero cumulative score across all dimensions still produces a rank", () => {
    const members = ["m-1", "m-2"];
    const rows: DimensionScoreRow[] = members.flatMap((id) => [
      row(id, "K", 0),
      row(id, "H", 0),
      row(id, "C", 0),
      row(id, "S", 0),
      row(id, "G", 0)
    ]);
    const ctx = computeRankContext({
      targetMemberId: "m-2",
      eligibleMemberIds: members,
      scoreRows: rows,
      elapsedScoringPeriods: 1
    });
    expect(ctx.K.cumulativeScore).toBe(0);
    // tie-broken by memberId ASC: m-1 rank 1, m-2 rank 2
    expect(ctx.K.rank).toBe(2);
  });
});
