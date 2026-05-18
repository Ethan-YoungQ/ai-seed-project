import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type Database from "better-sqlite3";

import { loadLocalEnv } from "../config/load-env.js";
import type { AiBootScoreCategory } from "../domain/v3/ai-boot-types.js";
import { combineLegacyAndV3Score } from "../domain/v3/scorebook.js";
import { SqliteRepository } from "../storage/sqlite-repository.js";

const AUDIT_MARKER = "first_cycle_score_audit";

export interface FirstCycleAuditEventPlan {
  sourceMessageId?: string;
  eventId?: string;
  category?: AiBootScoreCategory;
  scoreDelta: number;
  reason: string;
  evidence?: string;
}

export interface FirstCycleAuditMemberPlan {
  memberId: string;
  memberName?: string;
  replayedTotal: number;
  missingEvents?: FirstCycleAuditEventPlan[];
  overScoredEvents?: FirstCycleAuditEventPlan[];
}

export interface FirstCycleScoreAuditPlan {
  campId?: string;
  members: FirstCycleAuditMemberPlan[];
}

export interface FirstCycleAuditMemberResult {
  memberId: string;
  memberName: string;
  beforeTotal: number;
  replayedTotal: number | null;
  delta: number | null;
  missingEvents: FirstCycleAuditEventPlan[];
  overScoredEvents: FirstCycleAuditEventPlan[];
  applied: boolean;
  appliedDelta: number;
  reason: string;
}

export interface FirstCycleScoreAuditResult {
  campId: string;
  apply: boolean;
  planProvided: boolean;
  members: FirstCycleAuditMemberResult[];
}

function asDb(repository: SqliteRepository): Database.Database {
  return (repository as unknown as { db: Database.Database }).db;
}

function memberDisplayName(member: { displayName?: string; name: string }): string {
  return member.displayName || member.name;
}

function currentTotal(repository: SqliteRepository, campId: string, memberId: string): number {
  const legacyTotals = repository.fetchAiBootLegacyDimensionScoreTotals(campId, memberId);
  const legacySnapshot = repository.getAiBootLegacyScoreSnapshot(campId, memberId);
  const legacyScore = legacyTotals.totalScore !== 0
    ? legacyTotals.totalScore
    : legacySnapshot?.totalScore ?? 0;
  return combineLegacyAndV3Score({
    legacyTotal: legacyScore,
    approvedV3Total: repository.sumApprovedAiBootScore(campId, memberId),
  });
}

function hashPlan(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 12);
}

function summarizeEvents(events: FirstCycleAuditEventPlan[]): string {
  return events
    .map((event, index) => {
      const ref = event.sourceMessageId ?? event.eventId ?? `missing-${index + 1}`;
      return `${ref}: delta=${event.scoreDelta}; reason=${event.reason}`;
    })
    .join(" | ");
}

function normalizePlan(input: unknown): FirstCycleScoreAuditPlan {
  const root = input as Partial<FirstCycleScoreAuditPlan> | FirstCycleAuditMemberPlan[];
  const members = Array.isArray(root) ? root : root.members;
  if (!Array.isArray(members)) {
    throw new Error("plan must be an array or an object with members[]");
  }
  return {
    campId: Array.isArray(root) ? undefined : root.campId,
    members: members.map((member) => ({
      ...member,
      missingEvents: member.missingEvents ?? [],
      overScoredEvents: member.overScoredEvents ?? [],
    })),
  };
}

function readPlan(path: string): FirstCycleScoreAuditPlan {
  if (!existsSync(path)) {
    throw new Error(`plan not found: ${path}`);
  }
  return normalizePlan(JSON.parse(readFileSync(path, "utf8")));
}

function insertPositiveAdjustment(input: {
  repository: SqliteRepository;
  campId: string;
  memberId: string;
  memberName: string;
  chatId: string;
  beforeTotal: number;
  replayedTotal: number;
  delta: number;
  missingEvents: FirstCycleAuditEventPlan[];
  now: string;
  uuid: () => string;
  planKey: string;
}): boolean {
  const db = asDb(input.repository);
  const sourceMessageId = `${AUDIT_MARKER}:${input.campId}:${input.memberId}:${input.planKey}`;
  const existing = db.prepare(
    `SELECT s.id
     FROM ai_boot_score_events s
     INNER JOIN ai_boot_events e ON e.id = s.event_id
     WHERE s.camp_id = ?
       AND s.member_id = ?
       AND e.source_message_id = ?
       AND s.status = 'approved'
     LIMIT 1`
  ).get(input.campId, input.memberId, sourceMessageId);
  if (existing) {
    return false;
  }

  const eventUuid = input.uuid();
  const scoreUuid = input.uuid();
  const auditReason = `${AUDIT_MARKER}: confirmed missing positive delta ${input.delta}; before=${input.beforeTotal}; replayed=${input.replayedTotal}`;
  const reviewNote = `${auditReason}; member=${input.memberName}; missing_events=${summarizeEvents(input.missingEvents)}`;
  const evidence = JSON.stringify({
    marker: AUDIT_MARKER,
    beforeTotal: input.beforeTotal,
    replayedTotal: input.replayedTotal,
    delta: input.delta,
    missingEvents: input.missingEvents,
  });

  db.prepare(
    `INSERT INTO ai_boot_events
      (id, camp_id, chat_id, member_id, source_message_id, event_type,
       raw_text, sanitized_text, attachment_json, evidence_json, content_hash,
       status, engine_version, ruleset_version, created_at)
     VALUES
      (@id, @campId, @chatId, @memberId, @sourceMessageId, 'card',
       @rawText, @sanitizedText, '[]', @evidenceJson, @contentHash,
       'decided', 'score-audit-script', 'first-cycle-score-audit', @createdAt)`
  ).run({
    id: `first-cycle-score-audit-event-${eventUuid}`,
    campId: input.campId,
    chatId: input.chatId,
    memberId: input.memberId,
    sourceMessageId,
    rawText: reviewNote,
    sanitizedText: reviewNote,
    evidenceJson: evidence,
    contentHash: hashPlan({ sourceMessageId, evidence }),
    createdAt: input.now,
  });

  db.prepare(
    `INSERT INTO ai_boot_score_events
      (id, event_id, camp_id, member_id, category, score_delta, confidence,
       status, notify_policy, reason, evidence, badges_json, model_provider,
       model_name, prompt_version, reviewed_by_op_id, review_note, decided_at)
     VALUES
      (@id, @eventId, @campId, @memberId, 'operator_adjustment', @scoreDelta, 'high',
       'approved', 'silent', @reason, @evidence, '[]', 'script',
       'first-cycle-score-audit', 'manual-plan', 'codex', @reviewNote, @decidedAt)`
  ).run({
    id: `first-cycle-score-audit-score-${scoreUuid}`,
    eventId: `first-cycle-score-audit-event-${eventUuid}`,
    campId: input.campId,
    memberId: input.memberId,
    scoreDelta: input.delta,
    reason: auditReason,
    evidence,
    reviewNote,
    decidedAt: input.now,
  });

  return true;
}

