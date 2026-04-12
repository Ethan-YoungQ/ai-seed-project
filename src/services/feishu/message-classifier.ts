/**
 * Message Intent Classifier
 *
 * Classifies student messages in the Feishu group chat into scoring item codes.
 * Uses a rule-first approach with LLM fallback for ambiguous long text.
 *
 * Design: EVERY student message produces at least K1 (daily check-in).
 * More specific patterns yield additional scoring items.
 *
 * Priority (high → low):
 * 1. Content-specific: URL → G2, file → H1, image → H2, video → H3/G1
 * 2. Long text heuristics: prompt → C3, error → K4, creative → C1, summary → K3
 * 3. Fallback: ANY student activity → K1 (daily check-in)
 */

import type { ScoringItemCode } from "../../domain/v2/scoring-items-config.js";
import type { NormalizedFeishuMessage } from "./normalize-message.js";

export interface ClassificationResult {
  itemCode: ScoringItemCode;
  confidence: "rule" | "llm";
  reason: string;
}

// ============================================================================
// Rule-based classification
// ============================================================================

const VIDEO_COMPLETE_KEYWORDS = ["完成视频", "视频完成", "看完了", "学完了", "视频打卡"];

const URL_PATTERN = /https?:\/\/[^\s]+/;

/**
 * Classify a student message into scoring item codes.
 * Returns ALL applicable scoring items (K1 is always included as check-in).
 */
export function classifyMessage(
  message: NormalizedFeishuMessage,
): ClassificationResult[] {
  const results: ClassificationResult[] = [];
  const text = message.rawText.trim();

  // --- Content-specific classification (higher-value items) ---

  // Video completion (H3 视频打卡 / G1 视频学习)
  if (VIDEO_COMPLETE_KEYWORDS.some((kw) => text.includes(kw))) {
    results.push({ itemCode: "H3", confidence: "rule", reason: "视频完成关键词" });
  } else if (text.includes("完成") && (text.includes("视频") || text.includes("学习"))) {
    results.push({ itemCode: "G1", confidence: "rule", reason: "视频学习关键词" });
  }

  // URL sharing (G2 课外资源)
  if (URL_PATTERN.test(text)) {
    results.push({ itemCode: "G2", confidence: "rule", reason: "包含 URL 链接" });
  }

  // File attachment (H1 作业提交)
  if (message.messageType === "file" || (message.attachmentCount > 0 && message.messageType !== "image")) {
    results.push({ itemCode: "H1", confidence: "rule", reason: "文件附件（作业提交）" });
  }

  // Image (H2 实操分享)
  if (message.messageType === "image") {
    results.push({ itemCode: "H2", confidence: "rule", reason: "图片消息（实操分享）" });
  }

  // Long text classification
  if (text.length >= 20) {
    const longTextResult = classifyLongText(text);
    if (longTextResult) {
      results.push(longTextResult);
    }
  }

  // --- K1 签到: ANY student activity counts as daily check-in ---
  // This is always added. The Ingestor's per-period cap + dedup
  // ensures only one K1 per day is actually scored.
  results.push({ itemCode: "K1", confidence: "rule", reason: "群内活动自动签到" });

  return results;
}

// ============================================================================
// Simple heuristic classifier for long text
// ============================================================================

function classifyLongText(text: string): ClassificationResult | null {
  const lowerText = text.toLowerCase();

  // Prompt template indicators → C3
  if (
    lowerText.includes("prompt") ||
    lowerText.includes("提示词") ||
    lowerText.includes("模板")
  ) {
    return { itemCode: "C3", confidence: "rule", reason: "包含 prompt/提示词关键词" };
  }

  // AI error correction indicators → K4
  if (
    lowerText.includes("纠错") ||
    lowerText.includes("错误") ||
    lowerText.includes("修正") ||
    lowerText.includes("改正")
  ) {
    return { itemCode: "K4", confidence: "rule", reason: "包含纠错关键词" };
  }

  // Creative usage indicators → C1
  if (
    lowerText.includes("创意") ||
    lowerText.includes("创新") ||
    lowerText.includes("新玩法") ||
    lowerText.includes("妙用")
  ) {
    return { itemCode: "C1", confidence: "rule", reason: "包含创意关键词" };
  }

  // Default for long text: knowledge summary → K3
  if (text.length >= 50) {
    return { itemCode: "K3", confidence: "rule", reason: "长文本默认归类为知识总结" };
  }

  return null;
}
