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
import { buildReviewQueueCard } from "./cards/templates/review-queue-v1.js";
import { buildManualAdjustCard, type ManualAdjustState } from "./cards/templates/manual-adjust-v1.js";
import { buildMemberMgmtCard, type MemberMgmtState } from "./cards/templates/member-mgmt-v1.js";
import type { ChatEngine } from "./chat-bot/chat-engine.js";
import {
  defaultRecentChatContextProvider,
  createLocalDocumentTextExtractor,
  type DocumentTextExtractor,
  type RecentChatContextProvider,
} from "./chat-bot/recent-context.js";
import { classifyMessage, type ClassificationResult } from "./message-classifier.js";
import {
  needsSemanticScoring,
  filterScorableItems,
  buildUnifiedPrompt,
  type SemanticScoreItem,
} from "./semantic-classifier.js";
import type { ChatMessage, LlmChatClient, LlmScoringClient } from "../v2/llm-scoring-client.js";
import type { AutoReplyDeps } from "./auto-reply.js";
import type { ScoringItemCode } from "../../domain/v2/scoring-items-config.js";
import { SCORING_ITEMS } from "../../domain/v2/scoring-items-config.js";
import { buildPraisePrompt } from "./chat-bot/persona.js";
import type { AiBootConfig } from "./ai-boot/config.js";
import type { AiBootOrchestrator } from "./ai-boot/orchestrator.js";
import { classifyOperationsIntent } from "./operations-router.js";

// ============================================================================
// Keyword definitions
// ============================================================================

/** Keywords that trigger the admin panel card */
const ADMIN_PANEL_KEYWORDS = ["管理", "管理面板", "控制面板"];
const REVIEW_QUEUE_KEYWORDS = ["审核", "审核队列", "待审核", "复核", "复核队列"];
const QUIZ_KEYWORDS = ["测验", "随堂测验", "考试"];
const PEER_REVIEW_KEYWORDS = ["互评", "互评投票", "投票"];
const DASHBOARD_KEYWORDS = ["看板", "排行", "排行榜", "成长看板", "天梯榜"];
const MANUAL_ADJUST_KEYWORDS = ["调分", "手动调分"];
const MEMBER_MGMT_KEYWORDS = ["成员", "成员管理"];
const REVIEW_QUEUE_PAGE_SIZE = 10;

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
    contextProvider?: RecentChatContextProvider;
  };
  /** 语义评分配置（可选，未配置则使用旧关键词分类器） */
  semanticScoring?: {
    enabled: boolean;
    llmClient: LlmScoringClient;
  };
  /** 文档文本提取器（可选，默认使用本地 pdf-parse + mammoth） */
  documentExtractor?: DocumentTextExtractor;
  /** AI Boot v3 scoring config. Legacy mode keeps the v2 auto-capture path. */
  aiBootConfig?: AiBootConfig;
  /** AI Boot v3 orchestrator for shadow/live scoring modes. */
  aiBootOrchestrator?: Pick<AiBootOrchestrator, "handleMessage">;
}

