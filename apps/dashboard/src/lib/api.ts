import type { RankingResponse, MemberDetailResponse } from "../types/api";

export const API_BASE = "";

export async function fetchRanking(campId?: string): Promise<RankingResponse> {
  const url = `${API_BASE}/api/v2/board/ranking${campId ? `?campId=${campId}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ranking fetch failed: ${res.status}`);
  return res.json() as Promise<RankingResponse>;
}

export async function fetchMemberDetail(memberId: string): Promise<MemberDetailResponse> {
  const url = `${API_BASE}/api/v2/board/member/${memberId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Member detail fetch failed: ${res.status}`);
  return res.json() as Promise<MemberDetailResponse>;
}
