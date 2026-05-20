import { createHash } from "node:crypto";

import type {
  AiBootEventRecord,
  AiBootEventType,
  AiBootScoreEventRecord,
} from "../../../domain/v3/ai-boot-types.js";
import { applyV3CategoryPeriodCap } from "../../../domain/v3/scoring-caps.js";
import { parseScoringDecision, type ScoringDecision } from "../../../domain/v3/scoring-decision.js";
import { AI_BOOT_RULESET_VERSION } from "../../../domain/v3/scoring-rules.js";
import type { SqliteRepository } from "../../../storage/sqlite-repository.js";
import type { FeishuApiClient } from "../client.js";
import type { MemberLite } from "../cards/types.js";
import { buildReviewQueueCard } from "../cards/templates/review-queue-v1.js";
import {
  formatReviewQueueExcerpt,
  formatReviewQueueItemCode,
  formatReviewQueueReason,
} from "../cards/review-queue-display.js";
import type { NormalizedFeishuMessage } from "../normalize-message.js";
import type { AiBootConfig } from "./config.js";
import { extractEvidence, type EvidenceBundle } from "./content-extractor.js";
import { runDeterministicGuards, type GuardOutcome } from "./deterministic-guards.js";
import {
  createAiBootImageUnderstandingService,
  hasImageEvidence,
  isImageAttachment,
  type AiBootImageUnderstandingService,
} from "./image-understanding.js";
import {
  AI_BOOT_PROMPT_VERSION,
  decideWithLlm,
  fallbackDecisionForScoringFailure,
  type AiBootLlmClient,
} from "./llm-decision-engine.js";
import {
  buildPraiseText,
  createNotificationState,
  decideNotification,
} from "./notification-orchestrator.js";

const ENGINE_VERSION = "ai-boot-v3.0.0";
const ROLLING_CHAT_WINDOW_MS = 60 * 60 * 1_000;
const TOPIC_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_STUDENT_DAILY_PRAISE = 3;
const MAX_CHAT_HOURLY_PRAISE = 5;

export interface AiBootOrchestratorDeps {
  repo: Pick<
    SqliteRepository,
    | "insertAiBootEvent"
    | "findAiBootEventByMessageId"
    | "insertAiBootScoreEvent"
    | "findAiBootScoreEventByEventId"
    | "findAiBootEventByContentHash"
    | "findApprovedAiBootScoreEventByContentHash"
    | "countApprovedAiBootScoreEvents"
    | "sumApprovedAiBootScoreByCategory"
    | "sumApprovedAiBootScore"
    | "findActivePeriod"
    | "getMember"
    | "listAiBootReviewQueue"
    | "countAiBootReviewQueue"
    | "insertAiBootNotificationEvent"
    | "countAiBootNotificationEventsForMember"
    | "countAiBootNotificationEventsForChat"
    | "findRecentAiBootNotificationByTopicHash"
    | "findAiBootNotificationEventByScoreEventId"
    | "findAiBootImageUnderstandingByContentHash"
    | "upsertAiBootImageUnderstanding"
  > & {
    listAiBootImageOnlyEventsWithoutScore?(input: {
      campId: string;
      limit: number;
    }): AiBootEventRecord[];
  };
  campId: string;
  chatId?: string;
  memberResolver: {
    findMemberByOpenId(openId: string): MemberLite | null;
  };
  llmClient?: AiBootLlmClient;
  botOpenId?: string;
  feishuClient: Pick<FeishuApiClient, "getMessageFile" | "sendTextMessage" | "sendCardMessage">;
  reviewQueueChatId?: string;
  imageUnderstandingService?: AiBootImageUnderstandingService;
  recoverImageOnlyOnStartup?: boolean;
  afterApprovedScore?: (scoreEvent: AiBootScoreEventRecord) => void | Promise<void>;
  config: AiBootConfig;
  now: () => string;
  uuid: () => string;
}

