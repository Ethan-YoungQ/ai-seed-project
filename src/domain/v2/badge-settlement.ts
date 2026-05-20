export type BadgeDimension = "K" | "H" | "C" | "S" | "G";

export interface BadgeSettlementSnapshot {
  memberId: string;
  memberName: string;
  windowAq: number;
  cumulativeAq: number;
  dimensions: Record<BadgeDimension, number>;
}

export interface ExistingBadge {
  memberId: string;
  badgeId: string;
  periodNumber: number;
}

export interface BadgeSettlementInput {
  windowId: string;
  periodNumber: number;
  isFinal: boolean;
  snapshots: BadgeSettlementSnapshot[];
  previousSnapshots: BadgeSettlementSnapshot[];
  existingBadges: ExistingBadge[];
  awardedAt: string;
  source: string;
}

export interface BadgeSettlementAward {
  memberId: string;
  badgeId: string;
  periodNumber: number;
  awardedAt: string;
  source: string;
  reason: string;
}

const MAX_MVP_COUNT = 2;
const B3_ROTATION_ORDER: readonly BadgeDimension[] = ["K", "H", "C", "S", "G"];

function getB3DimensionForPeriod(periodNumber: number): BadgeDimension | null {
  if (periodNumber < 2 || periodNumber > 11) return null;
  return B3_ROTATION_ORDER[(periodNumber - 2) % B3_ROTATION_ORDER.length];
}

function byMemberId(left: BadgeSettlementSnapshot, right: BadgeSettlementSnapshot): number {
  return left.memberId.localeCompare(right.memberId);
}

function award(input: BadgeSettlementInput, memberId: string, badgeId: string, reason: string): BadgeSettlementAward {
  return {
    memberId,
    badgeId,
    periodNumber: input.periodNumber,
    awardedAt: input.awardedAt,
    source: input.source,
    reason,
  };
}

function hasExistingBadge(input: BadgeSettlementInput, memberId: string, badgeId: string): boolean {
  return input.existingBadges.some((badge) =>
    badge.memberId === memberId &&
    badge.badgeId === badgeId &&
    badge.periodNumber === input.periodNumber
  );
}

function hasSettledPeriodBadge(input: BadgeSettlementInput, badgeId: string): boolean {
  return input.existingBadges.some((badge) =>
    badge.badgeId === badgeId &&
    badge.periodNumber === input.periodNumber
  );
}

function computeB1(input: BadgeSettlementInput): BadgeSettlementAward | null {
  if (hasSettledPeriodBadge(input, "b1-mvp")) return null;

  const mvpCount = new Map<string, number>();
  for (const badge of input.existingBadges) {
    if (badge.badgeId === "b1-mvp") {
      mvpCount.set(badge.memberId, (mvpCount.get(badge.memberId) ?? 0) + 1);
    }
  }

  const sorted = [...input.snapshots].sort((left, right) =>
    right.windowAq - left.windowAq || byMemberId(left, right)
  );
  const winner = sorted.find((snapshot) =>
    (mvpCount.get(snapshot.memberId) ?? 0) < MAX_MVP_COUNT &&
    !hasExistingBadge(input, snapshot.memberId, "b1-mvp")
  );
  if (!winner) return null;
  return award(
    input,
    winner.memberId,
    "b1-mvp",
    `P${input.periodNumber} B1 MVP: highest window AQ ${winner.windowAq}`
  );
}

function computeB2(input: BadgeSettlementInput): BadgeSettlementAward | null {
  if (input.periodNumber < 3 || input.previousSnapshots.length === 0) return null;
  if (hasSettledPeriodBadge(input, "b2-breakthrough")) return null;

  const previousByMember = new Map(input.previousSnapshots.map((snapshot) => [snapshot.memberId, snapshot]));
  let best: { snapshot: BadgeSettlementSnapshot; growth: number } | null = null;
  for (const snapshot of input.snapshots) {
    const previous = previousByMember.get(snapshot.memberId);
    if (!previous) continue;
    const growth = snapshot.windowAq - previous.windowAq;
    if (growth <= 0) continue;
    if (
      !best ||
      growth > best.growth ||
      (growth === best.growth && snapshot.memberId.localeCompare(best.snapshot.memberId) < 0)
    ) {
      best = { snapshot, growth };
    }
  }
  if (!best || hasExistingBadge(input, best.snapshot.memberId, "b2-breakthrough")) return null;
  return award(
    input,
    best.snapshot.memberId,
    "b2-breakthrough",
    `P${input.periodNumber} B2 breakthrough: window AQ growth ${best.growth}`
  );
}

