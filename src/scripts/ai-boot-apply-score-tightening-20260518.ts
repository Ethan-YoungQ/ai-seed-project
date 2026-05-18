import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import Database from "better-sqlite3";

import {
  evaluateContinuousPromotion,
  type ContinuousLevelValue,
} from "../domain/v2/continuous-promotion.js";

interface LegacyCorrection {
  originalEventId: string;
  reason: string;
}

interface V3Correction {
  scoreEventId: string;
  targetCategory?: string;
  targetScoreDelta: number;
  reason: string;
}

const LEGACY_CORRECTIONS: readonly LegacyCorrection[] = [
  { originalEventId: "f76f8c14-e729-4406-8247-25e83f6a6ea2", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "31fc2c76-5672-4bbc-8875-4d0badc811dc", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "71c747e2-3e4b-42d0-94b4-51c4ea8d99de", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "cb53570c-1051-468a-8304-6a8c99706848", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "e2e2bc72-cd09-4799-9c42-88d0e7048618", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "1c569d93-63ee-487b-825c-b8d43d20ea13", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "7b36ca01-8914-4351-be1d-2aaa3e50b28c", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "0fe80cfe-91d5-4dde-883b-5af4b4236498", reason: "撤销空提交仍被 C1 加分的历史错误" },
  { originalEventId: "155db2f6-3c7e-4237-9d6d-771a76aee52d", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "3cffe2db-37a5-4b1c-a86e-127b24ee6922", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "f6a193ac-751c-444b-a559-f99fb1e02d0b", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "0c1db107-fe58-4906-a8ed-6b1c1e7784eb", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "aba93b77-47d2-4754-9ee1-a2b46cf431bd", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "cc143ad6-2ad7-4127-b480-fd54790c1f43", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "020e0017-a585-446a-bacb-f767bbdfe0d2", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "d7676ae2-a487-4ebe-8354-555b0e131620", reason: "撤销空提交仍被 H2 加分的历史错误" },
  { originalEventId: "211ad26a-27f0-4ddb-9b67-bcdfc9db8ef1", reason: "撤销系统判定不符合 C1 却仍加分的历史错误" },
  { originalEventId: "8bc970fd-937c-460d-a6aa-c11547dd93ee", reason: "撤销系统判定 K3 不合格却仍加分的历史错误" },
];

const V3_CORRECTIONS: readonly V3Correction[] = [
  {
    scoreEventId: "backfill:first-cycle:om_x100b6f32163ae4a0c2acd3d4c5846f9:ai_artifact",
    targetScoreDelta: 3,
    reason: "单张 AI 图片仅展示成品，按 ai_artifact 基准分 3 分下修",
  },
  {
    scoreEventId: "backfill:first-cycle:om_x100b6f1d8dd82884b48ec843c3f0616:ai_artifact",
    targetScoreDelta: 3,
    reason: "单张 AI 图片仅展示成品，按 ai_artifact 基准分 3 分下修",
  },
  {
    scoreEventId: "backfill:first-cycle:om_x100b6f464eefa4a0c312d2942d81597:formal_task",
    targetCategory: "prompt_or_method",
    targetScoreDelta: 4,
    reason: "文本为作业构思和画面提示词，不是已完成正式交付物，改按方法/提示词 4 分",
  },
  {
    scoreEventId: "backfill:first-cycle:om_x100b6f2c9252a114c2e4f1a3914bd7f:ai_artifact",
    targetScoreDelta: 3,
    reason: "单张 AI 海报仅展示成品，按 ai_artifact 基准分 3 分下修",
  },
  {
    scoreEventId: "backfill:first-cycle:om_x100b6f6d78dfcc9cb281b328fd3489e:ai_artifact",
    targetScoreDelta: 3,
    reason: "单张 AI 海报仅展示成品，按 ai_artifact 基准分 3 分下修",
  },
  {
    scoreEventId: "backfill:first-cycle:om_x100b6fb3d97664b0b279b0e037584a3:ai_artifact",
    targetScoreDelta: 3,
    reason: "单张 AI 图片仅展示成品，按 ai_artifact 基准分 3 分下修",
  },
  {
    scoreEventId: "backfill:first-cycle:om_x100b501a8959c8a8c43b0efe6d8346d:prompt_or_method",
    targetScoreDelta: 4,
    reason: "单条提问技巧按 prompt_or_method 基准分 4 分下修",
  },
  {
    scoreEventId: "a49e1f63-17a2-42f2-904a-4ecac556a369",
    targetScoreDelta: 3,
    reason: "单张 AI 海报仅展示成品，按 ai_artifact 基准分 3 分下修",
  },
];

