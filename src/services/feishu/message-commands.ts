/**
 * Message-based command handler for the Feishu bot.
 *
 * Listens for keyword triggers in group chat messages and responds
 * with interactive cards. Also handles automatic scoring for student
 * messages via the message classifier.
 *
 * Supported triggers:
 *   "管理" or "管理面板"  → sends the Admin Panel card
 *   Student messages      → auto-classify → ingest → confirm reply
 */

import type { NormalizedFeishuMessage } from "./normalize-message.js";
import type { FeishuApiClient } from "./client.js";
import type { AdminPanelLifecycleDeps } from "./cards/handlers/admin-panel-handler.js";
import type { CardHandlerDeps } from "./cards/types.js";
import {
  buildAdminPanelCard,
  type AdminPanelState,
} from "./cards/templates/admin-panel-v1.js";
import { classifyMessage } from "./message-classifier.js";
import { sendConfirmReply, type AutoReplyDeps } from "./auto-reply.js";

// ============================================================================
// Keyword definitions
// ============================================================================

/** Keywords that trigger the admin panel card */
const ADMIN_PANEL_KEYWORDS = ["管理", "管理面板", "控制面板"];

/**
 * Strip leading @mention placeholders from Feishu text messages.
 *
 * When a user @-mentions the bot in a group chat, the parsed `text` field
 * includes a placeholder like `@_user_1 ` or `@_all `.  We need to strip
 * these so keyword matching works regardless of whether the user mentioned
 * the bot.
 */
function stripAtMentionPrefix(text: string): string {
  // Feishu at-mention placeholders: @_user_1, @_user_2, @_all, etc.
  return text.replace(/^@_\S+\s+/g, "").trim();
}

// ============================================================================
// Message command handler
// ============================================================================

export interface MessageCommandDeps {
  feishuClient: FeishuApiClient;
  lifecycle: AdminPanelLifecycleDeps;
  cardDeps: Pick<CardHandlerDeps, "repo">;
  /** Optional: when provided, enables auto-capture for student messages */
  autoReply?: AutoReplyDeps;
}

export function createMessageCommandHandler(deps: MessageCommandDeps) {
  return async (message: NormalizedFeishuMessage): Promise<void> => {
    console.log(`[AdminPanel] onMessage received: chatType=${message.chatType}, messageType=${message.messageType}, rawText="${message.rawText}", memberId=${message.memberId}, chatId=${message.chatId}`);

    // Only process group chat messages (not DMs)
    if (message.chatType !== "group") {
      console.log("[AdminPanel] Skipped: not a group message");
      return;
    }

    // Only process text messages
    if (message.messageType !== "text") {
      console.log(`[AdminPanel] Skipped: messageType is "${message.messageType}", not "text"`);
      return;
    }

    const rawText = message.rawText.trim();
    const text = stripAtMentionPrefix(rawText);
    console.log(`[AdminPanel] Keyword matching: raw="${rawText}" → stripped="${text}"`);

    // Check for admin panel trigger
    if (ADMIN_PANEL_KEYWORDS.some((kw) => text === kw)) {
      console.log(`[AdminPanel] Keyword matched! Triggering admin panel for member ${message.memberId}`);
      await handleAdminPanelTrigger(message, deps);
      return;
    }

    // Auto-capture: classify student messages for scoring
    await handleAutoCapture(message, deps);
  };
}

// ============================================================================
// Auto-capture: classify student messages and trigger scoring
// ============================================================================

async function handleAutoCapture(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps,
): Promise<void> {
  // Only process group chat messages
  if (message.chatType !== "group") return;

  // Look up the sender
  const member = deps.cardDeps.repo.findMemberByOpenId(message.memberId);

  // Skip messages from unknown users or non-students
  // Operators/trainers messages are management commands, not scoring targets
  if (!member) {
    console.log(`[AutoCapture] Unknown sender ${message.memberId}, ignoring`);
    return;
  }
  if (member.roleType === "operator" || member.roleType === "trainer") {
    // Admin/trainer messages that didn't match keywords → ignore
    return;
  }

  // Run classifier
  const result = classifyMessage(message);
  if (!result) {
    // No match — silent ignore (don't spam the group)
    return;
  }

  console.log(
    `[AutoCapture] Classified: ${member.displayName} → ${result.itemCode} (${result.confidence}: ${result.reason})`,
  );

  // Send confirmation reply
  if (deps.autoReply && message.chatId) {
    await sendConfirmReply(deps.autoReply, {
      chatId: message.chatId,
      memberId: message.memberId,
      memberName: member.displayName,
      itemCode: result.itemCode,
    });
  }
}

// ============================================================================
// Admin panel trigger
// ============================================================================

async function handleAdminPanelTrigger(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps
): Promise<void> {
  // Permission check: only operator/trainer can trigger
  const member = deps.cardDeps.repo.findMemberByOpenId(message.memberId);
  console.log(`[AdminPanel] Permission check: memberId=${message.memberId}, found=${!!member}, roleType=${member?.roleType ?? "N/A"}`);
  if (
    !member ||
    (member.roleType !== "operator" && member.roleType !== "trainer")
  ) {
    console.log("[AdminPanel] Denied: user is not operator/trainer, ignoring silently");
    return;
  }

  // Build current state
  console.log("[AdminPanel] Building panel state...");
  const [activePeriod, activeWindow, memberCounts, pendingReviewCount] =
    await Promise.all([
      deps.lifecycle.getActivePeriod(),
      deps.lifecycle.getActiveWindow(),
      deps.lifecycle.countMembers(),
      deps.cardDeps.repo.countReviewRequiredEvents(),
    ]);

  console.log(`[AdminPanel] State: period=${JSON.stringify(activePeriod)}, window=${JSON.stringify(activeWindow)}, members=${JSON.stringify(memberCounts)}, pendingReview=${pendingReviewCount}`);

  const state: AdminPanelState = {
    activePeriod,
    activeWindow,
    stats: {
      totalMembers: memberCounts.total,
      activeStudents: memberCounts.activeStudents,
      pendingReviewCount,
    },
  };

  const cardJson = buildAdminPanelCard(state);

  // Send the card to the group chat
  if (message.chatId) {
    console.log(`[AdminPanel] Sending card to chatId=${message.chatId}`);
    await deps.feishuClient.sendCardMessage({ chatId: message.chatId, cardJson: cardJson as unknown as Record<string, unknown> });
    console.log("[AdminPanel] Card sent successfully");
  } else {
    console.log("[AdminPanel] No chatId on message, cannot send card");
  }
}
