/**
 * Message Intent Classifier
 *
 * Classifies student messages in the Feishu group chat into scoring item codes.
 * Uses a rule-first approach with LLM fallback for ambiguous long text.
 *
 * Design: EVERY student message produces at least K1 (daily check-in).
 * More specific patterns yield additional scoring items. A single message can
 * trigger multiple scoring dimensions simultaneously.
 */

import type { ScoringItemCode } from "../../domain/v2/scoring-items-config.js";
import type { NormalizedFeishuMessage } from "./normalize-message.js";

export interface ClassificationResult {
  itemCode: ScoringItemCode;
  confidence: "rule" | "llm";
  reason: string;
}

// ============================================================================
// Keyword banks
// ============================================================================

const VIDEO_COMPLETE_KEYWORDS = ["完成视频", "视频完成", "看完了", "学完了", "视频打卡"];

const C1_KEYWORDS = [
  "创意", "创新", "新玩法", "妙用",
  "分享", "试试", "发现", "试了", "推荐", "好用", "有意思",
  "新工具", "新方法", "有个想法", "换了一种", "不一样的",
  "做了个", "做了一", "玩玩", "试一下",
];

const C3_KEYWORDS = [
  "prompt", "提示词", "模板",
  "指令", "提问方式", "问法", "咒语", "AI说", "我问AI", "我让AI",
  "我是这样问", "这样写", "系统提示", "角色设定"
];

const K4_KEYWORDS = ["纠错", "错误", "修正", "改正"];

const G1_KEYWORDS = [
  "完成学习", "完成视频",
  "看完", "听过", "读了", "学到了", "学到", "收获",
  "学习心得", "学习笔记", "总结一下",
];

const S1_KEYWORDS = ["帮忙", "请教", "问一下", "谁知道", "求助"];

const URL_PATTERN = /https?:\/\/[^\s]+/;

// ============================================================================
// Public API
// ============================================================================

/**
 * Classify a student message into scoring item codes.
 * Returns ALL applicable scoring items (K1 is always included as check-in).
 */
export function classifyMessage(
  message: NormalizedFeishuMessage,
): ClassificationResult[] {
  const results: ClassificationResult[] = [];
  const text = message.rawText.trim();

  // --- C2: 表情回应 (reaction events create synthetic messages) ---
  if (text.startsWith("[表情回应:")) {
    results.push({ itemCode: "C2", confidence: "rule", reason: "群内表情回应" });
  }

  // --- Content-specific classification ---

  // Video completion (H3 视频打卡 / G1 视频学习)
  if (VIDEO_COMPLETE_KEYWORDS.some((kw) => text.includes(kw))) {
    results.push({ itemCode: "H3", confidence: "rule", reason: "视频完成关键词" });
  }

  if (G1_KEYWORDS.some((kw) => text.includes(kw))) {
    results.push({ itemCode: "G1", confidence: "rule", reason: "学习反思关键词" });
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

  // S1: Peer help via @mentioning non-bot group members
  if (text.includes("@") && message.mentionedBotIds.length === 0) {
    results.push({ itemCode: "S1", confidence: "rule", reason: "群内互动/帮助他人（@提及）" });
  }

  // --- Text heuristics (text >= 10 chars to catch shorter but meaningful messages) ---
  if (text.length >= 10) {
    for (const result of classifyLongText(text)) {
      results.push(result);
    }
  }

  // --- K1 签到: ANY student activity counts as daily check-in ---
  // Always added last. The Ingestor's per-period cap + dedup
  // ensures only one K1 per day is actually scored.
  results.push({ itemCode: "K1", confidence: "rule", reason: "群内活动自动签到" });

  return results;
}

// ============================================================================
// Long text classification (returns MULTIPLE results)
// ============================================================================

function classifyLongText(text: string): ClassificationResult[] {
  const results: ClassificationResult[] = [];
  const lowerText = text.toLowerCase();

  // C3: Prompt / instruction sharing
  if (C3_KEYWORDS.some((kw) => lowerText.includes(kw.toLowerCase()))) {
    results.push({ itemCode: "C3", confidence: "rule", reason: "包含 prompt/提示词关键词" });
  }

  // K4: AI error correction
  if (K4_KEYWORDS.some((kw) => text.includes(kw))) {
    results.push({ itemCode: "K4", confidence: "rule", reason: "包含纠错关键词" });
  }

  // C1: Creative usage / sharing discoveries
  if (C1_KEYWORDS.some((kw) => text.includes(kw))) {
    results.push({ itemCode: "C1", confidence: "rule", reason: "包含创意/分享关键词" });
  }

  // S1: Peer help — @mentioning someone (not the bot) to ask/help
  if (S1_KEYWORDS.some((kw) => text.includes(kw))) {
    results.push({ itemCode: "S1", confidence: "rule", reason: "群内互动/帮助他人" });
  }

  // K3: Default for genuinely long text (50+ chars) that wasn't matched above
  if (text.length >= 50 && results.length === 0) {
    results.push({ itemCode: "K3", confidence: "rule", reason: "长文本默认归类为知识总结" });
  }

  return results;
}
