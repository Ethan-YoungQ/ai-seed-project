import type { DimensionKey } from "../lib/colors";
import type { EarnedBadge } from "../lib/badges";

export interface RankingRow {
  memberId: string;
  memberName: string;
  avatarUrl?: string;
  cumulativeAq: number;
  latestWindowAq: number;
  currentLevel: number;
  dimensions: Record<DimensionKey, number>;
  rank: number;
  badges?: EarnedBadge[];
}

export interface RankingResponse {
  ok: boolean;
  campId: string;
  rows: RankingRow[];
  groupName?: string;
  periodCount?: number;
}

export interface MemberBoardDetail {
  memberId: string;
  memberName: string;
  avatarUrl?: string;
  currentLevel: number;
  cumulativeAq: number;
  dimensions: Record<DimensionKey, number>;
  badges?: EarnedBadge[];
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
