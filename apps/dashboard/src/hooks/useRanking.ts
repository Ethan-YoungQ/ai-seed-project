import { useState, useEffect } from "react";
import { fetchRanking } from "../lib/api";
import { MOCK_RANKING } from "../lib/mock-data";
import type { RankingResponse } from "../types/api";

export interface UseRankingState {
  data: RankingResponse | null;
  loading: boolean;
  error: string | null;
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
          setData(res);
          setLoading(false);
        }
      })
      .catch((_err: unknown) => {
        if (!cancelled) {
          if (import.meta.env.DEV) {
            console.warn("[useRanking] API unavailable, using mock data");
            setData({ ok: true, campId: "demo", rows: MOCK_RANKING });
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

  return { data, loading, error, refetch };
}