const V3_CATEGORY_DIMENSION: Record<string, "K" | "H" | "C" | "S" | "G"> = {
  daily_participation: "K",
  formal_task: "H",
  ai_artifact: "C",
  prompt_or_method: "C",
  peer_help: "S",
  ai_practice_reflection: "G",
  resource_recommendation: "G",
  operator_adjustment: "K",
};

interface LegacyEventRow {
  id: string;
  member_id: string;
  period_id: string;
  camp_id: string;
  item_code: string;
  dimension: "K" | "H" | "C" | "S" | "G";
  score_delta: number;
  status: string;
}

interface MemberRow {
  id: string;
  name: string;
  current_level: number | null;
}

interface ScriptResult {
  dryRun: boolean;
  legacyApplied: number;
  legacySkipped: number;
  legacyDelta: number;
  v3Applied: number;
  v3Skipped: number;
  v3Delta: number;
  levelUpdates: Array<{ name: string; from: number; to: number; totalScore: number }>;
}

function scoreRef(id: string): string {
  return `codex-correction:2026-05-18-score-tightening:${id}`;
}

function calculateLevel(totalScore: number, dimensions: { K: number; H: number; C: number; S: number; G: number }): number {
  let level: ContinuousLevelValue = 1;
  while (level < 5) {
    const decision = evaluateContinuousPromotion({
      currentLevel: level,
      cumulativeAq: totalScore,
      dimensions,
    });
    if (!decision.promoted) break;
    level = decision.toLevel;
  }
  return level;
}

