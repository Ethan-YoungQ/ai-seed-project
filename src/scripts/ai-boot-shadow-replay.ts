import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnv } from "../config/load-env.js";
import type { MemberProfile } from "../domain/types.js";
import type {
  AiBootDecisionStatus,
  AiBootEventRecord,
  AiBootScoreEventRecord,
} from "../domain/v3/ai-boot-types.js";
import { applyV3CategoryPeriodCap } from "../domain/v3/scoring-caps.js";
import { parseScoringDecision, type ScoringDecision } from "../domain/v3/scoring-decision.js";
import type { EvidenceBundle } from "../services/feishu/ai-boot/content-extractor.js";
import {
  runDeterministicGuards,
  type GuardOutcome,
} from "../services/feishu/ai-boot/deterministic-guards.js";
import {
  decideWithLlm,
  type AiBootLlmClient,
} from "../services/feishu/ai-boot/llm-decision-engine.js";
import { readLlmProviderConfig } from "../services/llm/provider-config.js";
import { OpenAiCompatibleLlmScoringClient } from "../services/v2/llm-scoring-client.js";
import { SqliteRepository } from "../storage/sqlite-repository.js";

const SHADOW_MODEL_PROVIDER = "shadow_harness";
const SHADOW_MODEL_NAME = "deterministic_golden_set";
const SHADOW_PROMPT_VERSION = "ai_boot_shadow_replay_v1";

export interface ShadowReplayOptions {
  repository?: SqliteRepository;
  env?: NodeJS.ProcessEnv;
  databaseUrl?: string;
  campId?: string;
  since?: string;
  limit?: number;
  now?: () => string;
  uuid?: () => string;
  stdout?: (line: string) => void;
  decider?: (event: AiBootEventRecord) => ScoringDecision | Promise<ScoringDecision>;
  llmClient?: AiBootLlmClient;
  allowHeuristic?: boolean;
}

export interface ShadowReplayResult {
  eventsReplayed: number;
  approved: number;
  noScore: number;
  reviewRequired: number;
}

export function isDirectScriptRun(metaUrl: string, argvPath: string | undefined) {
  if (!argvPath) {
    return false;
  }

  return resolve(fileURLToPath(metaUrl)) === resolve(argvPath);
}

export async function runShadowReplay(
  options: ShadowReplayOptions = {}
): Promise<ShadowReplayResult> {
  const env = options.env ?? process.env;
  const ownedRepo = !options.repository;
  const databaseUrl = options.databaseUrl ?? env.DATABASE_URL ?? "./data/app.db";
  const now = options.now ?? (() => new Date().toISOString());
  const uuid = options.uuid ?? randomUUID;
  const stdout = options.stdout ?? ((line: string) => console.log(line));

  let repository: SqliteRepository;
  if (options.repository) {
    repository = options.repository;
  } else {
    mkdirSync(dirname(resolve(databaseUrl)), { recursive: true });
    repository = new SqliteRepository(databaseUrl);
  }

  try {
    const campId = options.campId ?? repository.getDefaultCampId();
    if (!campId) {
      throw new Error("Cannot run shadow replay: no default camp found.");
    }

    const events = repository.listAiBootEventsForReplay({
      campId,
      since: normalizeSince(options.since ?? env.AI_BOOT_SHADOW_REPLAY_SINCE),
      limit: normalizeLimit(options.limit ?? Number(env.AI_BOOT_SHADOW_REPLAY_LIMIT || 100)),
    });
    const result: ShadowReplayResult = {
      eventsReplayed: events.length,
      approved: 0,
      noScore: 0,
      reviewRequired: 0,
    };
    const replayDailyParticipation = new Set<string>();
    const replayCategoryScores = new Map<string, number>();

    for (const event of events) {
      const shadowEventId = buildShadowReplayEventId(event.id);
      const existing = repository.findAiBootScoreEventByEventId(shadowEventId);
      if (existing) {
        countStatus(result, inferReplayStatus(existing));
        if (isShadowDailyParticipationEquivalent(existing)) {
          replayDailyParticipation.add(dailyParticipationReplayKey(event));
        }
        continue;
      }

      const evidence = evidenceFromStoredEvent(event);
      const member = repository.getMember(event.memberId);
      const guardOutcome = runDeterministicGuards(
        evidence,
        buildGuardContext({
          repository,
          event,
          evidence,
          member,
          replayDailyParticipation,
        }),
      );
      const decision = guardOutcome.kind === "continue"
        ? await decideContribution({
            event,
            evidence,
            member,
            decider: options.decider,
            llmClient: options.llmClient,
            allowHeuristic: options.allowHeuristic ?? false,
          })
        : decisionFromGuard(guardOutcome, evidence);
      const normalized = applyReplayPeriodCap({
        repository,
        event,
        decision: parseScoringDecision(decision),
        replayCategoryScores,
      });
      repository.insertAiBootScoreEvent(buildShadowScoreEvent({
        id: uuid(),
        shadowEventId,
        event,
        decision: normalized.decision,
        reviewNote: normalized.reviewNote,
        decidedAt: now(),
      }));
      countStatus(result, normalized.decision.status);
      if (normalized.decision.status === "approved" && normalized.decision.category === "daily_participation") {
        replayDailyParticipation.add(dailyParticipationReplayKey(event));
      }
    }

    stdout(JSON.stringify(result));
    return result;
  } finally {
    if (ownedRepo) {
      repository.close();
    }
  }
}

