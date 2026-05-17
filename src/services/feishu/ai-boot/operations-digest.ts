import {
  CONTINUOUS_PROMOTION_THRESHOLDS,
  type ContinuousLevelValue,
  type ContinuousDimensionTotals,
  type ContinuousPromotionPath,
} from "../../../domain/v2/continuous-promotion.js";

export interface OperationsDigestMember {
  memberId: string;
  memberName: string;
  currentLevel: number;
  cumulativeAq: number;
  dimensions: ContinuousDimensionTotals;
}

export interface SuspectedMissedScore {
  memberId: string;
  memberName: string;
  messageId: string;
  reason: string;
}

export interface SlowImageTask {
  messageId: string;
  memberName: string;
  latencyMs: number;
}

export interface OperationsDigestInput {
  nowIso: string;
  ranking: OperationsDigestMember[];
  suspectedMissedScores: SuspectedMissedScore[];
  slowImageTasks: SlowImageTask[];
  nearPromotionWindow?: number;
}

export interface NearPromotion {
  memberId: string;
  memberName: string;
  currentLevel: number;
  nextLevel: number;
  cumulativeAq: number;
  threshold: number;
  pointsRemaining: number;
  pathTaken: ContinuousPromotionPath;
}

export interface DigestResult {
  shouldSend: boolean;
  text: string;
  nearPromotions: NearPromotion[];
}

export interface OperatorDigestResult extends DigestResult {
  suspectedMissedScores: SuspectedMissedScore[];
  slowImageTasks: SlowImageTask[];
  zeroCsgMembers: OperationsDigestMember[];
}

export interface OperationsDigest {
  groupNudge: string | null;
  operatorDigest: string;
  nearPromotions: NearPromotion[];
  suspectedMissedScores: SuspectedMissedScore[];
  slowImageTasks: SlowImageTask[];
  zeroCsgMembers: OperationsDigestMember[];
}

export function buildGroupPromotionDigest(input: OperationsDigestInput): DigestResult {
  const nearPromotions = findNearPromotions(input);
  if (nearPromotions.length === 0) {
    return {
      shouldSend: false,
      text: "",
      nearPromotions,
    };
  }

  const lines = nearPromotions
    .slice(0, 5)
    .map((item) => `@${item.memberName} 距 Lv${item.nextLevel} 还差 ${item.pointsRemaining} 分`);

  return {
    shouldSend: true,
    nearPromotions,
    text: ["临近晋升提醒", ...lines].join("\n"),
  };
}

export function buildOperationsDigest(input: OperationsDigestInput): OperationsDigest {
  const group = buildGroupPromotionDigest(input);
  const operator = buildOperatorDigest(input);

  return {
    groupNudge: group.shouldSend ? group.text : null,
    operatorDigest: operator.text,
    nearPromotions: operator.nearPromotions,
    suspectedMissedScores: operator.suspectedMissedScores,
    slowImageTasks: operator.slowImageTasks,
    zeroCsgMembers: operator.zeroCsgMembers,
  };
}

export function buildOperatorDigest(input: OperationsDigestInput): OperatorDigestResult {
  const nearPromotions = findNearPromotions(input);
  const zeroCsgMembers = input.ranking.filter((member) =>
    member.dimensions.C === 0 &&
    member.dimensions.S === 0 &&
    member.dimensions.G === 0
  );

  const sections = [
    renderNearPromotionSection(nearPromotions),
    renderMissedScoreSection(input.suspectedMissedScores),
    renderSlowImageSection(input.slowImageTasks),
    renderZeroCsgSection(zeroCsgMembers),
  ];

  return {
    shouldSend: sections.some((section) => !section.endsWith("暂无")),
    text: sections.join("\n\n"),
    nearPromotions,
    suspectedMissedScores: input.suspectedMissedScores,
    slowImageTasks: input.slowImageTasks,
    zeroCsgMembers,
  };
}

function findNearPromotions(input: OperationsDigestInput): NearPromotion[] {
  const window = input.nearPromotionWindow ?? 5;
  return input.ranking
    .map((member) => toNearPromotion(member))
    .filter((item): item is NearPromotion => {
      return item !== null && item.pointsRemaining > 0 && item.pointsRemaining <= window;
    })
    .sort((left, right) =>
      left.pointsRemaining - right.pointsRemaining ||
      left.memberName.localeCompare(right.memberName, "zh-Hans-CN"),
    );
}

