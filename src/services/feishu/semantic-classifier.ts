/**
 * Semantic Message Classifier
 *
 * Replaces the keyword-whitelist approach with LLM-based semantic understanding.
 * One LLM call evaluates a message across all 9 LLM-scorable dimensions
 * simultaneously, returning only the items that qualify for scoring.
 *
 * Items NOT scored by LLM (independent pipelines):
 *   C2 — emoji reaction (reaction-tracker.ts)
 *   S2 — peer voted (peer-review-settle-handler.ts)
 *   G3 — attendance bonus (aggregation)
 * Items scored by FAST PATH (no LLM needed):
 *   K1 — daily check-in (any activity)
 *   K2 — quiz result (quiz handler)
 *   H1 — file submission (messageType check)
 */

import type { ScoringItemCode } from "../../domain/v2/scoring-items-config.js";
import { SCORING_ITEMS } from "../../domain/v2/scoring-items-config.js";
import type { NormalizedFeishuMessage } from "./normalize-message.js";

// ============================================================================
// Public types
// ============================================================================

export interface SemanticScoreItem {
  code: ScoringItemCode;
  score: number;
  reason: string;
}

// ============================================================================
// LLM-scorable items (9 items across K/C/H/G/S dimensions)
// ============================================================================

/**
 * Items that the LLM can evaluate from message content.
 * C2/S2/G3 are excluded — they come from independent event pipelines.
 * K1/K2/H1 are excluded — they are fast-path items.
 */
export const LLM_SCORABLE_ITEMS: ReadonlySet<ScoringItemCode> = new Set([
  "K3", "K4",
  "C1", "C3",
  "H2", "H3",
  "G1", "G2",
  "S1",
]);

// ============================================================================
// Unified scoring prompt
// ============================================================================

const SYSTEM_PREFIX = `你是 AI 训练营评分助手。对学员的消息，判断每条评分项是否得分。
输出严格 JSON，格式：{"items":[{"code":"K3","score":3,"reason":"不错的总结"}]}
只输出得分项（score > 0），不得分的项不输出。reason 用中文口语化表达。`;

const ITEM_STANDARDS: Record<string, string> = {
  K3: "K3 知识总结 (0-3分)：用自己的话总结 AI 知识点，≥30字",
  K4: "K4 AI纠错 (0-4分)：指出 AI 的具体错误并给出纠正",
  C1: "C1 创意用法 (0-4分)：描述具体的 AI 新玩法/新场景",
  C3: "C3 提示词模板 (0-5分)：分享结构化的可复用 prompt",
  H2: "H2 实操分享 (0-3分)：描述用 AI 工具做了什么、结果如何",
  H3: "H3 视频打卡 (0-2分)：提到完成视频学习/看完课程内容",
  G1: "G1 学习反思 (0-5分)：学习心得，有自己的反思和收获",
  G2: "G2 课外资源 (0-3分)：分享 AI 相关资源并说明推荐理由",
  S1: "S1 互助贡献 (0-3分)：@他人并提供帮助/解答问题",
};

/**
 * Build the unified scoring prompt for a message.
 */
export function buildUnifiedPrompt(text: string): string {
  const standards = [...LLM_SCORABLE_ITEMS]
    .map((code) => ITEM_STANDARDS[code] ?? `${code} 评分项`)
    .join("\n");

  return `${SYSTEM_PREFIX}\n\n【评分项标准】\n${standards}\n\n学员消息："""\n${text}\n"""`;
}

// ============================================================================
// Post-processing
// ============================================================================

/**
 * Filter and sanitize LLM response items:
 * 1. Remove items not in LLM_SCORABLE_ITEMS (hallucination guard)
 * 2. Remove items with score <= 0
 * 3. Clamp scores to per-item config max
 */
export function filterScorableItems(
  items: Array<{ code: string; score: number; reason: string }>,
): SemanticScoreItem[] {
  const results: SemanticScoreItem[] = [];

  for (const item of items) {
    // Guard: only LLM-scorable items
    if (!LLM_SCORABLE_ITEMS.has(item.code as ScoringItemCode)) {
      continue;
    }
    // Guard: score must be positive
    if (item.score <= 0) {
      continue;
    }

    const code = item.code as ScoringItemCode;
    const config = SCORING_ITEMS[code];
    const clampedScore = Math.min(item.score, config.defaultScoreDelta);

    results.push({
      code,
      score: clampedScore,
      reason: item.reason || "LLM 语义评分",
    });
  }

  return results;
}

// ============================================================================
// Pre-filter — determines if a message is worth sending to LLM
// ============================================================================

const MIN_TEXT_LENGTH = 10;

/**
 * Quick pre-filter to skip messages that don't need LLM scoring.
 * Returns false for messages that should only get K1 (check-in).
 */
export function needsSemanticScoring(message: NormalizedFeishuMessage): boolean {
  const text = message.rawText.trim();

  // Skip very short text messages
  if (text.length < MIN_TEXT_LENGTH && message.messageType === "text") {
    return false;
  }

  // Skip reaction synthetic messages (handled by reaction-tracker → C2)
  if (text.startsWith("[表情回应:")) {
    return false;
  }

  // Image and file messages always need scoring
  if (message.messageType === "image" || message.messageType === "file") {
    return true;
  }

  return true;
}
