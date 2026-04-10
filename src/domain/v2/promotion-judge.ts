import type { ScoringDimension } from "./scoring-items-config.js";

export interface WindowSnapshotLike {
  windowAq: number;
  cumulativeAq: number;
  kScore: number;
  hScore: number;
  cScore: number;
  sScore: number;
  gScore: number;
}

export interface DimensionRank {
  rank: number;
  cumulativeScore: number;
}

export interface JudgeRankContext {
  K: DimensionRank;
  H: DimensionRank;
  C: DimensionRank;
  S: DimensionRank;
  G: DimensionRank;
  eligibleStudentCount: number;
  dimensionsInBottom1: Set<ScoringDimension>;
  dimensionsInBottom3: Set<ScoringDimension>;
  dimensionsInTop3: Set<ScoringDimension>;
  dimensionsInTop5: Set<ScoringDimension>;
  elapsedScoringPeriods: number;
}

export type LevelValue = 1 | 2 | 3 | 4 | 5;

export interface JudgeInput {
  snapshot: WindowSnapshotLike;
  currentLevel: LevelValue;
  consecMissedOnEntry: number;
  isFinal: boolean;
  dimensionRankContext: JudgeRankContext;
  attendedAllPeriods: boolean;
  homeworkAllSubmitted: boolean;
  sBehaviorScore: number;
  cBehaviorScore: number;
  hasClosingShowcaseBonus: boolean;
}

export type JudgePathTaken =
  | "primary"
  | "alternate"
  | "protection_discounted"
  | "final_bonus"
  | "none";

export interface ConditionCheck {
  name: string;
  passed: boolean;
  actual: unknown;
  required: unknown;
}

export interface JudgeReason {
  attemptedPath: "primary" | "alternate" | "both";
  conditionChecks: ConditionCheck[];
  discount: number;
  notes?: string[];
}

export interface JudgeOutput {
  promoted: boolean;
  toLevel: LevelValue;
  pathTaken: JudgePathTaken;
  reason: JudgeReason;
}

interface PathContext {
  snapshot: WindowSnapshotLike;
  rankContext: JudgeRankContext;
  discount: number;
  dimCountRelax: number;
  finalHalving: number;
  skipDimensionChecks: boolean;
  homeworkAllSubmitted: boolean;
  sBehaviorScore: number;
  cBehaviorScore: number;
}

interface PathResult {
  passed: boolean;
  checks: ConditionCheck[];
}

const DIMENSIONS: readonly ScoringDimension[] = ["K", "H", "C", "S", "G"];

function threshold(base: number, discount: number, finalHalving: number): number {
  return Math.ceil(base * (1 - discount) * finalHalving);
}

// cumulativeAq accumulates across all windows, so the per-window
// `finalHalving` factor must not apply; only the protection `discount`
// (from consecMissedOnEntry) reduces it.
function cumThreshold(base: number, discount: number): number {
  return Math.ceil(base * (1 - discount));
}

function snapshotDimScore(
  snap: WindowSnapshotLike,
  dim: ScoringDimension
): number {
  switch (dim) {
    case "K":
      return snap.kScore;
    case "H":
      return snap.hScore;
    case "C":
      return snap.cScore;
    case "S":
      return snap.sScore;
    case "G":
      return snap.gScore;
  }
}

function countDimsAtLeast(
  snap: WindowSnapshotLike,
  cutoff: number
): number {
  let count = 0;
  for (const d of DIMENSIONS) {
    if (snapshotDimScore(snap, d) >= cutoff) count += 1;
  }
  return count;
}

function countDimsWithCumulativeAtLeast(
  rankContext: JudgeRankContext,
  cutoff: number
): number {
  let count = 0;
  for (const d of DIMENSIONS) {
    if (rankContext[d].cumulativeScore >= cutoff) count += 1;
  }
  return count;
}

function mk(
  name: string,
  actual: unknown,
  required: unknown,
  passed: boolean
): ConditionCheck {
  return { name, actual, required, passed };
}

