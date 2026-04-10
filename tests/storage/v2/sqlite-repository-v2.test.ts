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

describe("SqliteRepository v2 scoring_item_events", () => {
  test("insert + findBySourceRef + sums + updateStatus", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const memberId = "member-student-01";
    const periodId = `period-${campId}-2`;

    repo.insertPeriod({
      id: periodId,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    // approved event (non-LLM path)
    const e1Id = randomUUID();
    repo.insertScoringItemEvent({
      id: e1Id,
      memberId,
      periodId,
      itemCode: "K1",
      dimension: "K",
      scoreDelta: 3,
      sourceType: "card_interaction",
      sourceRef: "card-k1-001",
      status: "approved",
      llmTaskId: null,
      createdAt: "2026-04-11T08:00:00.000Z",
      decidedAt: "2026-04-11T08:00:00.000Z"
    });

    // pending event (LLM-bound)
    const e2Id = randomUUID();
    repo.insertScoringItemEvent({
      id: e2Id,
      memberId,
      periodId,
      itemCode: "K3",
      dimension: "K",
      scoreDelta: 3,
      sourceType: "card_interaction",
      sourceRef: "card-k3-001",
      status: "pending",
      llmTaskId: null,
      createdAt: "2026-04-11T09:00:00.000Z",
      decidedAt: null
    });

    // findEventBySourceRef returns the matching row
    const byRef = repo.findEventBySourceRef(memberId, periodId, "K1", "card-k1-001");
    expect(byRef?.id).toBe(e1Id);
    expect(byRef?.status).toBe("approved");

    // sums
    expect(repo.sumApprovedScoreDelta(memberId, periodId, "K1")).toBe(3);
    expect(repo.sumPendingScoreDelta(memberId, periodId, "K3")).toBe(3);
    expect(repo.sumApprovedScoreDelta(memberId, periodId, "K3")).toBe(0);

    // unique constraint on (memberId, periodId, itemCode, sourceRef)
    expect(() =>
      repo.insertScoringItemEvent({
        id: randomUUID(),
        memberId,
        periodId,
        itemCode: "K1",
        dimension: "K",
        scoreDelta: 3,
        sourceType: "card_interaction",
        sourceRef: "card-k1-001",
        status: "approved",
        llmTaskId: null,
        createdAt: "2026-04-11T10:00:00.000Z",
        decidedAt: "2026-04-11T10:00:00.000Z"
      })
    ).toThrow(/UNIQUE/);

    // updateEventStatus
    repo.updateEventStatus({
      id: e2Id,
      status: "approved",
      decidedAt: "2026-04-11T11:00:00.000Z",
      reviewNote: null,
      reviewedByOpId: null
    });
    expect(repo.sumApprovedScoreDelta(memberId, periodId, "K3")).toBe(3);
    expect(repo.sumPendingScoreDelta(memberId, periodId, "K3")).toBe(0);

    repo.close();
  });

  test("listReviewRequiredEvents returns review_required rows with JOINed memberName and llmReason", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const memberId = "member-student-01";
    const periodId = `period-${campId}-2`;

    repo.insertPeriod({
      id: periodId,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    // Seed an LLM task that the review_required event will link to. The
    // review queue card needs the LLM reason for display, so the repo
    // JOINs this row and exposes `llmReason` on the return shape.
    const taskId = randomUUID();
    const eventId = randomUUID();
    repo.insertScoringItemEvent({
      id: eventId,
      memberId,
      periodId,
      itemCode: "K4",
      dimension: "K",
      scoreDelta: 4,
      sourceType: "card_interaction",
      sourceRef: "card-k4-001",
      status: "review_required",
      llmTaskId: taskId,
      createdAt: "2026-04-11T12:00:00.000Z",
      decidedAt: null
    });
    // Pre-populate the task with a failed/borderline result so the
    // review-queue renderer can surface the reason.
    repo.insertLlmTask({
      id: taskId,
      eventId,
      provider: "glm",
      model: "glm-4.5-flash",
      promptText: "evaluate K4 submission ...",
      enqueuedAt: "2026-04-11T12:00:01.000Z",
      maxAttempts: 3
    });
    repo.claimNextPendingTask("2026-04-11T12:00:05.000Z");
    repo.markTaskSucceeded(taskId, {
      pass: false,
      score: 0,
      reason: "不清楚修正了什么 AI 错误,描述过于空泛",
      raw: { decision: "fail" }
    });

    // An unrelated approved event must NOT appear in the queue.
    repo.insertScoringItemEvent({
      id: randomUUID(),
      memberId,
      periodId,
      itemCode: "K4",
      dimension: "K",
      scoreDelta: 4,
      sourceType: "card_interaction",
      sourceRef: "card-k4-002",
      status: "approved",
      llmTaskId: null,
      createdAt: "2026-04-11T12:30:00.000Z",
      decidedAt: "2026-04-11T12:30:00.000Z"
    });

    // Object-argument signature with pagination; used by Phase G9
    // review-queue card and by any admin API that lists review items.
    const queue = repo.listReviewRequiredEvents({ campId, limit: 10, offset: 0 });
    expect(queue).toHaveLength(1);
    expect(queue[0].sourceRef).toBe("card-k4-001");
    expect(queue[0].memberName).toBeTruthy();
    expect(queue[0].memberId).toBe(memberId);
    expect(queue[0].llmTaskId).toBe(taskId);
    expect(queue[0].llmReason).toContain("空泛");

    // countReviewRequiredEvents powers pagination on the review queue card.
    expect(repo.countReviewRequiredEvents({ campId })).toBe(1);

    // Calling without a campId lists across all camps (single-camp ok).
    const unscoped = repo.listReviewRequiredEvents({ limit: 10, offset: 0 });
    expect(unscoped).toHaveLength(1);

    repo.close();
  });
});

describe("SqliteRepository v2 member_dimension_scores", () => {
  test("increment + decrement + fetch", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const memberId = "member-student-01";
    const periodId = `period-${campId}-2`;

    repo.insertPeriod({
      id: periodId,
      campId,
      number: 2,
      isIceBreaker: false,
      startedAt: "2026-04-11T00:00:00.000Z",
      openedByOpId: null,
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });

    // empty → fetch returns empty
    expect(repo.fetchMemberDimensionScores(memberId, periodId)).toEqual({});

    repo.incrementMemberDimensionScore({
      memberId,
      periodId,
      dimension: "K",
      delta: 3,
      eventAt: "2026-04-11T08:00:00.000Z"
    });
    repo.incrementMemberDimensionScore({
      memberId,
      periodId,
      dimension: "K",
      delta: 4,
      eventAt: "2026-04-11T09:00:00.000Z"
    });
    repo.incrementMemberDimensionScore({
      memberId,
      periodId,
      dimension: "H",
      delta: 5,
      eventAt: "2026-04-11T10:00:00.000Z"
    });

    const scores = repo.fetchMemberDimensionScores(memberId, periodId);
    expect(scores.K).toBe(7);
    expect(scores.H).toBe(5);
    expect(scores.C).toBeUndefined();

    // decrement
    repo.decrementMemberDimensionScore({
      memberId,
      periodId,
      dimension: "K",
      delta: 3,
      eventAt: "2026-04-11T11:00:00.000Z"
    });
    expect(repo.fetchMemberDimensionScores(memberId, periodId).K).toBe(4);

    repo.close();
  });

  test("fetchDimensionCumulativeForRanking aggregates across periods", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;

    const p2 = `period-${campId}-2`;
    const p3 = `period-${campId}-3`;
    for (const [pid, num] of [
      [p2, 2],
      [p3, 3]
    ] as Array<[string, number]>) {
      repo.insertPeriod({
        id: pid,
        campId,
        number: num,
        isIceBreaker: false,
        startedAt: `2026-04-1${num}T00:00:00.000Z`,
        openedByOpId: null,
        createdAt: `2026-04-1${num}T00:00:00.000Z`,
        updatedAt: `2026-04-1${num}T00:00:00.000Z`
      });
    }

    const alice = "member-student-01";
    const bob = "member-student-02";
    for (const m of [alice, bob]) {
      repo.incrementMemberDimensionScore({
        memberId: m,
        periodId: p2,
        dimension: "K",
        delta: 5,
        eventAt: "2026-04-12T00:00:00.000Z"
      });
    }
    repo.incrementMemberDimensionScore({
      memberId: alice,
      periodId: p3,
      dimension: "K",
      delta: 7,
      eventAt: "2026-04-13T00:00:00.000Z"
    });

    const ranking = repo.fetchDimensionCumulativeForRanking(campId, "K", [
      alice,
      bob
    ]);
    // Alice: 5 + 7 = 12, Bob: 5
    expect(ranking).toEqual([
      { memberId: alice, cumulativeScore: 12 },
      { memberId: bob, cumulativeScore: 5 }
    ]);

    repo.close();
  });
});