export interface AiBootOrchestrator {
  handleMessage(message: NormalizedFeishuMessage): Promise<void>;
  drainPendingWork(): Promise<void>;
}

export function createAiBootOrchestrator(
  deps: AiBootOrchestratorDeps,
): AiBootOrchestrator {
  const notificationState = createNotificationState();
  const pendingWork = new Set<Promise<void>>();
  const imageUnderstandingService = deps.imageUnderstandingService
    ?? createAiBootImageUnderstandingService({
      repo: deps.repo,
      feishuClient: deps.feishuClient,
      llmClient: deps.llmClient,
      now: deps.now,
    });

  async function handleMessage(
    message: NormalizedFeishuMessage,
    recoveredMember?: MemberLite,
  ): Promise<void> {
      if (message.chatType !== "group") {
        return;
      }
      if (deps.chatId && message.chatId !== deps.chatId) {
        return;
      }

      let event = deps.repo.findAiBootEventByMessageId(
        deps.campId,
        message.messageId,
      );

      if (event && deps.repo.findAiBootScoreEventByEventId(event.id)) {
        return;
      }

      const member = recoveredMember ?? deps.memberResolver.findMemberByOpenId(message.memberId);
      if (!member) {
        return;
      }

      let evidence = event
        ? parseEvidenceBundle(event.evidenceJson)
        : undefined;
      if (!evidence) {
        evidence = await extractEvidence(message, { feishuClient: deps.feishuClient });
      }
      const originalEvidence = evidence;
      const imageOnlyMessage = isImageOnlyMessage(message, originalEvidence);
      const imageUnderstanding = prepareImageUnderstanding({
        service: imageUnderstandingService,
        message,
        evidence,
        enqueue: !imageOnlyMessage,
      });
      if (imageUnderstanding.cached) {
        evidence = appendImageUnderstandingEvidence(evidence, imageUnderstanding.cached);
      }

      if (!event) {
        const proposedEvent = buildEvent({
          id: deps.uuid(),
          campId: deps.campId,
          message,
          member,
          evidence,
          now: deps.now(),
        });
        const inserted = deps.repo.insertAiBootEvent(proposedEvent);
        event = inserted
          ? proposedEvent
          : deps.repo.findAiBootEventByMessageId(deps.campId, message.messageId);

        if (!event) {
          return;
        }

        if (!inserted && deps.repo.findAiBootScoreEventByEventId(event.id)) {
          return;
        }

        if (!inserted) {
          evidence = parseEvidenceBundle(event.evidenceJson) ?? evidence;
        }
      }

      if (imageOnlyMessage && !imageUnderstanding.cached) {
        const task = scheduleImageOnlyUnderstandingReplay({
          service: imageUnderstandingService,
          message,
          evidence: originalEvidence,
          replay: () => handleMessage(message),
          onFailed: async (record) => {
            if (deps.repo.findAiBootScoreEventByEventId(event.id)) {
              return;
            }
            const scoreEvent = buildScoreEvent({
              id: deps.uuid(),
              campId: deps.campId,
              eventId: event.id,
              memberId: member.id,
              decision: decisionFromImageUnderstandingFailure(record, originalEvidence),
              config: deps.config,
              now: deps.now(),
              llmClient: deps.llmClient,
              usedModelName: record.modelName || resolveUsedModelName(deps.llmClient, originalEvidence),
            });
            const insertedScore = deps.repo.insertAiBootScoreEvent(scoreEvent);
            if (insertedScore && scoreEvent.status === "review_required") {
              await pushReviewQueueCard({ deps, scoreEvent, member });
            }
          },
        });
        pendingWork.add(task);
        task.finally(() => pendingWork.delete(task));
        return;
      }

      const duplicateApprovedScore = deps.repo.findApprovedAiBootScoreEventByContentHash(
        deps.campId,
        evidence.contentHash,
        event.id,
      );
      const duplicateEvent = deps.repo.findAiBootEventByContentHash(
        deps.campId,
        evidence.contentHash,
        event.id,
      );
      const dailyWindow = shanghaiBusinessDayBounds(deps.now());
      const guardOutcome = runDeterministicGuards(evidence, {
        roleType: member.roleType,
        isParticipant: member.isParticipant,
        isExcludedFromBoard: member.isExcludedFromBoard,
        mentionedBot: Boolean(deps.botOpenId && message.mentionedBotIds.includes(deps.botOpenId)),
        dailyParticipationAlreadyScored: deps.repo.countApprovedAiBootScoreEvents({
          campId: deps.campId,
          memberId: member.id,
          category: "daily_participation",
          decidedAtFrom: dailyWindow.start,
          decidedAtTo: dailyWindow.end,
        }) > 0,
        // No v3 category-cap policy exists yet; keep this unset deliberately.
        categoryCapRemaining: null,
        duplicateApprovedContent: Boolean(duplicateApprovedScore),
        duplicateContent: Boolean(duplicateEvent && !duplicateApprovedScore),
      });

      if (guardOutcome.kind === "ignore") {
        return;
      }

      const rawDecision = guardOutcome.kind === "continue"
        ? enforcePostLlmGuards(
            await decideContribution({ deps, evidence, member }),
            {
              dailyParticipationAlreadyScored: deps.repo.countApprovedAiBootScoreEvents({
                campId: deps.campId,
                memberId: member.id,
                category: "daily_participation",
                decidedAtFrom: dailyWindow.start,
                decidedAtTo: dailyWindow.end,
              }) > 0,
              evidence,
            },
          )
        : decisionFromGuard(guardOutcome, evidence);
      const decision = imageOnlyMessage
        ? forceSilentImageOnlyDecision(rawDecision, evidence)
        : rawDecision;
      const capped = applyLivePeriodCap({
        deps,
        memberId: member.id,
        decision,
      });

      const scoreEvent = buildScoreEvent({
        id: deps.uuid(),
        campId: deps.campId,
        eventId: event.id,
        memberId: member.id,
        decision: capped.decision,
        reviewNote: capped.reviewNote,
        config: deps.config,
        now: deps.now(),
        llmClient: guardOutcome.kind === "continue" ? deps.llmClient : undefined,
        usedModelName: guardOutcome.kind === "continue"
          ? resolveUsedModelName(deps.llmClient, evidence)
          : undefined,
      });
      const insertedScore = deps.repo.insertAiBootScoreEvent(scoreEvent);
      if (!insertedScore) {
        return;
      }

      if (scoreEvent.status === "approved" && scoreEvent.scoreDelta !== 0) {
        await deps.afterApprovedScore?.(scoreEvent);
      }

      if (scoreEvent.status === "review_required") {
        await pushReviewQueueCard({ deps, scoreEvent, member });
      }

      if (deps.config.engineMode !== "v3_live") {
        return;
      }

      if (!deps.config.allowGroupPraise || !message.chatId) {
        return;
      }

      const notification = decideNotification({
        decision: capped.decision,
        memberId: member.id,
        chatId: message.chatId,
        topicHash: evidence.contentHash,
        now: new Date(deps.now()).getTime(),
        state: notificationState,
      });

      if (!notification.shouldSend) {
        return;
      }

      const praiseText = buildPraiseText({
        memberName: member.displayName,
        decision: capped.decision,
      });
      if (!passesDurableNotificationCaps({
        deps,
        scoreEvent,
        message,
        topicHash: evidence.contentHash,
      })) {
        return;
      }

      await deps.feishuClient.sendTextMessage({
        receiveId: message.chatId,
        receiveIdType: "chat_id",
        text: praiseText,
      });
      deps.repo.insertAiBootNotificationEvent({
        id: `notification:${scoreEvent.id}`,
        scoreEventId: scoreEvent.id,
        campId: scoreEvent.campId,
        memberId: scoreEvent.memberId,
        chatId: message.chatId,
        topicHash: evidence.contentHash,
        notifyPolicy: "group_praise",
        sentAt: scoreEvent.decidedAt,
        textHash: stableTextHash(praiseText),
      });
    }

  if (deps.recoverImageOnlyOnStartup) {
    scheduleImageOnlyRecovery({
      deps,
      handleMessage,
    });
  }

  return {
    handleMessage,
    async drainPendingWork() {
      while (pendingWork.size > 0) {
        await Promise.allSettled([...pendingWork]);
      }
    },
  };
}

