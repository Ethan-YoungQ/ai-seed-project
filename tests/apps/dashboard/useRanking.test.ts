import { describe, expect, test } from "vitest";

import { attachBadges } from "../../../apps/dashboard/src/hooks/useRanking";
import type { RankingRow } from "../../../apps/dashboard/src/types/api";

function row(input: Partial<RankingRow> & Pick<RankingRow, "memberId">): RankingRow {
  return {
    memberId: input.memberId,
    memberName: input.memberName ?? input.memberId,
    currentLevel: input.currentLevel ?? 1,
    cumulativeAq: input.cumulativeAq ?? 0,
    latestWindowAq: input.latestWindowAq ?? 0,
    dimensions: input.dimensions ?? { K: 0, H: 0, C: 0, S: 0, G: 0 },
    rank: input.rank ?? 1,
    badges: input.badges,
  };
}

describe("attachBadges", () => {
  test("preserves server-persisted badge arrays instead of overwriting them", () => {
    const rows = attachBadges([
      row({
        memberId: "m1",
        cumulativeAq: 100,
        latestWindowAq: 100,
        dimensions: { K: 10, H: 0, C: 0, S: 0, G: 0 },
        badges: [],
      }),
      row({
        memberId: "m2",
        cumulativeAq: 1,
        latestWindowAq: 1,
        dimensions: { K: 1, H: 0, C: 0, S: 0, G: 0 },
        badges: [{ badgeId: "b1-mvp", periodNumber: 2 }],
      }),
    ]);

    expect(rows[0].badges).toEqual([]);
    expect(rows[1].badges).toEqual([{ badgeId: "b1-mvp", periodNumber: 2 }]);
  });

  test("does not synthesize badges from current period count when server badges are absent", () => {
    const rows = attachBadges([
      row({
        memberId: "m1",
        cumulativeAq: 100,
        latestWindowAq: 100,
        dimensions: { K: 100, H: 100, C: 100, S: 100, G: 100 },
      }),
    ]);

    expect(rows[0].badges).toEqual([]);
  });
});