export function auditFirstCycleScores(input: {
  repository: SqliteRepository;
  campId?: string;
  apply: boolean;
  now?: string;
  uuid?: () => string;
  plan?: FirstCycleScoreAuditPlan;
}): FirstCycleScoreAuditResult {
  const plan = input.plan ? normalizePlan(input.plan) : undefined;
  const campId = input.campId ?? plan?.campId ?? "default";
  const now = input.now ?? new Date().toISOString();
  const uuid = input.uuid ?? randomUUID;
  const chatId = input.repository.getCamp(campId)?.groupId ?? "";
  const planByMember = new Map((plan?.members ?? []).map((member) => [member.memberId, member]));
  const membersById = new Map(input.repository.listEligibleStudents(campId).map((member) => [member.id, member]));

  for (const planMember of plan?.members ?? []) {
    if (!membersById.has(planMember.memberId)) {
      const member = input.repository.getMember(planMember.memberId);
      if (member?.campId === campId) {
        membersById.set(member.id, member);
      }
    }
  }

  const db = asDb(input.repository);
  const tx = db.transaction(() => {
    const results: FirstCycleAuditMemberResult[] = [];
    for (const member of [...membersById.values()].sort((left, right) => left.id.localeCompare(right.id))) {
      const memberPlan = planByMember.get(member.id);
      const beforeTotal = currentTotal(input.repository, campId, member.id);
      const replayedTotal = memberPlan?.replayedTotal ?? null;
      const delta = replayedTotal === null ? null : replayedTotal - beforeTotal;
      const missingEvents = memberPlan?.missingEvents ?? [];
      const positiveMissingEvents = missingEvents.filter((event) => event.scoreDelta > 0);
      const overScoredEvents = memberPlan?.overScoredEvents ?? [];
      let applied = false;
      let appliedDelta = 0;
      let reason = plan ? "plan_no_delta" : "no_plan_current_total_only";

      if (replayedTotal !== null && delta !== null && delta > 0) {
        reason = positiveMissingEvents.length > 0 ? "positive_missing_delta" : "positive_delta_without_confirmed_missing_events";
        if (input.apply && positiveMissingEvents.length > 0) {
          applied = insertPositiveAdjustment({
            repository: input.repository,
            campId,
            memberId: member.id,
            memberName: memberPlan?.memberName ?? memberDisplayName(member),
            chatId,
            beforeTotal,
            replayedTotal,
            delta,
            missingEvents: positiveMissingEvents,
            now,
            uuid,
            planKey: hashPlan(memberPlan),
          });
          appliedDelta = applied ? delta : 0;
          reason = applied ? "applied_positive_missing_delta" : "skipped_existing_positive_missing_delta";
        }
      } else if (delta !== null && delta < 0) {
        reason = "negative_delta_report_only";
      } else if (delta === 0) {
        reason = "no_delta";
      }

      results.push({
        memberId: member.id,
        memberName: memberPlan?.memberName ?? memberDisplayName(member),
        beforeTotal,
        replayedTotal,
        delta,
        missingEvents,
        overScoredEvents,
        applied,
        appliedDelta,
        reason,
      });
    }

    return results;
  });

  return {
    campId,
    apply: input.apply,
    planProvided: Boolean(plan),
    members: tx(),
  };
}

function parseArgs(argv: string[]): {
  databaseUrl: string;
  campId?: string;
  planPath?: string;
  apply: boolean;
} {
  const args = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key === "apply" || key === "dry-run") {
      args.set(key, true);
      continue;
    }
    args.set(key, argv[i + 1]);
    i += 1;
  }

  return {
    databaseUrl: String(
      args.get("db") ??
      args.get("database") ??
      args.get("database-url") ??
      process.env.DATABASE_URL ??
      resolve("data/app.db")
    ),
    campId: typeof args.get("camp") === "string" ? String(args.get("camp")) : undefined,
    planPath: typeof args.get("plan") === "string" ? String(args.get("plan")) : undefined,
    apply: args.get("apply") === true,
  };
}

if (process.argv[1]?.endsWith("ai-boot-score-audit-first-cycle.ts")) {
  loadLocalEnv();
  const options = parseArgs(process.argv.slice(2));
  const repository = new SqliteRepository(options.databaseUrl);
  try {
    const result = auditFirstCycleScores({
      repository,
      campId: options.campId,
      apply: options.apply,
      plan: options.planPath ? readPlan(options.planPath) : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    repository.close();
  }
}