async function pushReviewQueueCard(input: {
  deps: AiBootOrchestratorDeps;
  scoreEvent: AiBootScoreEventRecord;
  member: MemberLite;
}): Promise<void> {
  const { deps, scoreEvent, member } = input;
  if (deps.config.engineMode !== "v3_live" || !deps.reviewQueueChatId) {
    return;
  }

  const totalEvents = deps.repo.countAiBootReviewQueue({ campId: deps.campId });
  const events = [scoreEvent].map((row) => {
    const rowMember = deps.repo.getMember(row.memberId);
    return {
      eventId: row.id,
      engine: "v3" as const,
      memberId: row.memberId,
      memberName: rowMember?.displayName || rowMember?.name || member.displayName || "未知学员",
      itemCode: formatReviewQueueItemCode(row.category),
      category: row.category,
      scoreDelta: row.scoreDelta,
      textExcerpt: formatReviewQueueExcerpt({
        evidence: row.evidence,
        reason: row.reason,
      }),
      llmReason: formatReviewQueueReason(row.reason),
      createdAt: row.decidedAt,
    };
  });

  await deps.feishuClient.sendCardMessage({
    chatId: deps.reviewQueueChatId,
    cardJson: buildReviewQueueCard({
      currentPage: 1,
      totalPages: Math.max(1, Math.ceil(Math.max(totalEvents, events.length) / 10)),
      totalEvents: Math.max(totalEvents, events.length),
      events,
    }) as unknown as Record<string, unknown>,
  });
}

