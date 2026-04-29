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
import {
  buildDashboardPinCard,
  type DashboardPinState,
} from "./cards/templates/dashboard-pin-v1.js";
import { buildManualAdjustCard, type ManualAdjustState } from "./cards/templates/manual-adjust-v1.js";
import { buildMemberMgmtCard, type MemberMgmtState } from "./cards/templates/member-mgmt-v1.js";
import type { ChatEngine } from "./chat-bot/chat-engine.js";
import { classifyMessage, type ClassificationResult } from "./message-classifier.js";
import {
  needsSemanticScoring,
  filterScorableItems,
  buildUnifiedPrompt,
  type SemanticScoreItem,
} from "./semantic-classifier.js";
import type { LlmScoringClient } from "../v2/llm-scoring-client.js";
import { sendConfirmReply, type AutoReplyDeps } from "./auto-reply.js";
import type { ScoringItemCode } from "../../domain/v2/scoring-items-config.js";

// ============================================================================
// Keyword definitions
// ============================================================================

/** Keywords that trigger the admin panel card */
const ADMIN_PANEL_KEYWORDS = ["管理", "管理面板", "控制面板"];
const QUIZ_KEYWORDS = ["测验", "随堂测验", "考试"];
const PEER_REVIEW_KEYWORDS = ["互评", "互评投票", "投票"];
const DASHBOARD_KEYWORDS = ["看板", "排行", "排行榜", "成长看板"];
const MANUAL_ADJUST_KEYWORDS = ["调分", "手动调分"];
const MEMBER_MGMT_KEYWORDS = ["成员", "成员管理"];

/**
 * 清洗指令文本：去除 @mention、全角/半角空格、零宽字符、标点符号
 * 解决严格 === 匹配导致"调分！"/"调分。"等带标点的消息无法触发的问题
 */
