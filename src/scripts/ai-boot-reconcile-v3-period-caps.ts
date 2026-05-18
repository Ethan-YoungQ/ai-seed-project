import { resolve } from "node:path";

import type Database from "better-sqlite3";

import type {
  AiBootDecisionStatus,
  AiBootNotifyPolicy,
  AiBootScoreCategory,
} from "../domain/v3/ai-boot-types.js";
import { applyV3CategoryPeriodCap } from "../domain/v3/scoring-caps.js";
import { loadLocalEnv } from "../config/load-env.js";
import { SqliteRepository } from "../storage/sqlite-repository.js";

const REVIEW_MARKER = "v3_period_cap_replay_20260518";

interface ScoreRow {
  id: string;
  camp_id: string;
  member_id: string;
  member_name: string;
  category: AiBootScoreCategory;
  score_delta: number;
  status: AiBootDecisionStatus;
  notify_policy: AiBootNotifyPolicy;
  review_note: string | null;
  decided_at: string;
}

export interface V3PeriodCapChange {
  scoreEventId: string;
  memberId: string;
  memberName: string;
  category: AiBootScoreCategory;
  oldStatus: AiBootDecisionStatus;
  newStatus: AiBootDecisionStatus;
  oldScoreDelta: number;
  newScoreDelta: number;
  delta: number;
  decidedAt: string;
}

export interface V3PeriodCapReconcileResult {
  campId: string;
  periodId: string;
  periodNumber: number;
  apply: boolean;
  changes: V3PeriodCapChange[];
  totalDelta: number;
}

export function reconcileV3PeriodCaps(input: {
  repository: SqliteRepository;
  campId: string;
  periodNumber: number;
  apply: boolean;
  nowIso: string;
}): V3PeriodCapReconcileResult {
  const period = input.repository.findPeriodByNumber(input.campId, input.periodNumber);
  if (!period) {
    throw new Error(`period_not_found:${input.campId}:${input.periodNumber}`);
  }

  const db = (input.repository as unknown as { db: Database.Database }).db;
  const periodEnd = period.endedAt ?? "9999-12-31T23:59:59.999Z";
  const rows = db.prepare(
    `SELECT s.id,
            s.camp_id,
            s.member_id,
            CASE WHEN m.display_name != '' THEN m.display_name ELSE m.name END AS member_name,
            s.category,
            s.score_delta,
            s.status,
            s.notify_policy,
            s.review_note,
            s.decided_at
     FROM ai_boot_score_events s
     INNER JOIN members m ON m.id = s.member_id
     WHERE s.camp_id = ?
       AND s.status = 'approved'
       AND s.score_delta > 0
       AND s.category != 'operator_adjustment'
       AND s.decided_at >= ?
       AND s.decided_at < ?
     ORDER BY s.member_id ASC, s.category ASC, s.decided_at ASC, s.id ASC`
  ).all(input.campId, period.startedAt, periodEnd) as ScoreRow[];

  const runningApproved = new Map<string, number>();
  const changes: V3PeriodCapChange[] = [];

  for (const row of rows) {
    const key = `${row.member_id}\u0000${row.category}`;
    const approvedCategoryScore = runningApproved.get(key) ?? 0;
    const capped = applyV3CategoryPeriodCap({
      category: row.category,
      requestedScoreDelta: Number(row.score_delta),
      approvedCategoryScore,
    });

    if (capped.status === "approved") {
      runningApproved.set(key, approvedCategoryScore + capped.scoreDelta);
    }

    if (!capped.capped) {
      continue;
    }

    const newStatus = capped.status;
    const newScoreDelta = capped.scoreDelta;
    changes.push({
      scoreEventId: row.id,
      memberId: row.member_id,
      memberName: row.member_name,
      category: row.category,
      oldStatus: row.status,
      newStatus,
      oldScoreDelta: Number(row.score_delta),
      newScoreDelta,
      delta: newScoreDelta - Number(row.score_delta),
      decidedAt: row.decided_at,
    });

    if (input.apply) {
      const notePrefix = row.review_note ? `${row.review_note}; ` : "";
      const note = `${notePrefix}${REVIEW_MARKER}: category=${row.category}; period=${period.id}; old_status=${row.status}; old_score=${row.score_delta}; new_status=${newStatus}; new_score=${newScoreDelta}; applied_at=${input.nowIso}`;
      db.prepare(
        `UPDATE ai_boot_score_events
         SET status = ?,
             score_delta = ?,
             notify_policy = CASE WHEN ? = 'no_score' THEN 'silent' ELSE notify_policy END,
             reviewed_by_op_id = 'codex',
             review_note = ?
         WHERE id = ?`
      ).run(newStatus, newScoreDelta, newStatus, note, row.id);
    }
  }

  return {
    campId: input.campId,
    periodId: period.id,
    periodNumber: period.number,
    apply: input.apply,
    changes,
    totalDelta: changes.reduce((sum, change) => sum + change.delta, 0),
  };
}

function parseArgs(argv: string[]): {
  databaseUrl: string;
  campId: string;
  periodNumber: number;
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

  const apply = args.get("apply") === true;
  return {
    databaseUrl: String(args.get("database") ?? process.env.DATABASE_URL ?? resolve("data/app.db")),
    campId: String(args.get("camp") ?? "default"),
    periodNumber: Number(args.get("period") ?? 2),
    apply,
  };
}

if (process.argv[1]?.endsWith("ai-boot-reconcile-v3-period-caps.ts")) {
  loadLocalEnv();
  const options = parseArgs(process.argv.slice(2));
  const repository = new SqliteRepository(options.databaseUrl);
  try {
    const result = reconcileV3PeriodCaps({
      repository,
      campId: options.campId,
      periodNumber: options.periodNumber,
      apply: options.apply,
      nowIso: new Date().toISOString(),
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    repository.close();
  }
}
