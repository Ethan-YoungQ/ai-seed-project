import { computeGrowthBonus } from "./growth-bonus.js";
import { judge, type JudgeInput, type JudgeOutput } from "./promotion-judge.js";
import {
  computeRankContext,
  type DimensionScoreRow
} from "./rank-context.js";
import type { ScoringDimension } from "./scoring-items-config.js";

export interface WindowRecord {
  id: string;
  campId: string;
  code: string;
  firstPeriodId: string | null;
  lastPeriodId: string | null;
  isFinal: boolean;
  settlementState: "open" | "settling" | "settled";
  settledAt: string | null;
}

export interface WindowSnapshotRecord {
  id: string;
  windowId: string;
  memberId: string;
  windowAq: number;
  cumulativeAq: number;
  kScore: number;
  hScore: number;
  cScore: number;
  sScore: number;
  gScore: number;
  growthBonus: number;
  consecMissedOnEntry: number;
  snapshotAt: string;
}

export interface MemberLevelRecord {
  memberId: string;
  currentLevel: 1 | 2 | 3 | 4 | 5;
  levelAttainedAt: string;
  lastWindowId: string | null;
  updatedAt: string;
}

export interface PromotionRecord {
  id: string;
  windowId: string;
  memberId: string;
  evaluatedAt: string;
  fromLevel: 1 | 2 | 3 | 4 | 5;
  toLevel: 1 | 2 | 3 | 4 | 5;
  promoted: 0 | 1;
  pathTaken: JudgeOutput["pathTaken"];
  reason: string;
}

export interface SettlerDependencies {
  fetchWindow(windowId: string): Promise<WindowRecord>;
  updateWindowSettlementState(
    windowId: string,
    next: "open" | "settling" | "settled"
  ): Promise<void>;
  listEligibleStudentIds(): Promise<string[]>;
  fetchPeriodDimensionScores(
    memberId: string,
    periodIds: readonly string[]
  ): Promise<DimensionScoreRow[]>;
  fetchPreviousSnapshot(
    memberId: string,
    beforeWindowId: string
  ): Promise<WindowSnapshotRecord | null>;
  fetchPreviousPromotionRecord(
    memberId: string,
    beforeWindowId: string
  ): Promise<PromotionRecord | null>;
  fetchMemberLevel(memberId: string): Promise<MemberLevelRecord>;
  computeAttendance(memberId: string): Promise<boolean>;
  computeHomeworkAllSubmitted(
    memberId: string,
    window: WindowRecord
  ): Promise<boolean>;
  fetchAllEligibleDimensionScores(): Promise<DimensionScoreRow[]>;
  fetchElapsedScoringPeriods(window: WindowRecord): Promise<number>;
  insertWindowSnapshot(snap: WindowSnapshotRecord): Promise<void>;
  insertPromotionRecord(rec: PromotionRecord): Promise<void>;
  updateMemberLevel(rec: MemberLevelRecord): Promise<void>;
  now(): string;
}

export interface SettleOptions {
  idFactory?: () => string;
}

export interface SettleResult {
  ok: boolean;
  alreadySettled: boolean;
  settledMemberCount: number;
}

function sumDim(rows: DimensionScoreRow[], dim: ScoringDimension): number {
  let total = 0;
  for (const row of rows) {
    if (row.dimension === dim) total += row.cumulativeScore;
  }
  return total;
}

