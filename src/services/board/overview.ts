import type { BoardRankingEntry } from "../../domain/types";

export function buildBoardOverview(entries: BoardRankingEntry[]) {
  return {
    participantCount: entries.length,
    leader: entries[0] ?? null,
    averageScore:
      entries.length === 0
        ? 0
        : Math.round(entries.reduce((sum, entry) => sum + entry.totalScore, 0) / entries.length)
  };
}
