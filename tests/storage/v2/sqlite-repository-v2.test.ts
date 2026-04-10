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
