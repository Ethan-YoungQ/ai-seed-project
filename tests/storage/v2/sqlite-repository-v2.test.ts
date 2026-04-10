import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";
import { describe, expect, test } from "vitest";

import { SqliteRepository } from "../../../src/storage/sqlite-repository.js";

describe("SqliteRepository v2 schema", () => {
  test("creates all 9 v2 tables on construction", () => {
    const repo = new SqliteRepository(":memory:");
    // Access the underlying db via a private cast for schema assertion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: Database.Database = (repo as unknown as { db: Database.Database }).db;

    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN (?,?,?,?,?,?,?,?,?)"
      )
      .all(
        "v2_periods",
        "v2_windows",
        "v2_card_interactions",
        "v2_scoring_item_events",
        "v2_member_dimension_scores",
        "v2_window_snapshots",
        "v2_member_levels",
        "v2_promotion_records",
        "v2_llm_scoring_tasks"
      ) as Array<{ name: string }>;

    expect(rows.map((r) => r.name).sort()).toEqual([
      "v2_card_interactions",
      "v2_llm_scoring_tasks",
      "v2_member_dimension_scores",
      "v2_member_levels",
      "v2_periods",
      "v2_promotion_records",
      "v2_scoring_item_events",
      "v2_window_snapshots",
      "v2_windows"
    ]);

    repo.close();
  });
});

describe("SqliteRepository v2 backfilled tables (peer_review_votes + reaction_tracked_messages)", () => {
  test("both tables exist on construction", () => {
    const repo = new SqliteRepository(":memory:");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (repo as unknown as { db: import("better-sqlite3").Database }).db;
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN (?, ?)"
      )
      .all("peer_review_votes", "reaction_tracked_messages") as Array<{
      name: string;
    }>;
    expect(rows.map((r) => r.name).sort()).toEqual([
      "peer_review_votes",
      "reaction_tracked_messages"
    ]);
    repo.close();
  });

  test("insertPeerReviewVote + listVotesBySession dedupes duplicate votes", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();

    const sessionId = "prs-1";
    const voteA = {
      id: randomUUID(),
      peerReviewSessionId: sessionId,
      voterMemberId: "member-student-01",
      votedMemberId: "member-student-02",
      votedAt: "2026-04-11T20:00:00.000Z"
    };
    expect(repo.insertPeerReviewVote(voteA)).toBe("inserted");

    // same (session, voter, voted) triple → already_exists, no throw
    const voteADup = { ...voteA, id: randomUUID() };
    expect(repo.insertPeerReviewVote(voteADup)).toBe("already_exists");

    // a distinct voter casts a vote for the same target
    const voteB = {
      id: randomUUID(),
      peerReviewSessionId: sessionId,
      voterMemberId: "member-student-03",
      votedMemberId: "member-student-02",
      votedAt: "2026-04-11T20:01:00.000Z"
    };
    expect(repo.insertPeerReviewVote(voteB)).toBe("inserted");

    const votes = repo.listPeerReviewVotesBySession(sessionId);
    expect(votes).toHaveLength(2);
    expect(
      votes.map((v) => `${v.voterMemberId}→${v.votedMemberId}`).sort()
    ).toEqual([
      "member-student-01→member-student-02",
      "member-student-03→member-student-02"
    ]);

    repo.close();
  });

  test("insertReactionTrackedMessage + findReactionTrackedMessage", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();

    const row = {
      id: randomUUID(),
      feishuMessageId: "om-c1-echo-1",
      memberId: "member-student-01",
      itemCode: "C2" as const,
      postedAt: "2026-04-11T21:00:00.000Z",
      reactionCount: 0
    };
    repo.insertReactionTrackedMessage(row);

    const found = repo.findReactionTrackedMessageByFeishuMessageId("om-c1-echo-1");
    expect(found?.id).toBe(row.id);
    expect(found?.memberId).toBe("member-student-01");
    expect(found?.reactionCount).toBe(0);

    // the reaction tracker bumps the counter from the reaction webhook handler
    repo.incrementReactionCount("om-c1-echo-1");
    repo.incrementReactionCount("om-c1-echo-1");
    const afterBump = repo.findReactionTrackedMessageByFeishuMessageId("om-c1-echo-1");
    expect(afterBump?.reactionCount).toBe(2);

    repo.close();
  });
});

