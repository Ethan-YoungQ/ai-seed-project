import type { SubmissionAttempt } from "./types";
import type { LlmProviderConfig } from "../services/llm/provider-config";
import { readLlmProviderConfig } from "../services/llm/provider-config";
import { scoreAttemptWithQwen, type QwenScoreResult } from "../services/llm/qwen-score";

import type { ScoringResult } from "./types";

const processMarkers = [
  "我是",
  "先",
  "然后",
  "步骤",
  "提示词",
  "prompt",
  "迭代",
  "尝试",
  "怎么做"
];

const resultMarkers = [
  "学到了",
  "学会了",
  "产出",
  "结果",
  "总结",
  "输出",
  "完成",
  "最终"
];

const structuredMarkers = ["总结", "输出", "步骤", "1.", "2.", "一、", "二、", "最终"];

export interface ScoreSubmissionOptions {
  config?: LlmProviderConfig;
  llmScorer?: (attempt: SubmissionAttempt, config: LlmProviderConfig) => Promise<QwenScoreResult>;
}

function buildSourceText(candidate: SubmissionAttempt) {
  return [candidate.combinedText.trim(), candidate.documentText?.trim() ?? ""]
    .filter(Boolean)
    .join("\n\n");
}

function buildInvalidScore(candidate: SubmissionAttempt, sourceText: string, reasons: string[]): ScoringResult {
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

function buildHeuristicValidScore(
  candidate: SubmissionAttempt,
  sourceText: string,
  llmReason = "启发式评分依据过程、结果和结构线索完成。"
): ScoringResult {
  const text = sourceText.toLowerCase();
  const processScore = [
    /prompt|提示词/.test(text),
    /迭代|两轮|三轮|优化|调整/.test(text),
    /学到了|学会了|反思|发现/.test(text)
  ].filter(Boolean).length;

  const qualityScore = [
    structuredMarkers.some((marker) => text.includes(marker.toLowerCase())),
    /产出|总结|模板|清单|方案|结果/.test(text)
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
    scoreReason: "evidence_present",
    llmReason,
    llmModel: "heuristic-fallback",
    llmInputExcerpt: sourceText.slice(0, 160),
    autoBaseScore: 5,
    autoProcessScore: Math.min(processScore, 3),
    autoQualityScore: Math.min(qualityScore, 2),
    autoCommunityBonus: 0
  };
}

function applyQwenScore(
  candidate: SubmissionAttempt,
  sourceText: string,
  qwenScore: QwenScoreResult
): ScoringResult {
  const processScore = Math.max(0, Math.min(qwenScore.processScore, 3));
  const qualityScore = Math.max(0, Math.min(qwenScore.qualityScore, 2));

  return {
    memberId: candidate.memberId,
    sessionId: candidate.sessionId,
    candidateId: candidate.id,
    baseScore: 5,
    processScore,
    qualityScore,
    communityBonus: 0,
    totalScore: 5 + processScore + qualityScore,
    finalStatus: "valid",
    scoreReason: "evidence_present",
    llmReason: qwenScore.reason,
    llmModel: qwenScore.model,
    llmInputExcerpt: qwenScore.inputExcerpt || sourceText.slice(0, 160),
    autoBaseScore: 5,
    autoProcessScore: processScore,
    autoQualityScore: qualityScore,
    autoCommunityBonus: 0
  };
}

export async function scoreSubmissionCandidate(
  candidate: SubmissionAttempt,
  options: ScoreSubmissionOptions = {}
): Promise<ScoringResult> {
  const sourceText = buildSourceText(candidate);
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
    return buildInvalidScore(candidate, sourceText, reasons);
  }

  const config = options.config ?? readLlmProviderConfig(process.env);
  const llmScorer = options.llmScorer ?? scoreAttemptWithQwen;

  if (config.enabled) {
    try {
      const qwenScore = await llmScorer(candidate, config);
      return applyQwenScore(candidate, sourceText, qwenScore);
    } catch (error) {
      const fallbackReason =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "unknown_llm_error";

      return buildHeuristicValidScore(
        candidate,
        sourceText,
        `llm_fallback:${fallbackReason}; 启发式评分依据过程、结果和结构线索完成。`
      );
    }
  }

  return buildHeuristicValidScore(candidate, sourceText);
}

export function buildPendingReviewScore(
  candidate: SubmissionAttempt,
  reason: string,
  llmReason: string
): ScoringResult {
  const sourceText = buildSourceText(candidate);

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