function scheduleImageOnlyRecovery(input: {
  deps: AiBootOrchestratorDeps;
  handleMessage: (message: NormalizedFeishuMessage, recoveredMember?: MemberLite) => Promise<void>;
}): void {
  if (!input.deps.repo.listAiBootImageOnlyEventsWithoutScore) {
    return;
  }

  setTimeout(() => {
    void recoverImageOnlyEventsWithoutScore(input).catch((err) => {
      console.warn("[AiBoot] image-only recovery failed", err);
    });
  }, 0);
}

async function recoverImageOnlyEventsWithoutScore(input: {
  deps: AiBootOrchestratorDeps;
  handleMessage: (message: NormalizedFeishuMessage, recoveredMember?: MemberLite) => Promise<void>;
}): Promise<void> {
  const events = input.deps.repo.listAiBootImageOnlyEventsWithoutScore?.({
    campId: input.deps.campId,
    limit: 50,
  }) ?? [];

  for (const event of events) {
    await input.handleMessage(
      messageFromStoredEvent(event),
      memberFromStoredEvent(event),
    );
  }
}

function messageFromStoredEvent(event: AiBootEventRecord): NormalizedFeishuMessage {
  const evidence = parseEvidenceBundle(event.evidenceJson);
  const attachments = evidence?.attachments ?? parseAttachmentJson(event.attachmentJson);
  const fileKey = attachments.find(isImageAttachment)?.fileKey;
  const messageType = event.eventType === "image" ? "image" : event.eventType;

  return {
    messageId: event.sourceMessageId,
    memberId: event.memberId,
    chatId: event.chatId,
    chatType: "group",
    senderType: "user",
    messageType,
    eventTime: event.createdAt,
    rawText: event.rawText,
    parsedTags: [],
    attachmentCount: attachments.length,
    attachmentTypes: attachments.map((attachment) => attachment.type),
    fileKey,
    documentText: "",
    documentParseStatus: "not_applicable",
    eventUrl: `feishu://message/${event.sourceMessageId}`,
    mentionedBotIds: [],
    cleanedText: event.sanitizedText,
  };
}

