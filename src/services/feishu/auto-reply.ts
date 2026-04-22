/**
 * Bot Auto-Reply
 *
 * Sends brief text confirmation replies after successful scoring operations.
 * Uses reply (not new message) to reduce group chat noise.
 * Includes rate limiting: same student + same item code within 5 minutes → skip.
 */

import type { ScoringItemCode } from "../../domain/v2/scoring-items-config.js";
import { SCORING_ITEMS } from "../../domain/v2/scoring-items-config.js";
import type { FeishuReceiveIdType } from "./config.js";

// ============================================================================
// Rate limiting — prevent duplicate confirmations
// ============================================================================

const recentReplies = new Map<string, number>();
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

function makeKey(memberId: string, itemCode: ScoringItemCode): string {
  return `${memberId}:${itemCode}`;
}

function isRateLimited(memberId: string, itemCode: ScoringItemCode): boolean {
  const key = makeKey(memberId, itemCode);
  const lastTime = recentReplies.get(key);
  if (lastTime && Date.now() - lastTime < RATE_LIMIT_MS) {
    return true;
  }
  return false;
}

function markSent(memberId: string, itemCode: ScoringItemCode): void {
  const key = makeKey(memberId, itemCode);
  recentReplies.set(key, Date.now());

  // Cleanup old entries every 100 sends
  if (recentReplies.size > 200) {
    const now = Date.now();
    for (const [k, t] of recentReplies) {
      if (now - t > RATE_LIMIT_MS) {
        recentReplies.delete(k);
      }
    }
  }
}

// ============================================================================
// Reply message formatting
// ============================================================================

const DIMENSION_LABELS: Record<string, string> = {
  K: "知识",
  H: "动手",
  C: "创造",
  S: "社交",
  G: "成长",
};

const ITEM_LABELS: Record<ScoringItemCode, string> = {
  K1: "签到成功",
  K2: "测验已提交",
  K3: "知识总结已记录，等待审核",
  K4: "AI纠错已记录，等待审核",
  H1: "作业已提交",
  H2: "实操分享已记录，等待审核",
  H3: "视频打卡成功",
  C1: "创意用法已记录，等待审核",
  C2: "表情回应已记录",
  C3: "提示词模板已记录，等待审核",
  S1: "互评投票已提交",
  S2: "被投票已记录",
  G1: "视频学习已记录",
  G2: "课外资源已记录",
  G3: "全勤加成已计算",
};

export function formatConfirmReply(
  memberName: string,
  itemCode: ScoringItemCode,
): string {
  const config = SCORING_ITEMS[itemCode];
  const label = ITEM_LABELS[itemCode] ?? "已记录";
  const dim = DIMENSION_LABELS[config.dimension] ?? config.dimension;
  const score = config.defaultScoreDelta;

  if (config.needsLlm) {
    return `✅ ${memberName} ${label}`;
  }
  return `✅ ${memberName} ${label}！${dim} +${score}`;
}

// ============================================================================
// Send reply via Feishu API
// ============================================================================

export interface AutoReplyDeps {
  sendTextMessage: (input: {
    receiveId: string;
    receiveIdType: FeishuReceiveIdType;
    text: string;
  }) => Promise<{ messageId?: string }>;
}

/**
 * 是否启用自动回复（默认关闭）。
 * 通过环境变量 FEISHU_AUTO_REPLY_ENABLED=true 启用。
 * 关闭后 Bot 仍然正常计分，只是不在群里发"签到成功"等回复消息。
 */
function isAutoReplyEnabled(): boolean {
  const v = (process.env.FEISHU_AUTO_REPLY_ENABLED ?? "false").toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

export async function sendConfirmReply(
  deps: AutoReplyDeps,
  opts: {
    chatId: string;
    memberId: string;
    memberName: string;
    itemCode: ScoringItemCode;
  },
): Promise<void> {
  // 全局开关：默认关闭自动回复，减少群内噪音
  if (!isAutoReplyEnabled()) {
    return;
  }

  // Rate limit check
  if (isRateLimited(opts.memberId, opts.itemCode)) {
    console.log(
      `[AutoReply] Rate limited: ${opts.memberId} ${opts.itemCode}, skipping`,
    );
    return;
  }

  const text = formatConfirmReply(opts.memberName, opts.itemCode);

  try {
    await deps.sendTextMessage({
      receiveId: opts.chatId,
      receiveIdType: "chat_id" as FeishuReceiveIdType,
      text,
    });
    markSent(opts.memberId, opts.itemCode);
    console.log(`[AutoReply] Sent: ${text}`);
  } catch (err) {
    console.error(`[AutoReply] Failed to send reply:`, err);
  }
}
