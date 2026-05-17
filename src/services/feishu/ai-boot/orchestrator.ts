import { createHash } from "node:crypto";

import type {
  AiBootEventRecord,
  AiBootEventType,
  AiBootScoreEventRecord,
} from "../../../domain/v3/ai-boot-types.js";
import { parseScoringDecision, type ScoringDecision } from "../../../domain/v3/scoring-decision.js";
import { AI_BOOT_RULESET_VERSION } from "../../../domain/v3/scoring-rules.js";
import type { SqliteRepository } from "../../../storage/sqlite-repository.js";
import type { FeishuApiClient } from "../client.js";
import type { MemberLite } from "../cards/types.js";
import type { NormalizedFeishuMessage } from "../normalize-message.js";
import type { AiBootConfig } from "./config.js";
import { extractEvidence, type EvidenceBundle } from "./content-extractor.js";
import { runDeterministicGuards, type GuardOutcome } from "./deterministic-guards.js";
import {
  AI_BOOT_PROMPT_VERSION,
  decideWithLlm,
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
    | "sumApprovedAiBootScore"
    | "insertAiBootNotificationEvent"
    | "countAiBootNotificationEventsForMember"
    | "countAiBootNotificationEventsForChat"
    | "findRecentAiBootNotificationByTopicHash"
    | "findAiBootNotificationEventByScoreEventId"
  >;
  campId: string;
  chatId?: string;
  memberResolver: {
    findMemberByOpenId(openId: string): MemberLite | null;
  };
  llmClient?: AiBootLlmClient;
  botOpenId?: string;
  feishuClient: Pick<FeishuApiClient, "getMessageFile" | "sendTextMessage">;
  config: AiBootConfig;
  now: () => string;
  uuid: () => string;
}

export interface AiBootOrchestrator {
  handleMessage(message: NormalizedFeishuMessage): Promise<void>;
}

export function createAiBootOrchestrator(
  deps: AiBootOrchestratorDeps,
): AiBootOrchestrator {
  const notificationState = createNotificationState();

  return {
    async handleMessage(message: NormalizedFeishuMessage): Promise<void> {
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

      const member = deps.memberResolver.findMemberByOpenId(message.memberId);
      if (!member) {
        return;
      }

      let evidence = event
        ? parseEvidenceBundle(event.evidenceJson)
        : undefined;
      if (!evidence) {
        evidence = await extractEvidence(message, { feishuClient: deps.feishuClient });
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

      const decision = guardOutcome.kind === "continue"
        ? enforcePostLlmGuards(
            await decideContribution({ deps, evidence, member, message }),
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

      const scoreEvent = buildScoreEvent({
        id: deps.uuid(),
        campId: deps.campId,
        eventId: event.id,
        memberId: member.id,
        decision,
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

      if (deps.config.engineMode !== "v3_live") {
        return;
      }

      if (!deps.config.allowGroupPraise || !message.chatId) {
        return;
      }

      const notification = decideNotification({
        decision,
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
        decision,
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
    },
  };
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
  message: NormalizedFeishuMessage;
}): Promise<ScoringDecision> {
  const { deps, evidence, member, message } = input;

  if (!deps.llmClient) {
    return parseScoringDecision({
      status: "review_required",
      category: "formal_task",
      scoreDelta: 1,
      confidence: "low",
      notifyPolicy: "silent",
      reason: "LLM scoring client is not configured.",
      evidence: `Scoring requires operator review for content hash ${evidence.contentHash}.`,
      badges: ["llm_missing"],
    });
  }

  try {
    return await decideWithLlm(deps.llmClient, {
      evidence,
      memberName: member.displayName,
      imageDataUrl: await buildVisionImageDataUrl({ deps, message, evidence }),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return parseScoringDecision({
      status: "review_required",
      category: "formal_task",
      scoreDelta: 1,
      confidence: "low",
      notifyPolicy: "silent",
      reason: `LLM scoring failed; operator review required: ${reason.slice(0, 160)}`,
      evidence: summarizeEvidence(evidence),
      badges: ["llm_error"],
    });
  }
}

async function buildVisionImageDataUrl(input: {
  deps: AiBootOrchestratorDeps;
  message: NormalizedFeishuMessage;
  evidence: EvidenceBundle;
}): Promise<string | undefined> {
  if (!input.deps.llmClient || !("visionModel" in input.deps.llmClient)) {
    return undefined;
  }
  if (!input.message.fileKey) {
    return undefined;
  }
  if (!input.evidence.attachments.some((attachment) => attachment.type === "image")) {
    return undefined;
  }

  try {
    const file = await input.deps.feishuClient.getMessageFile({
      messageId: input.message.messageId,
      fileKey: input.message.fileKey,
      resourceType: "image",
    });
    const mimeType = file.mimeType || "image/png";
    return `data:${mimeType};base64,${file.bytes.toString("base64")}`;
  } catch {
    return undefined;
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
      category: "formal_task",
      scoreDelta: 1,
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
    reviewNote: null,
    decidedAt: input.now,
  };
}

function resolveUsedModelName(
  llmClient: AiBootLlmClient | undefined,
  evidence: EvidenceBundle,
): string | undefined {
  if (!llmClient) {
    return undefined;
  }
  const hasImage = evidence.attachments.some((attachment) => attachment.type === "image");
  if (hasImage && llmClient.visionModel) {
    return llmClient.visionModel;
  }
  return llmClient.model;
}
