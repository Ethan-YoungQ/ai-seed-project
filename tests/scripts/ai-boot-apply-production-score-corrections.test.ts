import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { runProductionScoreCorrections } from "../../src/scripts/ai-boot-apply-production-score-corrections";

describe("runProductionScoreCorrections", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  function makeFixture(periodScore = 3) {
    dir = mkdtempSync(join(tmpdir(), "ai-boot-corrections-"));
    const dbPath = join(dir, "app.db");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE v2_scoring_item_events (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        period_id TEXT NOT NULL,
        item_code TEXT NOT NULL,
        dimension TEXT NOT NULL,
        score_delta INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        status TEXT NOT NULL,
        llm_task_id TEXT,
        reviewed_by_op_id TEXT,
        review_note TEXT,
        created_at TEXT NOT NULL,
        decided_at TEXT
      );
      CREATE TABLE v2_periods (
        id TEXT PRIMARY KEY,
        camp_id TEXT NOT NULL
      );
      CREATE TABLE v2_member_dimension_scores (
        member_id TEXT NOT NULL,
        period_id TEXT NOT NULL,
        dimension TEXT NOT NULL,
        period_score INTEGER NOT NULL DEFAULT 0,
        event_count INTEGER NOT NULL DEFAULT 0,
        last_event_at TEXT NOT NULL,
        PRIMARY KEY (member_id, period_id, dimension)
      );
    `);
    db.prepare("INSERT INTO v2_periods (id, camp_id) VALUES ('p-1', 'camp-demo')").run();
    db.prepare(
      `INSERT INTO v2_scoring_item_events
        (id, member_id, period_id, item_code, dimension, score_delta,
         source_type, source_ref, status, created_at, decided_at)
       VALUES
        ('66c0a16b-bbdc-41d3-8fed-912df58e07ab', 'm-1', 'p-1', 'K1', 'K', 3,
         'card_interaction', 'msg:test:K1', 'approved', '2026-04-22T12:15:15.536Z',
         '2026-04-22T12:15:15.536Z')`
    ).run();
    db.prepare(
      `INSERT INTO v2_member_dimension_scores
        (member_id, period_id, dimension, period_score, event_count, last_event_at)
       VALUES ('m-1', 'p-1', 'K', ?, 1, '2026-04-22T12:15:15.536Z')`
    ).run(periodScore);
    db.close();
    return dbPath;
  }

  it("inserts idempotent negative compensation events and updates dimension totals", () => {
    const dbPath = makeFixture();
    const first = runProductionScoreCorrections({
      databaseUrl: dbPath,
      campId: "camp-demo",
      dryRun: false,
      now: "2026-05-17T08:00:00.000Z",
      uuid: () => "fixed",
    });
    const second = runProductionScoreCorrections({
      databaseUrl: dbPath,
      campId: "camp-demo",
      dryRun: false,
      now: "2026-05-17T08:00:00.000Z",
      uuid: () => "fixed",
    });

    const verify = new Database(dbPath);
    expect(first.applied).toBe(1);
    expect(first.totalDelta).toBe(-3);
    expect(second.applied).toBe(0);
    expect(verify.prepare("SELECT period_score FROM v2_member_dimension_scores").get()).toEqual({
      period_score: 0,
    });
    expect(
      verify.prepare(
        "SELECT score_delta, source_type, reviewed_by_op_id FROM v2_scoring_item_events WHERE source_ref LIKE 'codex-correction:%'"
      ).all()
    ).toEqual([
      {
        score_delta: -3,
        source_type: "operator_manual",
        reviewed_by_op_id: "codex",
      },
    ]);
    verify.close();
  });

  it("dry-runs without writing and refuses mismatched camp or over-deducted totals", () => {
    const dbPath = makeFixture(2);

    expect(runProductionScoreCorrections({
      databaseUrl: dbPath,
      campId: "camp-demo",
      dryRun: true,
    })).toMatchObject({ applied: 0, skipped: 15, totalDelta: 0 });
    expect(runProductionScoreCorrections({
      databaseUrl: dbPath,
      campId: "wrong-camp",
      dryRun: false,
    })).toMatchObject({ applied: 0, skipped: 15, totalDelta: 0 });

    const verify = new Database(dbPath);
    expect(
      verify.prepare(
        "SELECT COUNT(*) AS count FROM v2_scoring_item_events WHERE source_ref LIKE 'codex-correction:%'"
      ).get()
    ).toEqual({ count: 0 });
    verify.close();
  });
});