describe("SqliteRepository v2 periods", () => {
  test("insertPeriod + findActivePeriod + findPeriodByNumber + closePeriod + listPeriods", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    // insert ice-breaker (period 1)
    const p1 = {
      id: `period-${campId}-1`,
      campId,
      number: 1,
      isIceBreaker: true,
      startedAt: "2026-04-10T00:00:00.000Z",
      openedByOpId: "op-001",
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z"
    };
    repo.insertPeriod(p1);

    // findActivePeriod should return p1
    const active1 = repo.findActivePeriod(campId);
    expect(active1?.id).toBe(p1.id);
    expect(active1?.number).toBe(1);
    expect(active1?.isIceBreaker).toBe(true);
    expect(active1?.endedAt).toBeNull();

    // findPeriodByNumber
    const byNum = repo.findPeriodByNumber(campId, 1);
    expect(byNum?.id).toBe(p1.id);

    // insert period 2 and close period 1 atomically via closePeriod
    repo.closePeriod(p1.id, "2026-04-11T00:00:00.000Z", "next_period_opened");

    const p2 = {
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: "op-001",
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    };
    repo.insertPeriod(p2);

    const active2 = repo.findActivePeriod(campId);
    expect(active2?.id).toBe(p2.id);

    const closedP1 = repo.findPeriodByNumber(campId, 1);
    expect(closedP1?.endedAt).toBe("2026-04-11T00:00:00.000Z");
    expect(closedP1?.closedReason).toBe("next_period_opened");

    const all = repo.listPeriods(campId);
    expect(all.map((p) => p.number)).toEqual([1, 2]);

    // unknown number returns undefined
    expect(repo.findPeriodByNumber(campId, 99)).toBeUndefined();

    repo.close();
  });

  test("findActivePeriod returns undefined when all periods closed", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    const p = {
      id: `period-${campId}-1`,
      campId,
      number: 1,
      isIceBreaker: true,
      startedAt: "2026-04-10T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-10T00:00:00.000Z",
      updatedAt: "2026-04-10T00:00:00.000Z"
    };
    repo.insertPeriod(p);
    repo.closePeriod(p.id, "2026-04-11T00:00:00.000Z", "manual_close");

    expect(repo.findActivePeriod(campId)).toBeUndefined();
    repo.close();
  });
});

describe("SqliteRepository v2 windows", () => {
  test("insertWindowShell + attachFirstPeriod + attachLastPeriod + findWindowByLastPeriod", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    // seed two periods to attach later
    const p2 = {
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    };
    const p3 = {
      id: `period-${campId}-3`,
      campId,
      number: 3,
      isIceBreaker: false,
      startedAt: "2026-04-12T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-12T00:00:00.000Z",
      updatedAt: "2026-04-12T00:00:00.000Z"
    };
    repo.insertPeriod(p2);
    repo.insertPeriod(p3);

    // insert W1 shell (no periods)
    repo.insertWindowShell({
      code: "W1",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });

    // findOpenWindowWithOpenSlot returns W1
    const open1 = repo.findOpenWindowWithOpenSlot(campId);
    expect(open1?.code).toBe("W1");
    expect(open1?.firstPeriodId).toBeNull();
    expect(open1?.lastPeriodId).toBeNull();

    repo.attachFirstPeriod(open1!.id, p2.id);
    const afterFirst = repo.findOpenWindowWithOpenSlot(campId);
    expect(afterFirst?.firstPeriodId).toBe(p2.id);
    expect(afterFirst?.lastPeriodId).toBeNull();

    repo.attachLastPeriod(afterFirst!.id, p3.id);

    // now W1 has no open slot → findOpenWindowWithOpenSlot returns undefined
    expect(repo.findOpenWindowWithOpenSlot(campId)).toBeUndefined();

    // findWindowByLastPeriod(p3) returns W1
    const byLast = repo.findWindowByLastPeriod(p3.id);
    expect(byLast?.code).toBe("W1");

    // findWindowByCode
    const byCode = repo.findWindowByCode(campId, "W1");
    expect(byCode?.id).toBe(byLast?.id);

    // markWindowSettling → markWindowSettled
    repo.markWindowSettling(byLast!.id);
    const settling = repo.findWindowByCode(campId, "W1");
    expect(settling?.settlementState).toBe("settling");

    repo.markWindowSettled(byLast!.id, "2026-04-20T00:00:00.000Z");
    const settled = repo.findWindowByCode(campId, "W1");
    expect(settled?.settlementState).toBe("settled");
    expect(settled?.settledAt).toBe("2026-04-20T00:00:00.000Z");

    repo.close();
  });

  test("insertWindowShell is idempotent on UNIQUE(camp_id, code)", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    repo.insertWindowShell({
      code: "W2",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });
    expect(() =>
      repo.insertWindowShell({
        code: "W2",
        campId,
        isFinal: false,
        createdAt: "2026-04-10T00:00:00.000Z"
      })
    ).toThrow(/UNIQUE/);

    repo.close();
  });

  test("findOpenWindowWithOpenSlot skips settled windows", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    repo.insertWindowShell({
      code: "W1",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });
    const w1 = repo.findWindowByCode(campId, "W1")!;
    repo.markWindowSettling(w1.id);
    repo.markWindowSettled(w1.id, "2026-04-20T00:00:00.000Z");

    expect(repo.findOpenWindowWithOpenSlot(campId)).toBeUndefined();
    repo.close();
  });
});