describe("SqliteRepository v2 window_snapshots", () => {
  test("insert + findSnapshotForWindow + findLatestSnapshotBefore", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const memberId = "member-student-01";

    // seed two windows
    repo.insertWindowShell({
      code: "W1",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });
    repo.insertWindowShell({
      code: "W2",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });
    const w1 = repo.findWindowByCode(campId, "W1")!;
    const w2 = repo.findWindowByCode(campId, "W2")!;

    // insert snapshot for W1
    repo.insertWindowSnapshot({
      id: randomUUID(),
      windowId: w1.id,
      memberId,
      windowAq: 35,
      cumulativeAq: 35,
      kScore: 10,
      hScore: 8,
      cScore: 7,
      sScore: 4,
      gScore: 6,
      growthBonus: 0,
      consecMissedOnEntry: 0,
      snapshotAt: "2026-04-15T00:00:00.000Z"
    });

    const w1Snap = repo.findSnapshotForWindow(w1.id, memberId);
    expect(w1Snap?.windowAq).toBe(35);
    expect(w1Snap?.cumulativeAq).toBe(35);

    // before W2 → returns W1
    const before = repo.findLatestSnapshotBefore(memberId, w2.id);
    expect(before?.windowId).toBe(w1.id);

    // before W1 → returns undefined
    expect(repo.findLatestSnapshotBefore(memberId, w1.id)).toBeUndefined();

    // insert snapshot for W2
    repo.insertWindowSnapshot({
      id: randomUUID(),
      windowId: w2.id,
      memberId,
      windowAq: 40,
      cumulativeAq: 75,
      kScore: 12,
      hScore: 9,
      cScore: 8,
      sScore: 5,
      gScore: 6,
      growthBonus: 3,
      consecMissedOnEntry: 0,
      snapshotAt: "2026-04-25T00:00:00.000Z"
    });

    // UNIQUE(window_id, member_id)
    expect(() =>
      repo.insertWindowSnapshot({
        id: randomUUID(),
        windowId: w2.id,
        memberId,
        windowAq: 99,
        cumulativeAq: 99,
        kScore: 0,
        hScore: 0,
        cScore: 0,
        sScore: 0,
        gScore: 0,
        growthBonus: 0,
        consecMissedOnEntry: 0,
        snapshotAt: "2026-04-26T00:00:00.000Z"
      })
    ).toThrow(/UNIQUE/);

    repo.close();
  });
});

