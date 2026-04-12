/**
 * Message Intent Classifier
 *
 * Classifies student messages in the Feishu group chat into scoring item codes.
 * Uses a rule-first approach with LLM fallback for ambiguous long text.
 *
 * Priority (high → low):
 * 1. Exact keywords: "签到" → K1, "完成"+视频 → H3/G1
 * 2. Content features: URL → G2, image/file → H1/H2
 * 3. LLM classification: long text → K3/K4/C1/C3
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

const CHECKIN_KEYWORDS = ["签到", "打卡", "每日签到", "每日打卡"];

const VIDEO_COMPLETE_KEYWORDS = ["完成视频", "视频完成", "看完了", "学完了", "视频打卡"];

const URL_PATTERN = /https?:\/\/[^\s]+/;

/**
 * Classify a student message into a scoring item code.
 * Returns null if the message doesn't match any scoring pattern.
 */
export function classifyMessage(
  message: NormalizedFeishuMessage,
): ClassificationResult | null {
  const text = message.rawText.trim();

  // --- Rule 1: Daily check-in (K1) ---
  if (CHECKIN_KEYWORDS.some((kw) => text.includes(kw))) {
    return { itemCode: "K1", confidence: "rule", reason: "签到关键词匹配" };
  }

  // --- Rule 2: Video completion (H3 视频打卡 / G1 视频学习) ---
  if (VIDEO_COMPLETE_KEYWORDS.some((kw) => text.includes(kw))) {
    return { itemCode: "H3", confidence: "rule", reason: "视频完成关键词匹配" };
  }
  if (text.includes("完成") && (text.includes("视频") || text.includes("学习"))) {
    return { itemCode: "G1", confidence: "rule", reason: "视频学习关键词匹配" };
  }

  // --- Rule 3: URL sharing (G2 课外资源) ---
  if (URL_PATTERN.test(text)) {
    return { itemCode: "G2", confidence: "rule", reason: "包含 URL 链接" };
  }

  // --- Rule 4: File/image attachment ---
  if (message.messageType === "file" || message.attachmentCount > 0) {
    // PDF/Word → H1 作业提交
    if (message.fileExt === "pdf" || message.fileExt === "docx" || message.fileExt === "doc") {
      return { itemCode: "H1", confidence: "rule", reason: "文件附件（作业提交）" };
    }
    // Other files → H1 as default
    return { itemCode: "H1", confidence: "rule", reason: "文件附件" };
  }

  // --- Rule 5: Image → H2 实操分享 ---
  if (message.messageType === "image") {
    return { itemCode: "H2", confidence: "rule", reason: "图片消息（实操分享）" };
  }

  // --- Rule 6: Long text → needs LLM classification ---
  if (text.length >= 20) {
    return classifyLongText(text);
  }

  // No match — ignore silently
  return null;
}

// ============================================================================
// Simple heuristic classifier for long text (no LLM call)
// When LLM is integrated, this can be replaced with an async LLM call.
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