function memberFromStoredEvent(event: AiBootEventRecord): MemberLite {
  return {
    id: event.memberId,
    displayName: "同学",
    roleType: "student",
    isParticipant: true,
    isExcludedFromBoard: false,
    currentLevel: 1,
  };
}

function parseAttachmentJson(value: string): Array<{ type: string; fileKey?: string; fileName?: string; fileExt?: string }> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && typeof (item as Record<string, unknown>).type === "string",
      )
      .map((item) => ({
        type: String(item.type),
        fileKey: typeof item.fileKey === "string" ? item.fileKey : undefined,
        fileName: typeof item.fileName === "string" ? item.fileName : undefined,
        fileExt: typeof item.fileExt === "string" ? item.fileExt : undefined,
      }));
  } catch {
    return [];
  }
}

function passesDurableNotificationCaps(input: {
  deps: AiBootOrchestratorDeps;
  scoreEvent: AiBootScoreEventRecord;
  message: NormalizedFeishuMessage;
  topicHash: string;
}): boolean {
  const { deps, scoreEvent, message, topicHash } = input;
  if (!message.chatId) {
    return false;
  }

  if (deps.repo.findAiBootNotificationEventByScoreEventId(scoreEvent.id)) {
    return false;
  }

  const decidedAtMs = new Date(scoreEvent.decidedAt).getTime();
  if (!Number.isFinite(decidedAtMs)) {
    return false;
  }

  const dayBounds = shanghaiBusinessDayBounds(scoreEvent.decidedAt);
  if (deps.repo.countAiBootNotificationEventsForMember({
    campId: scoreEvent.campId,
    memberId: scoreEvent.memberId,
    from: dayBounds.start,
    to: dayBounds.end,
  }) >= MAX_STUDENT_DAILY_PRAISE) {
    return false;
  }

  if (deps.repo.countAiBootNotificationEventsForChat({
    campId: scoreEvent.campId,
    chatId: message.chatId,
    from: new Date(decidedAtMs - ROLLING_CHAT_WINDOW_MS).toISOString(),
  }) >= MAX_CHAT_HOURLY_PRAISE) {
    return false;
  }

  if (deps.repo.findRecentAiBootNotificationByTopicHash({
    campId: scoreEvent.campId,
    topicHash,
    since: new Date(decidedAtMs - TOPIC_TTL_MS).toISOString(),
  })) {
    return false;
  }

  return true;
}

function stableTextHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function parseEvidenceBundle(value: string): EvidenceBundle | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<EvidenceBundle>;
    if (
      typeof parsed.sanitizedText === "string" &&
      Array.isArray(parsed.urls) &&
      Array.isArray(parsed.attachments) &&
      typeof parsed.documentText === "string" &&
      typeof parsed.extractionStatus === "string" &&
      typeof parsed.extractionReason === "string" &&
      typeof parsed.contentHash === "string"
    ) {
      return parsed as EvidenceBundle;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function shanghaiBusinessDayBounds(nowIso: string): { start: string; end: string } {
  const offsetMs = 8 * 60 * 60 * 1000;
  const nowMs = new Date(nowIso).getTime();
  const shanghai = new Date(nowMs + offsetMs);
  const dayStartShanghaiMs = Date.UTC(
    shanghai.getUTCFullYear(),
    shanghai.getUTCMonth(),
    shanghai.getUTCDate(),
  );
  const startUtcMs = dayStartShanghaiMs - offsetMs;

  return {
    start: new Date(startUtcMs).toISOString(),
    end: new Date(startUtcMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}

function buildEvent(input: {
  id: string;
  campId: string;
  message: NormalizedFeishuMessage;
  member: MemberLite;
  evidence: EvidenceBundle;
  now: string;
}): AiBootEventRecord {
  const { message, member, evidence } = input;

  return {
    id: input.id,
    campId: input.campId,
    chatId: message.chatId ?? "",
    memberId: member.id,
    sourceMessageId: message.messageId,
    eventType: mapEventType(message),
    rawText: message.rawText,
    sanitizedText: evidence.sanitizedText,
    attachmentJson: JSON.stringify(evidence.attachments),
    evidenceJson: JSON.stringify(evidence),
    contentHash: evidence.contentHash,
    status: "extracted",
    engineVersion: ENGINE_VERSION,
    rulesetVersion: AI_BOOT_RULESET_VERSION,
    createdAt: input.now,
  };
}

function mapEventType(message: NormalizedFeishuMessage): AiBootEventType {
  if (message.mentionedBotIds.length > 0) {
    return "mention";
  }

  switch (message.messageType) {
    case "image":
      return "image";
    case "file":
    case "media":
      return "file";
    case "reaction":
      return "reaction";
    case "interactive":
    case "card":
      return "card";
    case "text":
    case "post":
    default:
      return "text";
  }
}

async function decideContribution(input: {
  deps: AiBootOrchestratorDeps;
  evidence: EvidenceBundle;
  member: MemberLite;
}): Promise<ScoringDecision> {
  const { deps, evidence, member } = input;

  if (!deps.llmClient) {
    return fallbackDecisionForScoringFailure({
      evidence,
      reason: "LLM scoring client is not configured.",
      badges: ["llm_missing"],
    });
  }

  try {
    return await decideWithLlm(deps.llmClient, {
      evidence,
      memberName: member.displayName,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return fallbackDecisionForScoringFailure({
      evidence,
      reason: `LLM scoring failed; operator review required: ${reason.slice(0, 160)}`,
      badges: ["llm_error"],
    });
  }
}

function enforcePostLlmGuards(
  decision: ScoringDecision,
  input: {
    dailyParticipationAlreadyScored: boolean;
    evidence: EvidenceBundle;
  },
): ScoringDecision {
  if (
    decision.status === "approved" &&
    decision.category === "daily_participation" &&
    input.dailyParticipationAlreadyScored
  ) {
    return parseScoringDecision({
      status: "no_score",
      category: "daily_participation",
      scoreDelta: 0,
      confidence: "high",
      notifyPolicy: "silent",
      reason: "daily_participation_cap_used",
      evidence: summarizeEvidence(input.evidence),
      badges: ["post_llm_guard"],
    });
  }

  return decision;
}

function prepareImageUnderstanding(input: {
  service: AiBootImageUnderstandingService;
  message: NormalizedFeishuMessage;
  evidence: EvidenceBundle;
  enqueue: boolean;
}): {
  cached: ReturnType<AiBootImageUnderstandingService["getCachedUnderstanding"]>;
  pending: boolean;
} {
  if (!hasImageEvidence(input.evidence)) {
    return { cached: null, pending: false };
  }

  const cached = input.service.getCachedUnderstanding(input.evidence);
  if (cached) {
    return { cached, pending: false };
  }

  if (input.enqueue) {
    input.service.enqueueUnderstanding({
      message: input.message,
      evidence: input.evidence,
    });
  }
  return { cached: null, pending: true };
}

function scheduleImageOnlyUnderstandingReplay(input: {
  service: AiBootImageUnderstandingService;
  message: NormalizedFeishuMessage;
  evidence: EvidenceBundle;
  replay: () => Promise<void>;
  onFailed?: (record: Awaited<ReturnType<AiBootImageUnderstandingService["understandImage"]>>) => Promise<void>;
}): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      void input.service
      .understandImage({
        message: input.message,
        evidence: input.evidence,
      })
      .then((record) => {
        if (record.status === "succeeded") {
          return input.replay();
        }
        return input.onFailed?.(record);
      })
      .catch((err) => {
        console.warn("[AiBoot] image understanding replay failed", err);
      })
      .finally(() => {
        resolve();
      });
    }, 0);
  });
}

