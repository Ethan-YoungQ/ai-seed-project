import type { BoardRankingEntry, MemberProfile, RankingInputScore } from "./types.js";

interface BuildBoardRankingInput {
  members: MemberProfile[];
  scores: RankingInputScore[];
}

export function buildBoardRanking(input: BuildBoardRankingInput): BoardRankingEntry[] {
  const eligibleMembers = new Map(
    input.members
      .filter((member) => member.isParticipant && !member.isExcludedFromBoard)
      .map((member) => [member.id, member] as const)
  );

  const totals = new Map<string, { totalScore: number; sessionCount: number }>();

  for (const score of input.scores) {
    if (!eligibleMembers.has(score.memberId)) {
      continue;
    }

    const current = totals.get(score.memberId) ?? { totalScore: 0, sessionCount: 0 };
    totals.set(score.memberId, {
      totalScore: current.totalScore + score.totalScore,
      sessionCount: current.sessionCount + 1
    });
  }

  return [...totals.entries()]
    .map(([memberId, total]) => {
      const member = eligibleMembers.get(memberId);
      if (!member) {
        throw new Error(`Eligible member ${memberId} is missing from lookup.`);
      }

      return {
        memberId,
        memberName: member.displayName?.trim() || member.name,
        department: member.department,
        totalScore: total.totalScore,
        sessionCount: total.sessionCount,
        rank: 0
      };
    })
    .sort((left, right) => {
      if (right.totalScore !== left.totalScore) {
        return right.totalScore - left.totalScore;
      }

      return left.memberName.localeCompare(right.memberName);
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
}
