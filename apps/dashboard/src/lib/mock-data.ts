/**
 * Mock data for dashboard preview when backend API is unavailable.
 * Used in development mode only.
 */
import type { RankingRow, MemberBoardDetail } from "../types/api";

const NAMES = [
  "张三", "李四", "王五", "赵六", "陈七",
  "刘八", "周九", "吴十", "孙一", "郑二",
  "马三", "黄四", "林五", "何六"
];

function dims(k: number, h: number, c: number, s: number, g: number) {
  return { K: k, H: h, C: c, S: s, G: g };
}

export const MOCK_RANKING: RankingRow[] = NAMES.map((name, i) => {
  const level = i < 1 ? 5 : i < 3 ? 4 : i < 6 ? 3 : i < 10 ? 2 : 1;
  const aq = 70 - i * 4 + Math.floor(Math.random() * 5);
  const d = dims(
    Math.floor(12 + Math.random() * 8),
    Math.floor(6 + Math.random() * 4),
    Math.floor(8 + Math.random() * 9),
    Math.floor(3 + Math.random() * 5),
    Math.floor(7 + Math.random() * 8)
  );
  return {
    memberId: `m-${i + 1}`,
    memberName: name,
    cumulativeAq: aq,
    latestWindowAq: Math.floor(aq * 0.3),
    currentLevel: level,
    dimensions: d,
    rank: i + 1,
  };
}).sort((a, b) => b.cumulativeAq - a.cumulativeAq)
  .map((row, i) => ({ ...row, rank: i + 1 }));

export function getMockMemberDetail(memberId: string): MemberBoardDetail | null {
  const row = MOCK_RANKING.find((r) => r.memberId === memberId);
  if (!row) return null;

  const windows = ["W1", "W2", "W3", "W4"].map((_code, wi) => {
    const factor = 0.5 + wi * 0.15;
    return {
      windowId: `w-${wi + 1}`,
      aq: Math.floor(row.cumulativeAq * factor * 0.25),
      dims: {
        K: Math.floor(row.dimensions.K * factor),
        H: Math.floor(row.dimensions.H * factor),
        C: Math.floor(row.dimensions.C * factor),
        S: Math.floor(row.dimensions.S * factor),
        G: Math.floor(row.dimensions.G * factor),
      },
      settledAt: `2026-04-0${wi + 1}T20:00:00.000Z`,
    };
  });

  const promotions = [];
  if (row.currentLevel >= 3) {
    promotions.push({
      fromLevel: 1,
      toLevel: 2,
      windowId: "w-1",
      promotedAt: "2026-04-01T20:00:00.000Z",
      reason: JSON.stringify({
        conditions: [
          { name: "AQ >= 25", met: true, detail: `实际 AQ = ${Math.floor(row.cumulativeAq * 0.4)}` },
          { name: "参与率 >= 60%", met: true, detail: "参与率 = 85%" },
        ],
      }),
    });
    promotions.push({
      fromLevel: 2,
      toLevel: 3,
      windowId: "w-3",
      promotedAt: "2026-04-03T20:00:00.000Z",
      reason: JSON.stringify({
        conditions: [
          { name: "AQ >= 40", met: true, detail: `实际 AQ = ${Math.floor(row.cumulativeAq * 0.7)}` },
          { name: "K 维度 >= 10", met: true, detail: `K = ${row.dimensions.K}` },
          { name: "至少 3 维度达标", met: true, detail: "K,C,G 达标" },
        ],
      }),
    });
  }
  if (row.currentLevel >= 4) {
    promotions.push({
      fromLevel: 3,
      toLevel: 4,
      windowId: "w-4",
      promotedAt: "2026-04-04T20:00:00.000Z",
      reason: JSON.stringify({
        conditions: [
          { name: "AQ >= 55", met: true, detail: `实际 AQ = ${Math.floor(row.cumulativeAq * 0.85)}` },
          { name: "全维度均达标", met: true, detail: "5/5 维度超过阈值" },
        ],
      }),
    });
  }

  return {
    memberId: row.memberId,
    memberName: row.memberName,
    currentLevel: row.currentLevel,
    cumulativeAq: row.cumulativeAq,
    dimensions: row.dimensions,
    windowSnapshots: windows,
    promotions,
  };
}
