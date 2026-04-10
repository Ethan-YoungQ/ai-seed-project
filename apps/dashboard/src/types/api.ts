import type { DimensionKey } from "../lib/colors";

export interface RankingRow {
  memberId: string;
  memberName: string;
  cumulativeAq: number;
  latestWindowAq: number;
  currentLevel: number;
  dimensions: Record<DimensionKey, number>;
  rank: number;
}

export interface RankingResponse {
  ok: boolean;
  campId: string;
  rows: RankingRow[];
}

export interface MemberBoardDetail {
  memberId: string;
  memberName: string;
  currentLevel: number;
  cumulativeAq: number;
  dimensions: Record<DimensionKey, number>;
  windowSnapshots: Array<{
    windowId: string;
    aq: number;
    dims: Record<DimensionKey, number>;
    settledAt: string;
  }>;
  promotions: Array<{
    fromLevel: number;
    toLevel: number;
    windowId: string;
    promotedAt: string;
    reason: string;
  }>;
}

export interface MemberDetailResponse {
  ok: boolean;
  detail: MemberBoardDetail;
}
