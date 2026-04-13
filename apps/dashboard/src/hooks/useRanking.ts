import { useState, useEffect } from "react";
import { fetchRanking } from "../lib/api";
import { MOCK_RANKING } from "../lib/mock-data";
import type { RankingResponse, RankingRow } from "../types/api";
import { computeBadges } from "../lib/badge-engine";

/** Attach computed badges to ranking rows (pure, no mutation) */
function attachBadges(rows: RankingRow[], periodCount: number): RankingRow[] {
  if (rows.length === 0 || periodCount < 2) return rows;
  const badgeMap = computeBadges(rows, periodCount);
  return rows.map((row) => ({
    ...row,
    badges: badgeMap.get(row.memberId) ?? [],
  }));
}

export interface UseRankingState {
  data: RankingResponse | null;
  loading: boolean;
  error: string | null;
  groupName: string;
  refetch: () => void;
}

export function useRanking(campId?: string): UseRankingState {
  const [data, setData] = useState<RankingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchRanking(campId)
      .then((res) => {
        if (!cancelled) {
          // Compute badges frontend-side and attach to rows
          const periodCount = res.periodCount ?? 2;
          const rowsWithBadges = attachBadges(res.rows, periodCount);
          setData({ ...res, rows: rowsWithBadges });
          setLoading(false);
        }
      })
      .catch((_err: unknown) => {
        if (!cancelled) {
          if (import.meta.env.DEV) {
            console.warn("[useRanking] API unavailable, using mock data");
            const mockWithBadges = attachBadges(MOCK_RANKING, 4);
            setData({ ok: true, campId: "demo", rows: mockWithBadges, groupName: "AI 训练营" });
          } else {
            setError(_err instanceof Error ? _err.message : "Unknown error");
          }
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [campId, tick]);

  const groupName = data?.groupName ?? "AI 训练营";

  return { data, loading, error, groupName, refetch };
}
