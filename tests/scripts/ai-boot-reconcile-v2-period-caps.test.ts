import { afterEach, describe, expect, it } from "vitest";

import { reconcileV2PeriodCaps } from "../../src/scripts/ai-boot-reconcile-v2-period-caps.js";
import { SqliteRepository } from "../../src/storage/sqlite-repository.js";

const repositories: SqliteRepository[] = [];

function makeRepo(): SqliteRepository {
  const repository = new SqliteRepository(":memory:");
  repository.seedDemo();
  repository.insertPeriod({
    id: "period-2",
    campId: "camp-demo",
    number: 2,
    isIceBreaker: false,
    startedAt: "2026-04-22T00:00:00.000Z",
    openedByOpId: null,
    createdAt: "2026-04-22T00:00:00.000Z",
    updatedAt: "2026-04-22T00:00:00.000Z",
  });
  repositories.push(repository);
  return repository;
}

function insertApprovedEvent(
  repository: SqliteRepository,
  input: {
    id: string;
    memberId?: string;
    itemCode: string;
    dimension: string;
    scoreDelta: number;
    sourceRef?: string;
    decidedAt?: string;
  }
): void {
  const db = (repository as unknown as { db: import("better-sqlite3").Database }).db;
  db.prepare(
    `INSERT INTO v2_scoring_item_events
      (id, member_id, period_id, item_code, dimension, score_delta,
       source_type, source_ref, status, llm_task_id, reviewed_by_op_id,
       review_note, created_at, decided_at)
     VALUES
      (@id, @memberId, 'period-2', @itemCode, @dimension, @scoreDelta,
       'card_interaction', @sourceRef, 'approved', NULL, NULL,
       NULL, @decidedAt, @decidedAt)`
  ).run({
    id: input.id,
    memberId: input.memberId ?? "user-alice",
    itemCode: input.itemCode,
    dimension: input.dimension,
    scoreDelta: input.scoreDelta,
    sourceRef: input.sourceRef ?? input.id,
    decidedAt: input.decidedAt ?? "2026-05-01T00:00:00.000Z",
  });
}

function upsertDimensionScore(
  repository: SqliteRepository,
  input: {
    memberId?: string;
    dimension: string;
    periodScore: number;
    eventCount?: number;
  }
): void {
  const db = (repository as unknown as { db: import("better-sqlite3").Database }).db;
  db.prepare(
    `INSERT INTO v2_member_dimension_scores
      (member_id, period_id, dimension, period_score, event_count, last_event_at)
     VALUES (?, 'period-2', ?, ?, ?, '2026-05-01T00:00:00.000Z')`
  ).run(input.memberId ?? "user-alice", input.dimension, input.periodScore, input.eventCount ?? 1);
}

describe("reconcileV2PeriodCaps", () => {
  afterEach(() => {
    while (repositories.length > 0) {
      repositories.pop()?.close();
    }
  });

  it("dry-runs over-cap corrections without mutating events or dimension scores", () => {
    const repository = makeRepo();
    insertApprovedEvent(repository, { id: "c3-1", itemCode: "C3", dimension: "C", scoreDelta: 5 });
    insertApprovedEvent(repository, { id: "c3-2", itemCode: "C3", dimension: "C", scoreDelta: 5 });
    upsertDimensionScore(repository, { dimension: "C", periodScore: 10 });

    const result = reconcileV2PeriodCaps({
      repository,
      campId: "camp-demo",
      periodNumber: 2,
      apply: false,
      nowIso: "2026-05-18T00:00:00.000Z",
    });

    expect(result.corrections).toEqual([
      expect.objectContaining({
        memberId: "user-alice",
        itemCode: "C3",
        dimension: "C",
        netScore: 10,
        cap: 5,
        correctionDelta: -5,
        skippedExisting: false,
      }),
    ]);
    expect(result.dimensionChanges).toEqual([
      expect.objectContaining({
        memberId: "user-alice",
        dimension: "C",
        oldScore: 10,
        newScore: 5,
        delta: -5,
      }),
    ]);
    expect(repository.fetchMemberDimensionScores("user-alice", "period-2").C).toBe(10);
  });

  it("applies cap corrections and rebuilds dimension scores from approved event sums", () => {
    const repository = makeRepo();
    insertApprovedEvent(repository, { id: "k1-1", itemCode: "K1", dimension: "K", scoreDelta: 3 });
    insertApprovedEvent(repository, { id: "k1-2", itemCode: "K1", dimension: "K", scoreDelta: 3 });
    insertApprovedEvent(repository, { id: "k2-1", itemCode: "K2", dimension: "K", scoreDelta: 2 });
    insertApprovedEvent(repository, { id: "k3-1", itemCode: "K3", dimension: "K", scoreDelta: 3 });
    upsertDimensionScore(repository, { dimension: "K", periodScore: 8 });

    const result = reconcileV2PeriodCaps({
      repository,
      campId: "camp-demo",
      periodNumber: 2,
      apply: true,
      nowIso: "2026-05-18T00:00:00.000Z",
      uuid: () => "fixed",
    });

    expect(result.corrections).toEqual([
      expect.objectContaining({
        itemCode: "K1",
        netScore: 6,
        cap: 3,
        correctionDelta: -3,
      }),
    ]);
    expect(result.dimensionChanges).toEqual([]);
    expect(repository.fetchMemberDimensionScores("user-alice", "period-2").K).toBe(8);

    const db = (repository as unknown as { db: import("better-sqlite3").Database }).db;
    const correction = db.prepare(
      `SELECT score_delta, source_type, status, review_note
       FROM v2_scoring_item_events
       WHERE source_ref = 'codex-v2-period-cap-reconcile-20260518:period-2:user-alice:K1'`
    ).get() as { score_delta: number; source_type: string; status: string; review_note: string };
    expect(correction).toMatchObject({
      score_delta: -3,
      source_type: "operator_manual",
      status: "approved",
      review_note: expect.stringContaining("周期上限纠偏"),
    });
  });
});
