import { useState, useEffect } from "react";
import { fetchMemberDetail } from "../lib/api";
import type { MemberDetailResponse } from "../types/api";

export interface UseMemberDetailState {
  data: MemberDetailResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMemberDetail(memberId: string): UseMemberDetailState {
  const [data, setData] = useState<MemberDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!memberId) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchMemberDetail(memberId)
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
  }, [memberId, tick]);

  return { data, loading, error, refetch };
}