function tryLv2Primary(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(32, ctx.discount, ctx.finalHalving);
  const c1 = mk(
    "lv2.primary.windowAq",
    ctx.snapshot.windowAq,
    `>= ${needWindowAq}`,
    ctx.snapshot.windowAq >= needWindowAq
  );
  checks.push(c1);

  if (!ctx.skipDimensionChecks) {
    const dimsGe8 = countDimsAtLeast(ctx.snapshot, 8);
    checks.push(
      mk("lv2.primary.dimsGe8", dimsGe8, ">= 1", dimsGe8 >= 1)
    );
  }
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv2Alternate(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needCumAq = cumThreshold(56, ctx.discount);
  checks.push(
    mk(
      "lv2.alternate.cumulativeAq",
      ctx.snapshot.cumulativeAq,
      `>= ${needCumAq}`,
      ctx.snapshot.cumulativeAq >= needCumAq
    )
  );
  if (!ctx.skipDimensionChecks) {
    const dimsGe5 = countDimsAtLeast(ctx.snapshot, 5);
    checks.push(
      mk("lv2.alternate.dimsGe5", dimsGe5, ">= 2", dimsGe5 >= 2)
    );
  }
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv3Primary(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(42, ctx.discount, ctx.finalHalving);
  checks.push(
    mk(
      "lv3.primary.windowAq",
      ctx.snapshot.windowAq,
      `>= ${needWindowAq}`,
      ctx.snapshot.windowAq >= needWindowAq
    )
  );
  if (!ctx.skipDimensionChecks) {
    const required = 2 - ctx.dimCountRelax;
    const dimsGe10 = countDimsAtLeast(ctx.snapshot, 10);
    checks.push(
      mk("lv3.primary.dimsGe10", dimsGe10, `>= ${required}`, dimsGe10 >= required)
    );
  }
  checks.push(
    mk(
      "lv3.primary.homeworkAllSubmitted",
      ctx.homeworkAllSubmitted,
      true,
      ctx.homeworkAllSubmitted === true
    )
  );
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv3Alternate(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(32, ctx.discount, ctx.finalHalving);
  const needCumAq = cumThreshold(155, ctx.discount);
  checks.push(
    mk(
      "lv3.alternate.cumulativeAq",
      ctx.snapshot.cumulativeAq,
      `>= ${needCumAq}`,
      ctx.snapshot.cumulativeAq >= needCumAq
    )
  );
  checks.push(
    mk(
      "lv3.alternate.windowAq",
      ctx.snapshot.windowAq,
      `>= ${needWindowAq}`,
      ctx.snapshot.windowAq >= needWindowAq
    )
  );
  if (!ctx.skipDimensionChecks) {
    const required = 3 - ctx.dimCountRelax;
    const cutoff = ctx.rankContext.elapsedScoringPeriods * 4;
    const dims = countDimsWithCumulativeAtLeast(ctx.rankContext, cutoff);
    checks.push(
      mk(
        "lv3.alternate.dimsCumulativeGe",
        { dims, cutoff },
        `>= ${required}`,
        dims >= required
      )
    );
  }
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv4Primary(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(50, ctx.discount, ctx.finalHalving);
  const needCumAq = cumThreshold(245, ctx.discount);
  checks.push(
    mk(
      "lv4.primary.windowAq",
      ctx.snapshot.windowAq,
      `>= ${needWindowAq}`,
      ctx.snapshot.windowAq >= needWindowAq
    )
  );
  checks.push(
    mk(
      "lv4.primary.cumulativeAq",
      ctx.snapshot.cumulativeAq,
      `>= ${needCumAq}`,
      ctx.snapshot.cumulativeAq >= needCumAq
    )
  );
  if (!ctx.skipDimensionChecks) {
    const required = 4 - ctx.dimCountRelax;
    const cutoff = ctx.rankContext.elapsedScoringPeriods * 5;
    const dims = countDimsWithCumulativeAtLeast(ctx.rankContext, cutoff);
    checks.push(
      mk(
        "lv4.primary.dimsCumulativeGe",
        { dims, cutoff },
        `>= ${required}`,
        dims >= required
      )
    );
  }
  checks.push(
    mk(
      "lv4.primary.sBehaviorScore",
      ctx.sBehaviorScore,
      ">= 5",
      ctx.sBehaviorScore >= 5
    )
  );
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv4Alternate(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(39, ctx.discount, ctx.finalHalving);
  const needCumAq = cumThreshold(295, ctx.discount);
  checks.push(
    mk(
      "lv4.alternate.cumulativeAq",
      ctx.snapshot.cumulativeAq,
      `>= ${needCumAq}`,
      ctx.snapshot.cumulativeAq >= needCumAq
    )
  );
  checks.push(
    mk(
      "lv4.alternate.windowAq",
      ctx.snapshot.windowAq,
      `>= ${needWindowAq}`,
      ctx.snapshot.windowAq >= needWindowAq
    )
  );
  checks.push(
    mk(
      "lv4.alternate.dimensionsInBottom1Size",
      ctx.rankContext.dimensionsInBottom1.size,
      "== 0",
      ctx.rankContext.dimensionsInBottom1.size === 0
    )
  );
  checks.push(
    mk(
      "lv4.alternate.cBehaviorScore",
      ctx.cBehaviorScore,
      ">= 8",
      ctx.cBehaviorScore >= 8
    )
  );
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv5Primary(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(56, ctx.discount, ctx.finalHalving);
  const needCumAq = cumThreshold(392, ctx.discount);
  checks.push(
    mk(
      "lv5.primary.windowAq",
      ctx.snapshot.windowAq,
      `>= ${needWindowAq}`,
      ctx.snapshot.windowAq >= needWindowAq
    )
  );
  checks.push(
    mk(
      "lv5.primary.cumulativeAq",
      ctx.snapshot.cumulativeAq,
      `>= ${needCumAq}`,
      ctx.snapshot.cumulativeAq >= needCumAq
    )
  );
  if (!ctx.skipDimensionChecks) {
    const cutoff = ctx.rankContext.elapsedScoringPeriods * 5;
    const dims = countDimsWithCumulativeAtLeast(ctx.rankContext, cutoff);
    checks.push(
      mk(
        "lv5.primary.allDimsCumulativeGe",
        { dims, cutoff },
        "== 5",
        dims === 5
      )
    );
    checks.push(
      mk(
        "lv5.primary.dimensionsInTop3Size",
        ctx.rankContext.dimensionsInTop3.size,
        ">= 1",
        ctx.rankContext.dimensionsInTop3.size >= 1
      )
    );
  }
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryLv5Alternate(ctx: PathContext): PathResult {
  const checks: ConditionCheck[] = [];
  const needWindowAq = threshold(46, ctx.discount, ctx.finalHalving);
  const needCumAq = cumThreshold(434, ctx.discount);
  checks.push(
    mk(
      "lv5.alternate.cumulativeAq",
      ctx.snapshot.cumulativeAq,
      `>= ${needCumAq}`,
      ctx.snapshot.cumulativeAq >= needCumAq
    )
  );
  checks.push(
    mk(
      "lv5.alternate.windowAq",
      ctx.snapshot.windowAq,
      `>= ${needWindowAq}`,
      ctx.snapshot.windowAq >= needWindowAq
    )
  );
  if (!ctx.skipDimensionChecks) {
    checks.push(
      mk(
        "lv5.alternate.dimensionsInTop5Size",
        ctx.rankContext.dimensionsInTop5.size,
        ">= 4",
        ctx.rankContext.dimensionsInTop5.size >= 4
      )
    );
    checks.push(
      mk(
        "lv5.alternate.dimensionsInBottom3Size",
        ctx.rankContext.dimensionsInBottom3.size,
        "== 0",
        ctx.rankContext.dimensionsInBottom3.size === 0
      )
    );
  }
  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

function tryPrimary(targetLevel: LevelValue, ctx: PathContext): PathResult {
  switch (targetLevel) {
    case 2:
      return tryLv2Primary(ctx);
    case 3:
      return tryLv3Primary(ctx);
    case 4:
      return tryLv4Primary(ctx);
    case 5:
      return tryLv5Primary(ctx);
    default:
      return { passed: false, checks: [] };
  }
}

function tryAlternate(targetLevel: LevelValue, ctx: PathContext): PathResult {
  switch (targetLevel) {
    case 2:
      return tryLv2Alternate(ctx);
    case 3:
      return tryLv3Alternate(ctx);
    case 4:
      return tryLv4Alternate(ctx);
    case 5:
      return tryLv5Alternate(ctx);
    default:
      return { passed: false, checks: [] };
  }
}

/**
 * Applies the spec §3.7 final-bonus boost: +5 to every per-dimension
 * score, with the aggregate `windowAq` and `cumulativeAq` derived from
 * the boosted per-dim fields rather than a blind +25.
 *
 * The blind `+25` version (initial plan draft) double-counted in the
 * edge case where `windowAq` already included a non-zero `growthBonus`
 * baked into `gScore`, making the final-bonus retry falsely pass for
 * near-Lv5 students with a large growth bonus. See plan review M6.
 *
 * Invariant after boost:
 *   boosted.windowAq  === (snap.kScore + 5) + (snap.hScore + 5)
 *                        + (snap.cScore + 5) + (snap.sScore + 5)
 *                        + (snap.gScore + 5)
 *                        - (snap.kScore + snap.hScore + snap.cScore + snap.sScore + snap.gScore)
 *                        + snap.windowAq
 *                      === snap.windowAq + 25
 * i.e. the net effect on `windowAq` is still +25, but it's computed as
 * the difference between boosted per-dim totals and the original per-dim
 * totals, which remains correct even if `snap.windowAq` already includes
 * growth-bonus contributions on `gScore`.
 */
function boostedSnapshot(snap: WindowSnapshotLike): WindowSnapshotLike {
  const boostedK = snap.kScore + 5;
  const boostedH = snap.hScore + 5;
  const boostedC = snap.cScore + 5;
  const boostedS = snap.sScore + 5;
  const boostedG = snap.gScore + 5;
  const originalDimSum =
    snap.kScore + snap.hScore + snap.cScore + snap.sScore + snap.gScore;
  const boostedDimSum = boostedK + boostedH + boostedC + boostedS + boostedG;
  const dimDelta = boostedDimSum - originalDimSum; // always 25
  return {
    windowAq: snap.windowAq + dimDelta,
    cumulativeAq: snap.cumulativeAq + dimDelta,
    kScore: boostedK,
    hScore: boostedH,
    cScore: boostedC,
    sScore: boostedS,
    gScore: boostedG
  };
}

export function judge(input: JudgeInput): JudgeOutput {
  if (input.currentLevel === 5) {
    return {
      promoted: false,
      toLevel: 5,
      pathTaken: "none",
      reason: {
        attemptedPath: "primary",
        conditionChecks: [],
        discount: 0,
        notes: ["already_at_max"]
      }
    };
  }

  let discount = 0;
  let dimCountRelax = 0;
  if (input.consecMissedOnEntry === 1) {
    discount = 0.15;
  } else if (input.consecMissedOnEntry >= 2) {
    discount = 0.25;
    dimCountRelax = 1;
  }

  const finalHalving = input.isFinal ? 0.5 : 1.0;
  const skipDimensionChecks = input.isFinal && input.attendedAllPeriods;

  const targetLevel = (input.currentLevel + 1) as LevelValue;
  const ctx: PathContext = {
    snapshot: input.snapshot,
    rankContext: input.dimensionRankContext,
    discount,
    dimCountRelax,
    finalHalving,
    skipDimensionChecks,
    homeworkAllSubmitted: input.homeworkAllSubmitted,
    sBehaviorScore: input.sBehaviorScore,
    cBehaviorScore: input.cBehaviorScore
  };

  const primary = tryPrimary(targetLevel, ctx);
  if (primary.passed) {
    return {
      promoted: true,
      toLevel: targetLevel,
      pathTaken:
        input.consecMissedOnEntry >= 1 ? "protection_discounted" : "primary",
      reason: {
        attemptedPath: "primary",
        conditionChecks: primary.checks,
        discount,
        notes: skipDimensionChecks ? ["full_attendance_dim_skip"] : undefined
      }
    };
  }

  const alternate = tryAlternate(targetLevel, ctx);
  if (alternate.passed) {
    return {
      promoted: true,
      toLevel: targetLevel,
      pathTaken:
        input.consecMissedOnEntry >= 1 ? "protection_discounted" : "alternate",
      reason: {
        attemptedPath: "alternate",
        conditionChecks: [...primary.checks, ...alternate.checks],
        discount,
        notes: skipDimensionChecks ? ["full_attendance_dim_skip"] : undefined
      }
    };
  }

  if (input.isFinal && input.hasClosingShowcaseBonus) {
    const boostedCtx: PathContext = { ...ctx, snapshot: boostedSnapshot(input.snapshot) };
    const retryPrimary = tryPrimary(targetLevel, boostedCtx);
    const retryAlternate = retryPrimary.passed
      ? { passed: false, checks: [] as ConditionCheck[] }
      : tryAlternate(targetLevel, boostedCtx);
    if (retryPrimary.passed || retryAlternate.passed) {
      return {
        promoted: true,
        toLevel: targetLevel,
        pathTaken: "final_bonus",
        reason: {
          attemptedPath: "both",
          conditionChecks: [
            ...primary.checks,
            ...alternate.checks,
            ...retryPrimary.checks,
            ...retryAlternate.checks
          ],
          discount,
          notes: ["final_bonus_applied"]
        }
      };
    }
  }

  return {
    promoted: false,
    toLevel: input.currentLevel,
    pathTaken: "none",
    reason: {
      attemptedPath: "both",
      conditionChecks: [...primary.checks, ...alternate.checks],
      discount,
      notes: []
    }
  };
}
