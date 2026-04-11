/**
 * Badge computation engine.
 * Pure functions that compute badge assignments from ranking/snapshot data.
 * No side effects, no API calls — all computation is frontend-only.
 */
import type { RankingRow } from "../types/api";
import type { DimensionKey } from "./colors";
import type { EarnedBadge } from "./badges";
import { getB3DimensionForPeriod } from "./badges";

/** MVP 同一人全程最多获 2 次 */
const MAX_MVP_COUNT = 2;

interface SnapshotLike {
  memberId: string;
  aq: number;
  dims: Record<DimensionKey, number>;
}

/**
 * 从排行榜数据中，为单个期间计算 B1(MVP) 获得者。
 * 返回 memberId 或 null。
 */
function computeB1(
  rows: ReadonlyArray<RankingRow>,
  mvpHistory: ReadonlyMap<string, number>,
): string | null {
  const sorted = [...rows].sort((a, b) => {
    if (b.cumulativeAq !== a.cumulativeAq) return b.cumulativeAq - a.cumulativeAq;
    const aCount = mvpHistory.get(a.memberId) ?? 0;
    const bCount = mvpHistory.get(b.memberId) ?? 0;
    if (aCount !== bCount) return aCount - bCount;
    return a.memberId.localeCompare(b.memberId);
  });

  for (const row of sorted) {
    const count = mvpHistory.get(row.memberId) ?? 0;
    if (count < MAX_MVP_COUNT) {
      return row.memberId;
    }
  }
  return sorted[0]?.memberId ?? null;
}

/**
 * 计算 B2（突破之星）——本期 AQ 相比上期增长最大者。
 * 仅 P3 起颁发。
 */
function computeB2(
  currentSnapshots: ReadonlyArray<SnapshotLike>,
  previousSnapshots: ReadonlyArray<SnapshotLike>,
): string | null {
  if (previousSnapshots.length === 0) return null;

  const prevMap = new Map(previousSnapshots.map((s) => [s.memberId, s.aq]));
  let bestId: string | null = null;
  let bestGrowth = -Infinity;

  for (const snap of currentSnapshots) {
    const prevAq = prevMap.get(snap.memberId);
    if (prevAq === undefined) continue;
    const growth = snap.aq - prevAq;
    if (growth > bestGrowth) {
      bestGrowth = growth;
      bestId = snap.memberId;
    }
  }

  return bestGrowth > 0 ? bestId : null;
}

/**
 * 计算 B3（维度达人）——当期指定维度得分最高者。
 */
function computeB3(
  snapshots: ReadonlyArray<SnapshotLike>,
  dimension: DimensionKey,
  b3History: ReadonlyMap<string, Set<DimensionKey>>,
): string | null {
  const sorted = [...snapshots].sort((a, b) => {
    const diff = b.dims[dimension] - a.dims[dimension];
    if (diff !== 0) return diff;
    return a.memberId.localeCompare(b.memberId);
  });

  for (const snap of sorted) {
    const wonDims = b3History.get(snap.memberId);
    if (!wonDims || !wonDims.has(dimension)) {
      return snap.memberId;
    }
  }
  return sorted[0]?.memberId ?? null;
}

/**
 * 从排行榜快照数据计算所有勋章。
 * 返回 Map<memberId, EarnedBadge[]>。
 *
 * 在 mock 模式下，我们仅有单期快照数据，
 * 所以此函数做简化处理 —— 仅计算当期勋章。
 */
export function computeBadges(
  ranking: ReadonlyArray<RankingRow>,
  periodCount: number,
): Map<string, EarnedBadge[]> {
  const result = new Map<string, EarnedBadge[]>();

  const addBadge = (memberId: string, badge: EarnedBadge) => {
    const existing = result.get(memberId) ?? [];
    result.set(memberId, [...existing, badge]);
  };

  const mvpHistory = new Map<string, number>();
  const b3History = new Map<string, Set<DimensionKey>>();

  for (let period = 2; period <= periodCount; period++) {
    const snapshots: SnapshotLike[] = ranking.map((r) => ({
      memberId: r.memberId,
      aq: r.latestWindowAq,
      dims: r.dimensions,
    }));

    // B1: MVP
    const mvpWinner = computeB1(ranking, mvpHistory);
    if (mvpWinner) {
      addBadge(mvpWinner, { badgeId: "b1-mvp", periodNumber: period });
      mvpHistory.set(mvpWinner, (mvpHistory.get(mvpWinner) ?? 0) + 1);
    }

    // B2: 突破之星 (P3 起)
    // 注意：mock 模式下仅有单期快照，此处使用 80% 估算作为简化处理
    if (period >= 3) {
      const prevSnapshots: SnapshotLike[] = ranking.map((r) => ({
        memberId: r.memberId,
        aq: Math.floor(r.latestWindowAq * 0.8),
        dims: r.dimensions,
      }));
      const b2Winner = computeB2(snapshots, prevSnapshots);
      if (b2Winner) {
        addBadge(b2Winner, { badgeId: "b2-breakthrough", periodNumber: period });
      }
    }

    // B3: 维度达人
    const dim = getB3DimensionForPeriod(period);
    if (dim) {
      const b3Winner = computeB3(snapshots, dim, b3History);
      if (b3Winner) {
        addBadge(b3Winner, { badgeId: `b3-${dim}`, periodNumber: period });
        const wonSet = b3History.get(b3Winner) ?? new Set<DimensionKey>();
        wonSet.add(dim);
        b3History.set(b3Winner, wonSet);
      }
    }
  }

  return result;
}
