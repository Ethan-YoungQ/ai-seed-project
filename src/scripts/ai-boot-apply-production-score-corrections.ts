import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import Database from "better-sqlite3";

import { loadLocalEnv } from "../config/load-env.js";

export interface ScoreCorrection {
  originalEventId: string;
  reason: string;
}

export interface ScoreCorrectionResult {
  checked: number;
  applied: number;
  skipped: number;
  totalDelta: number;
}

const CORRECTIONS: readonly ScoreCorrection[] = [
  {
    originalEventId: "c263f000-96a4-4728-b7b8-c35823d13608",
    reason: "撤销无群消息证据且 LLM 判定为空提交的 C1 加分",
  },
  {
    originalEventId: "0fe80cfe-91d5-4dde-883b-5af4b4236498",
    reason: "撤销 retro C1：无群消息证据且 LLM 判定为空提交",
  },
  {
    originalEventId: "f5dd5127-1908-4b1a-98ba-7f78ae19eb64",
    reason: "撤销 retro C1：无群消息证据且 LLM 判定为空提交",
  },
  {
    originalEventId: "8a599656-0375-40de-8c5c-7130ab479885",
    reason: "撤销无群消息证据且 LLM 判定为空提交的 H2 加分",
  },
  {
    originalEventId: "66c0a16b-bbdc-41d3-8fed-912df58e07ab",
    reason: "撤销“收到”触发的 K1 弱参与加分",
  },
  {
    originalEventId: "51951303-7965-479a-a40d-275c5d5b608b",
    reason: "撤销“收到”触发的 K1 弱参与加分",
  },
  {
    originalEventId: "620e7784-6465-4b97-9649-26224b23f0cb",
    reason: "撤销“[OK]”触发的 K1 弱参与加分",
  },
  {
    originalEventId: "6ad850e0-2026-47a2-bfad-8d781e0aa162",
    reason: "撤销“收到”触发的 K1 弱参与加分",
  },
  {
    originalEventId: "b60c02f2-f07a-4301-9486-69671668f9af",
    reason: "撤销“收到”触发的 K1 弱参与加分",
  },
  {
    originalEventId: "c24c37e9-1eca-40f1-9455-e25a98a366ba",
    reason: "撤销“收到”触发的 K1 弱参与加分",
  },
  {
    originalEventId: "cdae23aa-3801-469d-86d0-228fd3cad306",
    reason: "撤销“收到”触发的 K1 弱参与加分",
  },
  {
    originalEventId: "2dc4eb52-4243-4a3e-a3a8-b4ff167e4849",
    reason: "撤销文件作业同条消息额外触发的 K1 加分",
  },
  {
    originalEventId: "adb67b3e-b3d6-440e-bb8d-7b09517468eb",
    reason: "撤销长文设计思路同条消息额外触发的 K1 加分",
  },
  {
    originalEventId: "74b53ad3-f9c4-49e5-930b-a01bb1456317",
    reason: "撤销追聊闲聊触发的 K1 加分",
  },
  {
    originalEventId: "a289df33-e1f3-4d80-854a-92c13048edca",
    reason: "撤销追聊闲聊触发的 K1 加分",
  },
];

interface OriginalEventRow {
  id: string;
  member_id: string;
  period_id: string;
  camp_id: string;
  item_code: string;
  dimension: string;
  score_delta: number;
  status: string;
}

export function runProductionScoreCorrections(input: {
  databaseUrl: string;
  campId: string;
  now?: string;
  dryRun?: boolean;
  uuid?: () => string;
}): ScoreCorrectionResult {
  if (!existsSync(input.databaseUrl)) {
    throw new Error(`database not found: ${input.databaseUrl}`);
  }
  const db = new Database(input.databaseUrl);
  const now = input.now ?? new Date().toISOString();
  const uuid = input.uuid ?? randomUUID;
  const dryRun = input.dryRun ?? true;

  const tx = db.transaction(() => {
    const result: ScoreCorrectionResult = {
      checked: CORRECTIONS.length,
      applied: 0,
      skipped: 0,
      totalDelta: 0,
    };

    for (const correction of CORRECTIONS) {
      const original = db
        .prepare(
          `SELECT e.id, e.member_id, e.period_id, p.camp_id, e.item_code,
                  e.dimension, e.score_delta, e.status
           FROM v2_scoring_item_events e
           INNER JOIN v2_periods p ON p.id = e.period_id
           WHERE e.id = ?`
        )
        .get(correction.originalEventId) as OriginalEventRow | undefined;
      if (
        !original ||
        original.camp_id !== input.campId ||
        original.status !== "approved" ||
        original.score_delta <= 0
      ) {
        result.skipped += 1;
        continue;
      }

      const sourceRef = `codex-correction:2026-05-17:${original.id}`;
      const existing = db
        .prepare(
          `SELECT id FROM v2_scoring_item_events
           WHERE member_id = ? AND period_id = ? AND item_code = ? AND source_ref = ?
           LIMIT 1`
        )
        .get(original.member_id, original.period_id, original.item_code, sourceRef);
      if (existing) {
        result.skipped += 1;
        continue;
      }

      const delta = -Number(original.score_delta);
      const dimensionScore = db
        .prepare(
          `SELECT period_score FROM v2_member_dimension_scores
           WHERE member_id = ? AND period_id = ? AND dimension = ?`
        )
        .get(original.member_id, original.period_id, original.dimension) as
          | { period_score: number }
          | undefined;
      if (!dimensionScore || Number(dimensionScore.period_score) + delta < 0) {
        result.skipped += 1;
        continue;
      }

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

      result.applied += 1;
      result.totalDelta += delta;
    }

    return result;
  });

  try {
    return tx();
  } finally {
    db.close();
  }
}

if (process.argv[1]?.endsWith("ai-boot-apply-production-score-corrections.ts")) {
  loadLocalEnv();
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
  const result = runProductionScoreCorrections({ databaseUrl, campId, dryRun });
  console.log(JSON.stringify({ ok: true, dryRun, ...result }));
}
