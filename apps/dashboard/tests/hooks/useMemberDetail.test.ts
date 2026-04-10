import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import type { MemberDetailResponse } from "../../src/types/api";

const mockMemberDetailData: MemberDetailResponse = {
  ok: true,
  detail: {
    memberId: "m1",
    memberName: "Alice",
    currentLevel: 3,
    cumulativeAq: 120,
    dimensions: { K: 25, H: 20, C: 30, S: 25, G: 20 },
    windowSnapshots: [
      {
        windowId: "w1",
        aq: 30,
        dims: { K: 25, H: 20, C: 30, S: 25, G: 20 },
        settledAt: "2026-04-01T00:00:00Z",
      },
    ],
    promotions: [
      {
        fromLevel: 2,
        toLevel: 3,
        windowId: "w1",
        promotedAt: "2026-04-01T00:00:00Z",
        reason: "Exceeded threshold",
      },
    ],
  },
};

describe("fetchMemberDetail (API client)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("fetchMemberDetail calls correct URL with memberId", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockMemberDetailData),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { fetchMemberDetail } = await import("../../src/lib/api");
    const result = await fetchMemberDetail("m1");

    expect(mockFetch).toHaveBeenCalledWith("/api/v2/board/member/m1");
    expect(result.ok).toBe(true);
    expect(result.detail.memberId).toBe("m1");
  });

  test("fetchMemberDetail throws on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { fetchMemberDetail } = await import("../../src/lib/api");
    await expect(fetchMemberDetail("unknown")).rejects.toThrow("Member detail fetch failed: 404");
  });

  test("fetchMemberDetail returns correct data shape", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockMemberDetailData),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { fetchMemberDetail } = await import("../../src/lib/api");
    const result = await fetchMemberDetail("m1");

    expect(result.detail.memberName).toBe("Alice");
    expect(result.detail.currentLevel).toBe(3);
    expect(result.detail.cumulativeAq).toBe(120);
    expect(result.detail.windowSnapshots).toHaveLength(1);
    expect(result.detail.promotions).toHaveLength(1);
    expect(result.detail.promotions[0].fromLevel).toBe(2);
    expect(result.detail.promotions[0].toLevel).toBe(3);
  });

  test("fetchMemberDetail passes correct memberId in URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockMemberDetailData),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { fetchMemberDetail } = await import("../../src/lib/api");
    await fetchMemberDetail("special-member-999");

    expect(mockFetch).toHaveBeenCalledWith("/api/v2/board/member/special-member-999");
  });
});