describe("SqliteRepository v2 card_interactions", () => {
  test("insert + list by member/period", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const memberId = "member-student-01";

    repo.insertPeriod({
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    const interactionA = {
      id: randomUUID(),
      memberId,
      periodId: `period-${campId}-2`,
      cardType: "daily_checkin" as const,
      actionName: "submit_k3_summary",
      actionPayload: JSON.stringify({ text: "today I learned ..." }),
      feishuMessageId: "om_msg_001",
      feishuCardVersion: "v1",
      receivedAt: "2026-04-11T08:00:00.000Z"
    };
    const interactionB = {
      id: randomUUID(),
      memberId,
      periodId: `period-${campId}-2`,
      cardType: "quiz" as const,
      actionName: "answer_k2",
      actionPayload: JSON.stringify({ score: 8 }),
      feishuMessageId: "om_msg_002",
      feishuCardVersion: "v1",
      receivedAt: "2026-04-11T09:00:00.000Z"
    };
    repo.insertCardInteraction(interactionA);
    repo.insertCardInteraction(interactionB);

    const all = repo.listCardInteractionsForMember(memberId, `period-${campId}-2`);
    expect(all).toHaveLength(2);

    const onlyQuiz = repo.listCardInteractionsForMember(
      memberId,
      `period-${campId}-2`,
      "quiz"
    );
    expect(onlyQuiz).toHaveLength(1);
    expect(onlyQuiz[0].actionName).toBe("answer_k2");
    expect(onlyQuiz[0].actionPayload).toContain("score");

    repo.close();
  });
});

// B9 seeds events via raw SQL because the public
// `insertScoringItemEvent` lands in Task B4 (next commit). This keeps the
// B9 commit self-contained on the queue primitives while matching the
// private-cast pattern already used for the stale-workers test.
function seedScoringEventRaw(
  repo: SqliteRepository,
  args: {
    id: string;
    memberId: string;
    periodId: string;
    itemCode: string;
    dimension: string;
    scoreDelta: number;
    sourceRef: string;
    status: string;
    createdAt: string;
  }
): void {
  const internal = repo as unknown as { db: Database.Database };
  internal.db
    .prepare(
      `INSERT INTO v2_scoring_item_events
        (id, member_id, period_id, item_code, dimension, score_delta,
         source_type, source_ref, status, llm_task_id, reviewed_by_op_id,
         review_note, created_at, decided_at)
       VALUES (@id, @memberId, @periodId, @itemCode, @dimension, @scoreDelta,
               'card_interaction', @sourceRef, @status, NULL, NULL, NULL,
               @createdAt, NULL)`
    )
    .run(args);
}

describe("SqliteRepository v2 llm_scoring_tasks", () => {
  test("insert + claimNextPending + markTaskSucceeded", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    repo.insertPeriod({
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    const eventId = randomUUID();
    seedScoringEventRaw(repo, {
      id: eventId,
      memberId: "member-student-01",
      periodId: `period-${campId}-2`,
      itemCode: "K3",
      dimension: "K",
      scoreDelta: 3,
      sourceRef: "card-k3-001",
      status: "pending",
      createdAt: "2026-04-11T08:00:00.000Z"
    });

    const taskId = repo.insertLlmTask({
      id: randomUUID(),
      eventId,
      provider: "glm",
      model: "glm-4-plus",
      promptText: "evaluate K3 submission ...",
      enqueuedAt: "2026-04-11T08:00:01.000Z",
      maxAttempts: 3
    });
    expect(taskId).toBeTruthy();

    const claimed = repo.claimNextPendingTask("2026-04-11T08:05:00.000Z");
    expect(claimed?.id).toBe(taskId);
    expect(claimed?.status).toBe("running");
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.startedAt).toBe("2026-04-11T08:05:00.000Z");

    // claiming again returns undefined
    expect(repo.claimNextPendingTask("2026-04-11T08:05:10.000Z")).toBeUndefined();

    repo.markTaskSucceeded(taskId, {
      pass: true,
      score: 3,
      reason: "approved",
      raw: { decision: "approved" }
    });
    // after success, still no pending task
    expect(repo.claimNextPendingTask("2026-04-11T08:06:00.000Z")).toBeUndefined();

    repo.close();
  });

  test("markTaskFailedRetry re-queues under max_attempts", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    repo.insertPeriod({
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    const eventId = randomUUID();
    seedScoringEventRaw(repo, {
      id: eventId,
      memberId: "member-student-01",
      periodId: `period-${campId}-2`,
      itemCode: "K3",
      dimension: "K",
      scoreDelta: 3,
      sourceRef: "card-k3-retry",
      status: "pending",
      createdAt: "2026-04-11T08:00:00.000Z"
    });

    const taskId = repo.insertLlmTask({
      id: randomUUID(),
      eventId,
      provider: "glm",
      model: "glm-4-plus",
      promptText: "...",
      enqueuedAt: "2026-04-11T08:00:00.000Z",
      maxAttempts: 3
    });

    repo.claimNextPendingTask("2026-04-11T08:01:00.000Z");
    repo.markTaskFailedRetry(taskId, 30, "timeout");

    // reclaim after backoff window
    const reclaimed = repo.claimNextPendingTask("2026-04-11T08:02:00.000Z");
    expect(reclaimed?.id).toBe(taskId);
    expect(reclaimed?.attempts).toBe(2);

    repo.close();
  });

  test("markTaskFailedTerminal leaves task in failed state", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    repo.insertPeriod({
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    const eventId = randomUUID();
    seedScoringEventRaw(repo, {
      id: eventId,
      memberId: "member-student-01",
      periodId: `period-${campId}-2`,
      itemCode: "K3",
      dimension: "K",
      scoreDelta: 3,
      sourceRef: "card-k3-terminal",
      status: "pending",
      createdAt: "2026-04-11T08:00:00.000Z"
    });

    const taskId = repo.insertLlmTask({
      id: randomUUID(),
      eventId,
      provider: "glm",
      model: "glm-4-plus",
      promptText: "...",
      enqueuedAt: "2026-04-11T08:00:00.000Z",
      maxAttempts: 1
    });
    repo.claimNextPendingTask("2026-04-11T08:01:00.000Z");
    repo.markTaskFailedTerminal(taskId, "invalid_json");

    // never picked up again
    expect(repo.claimNextPendingTask("2026-04-11T08:10:00.000Z")).toBeUndefined();
    repo.close();
  });

  test("requeueStaleRunningTasks recovers crashed workers", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    repo.insertPeriod({
      id: `period-${campId}-2`,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    const eventId = randomUUID();
    seedScoringEventRaw(repo, {
      id: eventId,
      memberId: "member-student-01",
      periodId: `period-${campId}-2`,
      itemCode: "K3",
      dimension: "K",
      scoreDelta: 3,
      sourceRef: "card-k3-stale",
      status: "pending",
      createdAt: "2026-04-11T08:00:00.000Z"
    });

    const taskId = repo.insertLlmTask({
      id: randomUUID(),
      eventId,
      provider: "glm",
      model: "glm-4-plus",
      promptText: "...",
      enqueuedAt: "2026-04-11T08:00:00.000Z",
      maxAttempts: 3
    });
    // claim and then simulate crash: push started_at deep into the past so
    // it is unambiguously before `cutoff = Date.now() - timeoutMs`. The plan
    // used 2026-04-11T07:00:00 which is not guaranteed to be before the
    // real wall clock at run time; 2000-01-01 makes the stale check
    // deterministic regardless of when the suite runs.
    repo.claimNextPendingTask("2026-04-11T08:01:00.000Z");
    const internal = repo as unknown as { db: Database.Database };
    internal.db
      .prepare(`UPDATE v2_llm_scoring_tasks SET started_at = ? WHERE id = ?`)
      .run("2000-01-01T00:00:00.000Z", taskId);

    const requeued = repo.requeueStaleRunningTasks(60 * 60 * 1000); // 1h
    expect(requeued).toBe(1);

    const next = repo.claimNextPendingTask("2026-04-11T09:00:00.000Z");
    expect(next?.id).toBe(taskId);

    repo.close();
  });
});