function computeB3(input: BadgeSettlementInput): BadgeSettlementAward | null {
  const dimension = getB3DimensionForPeriod(input.periodNumber);
  if (!dimension) return null;

  const badgeId = `b3-${dimension}`;
  if (hasSettledPeriodBadge(input, badgeId)) return null;

  const alreadyWonDimension = new Set(
    input.existingBadges
      .filter((badge) => badge.badgeId === badgeId)
      .map((badge) => badge.memberId)
  );
  const sorted = [...input.snapshots].sort((left, right) =>
    right.dimensions[dimension] - left.dimensions[dimension] || byMemberId(left, right)
  );
  const winner = sorted.find((snapshot) =>
    !alreadyWonDimension.has(snapshot.memberId) &&
    !hasExistingBadge(input, snapshot.memberId, badgeId)
  );
  if (!winner) return null;
  return award(
    input,
    winner.memberId,
    badgeId,
    `P${input.periodNumber} B3 ${dimension}: highest dimension score ${winner.dimensions[dimension]}`
  );
}

function topBy(
  snapshots: BadgeSettlementSnapshot[],
  value: (snapshot: BadgeSettlementSnapshot) => number
): { snapshot: BadgeSettlementSnapshot; score: number } | null {
  const sorted = [...snapshots].sort((left, right) =>
    value(right) - value(left) || byMemberId(left, right)
  );
  const winner = sorted[0];
  return winner ? { snapshot: winner, score: value(winner) } : null;
}

function computeFinalBadges(input: BadgeSettlementInput): BadgeSettlementAward[] {
  if (!input.isFinal) return [];

  const previousByMember = new Map(input.previousSnapshots.map((snapshot) => [snapshot.memberId, snapshot]));
  const growthRows = input.snapshots
    .map((snapshot) => ({
      snapshot,
      growth: snapshot.cumulativeAq - (previousByMember.get(snapshot.memberId)?.cumulativeAq ?? 0),
    }))
    .sort((left, right) =>
      right.growth - left.growth || left.snapshot.memberId.localeCompare(right.snapshot.memberId)
    );

  const candidates: Array<{ memberId: string; badgeId: string; reason: string }> = [];
  const king = topBy(input.snapshots, (snapshot) => snapshot.cumulativeAq);
  if (king) {
    candidates.push({
      memberId: king.snapshot.memberId,
      badgeId: "f1-king",
      reason: `P${input.periodNumber} F1 king: highest cumulative AQ ${king.score}`,
    });
  }
  const progress = growthRows.find((row) => row.growth > 0);
  if (progress) {
    candidates.push({
      memberId: progress.snapshot.memberId,
      badgeId: "f2-progress",
      reason: `P${input.periodNumber} F2 progress: cumulative AQ growth ${progress.growth}`,
    });
  }
  const popular = topBy(input.snapshots, (snapshot) => snapshot.dimensions.S);
  if (popular) {
    candidates.push({
      memberId: popular.snapshot.memberId,
      badgeId: "f3-popular",
      reason: `P${input.periodNumber} F3 popular: highest S score ${popular.score}`,
    });
  }
  const innovation = topBy(input.snapshots, (snapshot) => snapshot.dimensions.C);
  if (innovation) {
    candidates.push({
      memberId: innovation.snapshot.memberId,
      badgeId: "f4-innovation",
      reason: `P${input.periodNumber} F4 innovation: highest C score ${innovation.score}`,
    });
  }

  return candidates
    .filter((candidate) =>
      !hasExistingBadge(input, candidate.memberId, candidate.badgeId) &&
      !hasSettledPeriodBadge(input, candidate.badgeId)
    )
    .map((candidate) => award(input, candidate.memberId, candidate.badgeId, candidate.reason));
}

export function settleBadgesForWindow(input: BadgeSettlementInput): BadgeSettlementAward[] {
  const awards = [
    computeB1(input),
    computeB2(input),
    computeB3(input),
    ...computeFinalBadges(input),
  ].filter((badge): badge is BadgeSettlementAward => badge !== null);

  const seen = new Set<string>();
  return awards.filter((badge) => {
    const key = `${badge.memberId}:${badge.badgeId}:${badge.periodNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
