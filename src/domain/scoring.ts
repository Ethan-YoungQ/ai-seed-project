import type { ScoringResult, SubmissionCandidate } from "./types";

const processMarkers = [
  "\u6211\u662f",
  "\u5148",
  "\u7136\u540e",
  "\u6b65\u9aa4",
  "\u63d0\u793a\u8bcd",
  "prompt",
  "\u8fed\u4ee3",
  "\u5c1d\u8bd5",
  "\u600e\u4e48\u505a"
];

const resultMarkers = [
  "\u5b66\u5230\u4e86",
  "\u5b66\u4f1a\u4e86",
  "\u4ea7\u51fa",
  "\u7ed3\u679c",
  "\u603b\u7ed3",
  "\u8f93\u51fa",
  "\u5b8c\u6210",
  "\u6700\u7ec8"
];

const structuredMarkers = [
  "\u603b\u7ed3",
  "\u8f93\u51fa",
  "\u6b65\u9aa4",
  "1.",
  "2.",
  "\u4e00\u3001",
  "\u4e8c\u3001",
  "\u6700\u7ec8"
];

export async function scoreSubmissionCandidate(
  candidate: SubmissionCandidate
): Promise<ScoringResult> {
  const sourceText = [candidate.combinedText.trim(), candidate.documentText?.trim() ?? ""]
    .filter(Boolean)
    .join("\n\n");
  const text = sourceText.toLowerCase();
  const reasons: string[] = [];

  const hasEvidence = candidate.attachmentCount > 0 || /https?:\/\//.test(text);
  const hasProcess = processMarkers.some((marker) => text.includes(marker.toLowerCase()));
  const hasResult = resultMarkers.some((marker) => text.includes(marker.toLowerCase()));
  const onTime =
    new Date(candidate.latestEventTime).getTime() <= new Date(candidate.deadlineAt).getTime();

  reasons.push(hasEvidence ? "evidence_present" : "missing_evidence");

  if (!hasProcess) {
    reasons.push("missing_process");
  }

  if (!hasResult) {
    reasons.push("missing_result");
  }

  if (!onTime) {
    reasons.push("late_submission");
  }

  if (!hasEvidence || !hasProcess || !hasResult || !onTime) {
    return {
      memberId: candidate.memberId,
      sessionId: candidate.sessionId,
      candidateId: candidate.id,
      baseScore: 0,
      processScore: 0,
      qualityScore: 0,
      communityBonus: 0,
      totalScore: 0,
      finalStatus: "invalid",
      scoreReason: reasons.join(","),
      llmReason: "该提交未通过基础校验，已跳过自动评分。",
      llmModel: "heuristic-fallback",
      llmInputExcerpt: sourceText.slice(0, 160),
      autoBaseScore: 0,
      autoProcessScore: 0,
      autoQualityScore: 0,
      autoCommunityBonus: 0
    };
  }

  const processScore = [
    /prompt|\u63d0\u793a\u8bcd/.test(text),
    /\u8fed\u4ee3|\u4e24\u8f6e|\u4e09\u8f6e|\u4f18\u5316|\u8c03\u6574/.test(text),
    /\u5b66\u5230\u4e86|\u5b66\u4f1a\u4e86|\u53cd\u601d|\u53d1\u73b0/.test(text)
  ].filter(Boolean).length;

  const qualityScore = [
    structuredMarkers.some((marker) => text.includes(marker.toLowerCase())),
    /\u4ea7\u51fa|\u603b\u7ed3|\u6a21\u677f|\u6e05\u5355|\u65b9\u6848|\u7ed3\u679c/.test(text)
  ].filter(Boolean).length;

  return {
    memberId: candidate.memberId,
    sessionId: candidate.sessionId,
    candidateId: candidate.id,
    baseScore: 5,
    processScore: Math.min(processScore, 3),
    qualityScore: Math.min(qualityScore, 2),
    communityBonus: 0,
    totalScore: 5 + Math.min(processScore, 3) + Math.min(qualityScore, 2),
    finalStatus: "valid",
    scoreReason: reasons.join(","),
    llmReason: "启发式评分依据过程、结果和结构线索完成；配置好在线评审后可切换为模型判定。",
    llmModel: "heuristic-fallback",
    llmInputExcerpt: sourceText.slice(0, 160),
    autoBaseScore: 5,
    autoProcessScore: Math.min(processScore, 3),
    autoQualityScore: Math.min(qualityScore, 2),
    autoCommunityBonus: 0
  };
}

export function buildPendingReviewScore(
  candidate: SubmissionCandidate,
  reason: string,
  llmReason: string
): ScoringResult {
  const sourceText = [candidate.combinedText.trim(), candidate.documentText?.trim() ?? ""]
    .filter(Boolean)
    .join("\n\n");

  return {
    memberId: candidate.memberId,
    sessionId: candidate.sessionId,
    candidateId: candidate.id,
    baseScore: 0,
    processScore: 0,
    qualityScore: 0,
    communityBonus: 0,
    totalScore: 0,
    finalStatus: "pending_review",
    scoreReason: reason,
    llmReason,
    llmModel: "document-parse-gate",
    llmInputExcerpt: sourceText.slice(0, 160),
    autoBaseScore: 0,
    autoProcessScore: 0,
    autoQualityScore: 0,
    autoCommunityBonus: 0
  };
}
