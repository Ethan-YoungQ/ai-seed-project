import { describe, expect, it } from "vitest";
import { buildReportCard } from "../../src/scripts/weekly-ranking-report.js";

function makeEntry(
  overrides: Partial<{
    rank: number;
    memberName: string;
    currentLevel: number;
    K: number;
    H: number;
    C: number;
    S: number;
    G: number;
    cumulativeAq: number;
  }>,
) {
  const defaults = {
    rank: 1,
    memberName: "学员",
    currentLevel: 1,
    K: 0,
    H: 0,
    C: 0,
    S: 0,
    G: 0,
    cumulativeAq: 0,
  };
  const data = { ...defaults, ...overrides };
  return {
    ...data,
    dimensions: { K: data.K, H: data.H, C: data.C, S: data.S, G: data.G },
  };
}

describe("buildReportCard", () => {
  it("mentions top 3 members by name", () => {
    const top3 = [
      makeEntry({ rank: 1, memberName: "杨斌", cumulativeAq: 22 }),
      makeEntry({ rank: 2, memberName: "陈文超", cumulativeAq: 18 }),
      makeEntry({ rank: 3, memberName: "王静Effie", cumulativeAq: 17 }),
    ];
    const bottom3 = [makeEntry({ rank: 14, memberName: "吴桐", cumulativeAq: 0 })];
    const result = buildReportCard(top3, bottom3);
    expect(result).toContain("杨斌");
    expect(result).toContain("陈文超");
    expect(result).toContain("王静Effie");
    expect(result).toContain("🥇");
    expect(result).toContain("🥈");
    expect(result).toContain("🥉");
  });

  it("mentions bottom 3 members by name", () => {
    const top3 = [makeEntry({ rank: 1, memberName: "杨斌" })];
    const bottom3 = [
      makeEntry({ rank: 14, memberName: "吴桐", cumulativeAq: 1 }),
      makeEntry({ rank: 15, memberName: "班腾飞", cumulativeAq: 1 }),
    ];
    const result = buildReportCard(top3, bottom3);
    expect(result).toContain("吴桐");
    expect(result).toContain("班腾飞");
    expect(result).toContain("冲冲冲");
  });

  it("includes dimension scores in top 3 display", () => {
    const top3 = [
      makeEntry({ rank: 1, memberName: "杨斌", K: 13, H: 5, C: 4, cumulativeAq: 22 }),
    ];
    const result = buildReportCard(top3, []);
    expect(result).toContain("K:13");
    expect(result).toContain("H:5");
    expect(result).toContain("C:4");
  });

  it("includes AQ values", () => {
    const top3 = [makeEntry({ rank: 1, memberName: "杨斌", cumulativeAq: 22 })];
    const result = buildReportCard(top3, []);
    expect(result).toContain("22AQ");
  });

  it("includes zero-score students in bottom 3", () => {
    const top3 = [makeEntry({ rank: 1, memberName: "杨斌", cumulativeAq: 22 })];
    const bottom3 = [
      makeEntry({ rank: 14, memberName: "吴桐", cumulativeAq: 0 }),
      makeEntry({ rank: 15, memberName: "班腾飞", cumulativeAq: 0 }),
    ];
    const result = buildReportCard(top3, bottom3);
    expect(result).toContain("吴桐");
    expect(result).toContain("班腾飞");
    expect(result).toContain("0AQ");
  });
});
