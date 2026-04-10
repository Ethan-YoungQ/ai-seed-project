import { describe, expect, test } from "vitest";
import {
  buildLeaderboardCard,
  LEADERBOARD_TEMPLATE_ID
} from "../../../../../src/services/feishu/cards/templates/leaderboard-v1.js";
import { assertCardSize } from "../../../../../src/services/feishu/cards/renderer.js";
import type { LeaderboardState } from "../../../../../src/services/feishu/cards/types.js";

function makeState(overrides: Partial<LeaderboardState> = {}): LeaderboardState {
  return {
    settledWindowId: "w-1",
    generatedAt: "2026-04-10T12:00:00.000Z",
    topN: [
      {
        memberId: "m-alice",
        displayName: "Alice",
        cumulativeAq: 120,
        latestWindowAq: 30,
        currentLevel: 3,
        dims: { K: 25, H: 20, C: 30, S: 25, G: 20 }
      },
      {
        memberId: "m-bob",
        displayName: "Bob",
        cumulativeAq: 95,
        latestWindowAq: 20,
        currentLevel: 2,
        dims: { K: 20, H: 15, C: 25, S: 20, G: 15 }
      }
    ],
    radarImageUrl: null,
    ...overrides
  };
}

describe("leaderboard-v1 template", () => {
  test("LEADERBOARD_TEMPLATE_ID is 'leaderboard-v1'", () => {
    expect(LEADERBOARD_TEMPLATE_ID).toBe("leaderboard-v1");
  });

  test("header contains 排行榜 and generatedAt", () => {
    const card = buildLeaderboardCard(makeState());
    const json = JSON.stringify(card);
    expect(json).toContain("排行榜");
    expect(json).toContain("2026-04-10T12:00:00.000Z");
  });

  test("body contains member names, AQ values, rank medals, and refresh button", () => {
    const card = buildLeaderboardCard(makeState());
    const json = JSON.stringify(card);
    expect(json).toContain("Alice");
    expect(json).toContain("120");
    expect(json).toContain("Bob");
    expect(json).toContain("95");
    expect(json).toContain("🥇");
    expect(json).toContain("🥈");
    expect(json).toContain("leaderboard_refresh");
  });

  test("radar image element present when radarImageUrl is set", () => {
    const card = buildLeaderboardCard(makeState({ radarImageUrl: "https://cdn.example.com/radar.png" }));
    const json = JSON.stringify(card);
    expect(json).toContain("https://cdn.example.com/radar.png");
    expect(json).toContain('"tag":"img"');
  });

  test("no img element when radarImageUrl is null", () => {
    const card = buildLeaderboardCard(makeState({ radarImageUrl: null }));
    const json = JSON.stringify(card);
    expect(json).not.toContain('"tag":"img"');
  });

  test("card with top 10 members stays within size budget", () => {
    const topN = Array.from({ length: 10 }, (_, i) => ({
      memberId: `m-${i}`,
      displayName: `学员${i + 1}`,
      cumulativeAq: 100 - i * 5,
      latestWindowAq: 20 - i,
      currentLevel: Math.max(1, 5 - Math.floor(i / 2)),
      dims: { K: 20, H: 20, C: 20, S: 20, G: 20 }
    }));
    const card = buildLeaderboardCard(makeState({ topN }));
    expect(() => assertCardSize(card)).not.toThrow();
  });
});
