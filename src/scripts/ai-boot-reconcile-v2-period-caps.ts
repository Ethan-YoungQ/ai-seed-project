import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type Database from "better-sqlite3";

import { loadLocalEnv } from "../config/load-env.js";
import {
  SCORING_ITEMS,
  type ScoringDimension,
  type ScoringItemCode,
} from "../domain/v2/scoring-items-config.js";
import { SqliteRepository } from "../storage/sqlite-repository.js";

const SOURCE_REF_PREFIX = "codex-v2-period-cap-reconcile-20260518";
const DIMENSIONS: ScoringDimension[] = ["K", "H", "C", "S", "G"];

interface OverCapRow {
  member_id: string;
  member_name: string;
  item_code: ScoringItemCode;
  dimension: ScoringDimension;
  net_score: number;
  cap: number;
}

export interface V2PeriodCapCorrection {
  memberId: string;
  memberName: string;
  itemCode: ScoringItemCode;
  dimension: ScoringDimension;
  netScore: number;
  cap: number;
  correctionDelta: number;
  sourceRef: string;
  skippedExisting: boolean;
}

export interface V2DimensionReconcileChange {
  memberId: string;
  memberName: string;
  dimension: ScoringDimension;
  oldScore: number;
  newScore: number;
  delta: number;
}

export interface V2PeriodCapReconcileResult {
  campId: string;
  periodId: string;
  periodNumber: number;
  apply: boolean;
  corrections: V2PeriodCapCorrection[];
  dimensionChanges: V2DimensionReconcileChange[];
  legacySnapshotsUpdated: number;
  totalDelta: number;
}