export function heuristicShadowDecider(event: AiBootEventRecord): ScoringDecision {
  const evidence = summarizeEvidence(event);
  if (hasImageAttachment(event)) {
    return parseScoringDecision({
      status: "approved",
      category: "ai_artifact",
      scoreDelta: 4,
      confidence: "high",
      notifyPolicy: "group_praise",
      reason: "Shadow replay heuristic approved an AI artifact with image evidence.",
      evidence,
      badges: ["shadow_golden_set", "image_artifact"],
    });
  }

  if (hasPracticeReflectionText(event)) {
    return parseScoringDecision({
      status: "approved",
      category: "ai_practice_reflection",
      scoreDelta: 4,
      confidence: "high",
      notifyPolicy: "group_praise",
      reason: "Shadow replay heuristic approved an AI practice reflection.",
      evidence,
      badges: ["shadow_golden_set", "practice_reflection"],
    });
  }

  if (isPureLinkWithoutReason(event)) {
    return parseScoringDecision({
      status: "no_score",
      category: "daily_participation",
      scoreDelta: 0,
      confidence: "low",
      notifyPolicy: "silent",
      reason: "Shadow replay heuristic found only a bare link without contribution rationale.",
      evidence,
      badges: ["shadow_golden_set", "pure_link"],
    });
  }

  return parseScoringDecision({
    status: "no_score",
    category: "daily_participation",
    scoreDelta: 0,
    confidence: "low",
    notifyPolicy: "silent",
    reason: "Shadow replay heuristic found no golden-set scoring signal.",
    evidence,
    badges: ["shadow_golden_set", "no_signal"],
  });
}

function buildShadowReplayEventId(sourceEventId: string): string {
  return `shadow-replay:${sourceEventId}`;
}

async function decideContribution(input: {
  event: AiBootEventRecord;
  evidence: EvidenceBundle;
  member: MemberProfile | undefined;
  decider?: (event: AiBootEventRecord) => ScoringDecision | Promise<ScoringDecision>;
  llmClient?: AiBootLlmClient;
  allowHeuristic: boolean;
}): Promise<ScoringDecision> {
  if (input.decider) {
    return input.decider(input.event);
  }

  if (input.llmClient) {
    return decideWithLlm(input.llmClient, {
      evidence: input.evidence,
      memberName: displayMemberName(input.member, input.event.memberId),
    });
  }

  if (!input.allowHeuristic) {
    return parseScoringDecision({
      status: "review_required",
      category: "formal_task",
      scoreDelta: 1,
      confidence: "low",
      notifyPolicy: "silent",
      reason: "Shadow replay requires an LLM client unless heuristic fallback is explicitly allowed.",
      evidence: `content_hash:${input.evidence.contentHash}`,
      badges: ["llm_missing", "shadow_replay"],
    });
  }

  return heuristicShadowDecider(input.event);
}

