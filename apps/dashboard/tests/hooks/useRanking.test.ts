import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import type { RankingResponse } from "../../src/types/api";

const mockRankingData: RankingResponse = {
  ok: true,
  campId: "camp-001",
  rows: [
    {
      memberId: "m1",
      memberName: "Alice",
      cumulativeAq: 120,
      latestWindowAq: 30,
      currentLevel: 3,
      dimensions: { K: 25, H: 20, C: 30, S: 25, G: 20 },
      rank: 1,
    },
    {
      memberId: "m2",
      memberName: "Bob",
      cumulativeAq: 90,
      latestWindowAq: 20,
      currentLevel: 2,
      dimensions: { K: 20, H: 15, C: 20, S: 20, G: 15 },
      rank: 2,
    },
  ],
};

describe("fetchRanking (API client)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("fetchRanking calls correct URL without campId", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRankingData),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { fetchRanking } = await import("../../src/lib/api");
    const result = await fetchRanking();

    expect(mockFetch).toHaveBeenCalledWith("/api/v2/board/ranking");
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(2);
  });

  test("fetchRanking appends campId query param when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRankingData),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { fetchRanking } = await import("../../src/lib/api");
    await fetchRanking("camp-123");

    expect(mockFetch).toHaveBeenCalledWith("/api/v2/board/ranking?campId=camp-123");
  });

  test("fetchRanking throws on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { fetchRanking } = await import("../../src/lib/api");
    await expect(fetchRanking()).rejects.toThrow("Ranking fetch failed: 500");
  });

  test("fetchRanking returns correct data shape", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRankingData),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { fetchRanking } = await import("../../src/lib/api");
    const result = await fetchRanking("camp-001");

    expect(result.campId).toBe("camp-001");
    expect(result.rows[0].memberName).toBe("Alice");
    expect(result.rows[0].rank).toBe(1);
    expect(result.rows[0].dimensions.K).toBe(25);
  });
});