export function runScoreTightening20260518(input: {
  databaseUrl: string;
  campId: string;
  dryRun?: boolean;
  now?: string;
  uuid?: () => string;
}): ScriptResult {
  if (!existsSync(input.databaseUrl)) {
    throw new Error(`database not found: ${input.databaseUrl}`);
  }

  const db = new Database(input.databaseUrl);
  const dryRun = input.dryRun ?? true;
  const now = input.now ?? new Date().toISOString();
  const uuid = input.uuid ?? randomUUID;

  const tx = db.transaction(() => {
    const result: ScriptResult = {
      dryRun,
      legacyApplied: 0,
      legacySkipped: 0,
      legacyDelta: 0,
      v3Applied: 0,
      v3Skipped: 0,
      v3Delta: 0,
      levelUpdates: [],
    };

    for (const correction of LEGACY_CORRECTIONS) {
      const original = db.prepare(
        `SELECT e.id, e.member_id, e.period_id, p.camp_id, e.item_code,
                e.dimension, e.score_delta, e.status
         FROM v2_scoring_item_events e
         INNER JOIN v2_periods p ON p.id = e.period_id
         WHERE e.id = ?`
      ).get(correction.originalEventId) as LegacyEventRow | undefined;

      if (!original || original.camp_id !== input.campId || original.status !== "approved" || original.score_delta <= 0) {
        result.legacySkipped += 1;
        continue;
      }

      const sourceRef = scoreRef(original.id);
      const existing = db.prepare(
        `SELECT id FROM v2_scoring_item_events
         WHERE member_id = ? AND period_id = ? AND item_code = ? AND source_ref = ?
         LIMIT 1`
      ).get(original.member_id, original.period_id, original.item_code, sourceRef);
      if (existing) {
        result.legacySkipped += 1;
        continue;
      }

      const delta = -Number(original.score_delta);
      if (!dryRun) {
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
          id: `corr-${uuid()}`,
          memberId: original.member_id,
          periodId: original.period_id,
          itemCode: original.item_code,
          dimension: original.dimension,
          scoreDelta: delta,
          sourceRef,
          reviewNote: correction.reason,
          createdAt: now,
          decidedAt: now,
        });

        db.prepare(
          `INSERT INTO v2_member_dimension_scores
            (member_id, period_id, dimension, period_score, event_count, last_event_at)
           VALUES (?, ?, ?, ?, 1, ?)
           ON CONFLICT(member_id, period_id, dimension) DO UPDATE SET
             period_score = period_score + excluded.period_score,
             event_count = event_count + 1,
             last_event_at = excluded.last_event_at`
        ).run(original.member_id, original.period_id, original.dimension, delta, now);
      }

      result.legacyApplied += 1;
      result.legacyDelta += delta;
    }

    for (const correction of V3_CORRECTIONS) {
      const row = db.prepare(
        `SELECT id, category, score_delta, review_note
         FROM ai_boot_score_events
         WHERE id = ? AND camp_id = ? AND status = 'approved'
         LIMIT 1`
      ).get(correction.scoreEventId, input.campId) as
        | { id: string; category: string; score_delta: number; review_note: string | null }
        | undefined;
      if (!row) {
        result.v3Skipped += 1;
        continue;
      }

      const targetCategory = correction.targetCategory ?? row.category;
      const delta = Number(correction.targetScoreDelta) - Number(row.score_delta);
      if (row.category === targetCategory && Number(row.score_delta) === correction.targetScoreDelta) {
        result.v3Skipped += 1;
        continue;
      }

      if (!dryRun) {
        const existingNote = row.review_note ? `${row.review_note}; ` : "";
        db.prepare(
          `UPDATE ai_boot_score_events
           SET category = ?,
               score_delta = ?,
               reviewed_by_op_id = 'codex',
               review_note = ?
           WHERE id = ?`
        ).run(
          targetCategory,
          correction.targetScoreDelta,
          `${existingNote}score_tightening_20260518: ${correction.reason}; old_category=${row.category}; old_score=${row.score_delta}`,
          row.id,
        );
      }

      result.v3Applied += 1;
      result.v3Delta += delta;
    }

    const members = db.prepare(
      `SELECT m.id, m.name, ml.current_level
       FROM members m
       LEFT JOIN v2_member_levels ml ON ml.member_id = m.id
       WHERE m.camp_id = ? AND m.role_type = 'student'
         AND m.is_participant = 1 AND m.is_excluded_from_board = 0`
    ).all(input.campId) as MemberRow[];

    for (const member of members) {
      const legacyRows = db.prepare(
        `SELECT dimension, COALESCE(SUM(period_score), 0) AS score
         FROM v2_member_dimension_scores
         WHERE member_id = ?
         GROUP BY dimension`
      ).all(member.id) as Array<{ dimension: "K" | "H" | "C" | "S" | "G"; score: number }>;
      const dimensions = { K: 0, H: 0, C: 0, S: 0, G: 0 };
      for (const row of legacyRows) {
        dimensions[row.dimension] += Number(row.score);
      }

      const v3Rows = db.prepare(
        `SELECT category, COALESCE(SUM(score_delta), 0) AS score
         FROM ai_boot_score_events
         WHERE camp_id = ? AND member_id = ? AND status = 'approved'
         GROUP BY category`
      ).all(input.campId, member.id) as Array<{ category: string; score: number }>;
      for (const row of v3Rows) {
        const dimension = V3_CATEGORY_DIMENSION[row.category] ?? "K";
        dimensions[dimension] += Number(row.score);
      }

      const totalScore = dimensions.K + dimensions.H + dimensions.C + dimensions.S + dimensions.G;
      const fromLevel = Number(member.current_level ?? 1);
      const toLevel = calculateLevel(totalScore, dimensions);
      if (fromLevel === toLevel) continue;

      result.levelUpdates.push({ name: member.name, from: fromLevel, to: toLevel, totalScore });
      if (!dryRun) {
        db.prepare(
          `INSERT INTO v2_member_levels
            (member_id, current_level, level_attained_at, last_window_id, updated_at)
           VALUES (?, ?, ?, 'score-tightening-20260518', ?)
           ON CONFLICT(member_id) DO UPDATE SET
             current_level = excluded.current_level,
             last_window_id = excluded.last_window_id,
             updated_at = excluded.updated_at`
        ).run(member.id, toLevel, now, now);

        db.prepare(
          `DELETE FROM v2_promotion_records
           WHERE member_id = ? AND to_level > ?`
        ).run(member.id, toLevel);
      }
    }

    return result;
  });

  try {
    return tx();
  } finally {
    db.close();
  }
}

if (process.argv[1]?.endsWith("ai-boot-apply-score-tightening-20260518.ts")) {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i].startsWith("--") && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
      args.set(process.argv[i], process.argv[i + 1]);
      i += 1;
    }
  }
  const databaseUrl = args.get("--database-url");
  const campId = args.get("--camp-id");
  const dryRun = !process.argv.includes("--apply");
  if (!databaseUrl || !campId) {
    console.error(JSON.stringify({
      ok: false,
      error: "missing required --database-url <path> and --camp-id <camp>",
    }));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    ...runScoreTightening20260518({ databaseUrl, campId, dryRun }),
  }, null, 2));
}
