import { useState, useEffect } from "react";
import { fetchRanking } from "../lib/api";
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
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
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
