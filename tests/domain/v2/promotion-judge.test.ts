import { describe, expect, test } from "vitest";

import {
  judge,
  type JudgeInput,
  type JudgeOutput,
  type WindowSnapshotLike
} from "../../../src/domain/v2/promotion-judge.js";
import type { ScoringDimension } from "../../../src/domain/v2/scoring-items-config.js";

function snapshot(overrides: Partial<WindowSnapshotLike> = {}): WindowSnapshotLike {
  return {
    windowAq: 0,
    cumulativeAq: 0,
    kScore: 0,
    hScore: 0,
    cScore: 0,
    sScore: 0,
    gScore: 0,
    ...overrides
  };
}

function ctx(overrides: {
  top3?: ScoringDimension[];
  top5?: ScoringDimension[];
  bottom1?: ScoringDimension[];
  bottom3?: ScoringDimension[];
  eligibleStudentCount?: number;
  elapsedScoringPeriods?: number;
  perDim?: Partial<Record<ScoringDimension, number>>;
} = {}): JudgeInput["dimensionRankContext"] {
  const perDim = overrides.perDim ?? {};
  return {
    K: { rank: 1, cumulativeScore: perDim.K ?? 0 },
    H: { rank: 1, cumulativeScore: perDim.H ?? 0 },
    C: { rank: 1, cumulativeScore: perDim.C ?? 0 },
    S: { rank: 1, cumulativeScore: perDim.S ?? 0 },
    G: { rank: 1, cumulativeScore: perDim.G ?? 0 },
    eligibleStudentCount: overrides.eligibleStudentCount ?? 14,
    dimensionsInBottom1: new Set(overrides.bottom1 ?? []),
    dimensionsInBottom3: new Set(overrides.bottom3 ?? []),
    dimensionsInTop3: new Set(overrides.top3 ?? []),
    dimensionsInTop5: new Set(overrides.top5 ?? []),
    elapsedScoringPeriods: overrides.elapsedScoringPeriods ?? 4
  };
}

function input(overrides: Partial<JudgeInput> = {}): JudgeInput {
  return {
    snapshot: snapshot(),
    currentLevel: 1,
    consecMissedOnEntry: 0,
    isFinal: false,
    dimensionRankContext: ctx(),
    attendedAllPeriods: false,
    homeworkAllSubmitted: false,
    sBehaviorScore: 0,
    cBehaviorScore: 0,
    hasClosingShowcaseBonus: false,
    ...overrides
  };
}

interface JudgeCase {
  name: string;
  setup: JudgeInput;
  expectPromoted: boolean;
  expectToLevel: 1 | 2 | 3 | 4 | 5;
  expectPath: JudgeOutput["pathTaken"];
}

