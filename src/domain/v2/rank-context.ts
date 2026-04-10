import type { ScoringDimension } from "./scoring-items-config.js";

export interface DimensionScoreRow {
  memberId: string;
  dimension: ScoringDimension;
  cumulativeScore: number;
}

export interface RankContextInput {
  targetMemberId: string;
  eligibleMemberIds: readonly string[];
  scoreRows: readonly DimensionScoreRow[];
  elapsedScoringPeriods: number;
}

export interface DimensionRank {
  rank: number;
  cumulativeScore: number;
}

export interface RankContext {
  K: DimensionRank;
  H: DimensionRank;
  C: DimensionRank;
  S: DimensionRank;
  G: DimensionRank;
  eligibleStudentCount: number;
  dimensionsInBottom1: Set<ScoringDimension>;
  dimensionsInBottom3: Set<ScoringDimension>;
  dimensionsInTop3: Set<ScoringDimension>;
  dimensionsInTop5: Set<ScoringDimension>;
  elapsedScoringPeriods: number;
}

const DIMENSIONS: readonly ScoringDimension[] = ["K", "H", "C", "S", "G"];

function rankFor(
  dimension: ScoringDimension,
  targetMemberId: string,
  eligibleMemberIds: readonly string[],
  scoreRows: readonly DimensionScoreRow[]
): DimensionRank {
  const byMember = new Map<string, number>();
  for (const id of eligibleMemberIds) {
    byMember.set(id, 0);
  }
  for (const row of scoreRows) {
    if (row.dimension !== dimension) continue;
    if (!byMember.has(row.memberId)) continue;
    byMember.set(
      row.memberId,
      (byMember.get(row.memberId) ?? 0) + row.cumulativeScore
    );
  }
  const ordered = Array.from(byMember.entries())
    .map(([memberId, cumulativeScore]) => ({ memberId, cumulativeScore }))
    .sort((a, b) => {
      if (b.cumulativeScore !== a.cumulativeScore) {
        return b.cumulativeScore - a.cumulativeScore;
      }
      return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
    });
  const idx = ordered.findIndex((r) => r.memberId === targetMemberId);
  const cumulativeScore = byMember.get(targetMemberId) ?? 0;
  const rank = idx >= 0 ? idx + 1 : ordered.length + 1;
  return { rank, cumulativeScore };
}

export function computeRankContext(input: RankContextInput): RankContext {
  const count = input.eligibleMemberIds.length;
  const dimensionsInBottom1 = new Set<ScoringDimension>();
  const dimensionsInBottom3 = new Set<ScoringDimension>();
  const dimensionsInTop3 = new Set<ScoringDimension>();
  const dimensionsInTop5 = new Set<ScoringDimension>();
  const perDim: Record<ScoringDimension, DimensionRank> = {
    K: { rank: 0, cumulativeScore: 0 },
    H: { rank: 0, cumulativeScore: 0 },
    C: { rank: 0, cumulativeScore: 0 },
    S: { rank: 0, cumulativeScore: 0 },
    G: { rank: 0, cumulativeScore: 0 }
  };

  for (const dim of DIMENSIONS) {
    const dr = rankFor(
      dim,
      input.targetMemberId,
      input.eligibleMemberIds,
      input.scoreRows
    );
    perDim[dim] = dr;
    if (dr.rank <= 3) dimensionsInTop3.add(dim);
    if (dr.rank <= 5) dimensionsInTop5.add(dim);
    if (dr.rank === count) dimensionsInBottom1.add(dim);
    if (dr.rank >= count - 2) dimensionsInBottom3.add(dim);
  }

  return {
    K: perDim.K,
    H: perDim.H,
    C: perDim.C,
    S: perDim.S,
    G: perDim.G,
    eligibleStudentCount: count,
    dimensionsInBottom1,
    dimensionsInBottom3,
    dimensionsInTop3,
    dimensionsInTop5,
    elapsedScoringPeriods: input.elapsedScoringPeriods
  };
}
