import { useState, useEffect } from "react";
import { fetchMemberDetail, fetchRanking } from "../lib/api";
import { getMockMemberDetail } from "../lib/mock-data";
import type { MemberDetailResponse } from "../types/api";
import { computeBadges } from "../lib/badge-engine";

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

    // Fetch detail + ranking in parallel so we can compute badges
    Promise.all([fetchMemberDetail(memberId), fetchRanking()])
      .then(([detailRes, rankingRes]) => {
        if (!cancelled) {
          // Compute badges for this member from ranking data
          const periodCount = rankingRes.periodCount ?? 2;
          const badgeMap = computeBadges(rankingRes.rows, periodCount);
          const memberBadges = badgeMap.get(memberId) ?? [];
          setData({
            ...detailRes,
            detail: { ...detailRes.detail, badges: memberBadges },
          });
          setLoading(false);
        }
      })
      .catch((_err: unknown) => {
        if (!cancelled) {
          if (import.meta.env.DEV) {
            const mock = getMockMemberDetail(memberId);
            if (mock) {
              console.warn("[useMemberDetail] API unavailable, using mock data");
              setData({ ok: true, detail: mock });
            } else {
              setError("Member not found");
            }
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
  }, [memberId, tick]);

  return { data, loading, error, refetch };
}
