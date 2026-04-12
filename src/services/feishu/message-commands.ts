/**
 * Message-based command handler for the Feishu bot.
 *
 * Listens for keyword triggers in group chat messages and responds
 * with interactive cards. Also handles automatic scoring for student
 * messages via the message classifier + Ingestor pipeline.
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
import { classifyMessage, type ClassificationResult } from "./message-classifier.js";
import { sendConfirmReply, type AutoReplyDeps } from "./auto-reply.js";
import type { ScoringItemCode } from "../../domain/v2/scoring-items-config.js";

// ============================================================================
// Keyword definitions
// ============================================================================

/** Keywords that trigger the admin panel card */
const ADMIN_PANEL_KEYWORDS = ["管理", "管理面板", "控制面板"];

function stripAtMentionPrefix(text: string): string {
  return text.replace(/^@_\S+\s+/g, "").trim();
}

// ============================================================================
// Ingestor interface (minimal contract for auto-capture)
// ============================================================================

export interface AutoCaptureIngestor {
  ingest(input: {
    memberId: string;
    itemCode: ScoringItemCode;
    scoreDelta: number;
    sourceRef: string;
    payloadText?: string;
  }): { accepted: boolean; reason?: string };
}

// ============================================================================
// Message command handler
// ============================================================================

export interface MessageCommandDeps {
  feishuClient: FeishuApiClient;
  lifecycle: AdminPanelLifecycleDeps;
  cardDeps: Pick<CardHandlerDeps, "repo">;
  autoReply?: AutoReplyDeps;
  /** When provided, classified messages are fed into the scoring pipeline */
  ingestor?: AutoCaptureIngestor;
}

export function createMessageCommandHandler(deps: MessageCommandDeps) {
  return async (message: NormalizedFeishuMessage): Promise<void> => {
    console.log(`[MsgHandler] onMessage: chatType=${message.chatType}, msgType=${message.messageType}, text="${message.rawText.slice(0, 50)}", member=${message.memberId}`);

    // Only process group chat messages (not DMs)
    if (message.chatType !== "group") return;

    // Admin panel: text messages only
    if (message.messageType === "text") {
      const text = stripAtMentionPrefix(message.rawText.trim());
      if (ADMIN_PANEL_KEYWORDS.some((kw) => text === kw)) {
        console.log(`[MsgHandler] Admin panel trigger for ${message.memberId}`);
        await handleAdminPanelTrigger(message, deps);
        return;
      }
    }

    // Auto-capture: ALL message types (text, image, file, media, sticker)
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
  const member = deps.cardDeps.repo.findMemberByOpenId(message.memberId);

  if (!member) {
    console.log(`[AutoCapture] Unknown sender ${message.memberId}, ignoring`);
    return;
  }
  if (member.roleType === "operator" || member.roleType === "trainer") {
    return;
  }

  // Classify — returns array of all applicable scoring items
  const results = classifyMessage(message);
  if (results.length === 0) return;

  console.log(
    `[AutoCapture] ${member.displayName}: ${results.map((r) => `${r.itemCode}(${r.reason})`).join(", ")}`,
  );

  // Ingest each classified scoring item
  let primaryResult: ClassificationResult | null = null;

  for (const result of results) {
    if (deps.ingestor) {
      try {
        const outcome = deps.ingestor.ingest({
          memberId: member.id,
          itemCode: result.itemCode,
          scoreDelta: 0, // let Ingestor use defaultScoreDelta from config
          sourceRef: `msg:${message.messageId}:${result.itemCode}`,
          payloadText: message.rawText.slice(0, 500),
        });
        if (outcome.accepted && !primaryResult) {
          primaryResult = result;
        }
        console.log(
          `[AutoCapture] Ingest ${result.itemCode}: accepted=${outcome.accepted}${outcome.accepted ? "" : `, reason=${(outcome as any).reason}`}`,
        );
      } catch (err) {
        console.error(`[AutoCapture] Ingest error for ${result.itemCode}:`, err);
      }
    } else {
      // No ingestor wired — still track the primary result for reply
      if (!primaryResult) primaryResult = result;
    }
  }

  // Send ONE confirmation reply for the highest-value accepted item
  // (skip K1 if a more specific item was also accepted)
  const replyItem = primaryResult && primaryResult.itemCode !== "K1"
    ? primaryResult
    : results.find((r) => r.itemCode !== "K1") ?? primaryResult;

  if (replyItem && deps.autoReply && message.chatId) {
    await sendConfirmReply(deps.autoReply, {
      chatId: message.chatId,
      memberId: message.memberId,
      memberName: member.displayName,
      itemCode: replyItem.itemCode,
    });
  }
}

// ============================================================================
// Admin panel trigger
// ============================================================================

async function handleAdminPanelTrigger(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps,
): Promise<void> {
  const member = deps.cardDeps.repo.findMemberByOpenId(message.memberId);
  if (
    !member ||
    (member.roleType !== "operator" && member.roleType !== "trainer")
  ) {
    console.log("[AdminPanel] Denied: not operator/trainer");
    return;
  }

  const [activePeriod, activeWindow, memberCounts, pendingReviewCount] =
    await Promise.all([
      deps.lifecycle.getActivePeriod(),
      deps.lifecycle.getActiveWindow(),
      deps.lifecycle.countMembers(),
      deps.cardDeps.repo.countReviewRequiredEvents(),
    ]);

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

  if (message.chatId) {
    await deps.feishuClient.sendCardMessage({
      chatId: message.chatId,
      cardJson: cardJson as unknown as Record<string, unknown>,
    });
    console.log("[AdminPanel] Card sent");
  }
}
