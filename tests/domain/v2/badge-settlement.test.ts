import { describe, expect, test } from "vitest";

import {
  settleBadgesForWindow,
  type BadgeSettlementInput,
} from "../../../src/domain/v2/badge-settlement";

function input(overrides: Partial<BadgeSettlementInput> = {}): BadgeSettlementInput {
  return {
    windowId: "w2",
    periodNumber: 2,
    isFinal: false,
    snapshots: [
      {
        memberId: "m1",
        memberName: "Alpha",
        windowAq: 40,
        cumulativeAq: 80,
        dimensions: { K: 10, H: 8, C: 7, S: 6, G: 5 },
      },
      {
        memberId: "m2",
        memberName: "Bravo",
        windowAq: 36,
        cumulativeAq: 90,
        dimensions: { K: 13, H: 5, C: 4, S: 3, G: 2 },
      },
      {
        memberId: "m3",
        memberName: "Charlie",
        windowAq: 28,
        cumulativeAq: 60,
        dimensions: { K: 6, H: 7, C: 12, S: 11, G: 10 },
      },
    ],
    previousSnapshots: [],
    existingBadges: [],
    awardedAt: "2026-05-21T00:00:00.000Z",
    source: "test",
    ...overrides,
  };
}

describe("settleBadgesForWindow", () => {
  test("awards B1 to the highest current-window AQ learner and B3 to the rotated dimension winner", () => {
    const awards = settleBadgesForWindow(input());

    expect(awards).toEqual([
      {
        memberId: "m1",
        badgeId: "b1-mvp",
        periodNumber: 2,
        awardedAt: "2026-05-21T00:00:00.000Z",
        source: "test",
        reason: "P2 B1 MVP: highest window AQ 40",
      },
      {
        memberId: "m2",
        badgeId: "b3-K",
        periodNumber: 2,
        awardedAt: "2026-05-21T00:00:00.000Z",
        source: "test",
        reason: "P2 B3 K: highest dimension score 13",
      },
    ]);
  });

  test("keeps B1 under the lifetime two-award cap", () => {
    const awards = settleBadgesForWindow(input({
      existingBadges: [
        { memberId: "m1", badgeId: "b1-mvp", periodNumber: 1 },
        { memberId: "m1", badgeId: "b1-mvp", periodNumber: 2 },
      ],
      periodNumber: 3,
      previousSnapshots: [
        {
          memberId: "m1",
          memberName: "Alpha",
          windowAq: 20,
          cumulativeAq: 40,
          dimensions: { K: 3, H: 3, C: 3, S: 3, G: 3 },
        },
        {
          memberId: "m2",
          memberName: "Bravo",
          windowAq: 20,
          cumulativeAq: 40,
          dimensions: { K: 3, H: 3, C: 3, S: 3, G: 3 },
        },
      ],
    }));

    expect(awards.find((award) => award.badgeId === "b1-mvp")).toMatchObject({
      memberId: "m2",
      periodNumber: 3,
    });
  });

  test("awards B2 from period 3 when current-window growth is positive and highest", () => {
    const awards = settleBadgesForWindow(input({
      periodNumber: 3,
      previousSnapshots: [
        {
          memberId: "m1",
          memberName: "Alpha",
          windowAq: 38,
          cumulativeAq: 40,
          dimensions: { K: 1, H: 1, C: 1, S: 1, G: 1 },
        },
        {
          memberId: "m2",
          memberName: "Bravo",
          windowAq: 20,
          cumulativeAq: 40,
          dimensions: { K: 1, H: 1, C: 1, S: 1, G: 1 },
        },
        {
          memberId: "m3",
          memberName: "Charlie",
          windowAq: 30,
          cumulativeAq: 40,
          dimensions: { K: 1, H: 1, C: 1, S: 1, G: 1 },
        },
      ],
    }));

    expect(awards.find((award) => award.badgeId === "b2-breakthrough")).toMatchObject({
      memberId: "m2",
      reason: "P3 B2 breakthrough: window AQ growth 16",
    });
  });

  test("does not repeat the same B3 dimension for the same learner", () => {
    const awards = settleBadgesForWindow(input({
      periodNumber: 7,
      existingBadges: [
        { memberId: "m2", badgeId: "b3-K", periodNumber: 2 },
      ],
    }));

    expect(awards.find((award) => award.badgeId === "b3-K")).toMatchObject({
      memberId: "m1",
    });
  });

  test("awards final badges on final settlement", () => {
    const awards = settleBadgesForWindow(input({
      periodNumber: 12,
      isFinal: true,
      previousSnapshots: [
        {
          memberId: "m1",
          memberName: "Alpha",
          windowAq: 30,
          cumulativeAq: 30,
          dimensions: { K: 1, H: 1, C: 1, S: 1, G: 1 },
        },
        {
          memberId: "m2",
          memberName: "Bravo",
          windowAq: 20,
          cumulativeAq: 40,
          dimensions: { K: 1, H: 1, C: 1, S: 1, G: 1 },
        },
        {
          memberId: "m3",
          memberName: "Charlie",
          windowAq: 10,
          cumulativeAq: 0,
          dimensions: { K: 1, H: 1, C: 1, S: 1, G: 1 },
        },
      ],
    }));

    expect(awards.filter((award) => award.badgeId.startsWith("f")).map((award) => ({
      memberId: award.memberId,
      badgeId: award.badgeId,
    }))).toEqual([
      { memberId: "m2", badgeId: "f1-king" },
      { memberId: "m3", badgeId: "f2-progress" },
      { memberId: "m3", badgeId: "f3-popular" },
      { memberId: "m3", badgeId: "f4-innovation" },
    ]);
  });
});