export function reconcileV2PeriodCaps(input: {
  repository: SqliteRepository;
  campId: string;
  periodNumber: number;
  apply: boolean;
  nowIso: string;
  uuid?: () => string;
}): V2PeriodCapReconcileResult {
  const period = input.repository.findPeriodByNumber(input.campId, input.periodNumber);
  if (!period) {
    throw new Error(`period_not_found:${input.campId}:${input.periodNumber}`);
  }

  const uuid = input.uuid ?? randomUUID;
  const db = (input.repository as unknown as { db: Database.Database }).db;
  const capRows = Object.values(SCORING_ITEMS).map((item) => ({
    code: item.code,
    cap: item.perPeriodCap,
  }));

  const tx = db.transaction(() => {
    const corrections: V2PeriodCapCorrection[] = [];
    const dryRunProjectedDeltasByMemberDimension = new Map<string, number>();

    const valuesSql = capRows.map(() => "(?, ?)").join(", ");
    const overCapRows = db.prepare(
      `WITH item_caps(item_code, cap) AS (VALUES ${valuesSql})
       SELECT e.member_id,
              CASE WHEN m.display_name != '' THEN m.display_name ELSE m.name END AS member_name,
              e.item_code,
              e.dimension,
              SUM(e.score_delta) AS net_score,
              c.cap
       FROM v2_scoring_item_events e
       INNER JOIN item_caps c ON c.item_code = e.item_code
       INNER JOIN members m ON m.id = e.member_id
       WHERE e.period_id = ?
         AND e.status = 'approved'
         AND m.camp_id = ?
         AND m.role_type = 'student'
         AND m.is_participant = 1
         AND m.is_excluded_from_board = 0
       GROUP BY e.member_id, e.item_code, e.dimension
       HAVING net_score > c.cap
       ORDER BY member_name ASC, e.item_code ASC`
    ).all(
      ...capRows.flatMap((row) => [row.code, row.cap]),
      period.id,
      input.campId
    ) as OverCapRow[];

    for (const row of overCapRows) {
      const sourceRef = `${SOURCE_REF_PREFIX}:${period.id}:${row.member_id}:${row.item_code}`;
      const existing = db.prepare(
        `SELECT id FROM v2_scoring_item_events
         WHERE member_id = ?
           AND period_id = ?
           AND item_code = ?
           AND source_ref = ?
         LIMIT 1`
      ).get(row.member_id, period.id, row.item_code, sourceRef);
      const correctionDelta = Number(row.cap) - Number(row.net_score);

      corrections.push({
        memberId: row.member_id,
        memberName: row.member_name,
        itemCode: row.item_code,
        dimension: row.dimension,
        netScore: Number(row.net_score),
        cap: Number(row.cap),
        correctionDelta,
        sourceRef,
        skippedExisting: Boolean(existing),
      });
      if (!input.apply && !existing) {
        const projectedKey = `${row.member_id}\u0000${row.dimension}`;
        dryRunProjectedDeltasByMemberDimension.set(
          projectedKey,
          (dryRunProjectedDeltasByMemberDimension.get(projectedKey) ?? 0) + correctionDelta
        );
      }

      if (input.apply && !existing) {
        db.prepare(
          `INSERT INTO v2_scoring_item_events
            (id, member_id, period_id, item_code, dimension, score_delta,
             source_type, source_ref, status, llm_task_id, reviewed_by_op_id,
             review_note, created_at, decided_at)
           VALUES
            (@id, @memberId, @periodId, @itemCode, @dimension, @scoreDelta,
             'operator_manual', @sourceRef, 'approved', NULL, 'codex',
             @reviewNote, @createdAt, @decidedAt)`
        ).run({
          id: `v2-cap-${uuid()}`,
          memberId: row.member_id,
          periodId: period.id,
          itemCode: row.item_code,
          dimension: row.dimension,
          scoreDelta: correctionDelta,
          sourceRef,
          reviewNote: `按 v2 周期上限纠偏：${row.item_code} 当前 ${row.net_score}，上限 ${row.cap}`,
          createdAt: input.nowIso,
          decidedAt: input.nowIso,
        });
      }
    }

    const memberRows = db.prepare(
      `SELECT m.id AS member_id,
              CASE WHEN m.display_name != '' THEN m.display_name ELSE m.name END AS member_name
       FROM members m
       WHERE m.camp_id = ?
         AND m.role_type = 'student'
         AND m.is_participant = 1
         AND m.is_excluded_from_board = 0
         AND EXISTS (
           SELECT 1 FROM v2_scoring_item_events e
           WHERE e.member_id = m.id AND e.period_id = ?
         )
       ORDER BY member_name ASC`
    ).all(input.campId, period.id) as Array<{ member_id: string; member_name: string }>;

    const dimensionChanges: V2DimensionReconcileChange[] = [];
    let legacySnapshotsUpdated = 0;
    for (const member of memberRows) {
      for (const dimension of DIMENSIONS) {
        const oldRow = db.prepare(
          `SELECT period_score FROM v2_member_dimension_scores
           WHERE member_id = ? AND period_id = ? AND dimension = ?`
        ).get(member.member_id, period.id, dimension) as { period_score: number } | undefined;
        const sumRow = db.prepare(
          `SELECT COALESCE(SUM(score_delta), 0) AS new_score,
                  COUNT(*) AS event_count,
                  MAX(COALESCE(decided_at, created_at)) AS last_event_at
           FROM v2_scoring_item_events
           WHERE member_id = ?
             AND period_id = ?
             AND dimension = ?
             AND status = 'approved'`
        ).get(member.member_id, period.id, dimension) as {
          new_score: number;
          event_count: number;
          last_event_at: string | null;
        };

        const oldScore = Number(oldRow?.period_score ?? 0);
        const projectedDelta = dryRunProjectedDeltasByMemberDimension.get(
          `${member.member_id}\u0000${dimension}`
        ) ?? 0;
        const newScore = Number(sumRow.new_score ?? 0) + projectedDelta;
        if (oldScore !== newScore) {
          dimensionChanges.push({
            memberId: member.member_id,
            memberName: member.member_name,
            dimension,
            oldScore,
            newScore,
            delta: newScore - oldScore,
          });
        }

        if (input.apply && (oldRow || newScore !== 0)) {
          db.prepare(
            `INSERT INTO v2_member_dimension_scores
              (member_id, period_id, dimension, period_score, event_count, last_event_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(member_id, period_id, dimension) DO UPDATE SET
               period_score = excluded.period_score,
               event_count = excluded.event_count,
               last_event_at = excluded.last_event_at`
          ).run(
            member.member_id,
            period.id,
            dimension,
            newScore,
            Number(sumRow.event_count ?? 0),
            sumRow.last_event_at ?? input.nowIso
          );
        }
      }

      const legacyRows = db.prepare(
        `SELECT dimension, COALESCE(SUM(period_score), 0) AS score
         FROM v2_member_dimension_scores
         WHERE member_id = ?
         GROUP BY dimension`
      ).all(member.member_id) as Array<{ dimension: ScoringDimension; score: number }>;
      const legacyDimensions: Record<ScoringDimension, number> = { K: 0, H: 0, C: 0, S: 0, G: 0 };
      for (const row of legacyRows) {
        legacyDimensions[row.dimension] += Number(row.score);
      }
      const legacyTotal = DIMENSIONS.reduce((sum, dimension) => sum + legacyDimensions[dimension], 0);
      const dimensionJson = JSON.stringify(legacyDimensions);
      const existingSnapshot = db.prepare(
        `SELECT total_score, dimension_json
         FROM ai_boot_legacy_score_snapshots
         WHERE camp_id = ? AND member_id = ?
         LIMIT 1`
      ).get(input.campId, member.member_id) as
        | { total_score: number; dimension_json: string }
        | undefined;
      if (
        !existingSnapshot ||
        Number(existingSnapshot.total_score) !== legacyTotal ||
        String(existingSnapshot.dimension_json) !== dimensionJson
      ) {
        legacySnapshotsUpdated += 1;
        if (input.apply) {
          db.prepare(
            `INSERT INTO ai_boot_legacy_score_snapshots
              (id, camp_id, member_id, total_score, dimension_json, source_note, snapshot_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(camp_id, member_id) DO UPDATE SET
               total_score = excluded.total_score,
               dimension_json = excluded.dimension_json,
               source_note = excluded.source_note,
               snapshot_at = excluded.snapshot_at`
          ).run(
            `legacy-snapshot-v2-period-cap-${member.member_id}`,
            input.campId,
            member.member_id,
            legacyTotal,
            dimensionJson,
            SOURCE_REF_PREFIX,
            input.nowIso
          );
        }
      }
    }

    return {
      campId: input.campId,
      periodId: period.id,
      periodNumber: period.number,
      apply: input.apply,
      corrections,
      dimensionChanges,
      legacySnapshotsUpdated,
      totalDelta: dimensionChanges.reduce((sum, change) => sum + change.delta, 0),
    };
  });

  return tx();
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

  return {
    databaseUrl: String(args.get("database") ?? process.env.DATABASE_URL ?? resolve("data/app.db")),
    campId: String(args.get("camp") ?? "default"),
    periodNumber: Number(args.get("period") ?? 2),
    apply: args.get("apply") === true,
  };
}

if (process.argv[1]?.endsWith("ai-boot-reconcile-v2-period-caps.ts")) {
  loadLocalEnv();
  const options = parseArgs(process.argv.slice(2));
  const repository = new SqliteRepository(options.databaseUrl);
  try {
    const result = reconcileV2PeriodCaps({
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