function toNearPromotion(member: OperationsDigestMember): NearPromotion | null {
  const currentLevel = member.currentLevel;
  if (!isContinuousLevel(currentLevel) || currentLevel >= 5) return null;
  const promotedMember = { ...member, currentLevel };
  const nextLevel = (currentLevel + 1) as 2 | 3 | 4 | 5;
  if (nextLevel !== 2 && nextLevel !== 3 && nextLevel !== 4 && nextLevel !== 5) {
    return null;
  }
  const gap = calculatePromotionGap(promotedMember, nextLevel);
  if (!gap) return null;
  return {
    memberId: member.memberId,
    memberName: member.memberName,
    currentLevel,
    nextLevel,
    cumulativeAq: member.cumulativeAq,
    threshold: gap.threshold,
    pointsRemaining: gap.pointsRemaining,
    pathTaken: gap.pathTaken,
  };
}

function calculatePromotionGap(
  member: OperationsDigestMember & { currentLevel: ContinuousLevelValue },
  nextLevel: 2 | 3 | 4 | 5,
): Pick<NearPromotion, "threshold" | "pointsRemaining" | "pathTaken"> | null {
  if (member.currentLevel === 1 && nextLevel === 2) {
    const candidates = [
      lv2PathGap(member, "lv2_main_csg", 24, hasAnyCsgSignal(member.dimensions)),
      lv2PathGap(member, "lv2_strong_practice", CONTINUOUS_PROMOTION_THRESHOLDS[2], countDimensionsAtLeast(member.dimensions, 8) >= 1),
      lv2PathGap(member, "lv2_multidimensional", 20, countDimensionsAtLeast(member.dimensions, 5) >= 2 && countCsgDimensionsAtLeast(member.dimensions, 5) >= 1),
    ].filter((item): item is Pick<NearPromotion, "threshold" | "pointsRemaining" | "pathTaken"> => item !== null);

    return candidates
      .filter((candidate) => candidate.pointsRemaining > 0)
      .sort((left, right) => left.pointsRemaining - right.pointsRemaining)[0] ?? null;
  }

  const threshold = CONTINUOUS_PROMOTION_THRESHOLDS[nextLevel];
  const pointsRemaining = threshold - member.cumulativeAq;
  if (pointsRemaining <= 0) return null;
  return {
    threshold,
    pointsRemaining,
    pathTaken: "cumulative_threshold",
  };
}

function lv2PathGap(
  member: OperationsDigestMember,
  pathTaken: Exclude<ContinuousPromotionPath, "cumulative_threshold">,
  threshold: number,
  dimensionConditionMet: boolean,
): Pick<NearPromotion, "threshold" | "pointsRemaining" | "pathTaken"> | null {
  if (!dimensionConditionMet) return null;
  return {
    threshold,
    pointsRemaining: threshold - member.cumulativeAq,
    pathTaken,
  };
}

function isContinuousLevel(level: number): level is ContinuousLevelValue {
  return level === 1 || level === 2 || level === 3 || level === 4 || level === 5;
}

function countDimensionsAtLeast(
  dimensions: ContinuousDimensionTotals,
  cutoff: number,
): number {
  return Object.values(dimensions).filter((score) => score >= cutoff).length;
}

function countCsgDimensionsAtLeast(
  dimensions: ContinuousDimensionTotals,
  cutoff: number,
): number {
  return [dimensions.C, dimensions.S, dimensions.G].filter((score) => score >= cutoff).length;
}

function hasAnyCsgSignal(dimensions: ContinuousDimensionTotals): boolean {
  return dimensions.C > 0 || dimensions.S > 0 || dimensions.G > 0;
}

function renderNearPromotionSection(items: NearPromotion[]): string {
  if (items.length === 0) return "临近晋升名单：暂无";
  return [
    "临近晋升名单：",
    ...items.map((item) =>
      `- ${item.memberName}: Lv${item.currentLevel} -> Lv${item.nextLevel}, 还差 ${item.pointsRemaining} 分`,
    ),
  ].join("\n");
}

function renderMissedScoreSection(items: SuspectedMissedScore[]): string {
  if (items.length === 0) return "疑似漏分：暂无";
  return [
    "疑似漏分：",
    ...items.map((item) =>
      `- ${item.memberName} ${item.messageId}: ${item.reason}`,
    ),
  ].join("\n");
}

function renderSlowImageSection(items: SlowImageTask[]): string {
  if (items.length === 0) return "慢图片任务：暂无";
  return [
    "慢图片任务：",
    ...items.map((item) =>
      `- ${item.memberName} ${item.messageId}: ${Math.round(item.latencyMs / 1000)}s`,
    ),
  ].join("\n");
}

function renderZeroCsgSection(items: OperationsDigestMember[]): string {
  if (items.length === 0) return "C/S/G 为 0：暂无";
  return [
    "C/S/G 为 0：",
    ...items.map((item) => `- ${item.memberName}`),
  ].join("\n");
}
