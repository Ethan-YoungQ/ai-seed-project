import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnv } from "../config/load-env.js";
import type {
  AiBootDecisionStatus,
  AiBootEventRecord,
  AiBootScoreEventRecord,
} from "../domain/v3/ai-boot-types.js";
import { parseScoringDecision, type ScoringDecision } from "../domain/v3/scoring-decision.js";
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

    for (const event of events) {
      const existing = repository.findAiBootScoreEventByEventId(event.id);
      if (existing) {
        countStatus(result, inferReplayStatus(existing));
        continue;
      }

      const decision = await (options.decider ?? heuristicShadowDecider)(event);
      const normalized = parseScoringDecision(decision);
      repository.insertAiBootScoreEvent(buildShadowScoreEvent({
        id: uuid(),
        event,
        decision: normalized,
        decidedAt: now(),
      }));
      countStatus(result, normalized.status);
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

function buildShadowScoreEvent(input: {
  id: string;
  event: AiBootEventRecord;
  decision: ScoringDecision;
  decidedAt: string;
}): AiBootScoreEventRecord {
  return {
    id: input.id,
    eventId: input.event.id,
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
    ]),
    modelProvider: SHADOW_MODEL_PROVIDER,
    modelName: SHADOW_MODEL_NAME,
    promptVersion: SHADOW_PROMPT_VERSION,
    reviewedByOpId: null,
    reviewNote: null,
    decidedAt: input.decidedAt,
  };
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

function hasImageAttachment(event: AiBootEventRecord): boolean {
  return event.eventType === "image" || parseJsonArray(event.attachmentJson).some((attachment) => {
    if (!attachment || typeof attachment !== "object") {
      return false;
    }
    return String((attachment as { type?: unknown }).type ?? "").toLowerCase() === "image";
  });
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

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseBadges(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((badge) => String(badge)) : [];
  } catch {
    return [];
  }
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

function parseCliArgs(argv: string[]): Pick<ShadowReplayOptions, "campId" | "since" | "limit"> {
  const options: Pick<ShadowReplayOptions, "campId" | "since" | "limit"> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--camp-id") {
      options.campId = argv[++index];
    } else if (arg === "--since") {
      options.since = argv[++index];
    } else if (arg === "--limit") {
      options.limit = Number(argv[++index]);
    }
  }
  return options;
}

const isDirectRun =
  typeof process !== "undefined" &&
  isDirectScriptRun(import.meta.url, process.argv[1]);

if (isDirectRun) {
  loadLocalEnv();
  await runShadowReplay({ env: process.env, ...parseCliArgs(process.argv.slice(2)) });
}