function appendImageUnderstandingEvidence(
  evidence: EvidenceBundle,
  understanding: NonNullable<ReturnType<AiBootImageUnderstandingService["getCachedUnderstanding"]>>,
): EvidenceBundle {
  const imageText = [
    "Image understanding:",
    understanding.caption,
    understanding.scoreHint ? `Score hint: ${understanding.scoreHint}` : "",
  ].filter(Boolean).join("\n");
  return {
    ...evidence,
    documentText: [evidence.documentText, imageText]
      .filter((part) => part.trim().length > 0)
      .join("\n\n"),
    extractionStatus: "parsed",
    extractionReason: `image_understanding:${understanding.modelName}`,
  };
}

function isImageOnlyMessage(
  message: NormalizedFeishuMessage,
  evidence: EvidenceBundle,
): boolean {
  return hasImageEvidence(evidence) &&
    (message.rawText || message.cleanedText || evidence.sanitizedText).trim().length === 0 &&
    evidence.documentText.trim().length === 0 &&
    evidence.urls.length === 0;
}

function forceSilentImageOnlyDecision(
  decision: ScoringDecision,
  evidence: EvidenceBundle,
): ScoringDecision {
  if (decision.notifyPolicy !== "group_praise") {
    return decision;
  }

  return parseScoringDecision({
    ...decision,
    notifyPolicy: "silent",
    reason: decision.reason || "image_only_no_group_praise",
    evidence: decision.evidence || summarizeEvidence(evidence),
    badges: [...decision.badges, "image_only_silent"],
  });
}

function decisionFromImageUnderstandingFailure(
  record: Awaited<ReturnType<AiBootImageUnderstandingService["understandImage"]>>,
  evidence: EvidenceBundle,
): ScoringDecision {
  return parseScoringDecision({
    status: "review_required",
    category: "ai_artifact",
    scoreDelta: 3,
    confidence: "low",
    notifyPolicy: "silent",
    reason: [
      "image_understanding_failed",
      "candidate=ai_artifact_minimum",
      record.errorReason ? `reason=${record.errorReason}` : "",
    ].filter(Boolean).join("; "),
    evidence: summarizeEvidence(evidence),
    badges: ["image_understanding_failed", "image_review_candidate"],
  });
}

function decisionFromGuard(
  outcome: Exclude<GuardOutcome, { kind: "continue" } | { kind: "ignore" }>,
  evidence: EvidenceBundle,
): ScoringDecision {
  if (outcome.kind === "daily_participation") {
    return parseScoringDecision({
      status: "approved",
      category: "daily_participation",
      scoreDelta: 1,
      confidence: "high",
      notifyPolicy: "silent",
      reason: outcome.reason,
      evidence: summarizeEvidence(evidence),
      badges: ["deterministic_guard"],
    });
  }

  if (outcome.kind === "review_required") {
    return parseScoringDecision({
      status: "review_required",
      category: "operator_adjustment",
      scoreDelta: 0,
      confidence: "low",
      notifyPolicy: "silent",
      reason: outcome.reason,
      evidence: summarizeEvidence(evidence),
      badges: ["deterministic_guard"],
    });
  }

  return parseScoringDecision({
    status: "no_score",
    category: "daily_participation",
    scoreDelta: 0,
    confidence: "low",
    notifyPolicy: "silent",
    reason: outcome.reason,
    evidence: summarizeEvidence(evidence),
    badges: ["deterministic_guard"],
  });
}