function cleanCommandText(raw: string): string {
  return raw
    .replace(/@\S+/g, "")                  // 移除所有 @mention
    .replace(/[\s　 ]+/g, "")     // 移除空格（半角/全角/不换行空格）
    .replace(/[​-‏﻿]+/g, "") // 移除零宽字符（显式 Unicode 转义）
    .replace(/[。！？，、；：""''（）《》【】…—！￥…（）—：“”‘’《》\-\+\.\,\!\?\:\;\(\)\[\]\{\}]/g, "") // 移除标点
    .trim();
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

/** 战绩天梯榜卡片所需的依赖 — 只需要 URL */
export interface DashboardPinDeps {
  /** Dashboard 网页 URL */
  dashboardUrl: string;
}

/** 手动调分/成员管理所需的成员列表提供者 */
export interface MemberListProvider {
  listAllMembers: () => Array<{
    id: string;
    displayName: string;
    roleType: string;
    currentLevel: number;
    isParticipant: boolean;
    isExcludedFromBoard: boolean;
  }>;
}

export interface MessageCommandDeps {
  feishuClient: FeishuApiClient;
  lifecycle: AdminPanelLifecycleDeps;
  cardDeps: Pick<CardHandlerDeps, "repo">;
  autoReply?: AutoReplyDeps;
  ingestor?: AutoCaptureIngestor;
  listStudents?: () => Array<{ id: string; displayName: string }>;
  quizBank?: QuizBankDeps;
  /** Auto-register unknown senders as students (fetches name/avatar from Feishu) */
  autoRegister?: (openId: string) => Promise<{ id: string; displayName: string } | null>;
  /** 看板置顶卡片依赖 */
  dashboardPin?: DashboardPinDeps;
  /** 成员列表提供者 — 用于调分和成员管理卡片 */
  memberListProvider?: MemberListProvider;
  /** ChatBot @ 问答依赖（可选，未配置则不启用 @Bot 功能） */
  chatBot?: {
    botOpenId: string;
    engine: ChatEngine;
  };
  /** 语义评分配置（可选，未配置则使用旧关键词分类器） */
  semanticScoring?: {
    enabled: boolean;
    llmClient: LlmScoringClient;
  };
}

export function createMessageCommandHandler(deps: MessageCommandDeps) {
  return async (message: NormalizedFeishuMessage): Promise<void> => {
    console.log(`[MsgHandler] onMessage: chatType=${message.chatType}, msgType=${message.messageType}, text="${message.rawText.slice(0, 50)}", member=${message.memberId}`);

    // Only process group chat messages (not DMs)
    if (message.chatType !== "group") return;

    // 第 0 步：@Bot 问答分支（最高优先级，return 后不走评分）
    // handleChatBotMention 内部 fire-and-forget，handler 立即返回
    if (
      deps.chatBot &&
      message.mentionedBotIds.includes(deps.chatBot.botOpenId) &&
      message.messageType === "text"
    ) {
      handleChatBotMention(message, deps);
      return;
    }

    // Trainer/admin keyword triggers: text OR post messages
    if (message.messageType === "text" || message.messageType === "post") {
      const text = cleanCommandText(message.rawText);
      console.log(`[MsgHandler] cmd match: raw="${message.rawText.slice(0, 80)}" → cleaned="${text}"`);

      if (ADMIN_PANEL_KEYWORDS.some((kw) => text.includes(kw))) {
        console.log(`[MsgHandler] → ADMIN_PANEL`);
        await handleAdminPanelTrigger(message, deps);
        return;
      }
      if (QUIZ_KEYWORDS.some((kw) => text.includes(kw))) {
        console.log(`[MsgHandler] → QUIZ`);
        await handleQuizTrigger(message, deps);
        return;
      }
      if (PEER_REVIEW_KEYWORDS.some((kw) => text.includes(kw))) {
        console.log(`[MsgHandler] → PEER_REVIEW`);
        await handlePeerReviewTrigger(message, deps);
        return;
      }
      if (DASHBOARD_KEYWORDS.some((kw) => text.includes(kw))) {
        console.log(`[MsgHandler] → DASHBOARD`);
        await handleDashboardPinTrigger(message, deps);
        return;
      }
      if (MANUAL_ADJUST_KEYWORDS.some((kw) => text.includes(kw))) {
        console.log(`[MsgHandler] → MANUAL_ADJUST`);
        await handleManualAdjustTrigger(message, deps);
        return;
      }
      if (MEMBER_MGMT_KEYWORDS.some((kw) => text.includes(kw))) {
        console.log(`[MsgHandler] → MEMBER_MGMT`);
        await handleMemberMgmtTrigger(message, deps);
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
  let member = deps.cardDeps.repo.findMemberByOpenId(message.memberId);

  if (!member && deps.autoRegister) {
    // Auto-register: new student sends first message → create DB record
    console.log(`[AutoCapture] Unknown sender ${message.memberId}, attempting auto-register...`);
    const registered = await deps.autoRegister(message.memberId);
    if (registered) {
      console.log(`[AutoCapture] Auto-registered: ${registered.displayName} (${registered.id})`);
      member = deps.cardDeps.repo.findMemberByOpenId(message.memberId);
    }
  }

  if (!member) {
    console.log(`[AutoCapture] Unknown sender ${message.memberId}, ignoring`);
    return;
  }
  if (member.roleType === "operator" || member.roleType === "trainer") {
    return;
  }

  // Step 1: K1 签到始终直接给（不需要 LLM）
  ingestK1(message, member.id, deps);

  // Step 2: 判断使用语义评分还是关键词分类器
  const useSemantic = deps.semanticScoring?.enabled;

  if (useSemantic) {
    // --- 语义评分路径（异步 fire-and-forget） ---
    if (needsSemanticScoring(message)) {
      void semanticClassifyAndIngest(message, member.id, member.displayName, deps);
    }
  } else {
    // --- 关键词分类器路径（保持现有行为） ---
    const results = classifyMessage(message);
    if (results.length === 0) return;

    console.log(
      `[AutoCapture] ${member.displayName}: ${results.map((r) => `${r.itemCode}(${r.reason})`).join(", ")}`,
    );

    let primaryResult: ClassificationResult | null = null;

    for (const result of results) {
      if (deps.ingestor) {
        try {
          const outcome = deps.ingestor.ingest({
            memberId: member.id,
            itemCode: result.itemCode,
            scoreDelta: 0,
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
        if (!primaryResult) primaryResult = result;
      }
    }

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
}

// ============================================================================
// K1 签到 — 快速路径，不依赖 LLM
// ============================================================================

function ingestK1(
  message: NormalizedFeishuMessage,
  memberId: string,
  deps: MessageCommandDeps,
): void {
  if (!deps.ingestor) return;

  try {
    const outcome = deps.ingestor.ingest({
      memberId,
      itemCode: "K1",
      scoreDelta: 0,
      sourceRef: `msg:${message.messageId}:K1`,
      payloadText: message.rawText.slice(0, 100),
    });
    console.log(
      `[AutoCapture] K1: accepted=${outcome.accepted}${outcome.accepted ? "" : `, reason=${(outcome as any).reason}`}`,
    );
  } catch (err) {
    console.error("[AutoCapture] K1 ingest error:", err);
  }
}

// ============================================================================
// 语义评分 — 异步 fire-and-forget + LLM 降级
// ============================================================================

async function semanticClassifyAndIngest(
  message: NormalizedFeishuMessage,
  memberId: string,
  displayName: string,
  deps: MessageCommandDeps,
): Promise<void> {
  const llmClient = deps.semanticScoring?.llmClient;
  if (!llmClient || !deps.ingestor) return;

  const promptText = buildUnifiedPrompt(message.rawText);

  let items: SemanticScoreItem[];
  try {
    const result = await llmClient.multiScore(promptText, { timeoutMs: 15000 });
    items = filterScorableItems(result.items);
    console.log(
      `[SemanticScoring] ${displayName}: ${items.map((i) => `${i.code}(${i.reason})`).join(", ") || "(none)"}`,
    );
  } catch (err) {
    console.error(`[SemanticScoring] LLM failed for ${displayName}, falling back to keyword classifier:`, err);
    // 降级：LLM 失败时回退到关键词分类器
    fallbackToLegacyClassifier(message, memberId, displayName, deps);
    return;
  }

  // 逐项入账
  let primaryCode: ScoringItemCode | null = null;
  for (const item of items) {
    try {
      const outcome = deps.ingestor.ingest({
        memberId,
        itemCode: item.code,
        scoreDelta: item.score,
        sourceRef: `llm:${message.messageId}:${item.code}`,
        payloadText: message.rawText.slice(0, 500),
      });
      if (outcome.accepted && !primaryCode) {
        primaryCode = item.code;
      }
      console.log(
        `[SemanticScoring] Ingest ${item.code}: accepted=${outcome.accepted}`,
      );
    } catch (err) {
      console.error(`[SemanticScoring] Ingest error for ${item.code}:`, err);
    }
  }

  // 发送确认回复
  if (primaryCode && deps.autoReply && message.chatId) {
    await sendConfirmReply(deps.autoReply, {
      chatId: message.chatId,
      memberId: message.memberId,
      memberName: displayName,
      itemCode: primaryCode,
    });
  }
}

/**
 * 降级到旧关键词分类器（LLM 调用失败时使用）
 */
function fallbackToLegacyClassifier(
  message: NormalizedFeishuMessage,
  memberId: string,
  _displayName: string,
  deps: MessageCommandDeps,
): void {
  const results = classifyMessage(message);
  if (results.length === 0 || !deps.ingestor) return;

  for (const result of results) {
    if (result.itemCode === "K1") continue; // K1 already ingested
    try {
      deps.ingestor.ingest({
        memberId,
        itemCode: result.itemCode,
        scoreDelta: 0,
        sourceRef: `fallback:${message.messageId}:${result.itemCode}`,
        payloadText: message.rawText.slice(0, 500),
      });
    } catch (err) {
      console.error(`[Fallback] Ingest error for ${result.itemCode}:`, err);
    }
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

// ============================================================================
// 战绩天梯榜 — any member sends "看板"/"排行" → bot sends link card
// ============================================================================

async function handleDashboardPinTrigger(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps,
): Promise<void> {
  if (!message.chatId) return;

  const pinDeps = deps.dashboardPin;
  if (!pinDeps) {
    await deps.feishuClient.sendTextMessage({
      receiveId: message.chatId,
      receiveIdType: "chat_id",
      text: "⚠️ 天梯榜功能未配置",
    });
    return;
  }

  try {
    const state: DashboardPinState = {
      dashboardUrl: pinDeps.dashboardUrl,
    };

    const cardJson = buildDashboardPinCard(state);
    const result = await deps.feishuClient.sendCardMessage({
      chatId: message.chatId,
      cardJson: cardJson as unknown as Record<string, unknown>,
    });

    console.log(`[DashboardPin] Card sent: messageId=${result.messageId}`);

    // 尝试置顶卡片消息
    if (result.messageId && deps.feishuClient.pinMessage) {
      try {
        await deps.feishuClient.pinMessage({
          chatId: message.chatId,
          messageId: result.messageId,
        });
        console.log(`[DashboardPin] Message pinned: ${result.messageId}`);
      } catch (pinErr) {
        console.warn("[DashboardPin] Pin failed:", pinErr);
      }
    }
  } catch (err) {
    console.error("[DashboardPin] Error:", err);
    await deps.feishuClient.sendTextMessage({
      receiveId: message.chatId,
      receiveIdType: "chat_id",
      text: "⚠️ 天梯榜发送失败，请稍后重试",
    });
  }
}

// ============================================================================
// 手动调分 — operator/trainer sends "调分" → bot sends adjust card
// ============================================================================

async function handleManualAdjustTrigger(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps,
): Promise<void> {
  const member = deps.cardDeps.repo.findMemberByOpenId(message.memberId);
  if (!member || (member.roleType !== "operator" && member.roleType !== "trainer")) {
    console.log("[ManualAdjust] Denied: not operator/trainer");
    return;
  }
  if (!message.chatId) return;

  const provider = deps.memberListProvider;
  if (!provider) {
    await deps.feishuClient.sendTextMessage({
      receiveId: message.chatId,
      receiveIdType: "chat_id",
      text: "⚠️ 调分功能未配置",
    });
    return;
  }

  try {
    const allMembers = provider.listAllMembers();
    const state: ManualAdjustState = {
      members: allMembers.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        roleType: m.roleType as "student" | "operator" | "trainer" | "observer",
        isParticipant: m.isParticipant,
        isExcludedFromBoard: m.isExcludedFromBoard,
        currentLevel: m.currentLevel,
      })),
    };

    const cardJson = buildManualAdjustCard(state);
    await deps.feishuClient.sendCardMessage({
      chatId: message.chatId,
      cardJson: cardJson as unknown as Record<string, unknown>,
    });
    console.log(`[ManualAdjust] Card sent, members=${state.members.length}`);
  } catch (err) {
    console.error("[ManualAdjust] Error:", err);
    await deps.feishuClient.sendTextMessage({
      receiveId: message.chatId,
      receiveIdType: "chat_id",
      text: "⚠️ 调分卡片发送失败",
    });
  }
}

// ============================================================================
// 成员管理 — operator/trainer sends "成员" → bot sends mgmt card
// ============================================================================

async function handleMemberMgmtTrigger(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps,
): Promise<void> {
  const member = deps.cardDeps.repo.findMemberByOpenId(message.memberId);
  if (!member || (member.roleType !== "operator" && member.roleType !== "trainer")) {
    console.log("[MemberMgmt] Denied: not operator/trainer");
    return;
  }
  if (!message.chatId) return;

  const provider = deps.memberListProvider;
  if (!provider) {
    await deps.feishuClient.sendTextMessage({
      receiveId: message.chatId,
      receiveIdType: "chat_id",
      text: "⚠️ 成员管理功能未配置",
    });
    return;
  }

  try {
    const allMembers = provider.listAllMembers();
    const state: MemberMgmtState = {
      members: allMembers.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        roleType: m.roleType as "student" | "operator" | "trainer" | "observer",
        isParticipant: m.isParticipant,
        isExcludedFromBoard: m.isExcludedFromBoard,
        currentLevel: m.currentLevel,
      })),
    };

    const cardJson = buildMemberMgmtCard(state);
    await deps.feishuClient.sendCardMessage({
      chatId: message.chatId,
      cardJson: cardJson as unknown as Record<string, unknown>,
    });
    console.log(`[MemberMgmt] Card sent, members=${state.members.length}`);
  } catch (err) {
    console.error("[MemberMgmt] Error:", err);
    await deps.feishuClient.sendTextMessage({
      receiveId: message.chatId,
      receiveIdType: "chat_id",
      text: "⚠️ 成员管理卡片发送失败",
    });
  }
}

// ============================================================================
// ChatBot @ 问答：学员/管理员 @Bot 提问 → LLM 回答
// ============================================================================

/**
 * 已处理的 messageId 去重缓存（解决飞书 WS 同进程内重推事件问题）
 */
const processedChatBotMessageIds = new Map<string, number>();
const MESSAGE_DEDUP_TTL_MS = 10 * 60 * 1000;
const MAX_DEDUP_CACHE_SIZE = 500;

/**
 * 消息时效性窗口：超过此时间的 @Bot 消息不回复
 * 防御"僵尸消息"场景：飞书 WS 在服务重启后会重推未 ACK 的历史事件，
 * 导致几小时前的 @Bot 消息被重新回复到原群。
 */
const MESSAGE_STALENESS_THRESHOLD_MS = 3 * 60 * 1000;

function isAlreadyProcessed(messageId: string): boolean {
  const now = Date.now();
  const ts = processedChatBotMessageIds.get(messageId);
  if (ts !== undefined && now - ts < MESSAGE_DEDUP_TTL_MS) {
    return true;
  }
  // 记录此次处理
  processedChatBotMessageIds.set(messageId, now);

  // 定期清理过期条目
  if (processedChatBotMessageIds.size > MAX_DEDUP_CACHE_SIZE) {
    for (const [id, t] of processedChatBotMessageIds) {
      if (now - t > MESSAGE_DEDUP_TTL_MS) {
        processedChatBotMessageIds.delete(id);
      }
    }
  }
  return false;
}

/**
 * 判断消息是否过期（超过时效性窗口）。
 * eventTime 来自飞书事件 create_time，代表消息在飞书端的创建时间。
 */
function isMessageStale(eventTime: string): boolean {
  const eventMs = new Date(eventTime).getTime();
  if (!Number.isFinite(eventMs)) return false;
  const ageMs = Date.now() - eventMs;
  return ageMs > MESSAGE_STALENESS_THRESHOLD_MS;
}

/**
 * Fire-and-forget 处理：handler 立即返回，LLM 调用异步执行。
 * 这样即使 LLM 耗时 15-30s，WS 事件也不会被飞书视作"未处理"而重推。
 */
function handleChatBotMention(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps,
): void {
  if (!deps.chatBot || !message.chatId) return;

  // 时效性检查：跳过过期消息（防止重启后飞书 WS 重推历史 @Bot 事件）
  if (isMessageStale(message.eventTime)) {
    console.log(
      `[ChatBot] Stale messageId=${message.messageId} eventTime=${message.eventTime}, skipping (likely WS reconnect replay)`,
    );
    return;
  }

  // 幂等去重：防止同进程内飞书 WS 重推
  if (isAlreadyProcessed(message.messageId)) {
    console.log(
      `[ChatBot] Duplicate messageId=${message.messageId}, skipping`,
    );
    return;
  }

  // 后台异步处理，不阻塞 WS 回调
  void (async () => {
    try {
      const result = await deps.chatBot!.engine.reply({
        chatId: message.chatId!,
        openId: message.memberId,
        messageId: message.messageId,
        cleanedText: message.cleanedText,
      });

      console.log(
        `[ChatBot] reply chatId=${message.chatId} messageId=${message.messageId} to ${message.memberId}: used=${result.used}, latency=${result.latencyMs}ms`,
      );

      await deps.feishuClient.sendTextMessage({
        receiveId: message.chatId!,
        receiveIdType: "chat_id",
        text: result.replyText,
      });
    } catch (err) {
      console.error("[ChatBot] unexpected error:", err);
    }
  })();
}