function defaultIdFactory(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

export async function settleWindow(
  windowId: string,
  deps: SettlerDependencies,
  options: SettleOptions = {}
): Promise<SettleResult> {
  const window = await deps.fetchWindow(windowId);
  if (window.settlementState === "settled") {
    return { ok: true, alreadySettled: true, settledMemberCount: 0 };
  }

  await deps.updateWindowSettlementState(windowId, "settling");

  try {
    const eligibleIds = await deps.listEligibleStudentIds();
    if (eligibleIds.length === 0) {
      await deps.updateWindowSettlementState(windowId, "settled");
      return { ok: true, alreadySettled: false, settledMemberCount: 0 };
    }

    const periodIds: string[] = [];
    if (window.firstPeriodId) periodIds.push(window.firstPeriodId);
    if (window.lastPeriodId) periodIds.push(window.lastPeriodId);

    const allEligibleScores = await deps.fetchAllEligibleDimensionScores();
    const elapsedScoringPeriods = await deps.fetchElapsedScoringPeriods(window);

    let settledMemberCount = 0;

    for (const memberId of eligibleIds) {
      const dimRows = await deps.fetchPeriodDimensionScores(memberId, periodIds);
      const k = sumDim(dimRows, "K");
      const h = sumDim(dimRows, "H");
      const c = sumDim(dimRows, "C");
      const s = sumDim(dimRows, "S");
      const gBefore = sumDim(dimRows, "G");

      const prevSnap = await deps.fetchPreviousSnapshot(memberId, windowId);
      const prevPromotion = await deps.fetchPreviousPromotionRecord(
        memberId,
        windowId
      );

      const isFirstWindow = prevSnap === null;
      const currentAqBeforeBonus = k + h + c + s + gBefore;
      const { bonus } = computeGrowthBonus({
        currentAqBeforeBonus,
        previousWindowAq: prevSnap?.windowAq ?? 0,
        isFirstWindow
      });

      const gFinal = gBefore + bonus;
      const windowAq = k + h + c + s + gFinal;
      const cumulativeAq = (prevSnap?.cumulativeAq ?? 0) + windowAq;

      let consecMissedOnEntry = prevSnap?.consecMissedOnEntry ?? 0;
      if (prevPromotion && prevPromotion.promoted === 0) {
        consecMissedOnEntry += 1;
      }

      const snapshot: WindowSnapshotRecord = {
        id: (options.idFactory ?? (() => defaultIdFactory("snap")))(),
        windowId,
        memberId,
        windowAq,
        cumulativeAq,
        kScore: k,
        hScore: h,
        cScore: c,
        sScore: s,
        gScore: gFinal,
        growthBonus: bonus,
        consecMissedOnEntry,
        snapshotAt: deps.now()
      };

      await deps.insertWindowSnapshot(snapshot);

      const rankContext = computeRankContext({
        targetMemberId: memberId,
        eligibleMemberIds: eligibleIds,
        scoreRows: allEligibleScores,
        elapsedScoringPeriods
      });

      const memberLevel = await deps.fetchMemberLevel(memberId);
      const attended = await deps.computeAttendance(memberId);
      const homeworkAllSubmitted = await deps.computeHomeworkAllSubmitted(
        memberId,
        window
      );

      const judgeInput: JudgeInput = {
        snapshot: {
          windowAq,
          cumulativeAq,
          kScore: k,
          hScore: h,
          cScore: c,
          sScore: s,
          gScore: gFinal
        },
        currentLevel: memberLevel.currentLevel,
        consecMissedOnEntry,
        isFinal: window.isFinal,
        dimensionRankContext: rankContext,
        attendedAllPeriods: attended,
        homeworkAllSubmitted,
        sBehaviorScore: s,
        cBehaviorScore: c,
        hasClosingShowcaseBonus: false
      };
      const decision = judge(judgeInput);

      const promotion: PromotionRecord = {
        id: (options.idFactory ?? (() => defaultIdFactory("prom")))(),
        windowId,
        memberId,
        evaluatedAt: deps.now(),
        fromLevel: memberLevel.currentLevel,
        toLevel: decision.toLevel,
        promoted: decision.promoted ? 1 : 0,
        pathTaken: decision.pathTaken,
        reason: JSON.stringify(decision.reason)
      };
      await deps.insertPromotionRecord(promotion);

      if (decision.promoted) {
        await deps.updateMemberLevel({
          memberId,
          currentLevel: decision.toLevel,
          levelAttainedAt: deps.now(),
          lastWindowId: windowId,
          updatedAt: deps.now()
        });
      }

      settledMemberCount += 1;
    }

    await deps.updateWindowSettlementState(windowId, "settled");
    return { ok: true, alreadySettled: false, settledMemberCount };
  } catch (err) {
    await deps.updateWindowSettlementState(windowId, "open");
    throw err;
  }
}