function summarizeEvidence(evidence: EvidenceBundle): string {
  const text = evidence.sanitizedText || evidence.documentText;
  if (text.trim().length > 0) {
    return text.trim().slice(0, 180);
  }
  if (evidence.attachments.length > 0) {
    return `attachments:${evidence.attachments.map((attachment) => attachment.type).join(",")}`;
  }
  return `content_hash:${evidence.contentHash}`;
}

function buildScoreEvent(input: {
  id: string;
  campId: string;
  eventId: string;
  memberId: string;
  decision: ScoringDecision;
  reviewNote?: string | null;
  config: AiBootConfig;
  now: string;
  llmClient?: AiBootLlmClient;
  usedModelName?: string;
}): AiBootScoreEventRecord {
  const decision = input.config.engineMode === "v3_shadow"
    ? {
        ...input.decision,
        status: "shadow" as const,
        notifyPolicy: "silent" as const,
      }
    : input.decision;

  return {
    id: input.id,
    eventId: input.eventId,
    campId: input.campId,
    memberId: input.memberId,
    category: decision.category,
    scoreDelta: decision.scoreDelta,
    confidence: decision.confidence,
    status: decision.status,
    notifyPolicy: decision.notifyPolicy,
    reason: decision.reason,
    evidence: decision.evidence,
    badgesJson: JSON.stringify(decision.badges),
    modelProvider: input.llmClient?.provider ?? "deterministic",
    modelName: input.usedModelName ?? input.llmClient?.model ?? "guards",
    promptVersion: input.llmClient ? AI_BOOT_PROMPT_VERSION : "",
    reviewedByOpId: null,
    reviewNote: input.reviewNote ?? null,
    decidedAt: input.now,
  };
}

function applyLivePeriodCap(input: {
  deps: AiBootOrchestratorDeps;
  memberId: string;
  decision: ScoringDecision;
}): { decision: ScoringDecision; reviewNote: string | null } {
  if (input.decision.status !== "approved" || input.decision.scoreDelta <= 0) {
    return { decision: input.decision, reviewNote: null };
  }

  const period = input.deps.repo.findActivePeriod(input.deps.campId);
  if (!period) {
    return { decision: input.decision, reviewNote: null };
  }

  const approvedCategoryScore = input.deps.repo.sumApprovedAiBootScoreByCategory({
    campId: input.deps.campId,
    memberId: input.memberId,
    category: input.decision.category,
    decidedAtFrom: period.startedAt,
    decidedAtTo: period.endedAt ?? "9999-12-31T23:59:59.999Z",
  });
  const capped = applyV3CategoryPeriodCap({
    category: input.decision.category,
    requestedScoreDelta: input.decision.scoreDelta,
    approvedCategoryScore,
  });

  if (!capped.capped) {
    return { decision: input.decision, reviewNote: null };
  }

  const reviewNote = capped.status === "no_score"
    ? `v3_period_cap_reached: category=${input.decision.category}; period=${period.id}; approved=${approvedCategoryScore}; requested=${input.decision.scoreDelta}`
    : `v3_period_cap_applied: category=${input.decision.category}; period=${period.id}; approved=${approvedCategoryScore}; requested=${input.decision.scoreDelta}; applied=${capped.scoreDelta}`;

  return {
    decision: {
      ...input.decision,
      status: capped.status,
      scoreDelta: capped.scoreDelta,
      notifyPolicy: capped.status === "no_score" ? "silent" : input.decision.notifyPolicy,
      reason: capped.status === "no_score"
        ? `${input.decision.reason}；本周期该类别得分已达上限。`
        : input.decision.reason,
      badges: capped.status === "no_score"
        ? [...new Set([...input.decision.badges, "period_cap_reached"])]
        : [...new Set([...input.decision.badges, "period_cap_applied"])],
    },
    reviewNote,
  };
}

function resolveUsedModelName(
  llmClient: AiBootLlmClient | undefined,
  _evidence: EvidenceBundle,
): string | undefined {
  if (!llmClient) {
    return undefined;
  }
  return llmClient.model;
}