const cases: JudgeCase[] = [
  {
    name: "Lv1->Lv2 primary: windowAq=32, 1 dim>=8",
    setup: input({
      currentLevel: 1,
      snapshot: snapshot({ windowAq: 32, cumulativeAq: 32, kScore: 8 })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "primary"
  },
  {
    name: "Lv1->Lv2 primary fail (no dim>=8), alternate pass: cumAq=56, 2 dims>=5",
    setup: input({
      currentLevel: 1,
      snapshot: snapshot({
        windowAq: 28,
        cumulativeAq: 56,
        kScore: 7,
        hScore: 5,
        cScore: 5
      })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "alternate"
  },
  {
    name: "Lv1->Lv2 both fail: windowAq=20, cum=40, only 1 dim>=5",
    setup: input({
      currentLevel: 1,
      snapshot: snapshot({
        windowAq: 20,
        cumulativeAq: 40,
        kScore: 5,
        hScore: 4
      })
    }),
    expectPromoted: false,
    expectToLevel: 1,
    expectPath: "none"
  },
  {
    name: "Lv1->Lv2 primary with discount 0.15 (consecMissed=1): windowAq >= ceil(32*0.85)=28",
    setup: input({
      currentLevel: 1,
      consecMissedOnEntry: 1,
      snapshot: snapshot({ windowAq: 28, cumulativeAq: 28, kScore: 8 })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "protection_discounted"
  },
  {
    name: "Lv1->Lv2 primary with discount 0.25 (consecMissed=2): windowAq >= ceil(32*0.75)=24",
    setup: input({
      currentLevel: 1,
      consecMissedOnEntry: 2,
      snapshot: snapshot({ windowAq: 24, cumulativeAq: 24, kScore: 8 })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "protection_discounted"
  },
  {
    name: "Lv2->Lv3 primary: windowAq=42, 2 dims>=10, homework all",
    setup: input({
      currentLevel: 2,
      homeworkAllSubmitted: true,
      snapshot: snapshot({
        windowAq: 42,
        cumulativeAq: 100,
        kScore: 12,
        hScore: 10
      })
    }),
    expectPromoted: true,
    expectToLevel: 3,
    expectPath: "primary"
  },
  {
    name: "Lv2->Lv3 primary fails on homework, alternate pass",
    setup: input({
      currentLevel: 2,
      homeworkAllSubmitted: false,
      snapshot: snapshot({
        windowAq: 40,
        cumulativeAq: 160,
        kScore: 10,
        hScore: 10,
        cScore: 10
      }),
      dimensionRankContext: ctx({
        elapsedScoringPeriods: 4,
        perDim: { K: 16, H: 16, C: 16, S: 10 }
      })
    }),
    expectPromoted: true,
    expectToLevel: 3,
    expectPath: "alternate"
  },
  {
    name: "Lv2->Lv3 primary fails on dim count (only 1>=10), alternate fails on cumAq",
    setup: input({
      currentLevel: 2,
      homeworkAllSubmitted: true,
      snapshot: snapshot({
        windowAq: 42,
        cumulativeAq: 120,
        kScore: 12,
        hScore: 9
      })
    }),
    expectPromoted: false,
    expectToLevel: 2,
    expectPath: "none"
  },
  {
    name: "Lv2->Lv3 primary with discount 0.25 dimCountRelax=1 (only 1 dim>=10 needed)",
    setup: input({
      currentLevel: 2,
      consecMissedOnEntry: 2,
      homeworkAllSubmitted: true,
      snapshot: snapshot({
        windowAq: 32,
        cumulativeAq: 32,
        kScore: 10
      })
    }),
    expectPromoted: true,
    expectToLevel: 3,
    expectPath: "protection_discounted"
  },
  {
    name: "Lv3->Lv4 primary: windowAq=50, cum=245, 4 dims meet dimCumulative, sBehavior>=5",
    setup: input({
      currentLevel: 3,
      sBehaviorScore: 5,
      snapshot: snapshot({
        windowAq: 50,
        cumulativeAq: 245,
        kScore: 12,
        hScore: 12,
        cScore: 12,
        sScore: 12,
        gScore: 2
      }),
      dimensionRankContext: ctx({
        elapsedScoringPeriods: 4,
        perDim: { K: 20, H: 20, C: 20, S: 20, G: 8 }
      })
    }),
    expectPromoted: true,
    expectToLevel: 4,
    expectPath: "primary"
  },
  {
    name: "Lv3->Lv4 primary fails (sBehavior<5), alternate: cum=295, cBehavior>=8, no bottom1",
    setup: input({
      currentLevel: 3,
      sBehaviorScore: 4,
      cBehaviorScore: 8,
      snapshot: snapshot({
        windowAq: 39,
        cumulativeAq: 295,
        kScore: 9,
        hScore: 9,
        cScore: 8,
        sScore: 4,
        gScore: 9
      }),
      dimensionRankContext: ctx({
        bottom1: []
      })
    }),
    expectPromoted: true,
    expectToLevel: 4,
    expectPath: "alternate"
  },
  {
    name: "Lv3->Lv4 alternate fails on bottom1 rule",
    setup: input({
      currentLevel: 3,
      sBehaviorScore: 4,
      cBehaviorScore: 8,
      snapshot: snapshot({
        windowAq: 39,
        cumulativeAq: 295
      }),
      dimensionRankContext: ctx({
        bottom1: ["G"]
      })
    }),
    expectPromoted: false,
    expectToLevel: 3,
    expectPath: "none"
  },
  {
    name: "Lv3->Lv4 discount 0.15: windowAq >= ceil(50*0.85)=43",
    setup: input({
      currentLevel: 3,
      consecMissedOnEntry: 1,
      sBehaviorScore: 5,
      snapshot: snapshot({
        windowAq: 43,
        cumulativeAq: 245,
        kScore: 12,
        hScore: 12,
        cScore: 12,
        sScore: 12
      }),
      dimensionRankContext: ctx({
        elapsedScoringPeriods: 4,
        perDim: { K: 20, H: 20, C: 20, S: 20, G: 8 }
      })
    }),
    expectPromoted: true,
    expectToLevel: 4,
    expectPath: "protection_discounted"
  },
  {
    name: "Lv4->Lv5 primary: windowAq=56, cum=392, all 5 dims meet, 1 top3",
    setup: input({
      currentLevel: 4,
      snapshot: snapshot({
        windowAq: 56,
        cumulativeAq: 392
      }),
      dimensionRankContext: ctx({
        top3: ["K"],
        top5: ["K", "H"],
        elapsedScoringPeriods: 6,
        perDim: { K: 30, H: 30, C: 30, S: 30, G: 30 }
      })
    }),
    expectPromoted: true,
    expectToLevel: 5,
    expectPath: "primary"
  },
  {
    name: "Lv4->Lv5 primary fails on top3, alternate passes",
    setup: input({
      currentLevel: 4,
      snapshot: snapshot({
        windowAq: 46,
        cumulativeAq: 434
      }),
      dimensionRankContext: ctx({
        top3: [],
        top5: ["K", "H", "C", "S"],
        bottom3: [],
        elapsedScoringPeriods: 6,
        perDim: { K: 30, H: 30, C: 30, S: 30, G: 25 }
      })
    }),
    expectPromoted: true,
    expectToLevel: 5,
    expectPath: "alternate"
  },
  {
    name: "Lv4->Lv5 alternate fails on bottom3",
    setup: input({
      currentLevel: 4,
      snapshot: snapshot({
        windowAq: 46,
        cumulativeAq: 434
      }),
      dimensionRankContext: ctx({
        top3: [],
        top5: ["K", "H", "C", "S"],
        bottom3: ["G"]
      })
    }),
    expectPromoted: false,
    expectToLevel: 4,
    expectPath: "none"
  },
  {
    name: "Lv5 is terminal: already_at_max",
    setup: input({ currentLevel: 5 }),
    expectPromoted: false,
    expectToLevel: 5,
    expectPath: "none"
  },
  {
    name: "isFinal halving: Lv1->Lv2 primary windowAq >= ceil(32*0.5)=16",
    setup: input({
      currentLevel: 1,
      isFinal: true,
      snapshot: snapshot({ windowAq: 16, cumulativeAq: 16, kScore: 8 })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "primary"
  },
  {
    name: "isFinal + attendedAllPeriods skips dim checks",
    setup: input({
      currentLevel: 2,
      isFinal: true,
      attendedAllPeriods: true,
      homeworkAllSubmitted: true,
      snapshot: snapshot({
        windowAq: 21,
        cumulativeAq: 80,
        kScore: 5
      })
    }),
    expectPromoted: true,
    expectToLevel: 3,
    expectPath: "primary"
  },
  {
    name: "final_bonus rescue: Lv1->Lv2 primary and alt fail, +5 bonus triggers primary",
    setup: input({
      currentLevel: 1,
      isFinal: true,
      hasClosingShowcaseBonus: true,
      snapshot: snapshot({
        windowAq: 15,
        cumulativeAq: 15,
        kScore: 3
      })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "final_bonus"
  },
  {
    name: "final_bonus even fails: all fields too low",
    setup: input({
      currentLevel: 1,
      isFinal: true,
      hasClosingShowcaseBonus: true,
      snapshot: snapshot({
        windowAq: 5,
        cumulativeAq: 5,
        kScore: 0
      })
    }),
    expectPromoted: false,
    expectToLevel: 1,
    expectPath: "none"
  },
  {
    // Regression test for plan review M6: boostedSnapshot must derive
    // windowAq/cumulativeAq from the per-dim deltas rather than a blind
    // `+25`. This snapshot models the edge case where gScore has already
    // absorbed a growth-bonus contribution: gScore=5 = 3 base points + 2
    // growth_bonus (persisted separately in v2_window_snapshots but
    // collapsed into gScore by the time the snapshot reaches the judge).
    // windowAq equals the sum of per-dim fields (14), matching how the
    // settler computes it at snapshot time. The boosted snapshot must
    // end up at windowAq = 39, cumulativeAq = 39, and per-dim scores
    // {K:8, H:7, C:7, S:7, G:10}.
    name: "final_bonus with growth-bonus baked into gScore: boostedSnapshot derives aggregate from per-dim diff",
    setup: input({
      currentLevel: 1,
      isFinal: true,
      hasClosingShowcaseBonus: true,
      snapshot: snapshot({
        windowAq: 14,
        cumulativeAq: 14,
        kScore: 3,
        hScore: 2,
        cScore: 2,
        sScore: 2,
        gScore: 5
      })
    }),
    // Lv1→Lv2 primary path passes because boosted dims K=8, H=7, C=7, S=7, G=10
    // all meet the Lv2 minimum (spec §3.6 Lv2 primary requires
    // windowAq ≥ 30 AND at least 2 dims ≥ 5). windowAq = 14 + 25 = 39 ≥ 30.
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "final_bonus"
  },
  {
    name: "Lv2->Lv3 discount 0.15 dimCountRelax=0 still needs 2 dims>=10",
    setup: input({
      currentLevel: 2,
      consecMissedOnEntry: 1,
      homeworkAllSubmitted: true,
      snapshot: snapshot({
        windowAq: 36,
        cumulativeAq: 36,
        kScore: 10,
        hScore: 10
      })
    }),
    expectPromoted: true,
    expectToLevel: 3,
    expectPath: "protection_discounted"
  },
  {
    name: "Lv3->Lv4 discount 0.25 dimCountRelax=1 needs 3 dims",
    setup: input({
      currentLevel: 3,
      consecMissedOnEntry: 2,
      sBehaviorScore: 5,
      snapshot: snapshot({
        windowAq: 38,
        cumulativeAq: 184,
        kScore: 8,
        hScore: 8,
        cScore: 8,
        sScore: 8
      }),
      dimensionRankContext: ctx({
        elapsedScoringPeriods: 4,
        perDim: { K: 20, H: 20, C: 20, S: 10, G: 4 }
      })
    }),
    expectPromoted: true,
    expectToLevel: 4,
    expectPath: "protection_discounted"
  },
  {
    name: "threshold tie: Lv1->Lv2 windowAq exactly 32",
    setup: input({
      currentLevel: 1,
      snapshot: snapshot({ windowAq: 32, cumulativeAq: 32, kScore: 8 })
    }),
    expectPromoted: true,
    expectToLevel: 2,
    expectPath: "primary"
  },
  {
    name: "threshold miss by 1: Lv1->Lv2 windowAq 31 fails primary",
    setup: input({
      currentLevel: 1,
      snapshot: snapshot({
        windowAq: 31,
        cumulativeAq: 31,
        kScore: 8
      })
    }),
    expectPromoted: false,
    expectToLevel: 1,
    expectPath: "none"
  }
];

describe("LevelPromotionJudge", () => {
  describe.each(cases)("$name", (c) => {
    test("returns expected output", () => {
      const out = judge(c.setup);
      expect(out.promoted).toBe(c.expectPromoted);
      expect(out.toLevel).toBe(c.expectToLevel);
      expect(out.pathTaken).toBe(c.expectPath);
      expect(out.reason).toBeDefined();
      expect(Array.isArray(out.reason.conditionChecks)).toBe(true);
    });
  });

  test("reason.conditionChecks records every evaluated rule", () => {
    const out = judge(
      input({
        currentLevel: 1,
        snapshot: snapshot({ windowAq: 32, cumulativeAq: 32, kScore: 8 })
      })
    );
    expect(out.reason.conditionChecks.length).toBeGreaterThan(0);
    for (const check of out.reason.conditionChecks) {
      expect(typeof check.name).toBe("string");
      expect(typeof check.passed).toBe("boolean");
      expect(check).toHaveProperty("actual");
      expect(check).toHaveProperty("required");
    }
  });

  test("reason.discount reflects consecMissedOnEntry mapping", () => {
    const out0 = judge(input({ currentLevel: 1 }));
    expect(out0.reason.discount).toBe(0);
    const out1 = judge(input({ currentLevel: 1, consecMissedOnEntry: 1 }));
    expect(out1.reason.discount).toBeCloseTo(0.15);
    const out2 = judge(input({ currentLevel: 1, consecMissedOnEntry: 2 }));
    expect(out2.reason.discount).toBeCloseTo(0.25);
    const out3 = judge(input({ currentLevel: 1, consecMissedOnEntry: 5 }));
    expect(out3.reason.discount).toBeCloseTo(0.25);
  });

  test("Lv5 early return path is 'none' with already_at_max note", () => {
    const out = judge(input({ currentLevel: 5 }));
    expect(out.promoted).toBe(false);
    expect(out.toLevel).toBe(5);
    expect(out.pathTaken).toBe("none");
    expect(out.reason.notes ?? []).toContain("already_at_max");
  });

  test("input is not mutated (immutability)", () => {
    const i = input({
      currentLevel: 1,
      snapshot: snapshot({ windowAq: 32, cumulativeAq: 32, kScore: 8 })
    });
    const snap = JSON.stringify({
      ...i,
      dimensionRankContext: {
        ...i.dimensionRankContext,
        dimensionsInBottom1: Array.from(i.dimensionRankContext.dimensionsInBottom1),
        dimensionsInBottom3: Array.from(i.dimensionRankContext.dimensionsInBottom3),
        dimensionsInTop3: Array.from(i.dimensionRankContext.dimensionsInTop3),
        dimensionsInTop5: Array.from(i.dimensionRankContext.dimensionsInTop5)
      }
    });
    judge(i);
    const after = JSON.stringify({
      ...i,
      dimensionRankContext: {
        ...i.dimensionRankContext,
        dimensionsInBottom1: Array.from(i.dimensionRankContext.dimensionsInBottom1),
        dimensionsInBottom3: Array.from(i.dimensionRankContext.dimensionsInBottom3),
        dimensionsInTop3: Array.from(i.dimensionRankContext.dimensionsInTop3),
        dimensionsInTop5: Array.from(i.dimensionRankContext.dimensionsInTop5)
      }
    });
    expect(after).toBe(snap);
  });
});
