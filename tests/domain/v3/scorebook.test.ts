import { describe, expect, it } from "vitest";

import { combineLegacyAndV3Score } from "../../../src/domain/v3/scorebook.js";

function sumApprovedV3Score(
  events: Array<{ status: string; scoreDelta: number }>
): number {
  return events
    .filter((event) => event.status === "approved")
    .reduce((total, event) => total + event.scoreDelta, 0);
}

describe("combineLegacyAndV3Score", () => {
  it("uses v3 approved score only when there is no legacy snapshot", () => {
    expect(
      combineLegacyAndV3Score({ legacyTotal: 0, approvedV3Total: 9 })
    ).toBe(9);
  });

  it("sums legacy snapshot and v3 approved score", () => {
    expect(
      combineLegacyAndV3Score({ legacyTotal: 12, approvedV3Total: 7 })
    ).toBe(19);
  });

  it("does not include review_required, no_score, or rejected events in total", () => {
    const approvedV3Total = sumApprovedV3Score([
      { status: "approved", scoreDelta: 5 },
      { status: "review_required", scoreDelta: 8 },
      { status: "no_score", scoreDelta: 11 },
      { status: "rejected", scoreDelta: 13 },
    ]);

    expect(
      combineLegacyAndV3Score({ legacyTotal: 10, approvedV3Total })
    ).toBe(15);
  });

  it("includes approved operator adjustment in total", () => {
    const approvedV3Total = sumApprovedV3Score([
      { status: "approved", scoreDelta: 6 },
      { status: "approved", scoreDelta: -2 },
    ]);

    expect(
      combineLegacyAndV3Score({ legacyTotal: 10, approvedV3Total })
    ).toBe(14);
  });
});