function buildShadowScoreEvent(input: {
  id: string;
  shadowEventId: string;
  event: AiBootEventRecord;
  decision: ScoringDecision;
  reviewNote: string | null;
  decidedAt: string;
}): AiBootScoreEventRecord {
  return {
    id: input.id,
    eventId: input.shadowEventId,
    campId: input.event.campId,
    memberId: input.event.memberId,
    category: input.decision.category,
    scoreDelta: input.decision.scoreDelta,
    confidence: input.decision.confidence,
    status: "shadow",
    notifyPolicy: "silent",
    reason: input.decision.reason,
    evidence: input.decision.evidence,
    badgesJson: JSON.stringify([
      ...input.decision.badges,
      `shadow_original_status:${input.decision.status}`,
      `source_event_id:${input.event.id}`,
    ]),
    modelProvider: SHADOW_MODEL_PROVIDER,
    modelName: SHADOW_MODEL_NAME,
    promptVersion: SHADOW_PROMPT_VERSION,
    reviewedByOpId: null,
    reviewNote: input.reviewNote
      ? `source_event_id=${input.event.id}; ${input.reviewNote}`
      : `source_event_id=${input.event.id}`,
    decidedAt: input.decidedAt,
  };
}

function applyReplayPeriodCap(input: {
  repository: SqliteRepository;
  event: AiBootEventRecord;
  decision: ScoringDecision;
  replayCategoryScores: Map<string, number>;
}): { decision: ScoringDecision; reviewNote: string | null } {
  if (input.decision.status !== "approved" || input.decision.scoreDelta <= 0) {
    return { decision: input.decision, reviewNote: null };
  }

  const period = findPeriodForEvent(input.repository, input.event);
  if (!period) {
    return { decision: input.decision, reviewNote: null };
  }

  const key = `${period.id}\u0000${input.event.memberId}\u0000${input.decision.category}`;
  let approvedCategoryScore = input.replayCategoryScores.get(key);
  if (approvedCategoryScore === undefined) {
    approvedCategoryScore = input.repository.sumApprovedAiBootScoreByCategory({
      campId: input.event.campId,
      memberId: input.event.memberId,
      category: input.decision.category,
      decidedAtFrom: period.startedAt,
      decidedAtTo: input.event.createdAt,
    });
  }

  const capped = applyV3CategoryPeriodCap({
    category: input.decision.category,
    requestedScoreDelta: input.decision.scoreDelta,
    approvedCategoryScore,
  });

  if (capped.status === "approved") {
    input.replayCategoryScores.set(key, approvedCategoryScore + capped.scoreDelta);
  } else {
    input.replayCategoryScores.set(key, approvedCategoryScore);
  }

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

function findPeriodForEvent(repository: SqliteRepository, event: AiBootEventRecord) {
  return repository.listPeriods(event.campId).find((period) =>
    event.createdAt >= period.startedAt &&
    (period.endedAt === null || event.createdAt < period.endedAt)
  );
}

function evidenceFromStoredEvent(event: AiBootEventRecord): EvidenceBundle {
  const parsed = parseEvidenceBundle(event.evidenceJson);
  if (parsed) {
    return {
      ...parsed,
      contentHash: parsed.contentHash || event.contentHash,
    };
  }

  const sanitizedText = (event.sanitizedText || event.rawText).trim();
  return {
    sanitizedText,
    urls: extractUrls(sanitizedText),
    attachments: parseAttachments(event.attachmentJson),
    documentText: "",
    extractionStatus: "not_applicable",
    extractionReason: "stored_event_replay",
    contentHash: event.contentHash,
  };
}

function parseEvidenceBundle(value: string): EvidenceBundle | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<EvidenceBundle>;
    if (parsed && typeof parsed === "object") {
      const hasEvidenceShape = "sanitizedText" in parsed ||
        "urls" in parsed ||
        "attachments" in parsed ||
        "documentText" in parsed ||
        "extractionStatus" in parsed ||
        "extractionReason" in parsed ||
        "contentHash" in parsed;
      if (!hasEvidenceShape) {
        return undefined;
      }

      return {
        sanitizedText: typeof parsed.sanitizedText === "string"
          ? parsed.sanitizedText
          : "",
        urls: Array.isArray(parsed.urls)
          ? parsed.urls.filter((url): url is string => typeof url === "string")
          : [],
        attachments: sanitizeAttachments(parsed.attachments),
        documentText: typeof parsed.documentText === "string"
          ? parsed.documentText
          : "",
        extractionStatus: isEvidenceExtractionStatus(parsed.extractionStatus)
          ? parsed.extractionStatus
          : "not_applicable",
        extractionReason: typeof parsed.extractionReason === "string"
          ? parsed.extractionReason
          : "stored_event_replay",
        contentHash: typeof parsed.contentHash === "string"
          ? parsed.contentHash
          : "",
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function buildGuardContext(input: {
  repository: SqliteRepository;
  event: AiBootEventRecord;
  evidence: EvidenceBundle;
  member: MemberProfile | undefined;
  replayDailyParticipation: Set<string>;
}) {
  const duplicateApprovedScore = input.repository.findPreviousApprovedAiBootScoreEventByContentHash({
    campId: input.event.campId,
    contentHash: input.evidence.contentHash,
    beforeCreatedAt: input.event.createdAt,
    beforeEventId: input.event.id,
  });
  const duplicateEvent = input.repository.findPreviousAiBootEventByContentHash({
    campId: input.event.campId,
    contentHash: input.evidence.contentHash,
    beforeCreatedAt: input.event.createdAt,
    beforeEventId: input.event.id,
  });
  const dailyWindow = shanghaiBusinessDayBounds(input.event.createdAt);

  return {
    roleType: input.member?.roleType ?? "observer",
    isParticipant: input.member?.isParticipant ?? false,
    isExcludedFromBoard: input.member?.isExcludedFromBoard ?? true,
    mentionedBot: input.event.eventType === "mention",
    dailyParticipationAlreadyScored: input.replayDailyParticipation.has(
      dailyParticipationReplayKey(input.event),
    ) || input.repository.countApprovedAiBootScoreEventsBefore({
      campId: input.event.campId,
      memberId: input.event.memberId,
      category: "daily_participation",
      decidedAtFrom: dailyWindow.start,
      decidedAtTo: dailyWindow.end,
      beforeDecidedAt: input.event.createdAt,
    }) > 0,
    categoryCapRemaining: null,
    duplicateApprovedContent: Boolean(duplicateApprovedScore),
    duplicateContent: Boolean(duplicateEvent && !duplicateApprovedScore),
  };
}

function decisionFromGuard(
  outcome: Exclude<GuardOutcome, { kind: "continue" }>,
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
      evidence: summarizeEvidenceBundle(evidence),
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
      evidence: summarizeEvidenceBundle(evidence),
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
    evidence: summarizeEvidenceBundle(evidence),
    badges: ["deterministic_guard", `guard_${outcome.kind}`],
  });
}

function inferReplayStatus(scoreEvent: AiBootScoreEventRecord): AiBootDecisionStatus {
  if (scoreEvent.status !== "shadow") {
    return scoreEvent.status === "rejected" ? "no_score" : scoreEvent.status;
  }

  const originalStatus = parseBadges(scoreEvent.badgesJson)
    .find((badge) => badge.startsWith("shadow_original_status:"))
    ?.split(":")[1];
  if (originalStatus === "approved" || originalStatus === "no_score" || originalStatus === "review_required") {
    return originalStatus;
  }

  return scoreEvent.scoreDelta > 0 ? "approved" : "no_score";
}

function countStatus(result: ShadowReplayResult, status: AiBootDecisionStatus): void {
  if (status === "approved" || status === "shadow") {
    result.approved += 1;
  } else if (status === "review_required") {
    result.reviewRequired += 1;
  } else {
    result.noScore += 1;
  }
}

function isShadowDailyParticipationEquivalent(scoreEvent: AiBootScoreEventRecord): boolean {
  return scoreEvent.status === "shadow" &&
    scoreEvent.category === "daily_participation" &&
    inferReplayStatus(scoreEvent) === "approved";
}

function dailyParticipationReplayKey(event: AiBootEventRecord): string {
  return `${event.memberId}:${shanghaiBusinessDayBounds(event.createdAt).start}`;
}

function hasImageAttachment(event: AiBootEventRecord): boolean {
  return event.eventType === "image" || parseAttachments(event.attachmentJson).some(
    (attachment) => attachment.type.toLowerCase() === "image",
  );
}

function hasPracticeReflectionText(event: AiBootEventRecord): boolean {
  return /经验|实践|复盘|我用\s*AI/i.test(event.sanitizedText || event.rawText);
}

function isPureLinkWithoutReason(event: AiBootEventRecord): boolean {
  const text = (event.sanitizedText || event.rawText).trim();
  return /^https?:\/\/\S+$/i.test(text);
}

function summarizeEvidence(event: AiBootEventRecord): string {
  const text = (event.sanitizedText || event.rawText).trim();
  if (text.length > 0) {
    return text.slice(0, 180);
  }
  if (event.attachmentJson.trim() !== "[]") {
    return `attachments:${event.attachmentJson.slice(0, 160)}`;
  }
  return `content_hash:${event.contentHash}`;
}

function summarizeEvidenceBundle(evidence: EvidenceBundle): string {
  const text = evidence.sanitizedText || evidence.documentText;
  if (text.trim().length > 0) {
    return text.trim().slice(0, 180);
  }
  if (evidence.attachments.length > 0) {
    return `attachments:${evidence.attachments.map((attachment) => attachment.type).join(",")}`;
  }
  return `content_hash:${evidence.contentHash}`;
}

function parseAttachments(value: string): EvidenceBundle["attachments"] {
  try {
    const parsed = JSON.parse(value);
    return sanitizeAttachments(parsed);
  } catch {
    return [];
  }
}

function sanitizeAttachments(value: unknown): EvidenceBundle["attachments"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((attachment): attachment is Record<string, unknown> => {
      return Boolean(attachment) && typeof attachment === "object";
    })
    .map((attachment) => ({
      type: typeof attachment.type === "string" && attachment.type.trim().length > 0
        ? attachment.type
        : "attachment",
      ...(typeof attachment.fileKey === "string" ? { fileKey: attachment.fileKey } : {}),
      ...(typeof attachment.fileName === "string" ? { fileName: attachment.fileName } : {}),
      ...(typeof attachment.fileExt === "string" ? { fileExt: attachment.fileExt } : {}),
    }));
}

function isEvidenceExtractionStatus(
  value: unknown,
): value is EvidenceBundle["extractionStatus"] {
  return value === "not_applicable" ||
    value === "parsed" ||
    value === "unsupported" ||
    value === "failed";
}

function parseBadges(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((badge) => String(badge)) : [];
  } catch {
    return [];
  }
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"'，。！？；、：…]+/g) ?? [];
  return [...new Set(matches)];
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

function displayMemberName(member: MemberProfile | undefined, fallback: string): string {
  return member?.displayName?.trim() || member?.name || fallback;
}

function normalizeSince(value: string | undefined): string {
  if (!value) {
    return "1970-01-01T00:00:00.000Z";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00.000Z`;
  }
  return value;
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 100;
  }
  return Math.min(Math.floor(value), 10_000);
}

function parseCliArgs(argv: string[]): Pick<ShadowReplayOptions, "campId" | "since" | "limit" | "allowHeuristic"> {
  const options: Pick<ShadowReplayOptions, "campId" | "since" | "limit" | "allowHeuristic"> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--camp-id") {
      options.campId = argv[++index];
    } else if (arg === "--since") {
      options.since = argv[++index];
    } else if (arg === "--limit") {
      options.limit = Number(argv[++index]);
    } else if (arg === "--allow-heuristic") {
      options.allowHeuristic = true;
    }
  }
  return options;
}

export function resolveShadowReplayDirectRunOptions(
  env: NodeJS.ProcessEnv,
  argv: string[],
): { ok: true; options: ShadowReplayOptions } | { ok: false; error: "llm_client_required" } {
  const cliOptions = parseCliArgs(argv);
  const envAllowsHeuristic = env.AI_BOOT_SHADOW_REPLAY_ALLOW_HEURISTIC === "true";
  const allowHeuristic = Boolean(cliOptions.allowHeuristic || envAllowsHeuristic);
  const llmConfig = readLlmProviderConfig(env);
  const llmClient = llmConfig.enabled
    ? new OpenAiCompatibleLlmScoringClient(llmConfig)
    : undefined;

  if (!llmClient && !allowHeuristic) {
    return {
      ok: false,
      error: "llm_client_required",
    };
  }

  return {
    ok: true,
    options: {
      env,
      ...cliOptions,
      allowHeuristic,
      ...(llmClient ? { llmClient } : {}),
    },
  };
}

const isDirectRun =
  typeof process !== "undefined" &&
  isDirectScriptRun(import.meta.url, process.argv[1]);

if (isDirectRun) {
  loadLocalEnv();
  try {
    const resolved = resolveShadowReplayDirectRunOptions(process.env, process.argv.slice(2));
    if (!resolved.ok) {
      console.log(JSON.stringify({ ok: false, error: resolved.error }));
      process.exitCode = 1;
    } else {
      await runShadowReplay(resolved.options);
    }
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "shadow_replay_failed",
    }));
    process.exitCode = 1;
  }
}
