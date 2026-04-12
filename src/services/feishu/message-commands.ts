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
import { buildQuizCard } from "./cards/templates/quiz-v1.js";
import { fetchQuizByPeriod, type QuizBankDeps } from "./quiz-bank.js";
import { buildPeerReviewVoteCard } from "./cards/templates/peer-review-vote-v1.js";
import { classifyMessage, type ClassificationResult } from "./message-classifier.js";
import { sendConfirmReply, type AutoReplyDeps } from "./auto-reply.js";
import type { ScoringItemCode } from "../../domain/v2/scoring-items-config.js";

// ============================================================================
// Keyword definitions
// ============================================================================

/** Keywords that trigger the admin panel card */
const ADMIN_PANEL_KEYWORDS = ["管理", "管理面板", "控制面板"];
const QUIZ_KEYWORDS = ["测验", "随堂测验", "考试"];
const PEER_REVIEW_KEYWORDS = ["互评", "互评投票", "投票"];

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
  ingestor?: AutoCaptureIngestor;
  /** Returns student members for peer review voting */
  listStudents?: () => Array<{ id: string; displayName: string }>;
  quizBank?: QuizBankDeps;
}

export function createMessageCommandHandler(deps: MessageCommandDeps) {
  return async (message: NormalizedFeishuMessage): Promise<void> => {
    console.log(`[MsgHandler] onMessage: chatType=${message.chatType}, msgType=${message.messageType}, text="${message.rawText.slice(0, 50)}", member=${message.memberId}`);

    // Only process group chat messages (not DMs)
    if (message.chatType !== "group") return;

    // Trainer/admin keyword triggers: text messages only
    if (message.messageType === "text") {
      const text = stripAtMentionPrefix(message.rawText.trim());

      if (ADMIN_PANEL_KEYWORDS.some((kw) => text === kw)) {
        await handleAdminPanelTrigger(message, deps);
        return;
      }
      if (QUIZ_KEYWORDS.some((kw) => text === kw)) {
        await handleQuizTrigger(message, deps);
        return;
      }
      if (PEER_REVIEW_KEYWORDS.some((kw) => text === kw)) {
        await handlePeerReviewTrigger(message, deps);
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

// ============================================================================
// Quiz trigger — trainer sends "测验" → bot sends quiz card
// ============================================================================

async function handleQuizTrigger(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps,
): Promise<void> {
  const member = deps.cardDeps.repo.findMemberByOpenId(message.memberId);
  if (!member || (member.roleType !== "operator" && member.roleType !== "trainer")) {
    console.log("[Quiz] Denied: not operator/trainer");
    return;
  }
  if (!message.chatId) return;

  if (!deps.quizBank) {
    await deps.feishuClient.sendTextMessage({
      receiveId: message.chatId, receiveIdType: "chat_id" as any,
      text: "⚠️ 题库未配置，请设置 FEISHU_BASE_QUIZ_TABLE 环境变量",
    });
    return;
  }

  const activePeriod = await deps.lifecycle.getActivePeriod();
  const periodNumber = activePeriod?.number ?? 1;

  const quizState = await fetchQuizByPeriod(deps.quizBank, periodNumber);
  if (!quizState || quizState.questions.length === 0) {
    await deps.feishuClient.sendTextMessage({
      receiveId: message.chatId, receiveIdType: "chat_id" as any,
      text: `⚠️ 第 ${periodNumber} 期暂无测验题目，请在飞书多维表格中录入`,
    });
    return;
  }

  const cardJson = buildQuizCard(quizState);
  await deps.feishuClient.sendCardMessage({
    chatId: message.chatId,
    cardJson: cardJson as unknown as Record<string, unknown>,
  });
  console.log(`[Quiz] Card sent: period=${periodNumber}, questions=${quizState.questions.length}`);
}

// ============================================================================
// Peer review trigger — trainer sends "互评" → bot sends vote card
// ============================================================================

async function handlePeerReviewTrigger(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps,
): Promise<void> {
  const member = deps.cardDeps.repo.findMemberByOpenId(message.memberId);
  if (!member || (member.roleType !== "operator" && member.roleType !== "trainer")) {
    console.log("[PeerReview] Denied: not operator/trainer");
    return;
  }

  if (!message.chatId) return;

  // Get student candidates for voting
  const students = deps.listStudents?.() ?? [];
  const candidates = students.map((m) => ({
    memberId: m.id,
    displayName: m.displayName,
  }));

  if (candidates.length === 0) {
    // Fallback: send a text message
    await deps.feishuClient.sendTextMessage({
      receiveId: message.chatId,
      receiveIdType: "chat_id",
      text: "⚠️ 暂无学员可以参与互评",
    });
    return;
  }

  const sessionId = `pr-${Date.now()}`;
  const cardJson = buildPeerReviewVoteCard({
    sessionId,
    candidates,
    maxVotes: Math.min(3, candidates.length),
  });

  await deps.feishuClient.sendCardMessage({
    chatId: message.chatId,
    cardJson: cardJson as unknown as Record<string, unknown>,
  });
  console.log(`[PeerReview] Vote card sent, session=${sessionId}, candidates=${candidates.length}`);
}
