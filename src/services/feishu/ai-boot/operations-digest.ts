import {
  CONTINUOUS_PROMOTION_THRESHOLDS,
  type ContinuousDimensionTotals,
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
    .filter((item): item is NearPromotion =>
      Boolean(item) && item.pointsRemaining > 0 && item.pointsRemaining <= window,
    )
    .sort((left, right) =>
      left.pointsRemaining - right.pointsRemaining ||
      left.memberName.localeCompare(right.memberName, "zh-Hans-CN"),
    );
}

function toNearPromotion(member: OperationsDigestMember): NearPromotion | null {
  if (member.currentLevel >= 5) return null;
  const nextLevel = member.currentLevel + 1;
  if (nextLevel !== 2 && nextLevel !== 3 && nextLevel !== 4 && nextLevel !== 5) {
    return null;
  }
  const threshold = CONTINUOUS_PROMOTION_THRESHOLDS[nextLevel];
  const pointsRemaining = threshold - member.cumulativeAq;
  return {
    memberId: member.memberId,
    memberName: member.memberName,
    currentLevel: member.currentLevel,
    nextLevel,
    cumulativeAq: member.cumulativeAq,
    threshold,
    pointsRemaining,
  };
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
