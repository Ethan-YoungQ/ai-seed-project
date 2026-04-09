import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { SqliteRepository } from "../../src/storage/sqlite-repository";

function createTempDatabasePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase-one-sqlite-"));
  return {
    dir,
    file: path.join(dir, "legacy.db")
  };
}

describe("SqliteRepository compatibility migration", () => {
  let tempDir: string | undefined;
  let repository: SqliteRepository | undefined;

  afterEach(() => {
    repository?.close();
    repository = undefined;
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    tempDir = undefined;
  });

  it("backfills session results from existing scores and patches legacy columns", () => {
    const temp = createTempDatabasePath();
    tempDir = temp.dir;

    const legacyDb = new Database(temp.file);
    legacyDb.exec(`
      CREATE TABLE camps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        group_id TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE members (
        id TEXT PRIMARY KEY,
        camp_id TEXT NOT NULL,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        role_type TEXT NOT NULL,
        is_participant INTEGER NOT NULL DEFAULT 1,
        is_excluded_from_board INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        camp_id TEXT NOT NULL,
        title TEXT NOT NULL,
        homework_tag TEXT NOT NULL,
        cycle_type TEXT NOT NULL,
        course_date TEXT NOT NULL,
        deadline_at TEXT NOT NULL,
        window_start TEXT NOT NULL,
        window_end TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE raw_events (
        id TEXT PRIMARY KEY,
        camp_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        session_id TEXT,
        message_id TEXT NOT NULL UNIQUE,
        raw_text TEXT NOT NULL,
        parsed_tags TEXT NOT NULL,
        attachment_count INTEGER NOT NULL DEFAULT 0,
        attachment_types TEXT NOT NULL,
        event_time TEXT NOT NULL,
        event_url TEXT NOT NULL,
        parse_status TEXT NOT NULL DEFAULT 'raw'
      );
      CREATE TABLE submission_candidates (
        id TEXT PRIMARY KEY,
        camp_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        homework_tag TEXT NOT NULL,
        event_ids TEXT NOT NULL,
        combined_text TEXT NOT NULL,
        attachment_count INTEGER NOT NULL DEFAULT 0,
        attachment_types TEXT NOT NULL,
        first_event_time TEXT NOT NULL,
        latest_event_time TEXT NOT NULL,
        deadline_at TEXT NOT NULL,
        evaluation_window_end TEXT NOT NULL
      );
      CREATE TABLE scores (
        id TEXT PRIMARY KEY,
        camp_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        base_score INTEGER NOT NULL DEFAULT 0,
        process_score INTEGER NOT NULL DEFAULT 0,
        quality_score INTEGER NOT NULL DEFAULT 0,
        community_bonus INTEGER NOT NULL DEFAULT 0,
        total_score INTEGER NOT NULL DEFAULT 0,
        score_reason TEXT NOT NULL,
        llm_reason TEXT NOT NULL,
        final_status TEXT NOT NULL,
        manual_override_flag INTEGER NOT NULL DEFAULT 0,
        auto_base_score INTEGER NOT NULL DEFAULT 0,
        auto_process_score INTEGER NOT NULL DEFAULT 0,
        auto_quality_score INTEGER NOT NULL DEFAULT 0,
        auto_community_bonus INTEGER NOT NULL DEFAULT 0,
        review_note TEXT NOT NULL DEFAULT '',
        reviewed_by TEXT NOT NULL DEFAULT '',
        reviewed_at TEXT NOT NULL DEFAULT '',
        llm_model TEXT NOT NULL DEFAULT '',
        llm_input_excerpt TEXT NOT NULL DEFAULT ''
      );
    `);

    legacyDb.prepare(
      `INSERT INTO camps (id, name, group_id, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("camp-demo", "Demo Camp", "chat-demo", "2026-04-01", "2026-05-01", "active");

    legacyDb.prepare(
      `INSERT INTO members (id, camp_id, name, department, role_type, is_participant, is_excluded_from_board, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("user-alice", "camp-demo", "Alice", "HBU", "student", 1, 0, "active");

    legacyDb.prepare(
      `INSERT INTO sessions (id, camp_id, title, homework_tag, cycle_type, course_date, deadline_at, window_start, window_end, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "session-01",
      "camp-demo",
      "Kickoff",
      "#HW01",
      "biweekly",
      "2026-04-03T09:00:00.000Z",
      "2026-04-17T08:59:59.000Z",
      "2026-04-03T09:00:00.000Z",
      "2026-04-17T08:59:59.000Z",
      1
    );

    legacyDb.prepare(
      `INSERT INTO submission_candidates
       (id, camp_id, session_id, member_id, homework_tag, event_ids, combined_text, attachment_count, attachment_types, first_event_time, latest_event_time, deadline_at, evaluation_window_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "session-01:user-alice:om_file_900",
      "camp-demo",
      "session-01",
      "user-alice",
      "#HW01",
      JSON.stringify(["evt-legacy-900"]),
      "#HW01 #浣滀笟鎻愪氦",
      1,
      JSON.stringify(["file"]),
      "2026-04-10T08:00:00.000Z",
      "2026-04-10T08:00:00.000Z",
      "2026-04-17T08:59:59.000Z",
      "2026-04-17T08:59:59.000Z"
    );

    legacyDb.prepare(
      `INSERT INTO scores
       (id, camp_id, session_id, member_id, candidate_id, base_score, process_score, quality_score, community_bonus, total_score, score_reason, llm_reason, final_status, manual_override_flag, auto_base_score, auto_process_score, auto_quality_score, auto_community_bonus, review_note, reviewed_by, reviewed_at, llm_model, llm_input_excerpt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "session-01:user-alice:om_file_900",
      "camp-demo",
      "session-01",
      "user-alice",
      "session-01:user-alice:om_file_900",
      5,
      2,
      1,
      0,
      8,
      "evidence_present",
      "manual",
      "valid",
      0,
      5,
      2,
      1,
      0,
      "",
      "",
      "",
      "",
      ""
    );
    legacyDb.close();

    repository = new SqliteRepository(temp.file);

    expect(repository.getSessionResult("camp-demo", "user-alice", "session-01")).toMatchObject({
      chosenAttemptId: "session-01:user-alice:om_file_900",
      finalStatus: "valid",
      totalScore: 8,
      latestSubmittedAt: "2026-04-10T08:00:00.000Z"
    });

    expect(repository.getPublicBoard("camp-demo").entries).toHaveLength(1);
    expect(repository.getPublicBoard("camp-demo").entries[0]).toMatchObject({
      memberId: "user-alice",
      totalScore: 8
    });

    const inspectionDb = new Database(temp.file);

    const submissionColumns = inspectionDb
      .prepare("PRAGMA table_info(submission_candidates)")
      .all() as Array<{ name: string }>;
    expect(submissionColumns.some((column) => column.name === "event_id")).toBe(true);
    expect(submissionColumns.some((column) => column.name === "message_id")).toBe(true);
    expect(submissionColumns.some((column) => column.name === "file_key")).toBe(true);
    expect(submissionColumns.some((column) => column.name === "document_text")).toBe(true);

    const rawEventColumns = inspectionDb.prepare("PRAGMA table_info(raw_events)").all() as Array<{ name: string }>;
    expect(rawEventColumns.some((column) => column.name === "chat_id")).toBe(true);
    expect(rawEventColumns.some((column) => column.name === "file_key")).toBe(true);
    expect(rawEventColumns.some((column) => column.name === "document_text")).toBe(true);

    inspectionDb.close();
  });
});