describe("SqliteRepository v2 member_levels", () => {
  test("getMemberLevel defaults to 1 when no row exists", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();

    const level = repo.getMemberLevel("member-student-01");
    expect(level.currentLevel).toBe(1);
    expect(level.lastWindowId).toBeNull();

    repo.close();
  });

  test("upsertMemberLevel writes then reads back", () => {
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

    repo.upsertMemberLevel({
      memberId: "member-student-01",
      currentLevel: 2,
      levelAttainedAt: "2026-04-20T00:00:00.000Z",
      lastWindowId: w1.id,
      updatedAt: "2026-04-20T00:00:00.000Z"
    });

    const level = repo.getMemberLevel("member-student-01");
    expect(level.currentLevel).toBe(2);
    expect(level.lastWindowId).toBe(w1.id);
    expect(level.levelAttainedAt).toBe("2026-04-20T00:00:00.000Z");

    // upsert again (promotion to Lv3)
    repo.upsertMemberLevel({
      memberId: "member-student-01",
      currentLevel: 3,
      levelAttainedAt: "2026-04-30T00:00:00.000Z",
      lastWindowId: w1.id,
      updatedAt: "2026-04-30T00:00:00.000Z"
    });
    expect(repo.getMemberLevel("member-student-01").currentLevel).toBe(3);

    repo.close();
  });
});

describe("SqliteRepository v2 promotion_records", () => {
  test("insert + findPromotionForWindow + listPromotionsForMember", () => {
    const repo = new SqliteRepository(":memory:");
    repo.seedDemo();
    const campId = repo.getDefaultCampId()!;
    const memberId = "member-student-01";

    repo.insertWindowShell({
      code: "W1",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });
    repo.insertWindowShell({
      code: "W2",
      campId,
      isFinal: false,
      createdAt: "2026-04-10T00:00:00.000Z"
    });
    const w1 = repo.findWindowByCode(campId, "W1")!;
    const w2 = repo.findWindowByCode(campId, "W2")!;

    repo.insertPromotionRecord({
      id: randomUUID(),
      windowId: w1.id,
      memberId,
      evaluatedAt: "2026-04-20T00:00:00.000Z",
      fromLevel: 1,
      toLevel: 2,
      promoted: true,
      pathTaken: "primary",
      reason: JSON.stringify({ conditionChecks: [] })
    });

    const r1 = repo.findPromotionForWindow(w1.id, memberId);
    expect(r1?.promoted).toBe(true);
    expect(r1?.toLevel).toBe(2);
    expect(r1?.pathTaken).toBe("primary");

    // no record for W2 yet
    expect(repo.findPromotionForWindow(w2.id, memberId)).toBeUndefined();

    // insert second record (not promoted)
    repo.insertPromotionRecord({
      id: randomUUID(),
      windowId: w2.id,
      memberId,
      evaluatedAt: "2026-04-30T00:00:00.000Z",
      fromLevel: 2,
      toLevel: 2,
      promoted: false,
      pathTaken: "none",
      reason: JSON.stringify({ conditionChecks: [] })
    });

    const all = repo.listPromotionsForMember(memberId);
    expect(all).toHaveLength(2);
    expect(all[0].windowId).toBe(w1.id);
    expect(all[1].windowId).toBe(w2.id);

    // UNIQUE(window_id, member_id)
    expect(() =>
      repo.insertPromotionRecord({
        id: randomUUID(),
        windowId: w1.id,
        memberId,
        evaluatedAt: "2026-04-21T00:00:00.000Z",
        fromLevel: 1,
        toLevel: 1,
        promoted: false,
        pathTaken: "none",
        reason: "{}"
      })
    ).toThrow(/UNIQUE/);

    repo.close();
  });
});