export function createMessageCommandHandler(deps: MessageCommandDeps) {
  return async (message: NormalizedFeishuMessage): Promise<void> => {
    console.log(`[MsgHandler] onMessage: chatType=${message.chatType}, msgType=${message.messageType}, text="${message.rawText.slice(0, 50)}", member=${message.memberId}`);

    // Only process group chat messages (not DMs)
    if (message.chatType !== "group") return;

    const isChatBotMention = Boolean(
      deps.chatBot &&
      message.mentionedBotIds.includes(deps.chatBot.botOpenId)
    );

    const operationsIntent = classifyOperationsIntent(message, {
      botOpenId: deps.chatBot?.botOpenId,
    });

    // Trainer/admin keyword triggers: text OR post messages.
    // These must run before @Bot chat; otherwise "@Bot 管理/审核" is consumed
    // as a generic question and never sends the operational card.
    if (message.messageType === "text" || message.messageType === "post") {
      const text = cleanCommandText(message.cleanedText || message.rawText);
      console.log(`[MsgHandler] cmd match: raw="${message.rawText.slice(0, 80)}" → cleaned="${text}"`);

      const learnerQuestion = operationsIntent.kind === "learner_qa";
      if (!learnerQuestion && REVIEW_QUEUE_KEYWORDS.some((kw) => text.includes(kw))) {
        console.log(`[MsgHandler] → REVIEW_QUEUE`);
        await handleReviewQueueTrigger(message, deps);
        return;
      }
      if (!learnerQuestion && QUIZ_KEYWORDS.some((kw) => text.includes(kw))) {
        console.log(`[MsgHandler] → QUIZ`);
        await handleQuizTrigger(message, deps);
        return;
      }
      if (!learnerQuestion && PEER_REVIEW_KEYWORDS.some((kw) => text.includes(kw))) {
        console.log(`[MsgHandler] → PEER_REVIEW`);
        await handlePeerReviewTrigger(message, deps);
        return;
      }
      // 排行榜/天梯榜必须 @Bot 触发，不走普通关键词
      if (!learnerQuestion && MANUAL_ADJUST_KEYWORDS.some((kw) => text.includes(kw))) {
        console.log(`[MsgHandler] → MANUAL_ADJUST`);
        await handleManualAdjustTrigger(message, deps);
        return;
      }
      if (!learnerQuestion && MEMBER_MGMT_KEYWORDS.some((kw) => text.includes(kw))) {
        console.log(`[MsgHandler] → MEMBER_MGMT`);
        await handleMemberMgmtTrigger(message, deps);
        return;
      }
      if (!learnerQuestion && ADMIN_PANEL_KEYWORDS.some((kw) => text.includes(kw))) {
        console.log(`[MsgHandler] → ADMIN_PANEL`);
        await handleAdminPanelTrigger(message, deps);
        return;
      }
      if (isChatBotMention && DASHBOARD_KEYWORDS.some((kw) => text.includes(kw))) {
        console.log(`[MsgHandler] → DASHBOARD_PIN (via @Bot)`);
        await handleDashboardPinTrigger(message, deps);
        return;
      }
    }

    if (operationsIntent.kind === "score_opt_out") {
      if (message.chatId && isChatBotMention) {
        await deps.feishuClient.sendTextMessage({
          receiveId: message.chatId,
          receiveIdType: "chat_id",
          text: buildScoreOptOutReply(undefined),
        });
      }
      return;
    }

    const chatContextProvider = deps.chatBot?.contextProvider ?? defaultRecentChatContextProvider;
    if (deps.chatBot && !isChatBotMention) {
      chatContextProvider.record(message);
    }

    // @Bot chat branch. handleChatBotMention runs fire-and-forget; handler returns
    // immediately so Feishu does not retry slow LLM responses.
    if (isChatBotMention) {
      if (operationsIntent.kind === "score_candidate") {
        await handleAutoCapture(message, deps);
        return;
      }
      handleChatBotMention(message, deps);
      return;
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

  if (deps.aiBootOrchestrator && deps.aiBootConfig?.engineMode === "v3_live") {
    await deps.aiBootOrchestrator.handleMessage(message);
    return;
  }

  if (deps.aiBootOrchestrator && deps.aiBootConfig?.engineMode === "v3_shadow") {
    try {
      await deps.aiBootOrchestrator.handleMessage(message);
    } catch (err) {
      console.error("[AutoCapture] AI Boot v3 shadow sidecar failed:", err);
    }
  }

  // Step 1: K1 签到始终直接给（不需要 LLM）
  ingestK1(message, member.id, deps);

  // Step 2: 判断使用语义评分还是关键词分类器
  const useSemantic = deps.semanticScoring?.enabled;

  if (useSemantic) {
    // --- 语义评分路径（异步 fire-and-forget） ---
    ingestSemanticFastPathItems(message, member.id, deps);
    // No confirm reply for routine submissions — only proactive praise (score >= 3) below
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

    // No confirm reply for routine submissions — only proactive praise (score >= 3) below
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
// 语义评分快速路径 — 非 LLM 结构化项
// ============================================================================

function ingestSemanticFastPathItems(
  message: NormalizedFeishuMessage,
  memberId: string,
  deps: MessageCommandDeps,
): ClassificationResult | null {
  if (!deps.ingestor) return null;

  const results = classifyMessage(message).filter((result) => result.itemCode === "H1");
  let primaryResult: ClassificationResult | null = null;

  for (const result of results) {
    try {
      const outcome = deps.ingestor.ingest({
        memberId,
        itemCode: result.itemCode,
        scoreDelta: 0,
        sourceRef: `msg:${message.messageId}:${result.itemCode}`,
        payloadText: (message.rawText || message.fileName || "").slice(0, 500),
      });
      if (outcome.accepted && !primaryResult) {
        primaryResult = result;
      }
      console.log(
        `[AutoCapture] FastPath ${result.itemCode}: accepted=${outcome.accepted}${outcome.accepted ? "" : `, reason=${(outcome as any).reason}`}`,
      );
    } catch (err) {
      console.error(`[AutoCapture] FastPath ingest error for ${result.itemCode}:`, err);
    }
  }

  return primaryResult;
}

// ============================================================================
// 文档文本提取 — 下载文件并解析正文内容
// ============================================================================

/**
 * Ensure that document text is extracted for file messages that support it.
 * Downloads the file via Feishu API, extracts text with the configured extractor,
 * and writes results to message.documentText / message.documentParseStatus.
 *
 * Returns the best available text for scoring: documentText if extraction
 * succeeded, otherwise rawText.
 */
async function ensureDocumentText(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps,
): Promise<string> {
  if (
    message.documentParseStatus !== "pending" ||
    !message.fileKey ||
    !message.messageId
  ) {
    return message.rawText;
  }

  const extractor = deps.documentExtractor ?? createLocalDocumentTextExtractor();

  try {
    const file = await deps.feishuClient.getMessageFile({
      messageId: message.messageId,
      fileKey: message.fileKey,
      fileName: message.fileName,
    });

    const result = await extractor.extract({
      bytes: file.bytes,
      fileExt: file.fileExt ?? message.fileExt,
      fileName: file.fileName ?? message.fileName,
      mimeType: file.mimeType ?? message.mimeType,
    });

    message.documentParseStatus = result.status;
    message.documentText = result.text;

    if (result.status === "parsed" && result.text) {
      console.log(
        `[DocExtract] Parsed ${message.fileExt ?? "file"}: ${result.text.length} chars`,
      );
      return `${message.rawText}\n\n【文件正文内容】\n${result.text}`;
    }

    console.log(
      `[DocExtract] ${result.status}${result.reason ? `: ${result.reason}` : ""}`,
    );
    return message.rawText;
  } catch (err) {
    message.documentParseStatus = "failed";
    message.documentParseReason =
      err instanceof Error ? err.message : "document_extract_failed";
    console.error(`[DocExtract] Download/extract failed:`, err);
    return message.rawText;
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

  // Extract document text for file messages so the LLM can see the actual content
  const scoreText = await ensureDocumentText(message, deps);
  const promptText = buildUnifiedPrompt(scoreText);

  // Pre-check deterministic structural items that should create scoring tasks
  // even when the semantic classifier misses them.
  const precheckItems = classifyMessage(message)
    .filter((result) => ["H2", "H3", "G2", "S1"].includes(result.itemCode))
    .map((result) => ({
      code: result.itemCode,
      score: SCORING_ITEMS[result.itemCode].defaultScoreDelta,
      reason: result.reason,
    }));

  let items: SemanticScoreItem[];
  try {
    const result = await llmClient.multiScore(promptText, { timeoutMs: 15000 });
    items = filterScorableItems(result.items);
    // Merge LLM items with pre-check items (dedup)
    const llmCodes = new Set(items.map((i) => i.code));
    for (const mi of precheckItems) {
      if (!llmCodes.has(mi.code)) {
        items.push(mi);
      }
    }
    console.log(
      `[SemanticScoring] ${displayName}: ${items.map((i) => `${i.code}(${i.reason})`).join(", ") || "(none)"}`,
    );
  } catch (err) {
    console.error(`[SemanticScoring] LLM failed for ${displayName}, falling back to keyword classifier:`, err);
    // 降级：LLM 失败时回退到关键词分类器
    await fallbackToLegacyClassifier(message, memberId, displayName, deps);
    return;
  }

  // 逐项入账
  let primaryCode: ScoringItemCode | null = null;
  const acceptedItems: SemanticScoreItem[] = [];
  let acceptedScore = 0;
  for (const item of items) {
    try {
      const outcome = deps.ingestor.ingest({
        memberId,
        itemCode: item.code,
        scoreDelta: item.score,
        sourceRef: `llm:${message.messageId}:${item.code}`,
        payloadText: scoreText.slice(0, 500),
      });
      if (outcome.accepted && !primaryCode) {
        primaryCode = item.code;
      }
      if (outcome.accepted) {
        acceptedItems.push(item);
        acceptedScore += item.score;
      }
      console.log(
        `[SemanticScoring] Ingest ${item.code}: accepted=${outcome.accepted}`,
      );
    } catch (err) {
      console.error(`[SemanticScoring] Ingest error for ${item.code}:`, err);
    }
  }

  if (
    acceptedScore >= 3 &&
    await sendProactivePraise({
      deps,
      message,
      displayName,
      totalScore: acceptedScore,
      highlights: buildPraiseHighlights(acceptedItems),
      preferLlm: true,
    })
  ) {
    return;
  }

  // No confirm reply for routine submissions — only proactive praise (score >= 3) above
}

/**
 * 降级到旧关键词分类器（LLM 调用失败时使用）
 */
async function fallbackToLegacyClassifier(
  message: NormalizedFeishuMessage,
  memberId: string,
  displayName: string,
  deps: MessageCommandDeps,
): Promise<void> {
  const results = classifyMessage(message);
  if (results.length === 0 || !deps.ingestor) return;

  // Extract document text for file messages
  const scoreText = await ensureDocumentText(message, deps);

  // Skip LLM-scored items when there's no substantive text:
  // ingesting empty text would create review_required noise that needs
  // manual review. Non-LLM items (e.g. H1/H3/G1) still go through.
  const hasSubstantiveText = scoreText.replace(/\p{Extended_Pictographic}/gu, "").replace(/\s+/g, "").length >= 20;

  // Track total score from classified item defaultScoreDelta values
  let totalScore = 0;
  const scoredResults: ClassificationResult[] = [];

  for (const result of results) {
    if (result.itemCode === "K1") continue; // K1 already ingested
    const cfg = SCORING_ITEMS[result.itemCode];
    // Skip LLM-dependent items when text is too short to evaluate
    if (cfg?.needsLlm && !hasSubstantiveText) {
      console.log(
        `[Fallback] skipped ${result.itemCode} for ${displayName}: no substantive text to score`,
      );
      continue;
    }
    totalScore += cfg?.defaultScoreDelta ?? 0;
    scoredResults.push(result);
    try {
      deps.ingestor.ingest({
        memberId,
        itemCode: result.itemCode,
        scoreDelta: 0,
        sourceRef: `fallback:${message.messageId}:${result.itemCode}`,
        payloadText: scoreText.slice(0, 500),
      });
    } catch (err) {
      console.error(`[Fallback] Ingest error for ${result.itemCode}:`, err);
    }
  }

  // Proactive praise: if total default score >= 3 ("nice" threshold)
  if (totalScore < 3) return;
  if (!deps.autoReply || !message.chatId) return;

  // Dedup: skip if already processed via ChatBot path
  if (isAlreadyProcessed(message.messageId)) {
    console.log(
      `[Fallback] Praise skipped: messageId=${message.messageId} already processed`,
    );
    return;
  }

  // Cooldown: minimum 120s between any two praise messages
  const now = Date.now();
  if (now - lastPraiseAt < PRAISE_COOLDOWN_MS) {
    console.log(
      `[Fallback] Praise skipped: cooldown (${Math.ceil((PRAISE_COOLDOWN_MS - (now - lastPraiseAt)) / 1000)}s remaining)`,
    );
    return;
  }

  // Send praise as a text message (not a reply, since this is the fallback path)
  void (async () => {
    await sendProactivePraise({
      deps,
      message,
      displayName,
      totalScore,
      highlights: buildPraiseHighlights(scoredResults),
      preferLlm: false,
    });
  })();
}

function hasChatCapability(client: LlmScoringClient | undefined): client is LlmScoringClient & LlmChatClient {
  return typeof (client as { chat?: unknown } | undefined)?.chat === "function";
}

function buildPraiseHighlights(
  items: Array<SemanticScoreItem | ClassificationResult>,
): string[] {
  const labels: Record<string, string> = {
    K3: "知识总结",
    K4: "提问质量",
    H1: "作业提交",
    H2: "文件作业",
    H3: "视频学习",
    C1: "AI 工具实战",
    C2: "互动反馈",
    C3: "创意作品",
    S1: "持续打卡",
    S2: "互助答疑",
    G1: "外部资源链接",
    G2: "经验复盘分享",
    G3: "阶段成长",
  };

  const highlights: string[] = [];
  for (const item of items) {
    const code = "code" in item ? item.code : item.itemCode;
    const reason = "reason" in item ? item.reason : "";
    const label = labels[code] ?? code;
    const text = reason && !reason.includes("keyword") ? `${label}:${reason}` : label;
    if (!highlights.includes(text)) highlights.push(text);
  }
  return highlights.slice(0, 4);
}

function inferMessageFocus(rawText: string, highlights: string[]): string {
  if (/肺癌|高危|患者|医疗|药师|慢病/.test(rawText)) return "医疗业务场景";
  if (/prompt|提示词/i.test(rawText)) return "prompt 思路";
  // For messages < 40 chars, keyword-based focus detection is unreliable:
  // casual chat mentioning "AI" (e.g. "AI终于搭理你了") should not be
  // labeled as "AI 实战".
  if (rawText.length >= 40) {
    if (/AI|智能体|RAG|工作流/i.test(rawText)) return "AI 实战";
    if (/复盘|分享|经验/.test(rawText)) return "经验复盘";
  }
  return highlights[0]?.split(":")[0] ?? "这次分享";
}

function stableIndex(seed: string, modulo: number): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % modulo;
}

export function buildFallbackPraiseText(
  displayName: string,
  totalScore: number,
  rawText: string,
  highlights: string[],
  seed: string,
): string {
  const focus = inferMessageFocus(rawText, highlights);
  const templates = [
    `@${displayName} 这份${focus}把关键步骤讲清楚了，别人能顺着复用，${totalScore} 分记录下来。`,
    `@${displayName} 这次${focus}有具体场景也有过程，学习价值比较明确，${totalScore} 分入账。`,
    `@${displayName} 这段${focus}不是只晒结果，还补了思路和判断，${totalScore} 分给到位。`,
    `@${displayName} ${focus}的亮点在于可执行，后面再补一点复盘会更完整，${totalScore} 分。`,
    `@${displayName} 你把${focus}说到了能落地的层面，这种分享对同学有参考价值，${totalScore} 分。`,
    `@${displayName} 这条${focus}信息量够，既有动作也有产出，${totalScore} 分先记上。`,
  ];
  return templates[stableIndex(seed || `${displayName}:${totalScore}:${rawText}`, templates.length)];
}

function normalizePraiseText(text: string, displayName: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.startsWith(`@${displayName}`)) return cleaned;
  return `@${displayName} ${cleaned}`.trim();
}

const BANNED_PRAISE_TERMS = /绝绝子|yyds|天花板|杀疯|封神|拿捏|炸场|卷王|含金量拉满/i;

async function buildLlmPraiseText(input: {
  client: LlmScoringClient & LlmChatClient;
  displayName: string;
  totalScore: number;
  rawText: string;
  highlights: string[];
  documentText?: string;
}): Promise<string | null> {
  let userContent = `学员原消息：${input.rawText.slice(0, 800)}`;
  if (input.documentText) {
    userContent += `\n学员提交的文件内容摘录：${input.documentText.slice(0, 2000)}`;
  }
  userContent += "\n请只输出一条群聊夸赞，45-90 字，避免套话，不要解释。";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildPraisePrompt(input.displayName, input.highlights, input.totalScore),
    },
    {
      role: "user",
      content: userContent,
    },
  ];
  const text = await input.client.chat(messages, {
    timeoutMs: 8000,
    temperature: 0.95,
    maxTokens: 180,
  });
  const normalized = normalizePraiseText(text, input.displayName);
  if (normalized.length > 140) return null;
  if (BANNED_PRAISE_TERMS.test(normalized)) return null;
  return normalized;
}

async function sendProactivePraise(input: {
  deps: MessageCommandDeps;
  message: NormalizedFeishuMessage;
  displayName: string;
  totalScore: number;
  highlights: string[];
  preferLlm: boolean;
}): Promise<boolean> {
  if (!input.deps.autoReply || !input.message.chatId) return false;

  const now = Date.now();
  if (now - lastPraiseAt < PRAISE_COOLDOWN_MS) {
    console.log(
      `[Praise] skipped: cooldown (${Math.ceil((PRAISE_COOLDOWN_MS - (now - lastPraiseAt)) / 1000)}s remaining)`,
    );
    return false;
  }

  // Skip praise for very short messages (trivial chat, not a substantive contribution)
  // Scoring still happens, but the bot doesn't send a group message for low-effort content.
  // For file messages, check the combined document text + raw text length.
  const effectiveText = input.message.documentText || input.message.rawText || "";
  if (effectiveText.trim().length < 20 && input.message.messageType === "text") {
    console.log(`[Praise] skipped: message too short (${effectiveText.trim().length} chars)`);
    return false;
  }

  let praiseText: string | null = null;
  const client = input.deps.semanticScoring?.llmClient;
  if (input.preferLlm && hasChatCapability(client)) {
    try {
      praiseText = await buildLlmPraiseText({
        client,
        displayName: input.displayName,
        totalScore: input.totalScore,
        rawText: input.message.rawText,
        documentText: input.message.documentText || undefined,
        highlights: input.highlights,
      });
    } catch (err) {
      console.error("[Praise] LLM praise failed, using local fallback:", err);
    }
  }

  if (!praiseText) {
    // For short text messages (< 40 chars), skip fallback templates:
    // they tend to mislabel casual chat or non-original content as
    // substantive work (e.g. "AI 实战" for any message mentioning AI).
    // Only LLM-generated praise (which understands context) should fire.
    if (input.message.messageType === "text" && effectiveText.trim().length < 40) {
      console.log(
        `[Praise] skipped: LLM praise failed and text too short (${effectiveText.trim().length} chars) for template fallback`,
      );
      return false;
    }

    praiseText = buildFallbackPraiseText(
      input.displayName,
      input.totalScore,
      input.message.documentText || input.message.rawText,
      input.highlights,
      input.message.messageId,
    );
  }

  try {
    await input.deps.autoReply.sendTextMessage({
      receiveId: input.message.chatId,
      receiveIdType: "chat_id" as any,
      text: praiseText,
    });
    lastPraiseAt = now;
    console.log(
      `[Praise] sent to ${input.displayName}: totalScore=${input.totalScore}`,
    );
    return true;
  } catch (err) {
    console.error("[Praise] Failed to send praise:", err);
    return false;
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
// Review queue trigger
// ============================================================================

async function handleReviewQueueTrigger(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps,
): Promise<void> {
  const member = deps.cardDeps.repo.findMemberByOpenId(message.memberId);
  if (!member || (member.roleType !== "operator" && member.roleType !== "trainer")) {
    console.log("[ReviewQueue] Denied: not operator/trainer");
    return;
  }
  if (!message.chatId) return;

  try {
    const [events, totalEvents] = await Promise.all([
      deps.cardDeps.repo.listReviewRequiredEvents({
        limit: REVIEW_QUEUE_PAGE_SIZE,
        offset: 0,
      }),
      deps.cardDeps.repo.countReviewRequiredEvents(),
    ]);
    const cardJson = buildReviewQueueCard({
      currentPage: 1,
      totalPages: Math.max(1, Math.ceil(totalEvents / REVIEW_QUEUE_PAGE_SIZE)),
      totalEvents,
      events,
    });

    await deps.feishuClient.sendCardMessage({
      chatId: message.chatId,
      cardJson: cardJson as unknown as Record<string, unknown>,
    });
    console.log(`[ReviewQueue] Card sent, total=${totalEvents}`);
  } catch (err) {
    console.error("[ReviewQueue] Error:", err);
    await deps.feishuClient.sendTextMessage({
      receiveId: message.chatId,
      receiveIdType: "chat_id",
      text: "⚠️ 审核队列发送失败，请稍后重试",
    });
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
// Rate limited: at most once per 30 seconds per chat to avoid spam
// ============================================================================

const pinCooldowns = new Map<string, number>();
const PIN_COOLDOWN_MS = 30_000;

async function handleDashboardPinTrigger(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps,
): Promise<void> {
  if (!message.chatId) return;

  // Rate limit: prevent spam from casual chat keywords
  const now = Date.now();
  const lastPin = pinCooldowns.get(message.chatId) ?? 0;
  if (now - lastPin < PIN_COOLDOWN_MS) {
    console.log(
      `[DashboardPin] Rate limited: chatId=${message.chatId}, ` +
      `remaining=${Math.ceil((PIN_COOLDOWN_MS - (now - lastPin)) / 1000)}s`
    );
    return;
  }
  pinCooldowns.set(message.chatId, now);

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

// ============================================================================
// Praise cooldown — prevent excessive praise in fallback path
// ============================================================================

const PRAISE_COOLDOWN_MS = 120 * 1000; // 120 seconds
let lastPraiseAt = 0;

/**
 * 消息时效性窗口：超过此时间的 @Bot 消息不回复
 * 防御"僵尸消息"场景：飞书 WS 在服务重启后会重推未 ACK 的历史事件，
 * 导致几小时前的 @Bot 消息被重新回复到原群。
 */
const MESSAGE_STALENESS_THRESHOLD_MS = 3 * 60 * 1000;
const SCORE_OPT_OUT_RE = /(不\s*(用|要|必)?\s*(加分|计分|评分)|别\s*(加分|计分|评分)|无需\s*(加分|计分|评分)|不算分|别算分|纯瞎聊|撤回加分|撤销加分|取消加分)/;

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

function isScoreOptOutMention(text: string): boolean {
  return SCORE_OPT_OUT_RE.test(text.replace(/\s+/g, ""));
}

function buildScoreOptOutReply(contextBlocks: Array<{ title: string; content: string }> | undefined): string {
  const hasRecentScoreContext = (contextBlocks ?? []).some((block) =>
    /(\d+\s*分|加分|计分|评分|拿得漂亮)/.test(block.content)
  );

  if (hasRecentScoreContext) {
    return "收到，我按“不计分”理解这条纠偏。刚才如果已经触发了自动加分或夸赞，请运营用「调分」撤回对应分数；后续我不会把这句纠偏当作得分内容。";
  }

  return "收到，这条按“不计分/纯聊天”处理。后续我不会把这句纠偏当作得分内容。";
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
      const contextProvider = deps.chatBot!.contextProvider ?? defaultRecentChatContextProvider;
      let contextBlocks;
      try {
        contextBlocks = await contextProvider.resolveMentionContext({
          currentMessage: message,
          feishuClient: deps.feishuClient,
        });
      } catch (contextErr) {
        const reason = contextErr instanceof Error ? contextErr.message : "context_resolution_failed";
        console.error("[ChatBot] context resolution failed:", contextErr);
        contextBlocks = [
          {
            title: "上下文读取状态",
            content: `尝试读取最近上下文失败：${reason}`,
          },
        ];
      }

      if (isScoreOptOutMention(message.cleanedText || message.rawText)) {
        const replyText = buildScoreOptOutReply(contextBlocks);
        await deps.feishuClient.sendTextMessage({
          receiveId: message.chatId!,
          receiveIdType: "chat_id",
          text: replyText,
        });
        console.log(
          `[ChatBot] score opt-out handled chatId=${message.chatId} messageId=${message.messageId}`,
        );
        return;
      }

      const result = await deps.chatBot!.engine.reply({
        chatId: message.chatId!,
        openId: message.memberId,
        messageId: message.messageId,
        cleanedText: message.cleanedText,
        contextBlocks,
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
