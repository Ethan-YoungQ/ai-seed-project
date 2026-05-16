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

const DEFAULT_CAMP_ID = "default";
const ENGINE_VERSION = "ai-boot-v3.0.0";

export interface AiBootOrchestratorDeps {
  repo: Pick<
    SqliteRepository,
    | "insertAiBootEvent"
    | "findAiBootEventByMessageId"
    | "insertAiBootScoreEvent"
    | "sumApprovedAiBootScore"
  >;
  memberResolver: {
    findMemberByOpenId(openId: string): MemberLite | null;
  };
  llmClient?: AiBootLlmClient;
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

      const existingEvent = deps.repo.findAiBootEventByMessageId(
        DEFAULT_CAMP_ID,
        message.messageId,
      );
      if (existingEvent) {
        return;
      }

      const member = deps.memberResolver.findMemberByOpenId(message.memberId);
      if (!member) {
        return;
      }

      const evidence = await extractEvidence(message, { feishuClient: deps.feishuClient });
      const event = buildEvent({
        id: deps.uuid(),
        message,
        member,
        evidence,
        now: deps.now(),
      });
      deps.repo.insertAiBootEvent(event);

      const guardOutcome = runDeterministicGuards(evidence, {
        roleType: member.roleType,
        isParticipant: member.isParticipant,
        isExcludedFromBoard: member.isExcludedFromBoard,
        mentionedBot: message.mentionedBotIds.length > 0,
        dailyParticipationAlreadyScored: false,
        categoryCapRemaining: null,
        duplicateApprovedContent: false,
      });

      if (guardOutcome.kind === "ignore") {
        return;
      }

      const decision = guardOutcome.kind === "continue"
        ? await decideContribution({ deps, evidence, member })
        : decisionFromGuard(guardOutcome, evidence);

      const scoreEvent = buildScoreEvent({
        id: deps.uuid(),
        eventId: event.id,
        memberId: member.id,
        decision,
        config: deps.config,
        now: deps.now(),
        llmClient: guardOutcome.kind === "continue" ? deps.llmClient : undefined,
      });
      deps.repo.insertAiBootScoreEvent(scoreEvent);

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

      await deps.feishuClient.sendTextMessage({
        receiveId: message.chatId,
        receiveIdType: "chat_id",
        text: buildPraiseText({
          memberName: member.displayName,
          decision,
        }),
      });
    },
  };
}

function buildEvent(input: {
  id: string;
  message: NormalizedFeishuMessage;
  member: MemberLite;
  evidence: EvidenceBundle;
  now: string;
}): AiBootEventRecord {
  const { message, member, evidence } = input;

  return {
    id: input.id,
    campId: DEFAULT_CAMP_ID,
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

  return decideWithLlm(deps.llmClient, {
    evidence,
    memberName: member.displayName,
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
  eventId: string;
  memberId: string;
  decision: ScoringDecision;
  config: AiBootConfig;
  now: string;
  llmClient?: AiBootLlmClient;
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
    campId: DEFAULT_CAMP_ID,
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
    modelName: input.llmClient?.model ?? "guards",
    promptVersion: input.llmClient ? AI_BOOT_PROMPT_VERSION : "",
    reviewedByOpId: null,
    reviewNote: null,
    decidedAt: input.now,
  };
}
