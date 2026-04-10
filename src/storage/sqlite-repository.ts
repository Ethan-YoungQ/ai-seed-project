import Database from "better-sqlite3";

import { demoCamp, demoMembers, demoSessions } from "../config/defaults.js";
import { buildBoardRanking } from "../domain/ranking.js";
import {
  buildWarningKey,
  classifyWarningViolation,
  nextMemberStatusFromWarnings,
  resolveWarningLevel
} from "../domain/warnings.js";
import type {
  AnnouncementJob,
  AnnouncementType,
  AuditEvent,
  BoardSnapshotRecord,
  CampRecord,
  MemberProfile,
  OperatorSubmissionEntry,
  RawMessageEvent,
  ReviewAction,
  ScoringResult,
  SessionResult,
  SessionDefinition,
  SubmissionAttempt,
  WarningRecord
} from "../domain/types.js";
import { buildBoardOverview } from "../services/board/overview.js";

const tableDefinitions = `
CREATE TABLE IF NOT EXISTS camps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL,
  role_type TEXT NOT NULL,
  is_participant INTEGER NOT NULL DEFAULT 1,
  is_excluded_from_board INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS sessions (
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
CREATE TABLE IF NOT EXISTS raw_events (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  chat_id TEXT NOT NULL DEFAULT '',
  member_id TEXT NOT NULL,
  session_id TEXT,
  message_id TEXT NOT NULL UNIQUE,
  message_type TEXT NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL,
  parsed_tags TEXT NOT NULL,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  attachment_types TEXT NOT NULL,
  file_key TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  file_ext TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  document_text TEXT NOT NULL DEFAULT '',
  document_parse_status TEXT NOT NULL DEFAULT 'not_applicable',
  document_parse_reason TEXT NOT NULL DEFAULT '',
  event_time TEXT NOT NULL,
  event_url TEXT NOT NULL,
  parse_status TEXT NOT NULL DEFAULT 'raw'
);
CREATE TABLE IF NOT EXISTS submission_candidates (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  homework_tag TEXT NOT NULL,
  event_id TEXT NOT NULL DEFAULT '',
  message_id TEXT NOT NULL DEFAULT '',
  event_ids TEXT NOT NULL,
  file_key TEXT NOT NULL DEFAULT '',
  combined_text TEXT NOT NULL,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  attachment_types TEXT NOT NULL,
  document_text TEXT NOT NULL DEFAULT '',
  document_parse_status TEXT NOT NULL DEFAULT 'not_applicable',
  first_event_time TEXT NOT NULL,
  latest_event_time TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  evaluation_window_end TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_results (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  chosen_attempt_id TEXT,
  final_status TEXT NOT NULL,
  total_score INTEGER NOT NULL DEFAULT 0,
  latest_submitted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
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
CREATE TABLE IF NOT EXISTS warnings (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  session_id TEXT,
  violation_type TEXT NOT NULL,
  level TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_flag INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS board_snapshots (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  session_id TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS announcement_jobs (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS v2_periods (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  is_ice_breaker INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  opened_by_op_id TEXT,
  closed_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(camp_id, number)
);
CREATE INDEX IF NOT EXISTS idx_v2_periods_camp_started ON v2_periods (camp_id, started_at DESC);

CREATE TABLE IF NOT EXISTS v2_windows (
  id TEXT PRIMARY KEY,
  camp_id TEXT NOT NULL,
  code TEXT NOT NULL,
  first_period_id TEXT,
  last_period_id TEXT,
  is_final INTEGER NOT NULL DEFAULT 0,
  settlement_state TEXT NOT NULL DEFAULT 'open',
  settled_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(camp_id, code)
);

CREATE TABLE IF NOT EXISTS v2_card_interactions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  card_type TEXT NOT NULL,
  action_name TEXT NOT NULL,
  action_payload TEXT,
  feishu_message_id TEXT,
  feishu_card_version TEXT,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_v2_card_interactions_member_period_type
  ON v2_card_interactions (member_id, period_id, card_type);
CREATE INDEX IF NOT EXISTS idx_v2_card_interactions_feishu_msg
  ON v2_card_interactions (feishu_message_id);

CREATE TABLE IF NOT EXISTS v2_scoring_item_events (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  dimension TEXT NOT NULL,
  score_delta INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  llm_task_id TEXT,
  reviewed_by_op_id TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  UNIQUE(member_id, period_id, item_code, source_ref)
);
CREATE INDEX IF NOT EXISTS idx_v2_scoring_events_member_period_status
  ON v2_scoring_item_events (member_id, period_id, status);
CREATE INDEX IF NOT EXISTS idx_v2_scoring_events_status_decided
  ON v2_scoring_item_events (status, decided_at);

CREATE TABLE IF NOT EXISTS v2_member_dimension_scores (
  member_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  period_score INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  last_event_at TEXT,
  PRIMARY KEY (member_id, period_id, dimension)
);
CREATE INDEX IF NOT EXISTS idx_v2_dim_scores_period_dim
  ON v2_member_dimension_scores (period_id, dimension, period_score DESC);

CREATE TABLE IF NOT EXISTS v2_window_snapshots (
  id TEXT PRIMARY KEY,
  window_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  window_aq INTEGER NOT NULL,
  cumulative_aq INTEGER NOT NULL,
  k_score INTEGER NOT NULL,
  h_score INTEGER NOT NULL,
  c_score INTEGER NOT NULL,
  s_score INTEGER NOT NULL,
  g_score INTEGER NOT NULL,
  growth_bonus INTEGER NOT NULL DEFAULT 0,
  consec_missed_on_entry INTEGER NOT NULL DEFAULT 0,
  snapshot_at TEXT NOT NULL,
  UNIQUE(window_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_v2_window_snapshots_member
  ON v2_window_snapshots (member_id, window_id);

CREATE TABLE IF NOT EXISTS v2_member_levels (
  member_id TEXT PRIMARY KEY,
  current_level INTEGER NOT NULL DEFAULT 1,
  level_attained_at TEXT NOT NULL,
  last_window_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS v2_promotion_records (
  id TEXT PRIMARY KEY,
  window_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  promoted INTEGER NOT NULL,
  path_taken TEXT NOT NULL,
  reason TEXT NOT NULL,
  UNIQUE(window_id, member_id)
);

CREATE TABLE IF NOT EXISTS v2_llm_scoring_tasks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  result_json TEXT,
  error_reason TEXT,
  enqueued_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_v2_llm_tasks_status_enqueued
  ON v2_llm_scoring_tasks (status, enqueued_at);

CREATE TABLE IF NOT EXISTS peer_review_votes (
  id TEXT PRIMARY KEY,
  peer_review_session_id TEXT NOT NULL,
  voter_member_id TEXT NOT NULL,
  voted_member_id TEXT NOT NULL,
  voted_at TEXT NOT NULL,
  UNIQUE (peer_review_session_id, voter_member_id, voted_member_id)
);

CREATE INDEX IF NOT EXISTS idx_peer_review_votes_session
  ON peer_review_votes (peer_review_session_id);

CREATE TABLE IF NOT EXISTS reaction_tracked_messages (
  id TEXT PRIMARY KEY,
  feishu_message_id TEXT NOT NULL UNIQUE,
  member_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  posted_at TEXT NOT NULL,
  reaction_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reaction_tracked_messages_by_member
  ON reaction_tracked_messages (member_id);
`;

function asBoolean(value: number) {
  return value === 1;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === column)) {
    return;
  }

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

interface WarningSyncRow {
  sessionId: string;
  violationType: WarningRecord["violationType"];
  createdAt: string;
  note: string;
  key: string;
  resolved: boolean;
  existing?: WarningRecord;
}

export interface PeerReviewVoteRow {
  id: string;
  peerReviewSessionId: string;
  voterMemberId: string;
  votedMemberId: string;
  votedAt: string;
}

export interface ReactionTrackedMessageRow {
  id: string;
  feishuMessageId: string;
  memberId: string;
  itemCode: "C2";
  postedAt: string;
  reactionCount: number;
}

export interface PeriodRecord {
  id: string;
  campId: string;
  number: number;
  isIceBreaker: boolean;
  startedAt: string;
  endedAt: string | null;
  openedByOpId: string | null;
  closedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WindowRecord {
  id: string;
  campId: string;
  code: string;
  firstPeriodId: string | null;
  lastPeriodId: string | null;
  isFinal: boolean;
  settlementState: "open" | "settling" | "settled";
  settledAt: string | null;
  createdAt: string;
}

export interface CardInteractionRecord {
  id: string;
  memberId: string;
  periodId: string;
  cardType: string;
  actionName: string;
  actionPayload: string | null;
  feishuMessageId: string | null;
  feishuCardVersion: string | null;
  receivedAt: string;
}

export type ScoringEventStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "review_required";

export interface ScoringItemEventRecord {
  id: string;
  memberId: string;
  periodId: string;
  itemCode: string;
  dimension: string;
  scoreDelta: number;
  sourceType: string;
  sourceRef: string;
  status: ScoringEventStatus;
  llmTaskId: string | null;
  reviewedByOpId: string | null;
  reviewNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/**
 * Review queue row shape. This is a *view* projection that JOINs
 * `v2_scoring_item_events` with `members` (for `memberName`) and with
 * `v2_llm_scoring_tasks` (for `llmReason` parsed out of `result_json`).
 * The review queue card (Phase G9) uses exactly these fields — adding
 * new fields here requires updating that card's template too.
 */
export interface ReviewRequiredEventRow {
  eventId: string;
  memberId: string;
  memberName: string;
  periodId: string;
  itemCode: string;
  dimension: string;
  scoreDelta: number;
  sourceType: string;
  sourceRef: string;
  llmTaskId: string | null;
  /**
   * The `reason` field parsed out of the latest `llm_scoring_tasks.result_json`
   * for this event. `null` if no task is linked or the task has no parsed
   * result yet. The review-queue card displays this verbatim to the operator.
   */
  llmReason: string | null;
  createdAt: string;
}

export interface MemberLevelRecord {
  memberId: string;
  currentLevel: number;
  levelAttainedAt: string | null;
  lastWindowId: string | null;
  updatedAt: string | null;
}

export interface PromotionRecord {
  id: string;
  windowId: string;
  memberId: string;
  evaluatedAt: string;
  fromLevel: number;
  toLevel: number;
  promoted: boolean;
  pathTaken: string;
  reason: string;
}

export interface WindowSnapshotRecord {
  id: string;
  windowId: string;
  memberId: string;
  windowAq: number;
  cumulativeAq: number;
  kScore: number;
  hScore: number;
  cScore: number;
  sScore: number;
  gScore: number;
  growthBonus: number;
  consecMissedOnEntry: number;
  snapshotAt: string;
}

export type LlmTaskStatus = "pending" | "running" | "succeeded" | "failed";

export interface LlmScoringTaskRecord {
  id: string;
  eventId: string;
  provider: string;
  model: string;
  promptText: string;
  status: LlmTaskStatus;
  attempts: number;
  maxAttempts: number;
  resultJson: string | null;
  errorReason: string | null;
  enqueuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/**
 * Shape of the LLM scoring result stored in v2_llm_scoring_tasks.result_json.
 * The canonical type lives in src/domain/v2/llm-scoring-client.ts (Phase E5);
 * this is a structural subtype duplicated here to keep the storage layer
 * free of upward imports. When Phase E5 lands, this can be replaced with a
 * type-only import.
 */
export interface LlmScoringResult {
  pass: boolean;
  score: number;
  reason: string;
  raw: unknown;
}

export class SqliteRepository {
  private readonly db: Database.Database;

  constructor(databaseUrl: string) {
    this.db = new Database(databaseUrl);
    this.db.exec(tableDefinitions);
    this.ensureCompatibility();
    this.backfillSessionResults();
  }

  private ensureCompatibility() {
    ensureColumn(this.db, "scores", "auto_base_score", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(this.db, "scores", "auto_process_score", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(this.db, "scores", "auto_quality_score", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(this.db, "scores", "auto_community_bonus", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(this.db, "scores", "review_note", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "scores", "reviewed_by", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "scores", "reviewed_at", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "scores", "llm_model", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "scores", "llm_input_excerpt", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "raw_events", "chat_id", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "raw_events", "message_type", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "raw_events", "file_key", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "raw_events", "file_name", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "raw_events", "file_ext", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "raw_events", "mime_type", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "raw_events", "document_text", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "raw_events", "document_parse_status", "TEXT NOT NULL DEFAULT 'not_applicable'");
    ensureColumn(this.db, "raw_events", "document_parse_reason", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "members", "display_name", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "members", "avatar_url", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "members", "source_feishu_open_id", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "members", "hidden_from_board", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(this.db, "submission_candidates", "event_id", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "submission_candidates", "message_id", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "submission_candidates", "file_key", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(this.db, "submission_candidates", "document_text", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(
      this.db,
      "submission_candidates",
      "document_parse_status",
      "TEXT NOT NULL DEFAULT 'not_applicable'"
    );
  }

  private backfillSessionResults() {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT camp_id, member_id, session_id
         FROM scores
         WHERE session_id IS NOT NULL`
      )
      .all() as Array<{ camp_id: string; member_id: string; session_id: string }>;

    for (const row of rows) {
      this.recomputeSessionResult(row.camp_id, row.member_id, row.session_id);
    }
  }

  insertPeerReviewVote(vote: PeerReviewVoteRow): "inserted" | "already_exists" {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO peer_review_votes
          (id, peer_review_session_id, voter_member_id, voted_member_id, voted_at)
         VALUES (@id, @peerReviewSessionId, @voterMemberId, @votedMemberId, @votedAt)`
      )
      .run(vote);
    return result.changes === 1 ? "inserted" : "already_exists";
  }

  listPeerReviewVotesBySession(sessionId: string): PeerReviewVoteRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, peer_review_session_id, voter_member_id, voted_member_id, voted_at
         FROM peer_review_votes
         WHERE peer_review_session_id = ?
         ORDER BY voted_at ASC, id ASC`
      )
      .all(sessionId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      peerReviewSessionId: String(r.peer_review_session_id),
      voterMemberId: String(r.voter_member_id),
      votedMemberId: String(r.voted_member_id),
      votedAt: String(r.voted_at)
    }));
  }

  insertReactionTrackedMessage(row: ReactionTrackedMessageRow): void {
    this.db
      .prepare(
        `INSERT INTO reaction_tracked_messages
          (id, feishu_message_id, member_id, item_code, posted_at, reaction_count)
         VALUES (@id, @feishuMessageId, @memberId, @itemCode, @postedAt, @reactionCount)`
      )
      .run(row);
  }

  findReactionTrackedMessageByFeishuMessageId(
    feishuMessageId: string
  ): ReactionTrackedMessageRow | null {
    const row = this.db
      .prepare(
        `SELECT id, feishu_message_id, member_id, item_code, posted_at, reaction_count
         FROM reaction_tracked_messages
         WHERE feishu_message_id = ?`
      )
      .get(feishuMessageId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      feishuMessageId: String(row.feishu_message_id),
      memberId: String(row.member_id),
      itemCode: String(row.item_code) as "C2",
      postedAt: String(row.posted_at),
      reactionCount: Number(row.reaction_count ?? 0)
    };
  }

  incrementReactionCount(feishuMessageId: string): void {
    this.db
      .prepare(
        `UPDATE reaction_tracked_messages
         SET reaction_count = reaction_count + 1
         WHERE feishu_message_id = ?`
      )
      .run(feishuMessageId);
  }

  insertPeriod(input: {
    id: string;
    campId: string;
    number: number;
    isIceBreaker: boolean;
    startedAt: string;
    openedByOpId: string | null;
    createdAt: string;
    updatedAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO v2_periods
          (id, camp_id, number, is_ice_breaker, started_at, ended_at,
           opened_by_op_id, closed_reason, created_at, updated_at)
         VALUES (@id, @campId, @number, @isIceBreaker, @startedAt, NULL,
                 @openedByOpId, NULL, @createdAt, @updatedAt)`
      )
      .run({
        id: input.id,
        campId: input.campId,
        number: input.number,
        isIceBreaker: input.isIceBreaker ? 1 : 0,
        startedAt: input.startedAt,
        openedByOpId: input.openedByOpId,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt
      });
  }

  findActivePeriod(campId: string): PeriodRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM v2_periods
         WHERE camp_id = ? AND ended_at IS NULL
         ORDER BY started_at DESC LIMIT 1`
      )
      .get(campId) as Record<string, unknown> | undefined;
    return row ? this.mapPeriodRow(row) : undefined;
  }

  findPeriodByNumber(campId: string, number: number): PeriodRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM v2_periods WHERE camp_id = ? AND number = ? LIMIT 1`
      )
      .get(campId, number) as Record<string, unknown> | undefined;
    return row ? this.mapPeriodRow(row) : undefined;
  }

  closePeriod(id: string, endedAt: string, reason: string): void {
    this.db
      .prepare(
        `UPDATE v2_periods
         SET ended_at = ?, closed_reason = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(endedAt, reason, endedAt, id);
  }

  listPeriods(campId: string): PeriodRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM v2_periods WHERE camp_id = ? ORDER BY number ASC`
      )
      .all(campId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapPeriodRow(row));
  }

  private mapPeriodRow(row: Record<string, unknown>): PeriodRecord {
    return {
      id: String(row.id),
      campId: String(row.camp_id),
      number: Number(row.number),
      isIceBreaker: Number(row.is_ice_breaker) === 1,
      startedAt: String(row.started_at),
      endedAt: row.ended_at === null ? null : String(row.ended_at),
      openedByOpId: row.opened_by_op_id === null ? null : String(row.opened_by_op_id),
      closedReason: row.closed_reason === null ? null : String(row.closed_reason),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  insertWindowShell(input: {
    code: string;
    campId: string;
    isFinal: boolean;
    createdAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO v2_windows
          (id, camp_id, code, first_period_id, last_period_id, is_final,
           settlement_state, settled_at, created_at)
         VALUES (@id, @campId, @code, NULL, NULL, @isFinal, 'open', NULL, @createdAt)`
      )
      .run({
        id: `window-${input.campId}-${input.code.toLowerCase()}`,
        campId: input.campId,
        code: input.code,
        isFinal: input.isFinal ? 1 : 0,
        createdAt: input.createdAt
      });
  }

  findOpenWindowWithOpenSlot(campId: string): WindowRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM v2_windows
         WHERE camp_id = ? AND settlement_state = 'open'
           AND (first_period_id IS NULL OR last_period_id IS NULL)
         ORDER BY code ASC
         LIMIT 1`
      )
      .get(campId) as Record<string, unknown> | undefined;
    return row ? this.mapWindowRow(row) : undefined;
  }

  attachFirstPeriod(windowId: string, periodId: string): void {
    this.db
      .prepare(
        `UPDATE v2_windows SET first_period_id = ? WHERE id = ? AND first_period_id IS NULL`
      )
      .run(periodId, windowId);
  }

  attachLastPeriod(windowId: string, periodId: string): void {
    this.db
      .prepare(
        `UPDATE v2_windows SET last_period_id = ? WHERE id = ? AND last_period_id IS NULL`
      )
      .run(periodId, windowId);
  }

  findWindowByLastPeriod(periodId: string): WindowRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM v2_windows WHERE last_period_id = ? LIMIT 1`)
      .get(periodId) as Record<string, unknown> | undefined;
    return row ? this.mapWindowRow(row) : undefined;
  }

  markWindowSettling(windowId: string): void {
    this.db
      .prepare(
        `UPDATE v2_windows SET settlement_state = 'settling' WHERE id = ? AND settlement_state = 'open'`
      )
      .run(windowId);
  }

  markWindowSettled(windowId: string, at: string): void {
    this.db
      .prepare(
        `UPDATE v2_windows SET settlement_state = 'settled', settled_at = ? WHERE id = ?`
      )
      .run(at, windowId);
  }

  findWindowByCode(campId: string, code: string): WindowRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM v2_windows WHERE camp_id = ? AND code = ? LIMIT 1`)
      .get(campId, code) as Record<string, unknown> | undefined;
    return row ? this.mapWindowRow(row) : undefined;
  }

  private mapWindowRow(row: Record<string, unknown>): WindowRecord {
    return {
      id: String(row.id),
      campId: String(row.camp_id),
      code: String(row.code),
      firstPeriodId: row.first_period_id === null ? null : String(row.first_period_id),
      lastPeriodId: row.last_period_id === null ? null : String(row.last_period_id),
      isFinal: Number(row.is_final) === 1,
      settlementState: String(row.settlement_state) as WindowRecord["settlementState"],
      settledAt: row.settled_at === null ? null : String(row.settled_at),
      createdAt: String(row.created_at)
    };
  }

  insertCardInteraction(input: {
    id: string;
    memberId: string;
    periodId: string;
    cardType: string;
    actionName: string;
    actionPayload: string | null;
    feishuMessageId: string | null;
    feishuCardVersion: string | null;
    receivedAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO v2_card_interactions
          (id, member_id, period_id, card_type, action_name, action_payload,
           feishu_message_id, feishu_card_version, received_at)
         VALUES (@id, @memberId, @periodId, @cardType, @actionName, @actionPayload,
                 @feishuMessageId, @feishuCardVersion, @receivedAt)`
      )
      .run(input);
  }

  listCardInteractionsForMember(
    memberId: string,
    periodId: string,
    cardType?: string
  ): CardInteractionRecord[] {
    const sql = cardType
      ? `SELECT * FROM v2_card_interactions
         WHERE member_id = ? AND period_id = ? AND card_type = ?
         ORDER BY received_at ASC`
      : `SELECT * FROM v2_card_interactions
         WHERE member_id = ? AND period_id = ?
         ORDER BY received_at ASC`;
    const rows = (cardType
      ? this.db.prepare(sql).all(memberId, periodId, cardType)
      : this.db.prepare(sql).all(memberId, periodId)) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      memberId: String(row.member_id),
      periodId: String(row.period_id),
      cardType: String(row.card_type),
      actionName: String(row.action_name),
      actionPayload: row.action_payload === null ? null : String(row.action_payload),
      feishuMessageId: row.feishu_message_id === null ? null : String(row.feishu_message_id),
      feishuCardVersion:
        row.feishu_card_version === null ? null : String(row.feishu_card_version),
      receivedAt: String(row.received_at)
    }));
  }

  insertScoringItemEvent(input: {
    id: string;
    memberId: string;
    periodId: string;
    itemCode: string;
    dimension: string;
    scoreDelta: number;
    sourceType: string;
    sourceRef: string;
    status: ScoringEventStatus;
    llmTaskId: string | null;
    createdAt: string;
    decidedAt: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO v2_scoring_item_events
          (id, member_id, period_id, item_code, dimension, score_delta,
           source_type, source_ref, status, llm_task_id, reviewed_by_op_id,
           review_note, created_at, decided_at)
         VALUES (@id, @memberId, @periodId, @itemCode, @dimension, @scoreDelta,
                 @sourceType, @sourceRef, @status, @llmTaskId, NULL, NULL,
                 @createdAt, @decidedAt)`
      )
      .run(input);
  }

  findEventBySourceRef(
    memberId: string,
    periodId: string,
    itemCode: string,
    sourceRef: string
  ): ScoringItemEventRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM v2_scoring_item_events
         WHERE member_id = ? AND period_id = ? AND item_code = ? AND source_ref = ?
         LIMIT 1`
      )
      .get(memberId, periodId, itemCode, sourceRef) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapScoringEventRow(row) : undefined;
  }

  sumApprovedScoreDelta(
    memberId: string,
    periodId: string,
    itemCode: string
  ): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(score_delta), 0) AS total
         FROM v2_scoring_item_events
         WHERE member_id = ? AND period_id = ? AND item_code = ? AND status = 'approved'`
      )
      .get(memberId, periodId, itemCode) as { total: number };
    return Number(row.total);
  }

  sumPendingScoreDelta(
    memberId: string,
    periodId: string,
    itemCode: string
  ): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(score_delta), 0) AS total
         FROM v2_scoring_item_events
         WHERE member_id = ? AND period_id = ? AND item_code = ? AND status = 'pending'`
      )
      .get(memberId, periodId, itemCode) as { total: number };
    return Number(row.total);
  }

  updateEventStatus(input: {
    id: string;
    status: ScoringEventStatus;
    decidedAt: string;
    reviewNote: string | null;
    reviewedByOpId: string | null;
  }): void {
    this.db
      .prepare(
        `UPDATE v2_scoring_item_events
         SET status = @status, decided_at = @decidedAt,
             review_note = @reviewNote, reviewed_by_op_id = @reviewedByOpId
         WHERE id = @id`
      )
      .run(input);
  }

  listReviewRequiredEvents(args: {
    campId?: string;
    limit: number;
    offset: number;
  }): ReviewRequiredEventRow[] {
    const rows = this.db
      .prepare(
        `SELECT
           e.id            AS event_id,
           e.member_id     AS member_id,
           m.display_name  AS member_name,
           e.period_id     AS period_id,
           e.item_code     AS item_code,
           e.dimension     AS dimension,
           e.score_delta   AS score_delta,
           e.source_type   AS source_type,
           e.source_ref    AS source_ref,
           e.llm_task_id   AS llm_task_id,
           t.result_json   AS llm_result_json,
           e.created_at    AS created_at
         FROM v2_scoring_item_events e
         INNER JOIN v2_periods p ON p.id = e.period_id
         LEFT JOIN members m ON m.id = e.member_id
         LEFT JOIN v2_llm_scoring_tasks t ON t.id = e.llm_task_id
         WHERE e.status = 'review_required'
           AND (@campId IS NULL OR p.camp_id = @campId)
         ORDER BY e.created_at ASC
         LIMIT @limit OFFSET @offset`
      )
      .all({
        campId: args.campId ?? null,
        limit: args.limit,
        offset: args.offset
      }) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapReviewRequiredRow(row));
  }

  countReviewRequiredEvents(args: { campId?: string }): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM v2_scoring_item_events e
         INNER JOIN v2_periods p ON p.id = e.period_id
         WHERE e.status = 'review_required'
           AND (@campId IS NULL OR p.camp_id = @campId)`
      )
      .get({ campId: args.campId ?? null }) as { total: number };
    return Number(row.total ?? 0);
  }

  private mapReviewRequiredRow(row: Record<string, unknown>): ReviewRequiredEventRow {
    const rawResultJson =
      row.llm_result_json === null || row.llm_result_json === undefined
        ? null
        : String(row.llm_result_json);
    let llmReason: string | null = null;
    if (rawResultJson) {
      try {
        const parsed = JSON.parse(rawResultJson) as { reason?: unknown };
        if (parsed && typeof parsed.reason === "string") {
          llmReason = parsed.reason;
        }
      } catch {
        // malformed JSON → leave null; the review queue card will show
        // "(no reason available)" in the renderer.
      }
    }
    const memberName =
      row.member_name === null || row.member_name === undefined
        ? "(未知学员)"
        : String(row.member_name);
    return {
      eventId: String(row.event_id),
      memberId: String(row.member_id),
      memberName,
      periodId: String(row.period_id),
      itemCode: String(row.item_code),
      dimension: String(row.dimension),
      scoreDelta: Number(row.score_delta),
      sourceType: String(row.source_type),
      sourceRef: String(row.source_ref),
      llmTaskId:
        row.llm_task_id === null || row.llm_task_id === undefined
          ? null
          : String(row.llm_task_id),
      llmReason,
      createdAt: String(row.created_at)
    };
  }

  private mapScoringEventRow(row: Record<string, unknown>): ScoringItemEventRecord {
    return {
      id: String(row.id),
      memberId: String(row.member_id),
      periodId: String(row.period_id),
      itemCode: String(row.item_code),
      dimension: String(row.dimension),
      scoreDelta: Number(row.score_delta),
      sourceType: String(row.source_type),
      sourceRef: String(row.source_ref),
      status: String(row.status) as ScoringEventStatus,
      llmTaskId: row.llm_task_id === null ? null : String(row.llm_task_id),
      reviewedByOpId: row.reviewed_by_op_id === null ? null : String(row.reviewed_by_op_id),
      reviewNote: row.review_note === null ? null : String(row.review_note),
      createdAt: String(row.created_at),
      decidedAt: row.decided_at === null ? null : String(row.decided_at)
    };
  }

  incrementMemberDimensionScore(input: {
    memberId: string;
    periodId: string;
    dimension: string;
    delta: number;
    eventAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO v2_member_dimension_scores
          (member_id, period_id, dimension, period_score, event_count, last_event_at)
         VALUES (@memberId, @periodId, @dimension, @delta, 1, @eventAt)
         ON CONFLICT(member_id, period_id, dimension) DO UPDATE SET
           period_score = period_score + @delta,
           event_count = event_count + 1,
           last_event_at = @eventAt`
      )
      .run(input);
  }

  decrementMemberDimensionScore(input: {
    memberId: string;
    periodId: string;
    dimension: string;
    delta: number;
    eventAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO v2_member_dimension_scores
          (member_id, period_id, dimension, period_score, event_count, last_event_at)
         VALUES (@memberId, @periodId, @dimension, -@delta, 0, @eventAt)
         ON CONFLICT(member_id, period_id, dimension) DO UPDATE SET
           period_score = period_score - @delta,
           event_count = MAX(event_count - 1, 0),
           last_event_at = @eventAt`
      )
      .run(input);
  }

  fetchMemberDimensionScores(
    memberId: string,
    periodId: string
  ): Record<string, number> {
    const rows = this.db
      .prepare(
        `SELECT dimension, period_score FROM v2_member_dimension_scores
         WHERE member_id = ? AND period_id = ?`
      )
      .all(memberId, periodId) as Array<{ dimension: string; period_score: number }>;
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.dimension] = Number(row.period_score);
    }
    return result;
  }

  fetchDimensionCumulativeForRanking(
    campId: string,
    dimension: string,
    memberIds: string[]
  ): Array<{ memberId: string; cumulativeScore: number }> {
    if (memberIds.length === 0) {
      return [];
    }
    const placeholders = memberIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT ds.member_id AS member_id, COALESCE(SUM(ds.period_score), 0) AS total
         FROM v2_member_dimension_scores ds
         INNER JOIN v2_periods p ON p.id = ds.period_id
         WHERE p.camp_id = ? AND ds.dimension = ?
           AND ds.member_id IN (${placeholders})
         GROUP BY ds.member_id
         ORDER BY total DESC, ds.member_id ASC`
      )
      .all(campId, dimension, ...memberIds) as Array<{
      member_id: string;
      total: number;
    }>;

    // Include zeroed members explicitly so ranking stays stable.
    const byMember = new Map<string, number>();
    for (const row of rows) {
      byMember.set(String(row.member_id), Number(row.total));
    }
    const result: Array<{ memberId: string; cumulativeScore: number }> = memberIds.map(
      (mid) => ({
        memberId: mid,
        cumulativeScore: byMember.get(mid) ?? 0
      })
    );
    result.sort((a, b) => {
      if (b.cumulativeScore !== a.cumulativeScore) {
        return b.cumulativeScore - a.cumulativeScore;
      }
      return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
    });
    return result;
  }

  insertWindowSnapshot(input: WindowSnapshotRecord): void {
    this.db
      .prepare(
        `INSERT INTO v2_window_snapshots
          (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score,
           c_score, s_score, g_score, growth_bonus, consec_missed_on_entry, snapshot_at)
         VALUES (@id, @windowId, @memberId, @windowAq, @cumulativeAq, @kScore, @hScore,
                 @cScore, @sScore, @gScore, @growthBonus, @consecMissedOnEntry, @snapshotAt)`
      )
      .run(input);
  }

  findSnapshotForWindow(
    windowId: string,
    memberId: string
  ): WindowSnapshotRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM v2_window_snapshots
         WHERE window_id = ? AND member_id = ? LIMIT 1`
      )
      .get(windowId, memberId) as Record<string, unknown> | undefined;
    return row ? this.mapSnapshotRow(row) : undefined;
  }

  findLatestSnapshotBefore(
    memberId: string,
    windowId: string
  ): WindowSnapshotRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT s.* FROM v2_window_snapshots s
         INNER JOIN v2_windows w ON w.id = s.window_id
         WHERE s.member_id = ?
           AND s.window_id != ?
           AND w.code < (SELECT code FROM v2_windows WHERE id = ?)
         ORDER BY w.code DESC LIMIT 1`
      )
      .get(memberId, windowId, windowId) as Record<string, unknown> | undefined;
    return row ? this.mapSnapshotRow(row) : undefined;
  }

  private mapSnapshotRow(row: Record<string, unknown>): WindowSnapshotRecord {
    return {
      id: String(row.id),
      windowId: String(row.window_id),
      memberId: String(row.member_id),
      windowAq: Number(row.window_aq),
      cumulativeAq: Number(row.cumulative_aq),
      kScore: Number(row.k_score),
      hScore: Number(row.h_score),
      cScore: Number(row.c_score),
      sScore: Number(row.s_score),
      gScore: Number(row.g_score),
      growthBonus: Number(row.growth_bonus),
      consecMissedOnEntry: Number(row.consec_missed_on_entry),
      snapshotAt: String(row.snapshot_at)
    };
  }

  getMemberLevel(memberId: string): MemberLevelRecord {
    const row = this.db
      .prepare(`SELECT * FROM v2_member_levels WHERE member_id = ?`)
      .get(memberId) as Record<string, unknown> | undefined;

    if (!row) {
      return {
        memberId,
        currentLevel: 1,
        levelAttainedAt: null,
        lastWindowId: null,
        updatedAt: null
      };
    }

    return {
      memberId: String(row.member_id),
      currentLevel: Number(row.current_level),
      levelAttainedAt:
        row.level_attained_at === null ? null : String(row.level_attained_at),
      lastWindowId: row.last_window_id === null ? null : String(row.last_window_id),
      updatedAt: row.updated_at === null ? null : String(row.updated_at)
    };
  }

  upsertMemberLevel(input: {
    memberId: string;
    currentLevel: number;
    levelAttainedAt: string;
    lastWindowId: string | null;
    updatedAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO v2_member_levels
          (member_id, current_level, level_attained_at, last_window_id, updated_at)
         VALUES (@memberId, @currentLevel, @levelAttainedAt, @lastWindowId, @updatedAt)
         ON CONFLICT(member_id) DO UPDATE SET
           current_level = @currentLevel,
           level_attained_at = @levelAttainedAt,
           last_window_id = @lastWindowId,
           updated_at = @updatedAt`
      )
      .run(input);
  }

  insertPromotionRecord(input: PromotionRecord): void {
    this.db
      .prepare(
        `INSERT INTO v2_promotion_records
          (id, window_id, member_id, evaluated_at, from_level, to_level,
           promoted, path_taken, reason)
         VALUES (@id, @windowId, @memberId, @evaluatedAt, @fromLevel, @toLevel,
                 @promoted, @pathTaken, @reason)`
      )
      .run({
        ...input,
        promoted: input.promoted ? 1 : 0
      });
  }

  findPromotionForWindow(
    windowId: string,
    memberId: string
  ): PromotionRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM v2_promotion_records
         WHERE window_id = ? AND member_id = ? LIMIT 1`
      )
      .get(windowId, memberId) as Record<string, unknown> | undefined;
    return row ? this.mapPromotionRow(row) : undefined;
  }

  listPromotionsForMember(memberId: string): PromotionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT p.* FROM v2_promotion_records p
         INNER JOIN v2_windows w ON w.id = p.window_id
         WHERE p.member_id = ?
         ORDER BY w.code ASC, p.evaluated_at ASC`
      )
      .all(memberId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapPromotionRow(row));
  }

  private mapPromotionRow(row: Record<string, unknown>): PromotionRecord {
    return {
      id: String(row.id),
      windowId: String(row.window_id),
      memberId: String(row.member_id),
      evaluatedAt: String(row.evaluated_at),
      fromLevel: Number(row.from_level),
      toLevel: Number(row.to_level),
      promoted: Number(row.promoted) === 1,
      pathTaken: String(row.path_taken),
      reason: String(row.reason)
    };
  }

  insertLlmTask(input: {
    id: string;
    eventId: string;
    provider: string;
    model: string;
    promptText: string;
    enqueuedAt: string;
    maxAttempts: number;
  }): string {
    this.db
      .prepare(
        `INSERT INTO v2_llm_scoring_tasks
          (id, event_id, provider, model, prompt_text, status, attempts,
           max_attempts, result_json, error_reason, enqueued_at, started_at, finished_at)
         VALUES (@id, @eventId, @provider, @model, @promptText, 'pending', 0,
                 @maxAttempts, NULL, NULL, @enqueuedAt, NULL, NULL)`
      )
      .run(input);
    return input.id;
  }

  claimNextPendingTask(now: string): LlmScoringTaskRecord | undefined {
    // `better-sqlite3` transactions are synchronous. `immediate` begins the
    // transaction with `BEGIN IMMEDIATE`, which blocks concurrent writers
    // between the SELECT and UPDATE — satisfying the "atomic claim"
    // requirement without external locking.
    const runner = this.db.transaction((clock: string): string | undefined => {
      const row = this.db
        .prepare(
          `SELECT id FROM v2_llm_scoring_tasks
           WHERE status = 'pending' AND enqueued_at <= ?
           ORDER BY enqueued_at ASC LIMIT 1`
        )
        .get(clock) as { id: string } | undefined;

      if (!row) {
        return undefined;
      }

      this.db
        .prepare(
          `UPDATE v2_llm_scoring_tasks
           SET status = 'running', started_at = ?, attempts = attempts + 1
           WHERE id = ? AND status = 'pending'`
        )
        .run(clock, row.id);

      return row.id;
    });

    const claimedId = runner.immediate(now);
    if (!claimedId) {
      return undefined;
    }
    const updated = this.db
      .prepare(`SELECT * FROM v2_llm_scoring_tasks WHERE id = ?`)
      .get(claimedId) as Record<string, unknown> | undefined;
    return updated ? this.mapLlmTaskRow(updated) : undefined;
  }

  /**
   * Marks a running LLM task as succeeded. Accepts the domain-level
   * `LlmScoringResult` (from `src/domain/v2/llm-scoring-client.ts`) directly
   * — the repository owns the JSON serialization and the `finished_at`
   * timestamp so the worker never has to think about either concern. This
   * matches the `WorkerDeps.markTaskSucceeded(taskId, result)` signature
   * used by `LlmScoringWorker` (see Phase E5), so `Phase H2` can wire the
   * repository directly into `WorkerDeps` with zero adapter code.
   */
  markTaskSucceeded(taskId: string, result: LlmScoringResult): void {
    this.db
      .prepare(
        `UPDATE v2_llm_scoring_tasks
         SET status = 'succeeded', result_json = ?, finished_at = ?
         WHERE id = ?`
      )
      .run(JSON.stringify(result), new Date().toISOString(), taskId);
  }

  /**
   * Re-queues a running task for retry, or escalates to terminal failure
   * once `attempts >= max_attempts`. Parameter order is
   * `(taskId, backoffSeconds, errorReason)` to match the
   * `WorkerDeps.markTaskFailedRetry` shape used by `LlmScoringWorker`,
   * so Phase H2 can bind the repository method to the worker deps slot
   * directly.
   */
  markTaskFailedRetry(
    taskId: string,
    backoffSeconds: number,
    errorReason: string
  ): void {
    const row = this.db
      .prepare(
        `SELECT attempts, max_attempts FROM v2_llm_scoring_tasks WHERE id = ?`
      )
      .get(taskId) as { attempts: number; max_attempts: number } | undefined;
    if (!row) {
      return;
    }
    if (row.attempts >= row.max_attempts) {
      this.markTaskFailedTerminal(taskId, errorReason);
      return;
    }
    const nextEnqueue = new Date(Date.now() + backoffSeconds * 1000).toISOString();
    this.db
      .prepare(
        `UPDATE v2_llm_scoring_tasks
         SET status = 'pending', error_reason = ?, enqueued_at = ?, started_at = NULL
         WHERE id = ?`
      )
      .run(errorReason, nextEnqueue, taskId);
  }

  /**
   * Terminates a task in `failed` state. `finished_at` defaults to the
   * current wall clock; callers that need deterministic timestamps (tests)
   * can pre-freeze the clock via their fake `Date.now`. Matches the
   * `WorkerDeps.markTaskFailedTerminal(taskId, reason)` signature from
   * Phase E5 — no explicit `at` parameter is accepted on the worker path.
   */
  markTaskFailedTerminal(taskId: string, errorReason: string): void {
    this.db
      .prepare(
        `UPDATE v2_llm_scoring_tasks
         SET status = 'failed', error_reason = ?, finished_at = ?
         WHERE id = ?`
      )
      .run(errorReason, new Date().toISOString(), taskId);
  }

  requeueStaleRunningTasks(timeoutMs: number): number {
    const cutoff = new Date(Date.now() - timeoutMs).toISOString();
    const result = this.db
      .prepare(
        `UPDATE v2_llm_scoring_tasks
         SET status = 'pending', started_at = NULL,
             error_reason = COALESCE(error_reason, 'crash_recovered')
         WHERE status = 'running' AND started_at IS NOT NULL AND started_at < ?`
      )
      .run(cutoff);
    return Number(result.changes ?? 0);
  }

  private mapLlmTaskRow(row: Record<string, unknown>): LlmScoringTaskRecord {
    return {
      id: String(row.id),
      eventId: String(row.event_id),
      provider: String(row.provider),
      model: String(row.model),
      promptText: String(row.prompt_text),
      status: String(row.status) as LlmTaskStatus,
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
      resultJson: row.result_json === null ? null : String(row.result_json),
      errorReason: row.error_reason === null ? null : String(row.error_reason),
      enqueuedAt: String(row.enqueued_at),
      startedAt: row.started_at === null ? null : String(row.started_at),
      finishedAt: row.finished_at === null ? null : String(row.finished_at)
    };
  }

  close() {
    this.db.close();
  }

  seedDemo() {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO camps (id, name, group_id, start_date, end_date, status)
         VALUES (@id, @name, @groupId, @startDate, @endDate, @status)`
      )
      .run(demoCamp);

    const insertMember = this.db.prepare(
      `INSERT OR REPLACE INTO members
      (id, camp_id, name, department, role_type, is_participant, is_excluded_from_board, status)
      VALUES (@id, @campId, @name, @department, @roleType, @isParticipant, @isExcludedFromBoard, @status)`
    );

    for (const member of demoMembers) {
      insertMember.run({
        ...member,
        isParticipant: member.isParticipant ? 1 : 0,
        isExcludedFromBoard: member.isExcludedFromBoard ? 1 : 0
      });
    }

    const insertSession = this.db.prepare(
      `INSERT OR REPLACE INTO sessions
      (id, camp_id, title, homework_tag, cycle_type, course_date, deadline_at, window_start, window_end, active)
      VALUES (@id, @campId, @title, @homeworkTag, @cycleType, @courseDate, @deadlineAt, @windowStart, @windowEnd, @active)`
    );

    for (const session of demoSessions) {
      insertSession.run({
        ...session,
        active: session.active ? 1 : 0
      });
    }
  }

  getDefaultCampId() {
    const row = this.db.prepare("SELECT id FROM camps ORDER BY start_date LIMIT 1").get() as
      | { id: string }
      | undefined;
    return row?.id;
  }

  getCamp(campId: string): CampRecord | undefined {
    const row = this.db.prepare("SELECT * FROM camps WHERE id = ?").get(campId) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: String(row.id),
      name: String(row.name),
      groupId: String(row.group_id),
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      status: String(row.status)
    };
  }

  getDefaultCamp() {
    const campId = this.getDefaultCampId();
    return campId ? this.getCamp(campId) : undefined;
  }

  getCampByGroupId(groupId: string): CampRecord | undefined {
    const row = this.db.prepare("SELECT * FROM camps WHERE group_id = ? LIMIT 1").get(groupId) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: String(row.id),
      name: String(row.name),
      groupId: String(row.group_id),
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      status: String(row.status)
    };
  }

  updateCampGroupId(campId: string, groupId: string) {
    this.db.prepare("UPDATE camps SET group_id = ? WHERE id = ?").run(groupId, campId);
    return this.getCamp(campId);
  }

  getMember(memberId: string): MemberProfile | undefined {
    const row = this.db.prepare("SELECT * FROM members WHERE id = ?").get(memberId) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: String(row.id),
      campId: String(row.camp_id),
      name: String(row.name),
      displayName: String(row.display_name ?? ""),
      avatarUrl: String(row.avatar_url ?? ""),
      department: String(row.department),
      roleType: row.role_type as MemberProfile["roleType"],
      isParticipant: asBoolean(Number(row.is_participant)),
      isExcludedFromBoard: asBoolean(Number(row.is_excluded_from_board)),
      status: row.status as MemberProfile["status"]
    };
  }

  ensureMember(memberId: string, campIdOverride?: string) {
    const existing = this.getMember(memberId);
    if (existing) {
      return existing;
    }

    const campId = campIdOverride ?? this.getDefaultCampId();
    if (!campId) {
      throw new Error("No camp has been seeded.");
    }

    const fallback: MemberProfile = {
      id: memberId,
      campId,
      name: memberId,
      displayName: "",
      avatarUrl: "",
      department: "Unknown",
      roleType: "observer",
      isParticipant: false,
      isExcludedFromBoard: true,
      status: "active"
    };

    this.db
      .prepare(
        `INSERT INTO members
        (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
        VALUES (@id, @campId, @name, @displayName, @avatarUrl, @department, @roleType, @isParticipant, @isExcludedFromBoard, @status)`
      )
      .run({
        ...fallback,
        isParticipant: 0,
        isExcludedFromBoard: 1
      });

    return fallback;
  }

  updateMember(
    memberId: string,
    patch: Partial<
      Pick<MemberProfile, "isParticipant" | "isExcludedFromBoard" | "roleType" | "displayName" | "avatarUrl">
    >
  ) {
    const current = this.getMember(memberId);
    if (!current) {
      return undefined;
    }

    const next = {
      ...current,
      ...patch
    };

      this.db
        .prepare(
          `UPDATE members
          SET role_type = @roleType,
              display_name = @displayName,
              avatar_url = @avatarUrl,
              is_participant = @isParticipant,
              is_excluded_from_board = @isExcludedFromBoard
          WHERE id = @id`
        )
        .run({
          id: memberId,
          roleType: next.roleType,
          displayName: next.displayName ?? "",
          avatarUrl: next.avatarUrl ?? "",
          isParticipant: next.isParticipant ? 1 : 0,
          isExcludedFromBoard: next.isExcludedFromBoard ? 1 : 0
        });

    this.recordAudit({
      id: `audit:member:${memberId}:${Date.now()}`,
      campId: next.campId,
      entityType: "member",
      entityId: memberId,
      action: "member_updated",
      actor: "operator",
      payload: JSON.stringify(patch),
      createdAt: nowIso()
    });

    return next;
  }

  listMembers(campId: string) {
    const rows = this.db
      .prepare("SELECT * FROM members WHERE camp_id = ? ORDER BY name")
      .all(campId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      campId: String(row.camp_id),
      name: String(row.name),
      displayName: String(row.display_name ?? ""),
      avatarUrl: String(row.avatar_url ?? ""),
      department: String(row.department),
      roleType: row.role_type as MemberProfile["roleType"],
      isParticipant: asBoolean(Number(row.is_participant)),
      isExcludedFromBoard: asBoolean(Number(row.is_excluded_from_board)),
      status: row.status as MemberProfile["status"]
    }));
  }

  listSessions(campId: string): SessionDefinition[] {
    const rows = this.db
      .prepare("SELECT * FROM sessions WHERE camp_id = ? ORDER BY course_date")
      .all(campId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      campId: String(row.camp_id),
      title: String(row.title),
      homeworkTag: String(row.homework_tag),
      courseDate: String(row.course_date),
      deadlineAt: String(row.deadline_at),
      windowStart: String(row.window_start),
      windowEnd: String(row.window_end),
      cycleType: row.cycle_type as SessionDefinition["cycleType"],
      active: asBoolean(Number(row.active))
    }));
  }

  insertRawEvent(event: RawMessageEvent & { campId: string; parseStatus: string }) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO raw_events
        (id, camp_id, chat_id, member_id, session_id, message_id, message_type, raw_text, parsed_tags, attachment_count, attachment_types, file_key, file_name, file_ext, mime_type, document_text, document_parse_status, document_parse_reason, event_time, event_url, parse_status)
        VALUES (@id, @campId, @chatId, @memberId, @sessionId, @messageId, @messageType, @rawText, @parsedTags, @attachmentCount, @attachmentTypes, @fileKey, @fileName, @fileExt, @mimeType, @documentText, @documentParseStatus, @documentParseReason, @eventTime, @eventUrl, @parseStatus)`
      )
      .run({
        ...event,
        parsedTags: JSON.stringify(event.parsedTags),
        attachmentTypes: JSON.stringify(event.attachmentTypes),
        messageType: event.messageType ?? "",
        fileKey: event.fileKey ?? "",
        fileName: event.fileName ?? "",
        fileExt: event.fileExt ?? "",
        mimeType: event.mimeType ?? "",
        documentText: event.documentText ?? "",
        documentParseStatus: event.documentParseStatus ?? "not_applicable",
        documentParseReason: event.documentParseReason ?? ""
      });
  }

  listRawEventsForWindow(
    memberId: string,
    sessionId: string,
    windowStart: string,
    windowEnd: string
  ): RawMessageEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM raw_events
         WHERE member_id = ? AND session_id = ? AND event_time >= ? AND event_time <= ?
         ORDER BY event_time`
      )
      .all(memberId, sessionId, windowStart, windowEnd) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      chatId: String(row.chat_id),
      memberId: String(row.member_id),
      sessionId: row.session_id ? String(row.session_id) : undefined,
      messageId: String(row.message_id),
      messageType: String(row.message_type ?? ""),
      eventTime: String(row.event_time),
      rawText: String(row.raw_text),
      parsedTags: JSON.parse(String(row.parsed_tags)) as string[],
      attachmentCount: Number(row.attachment_count),
      attachmentTypes: JSON.parse(String(row.attachment_types)) as string[],
      fileKey: String(row.file_key ?? "") || undefined,
      fileName: String(row.file_name ?? "") || undefined,
      fileExt: String(row.file_ext ?? "") || undefined,
      mimeType: String(row.mime_type ?? "") || undefined,
      documentText: String(row.document_text ?? ""),
      documentParseStatus: String(row.document_parse_status ?? "not_applicable") as RawMessageEvent["documentParseStatus"],
      documentParseReason: String(row.document_parse_reason ?? "") || undefined,
      eventUrl: String(row.event_url)
    }));
  }

  getRawEvent(eventId: string): (RawMessageEvent & { campId: string; parseStatus: string }) | undefined {
    const row = this.db.prepare("SELECT * FROM raw_events WHERE id = ?").get(eventId) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: String(row.id),
      campId: String(row.camp_id),
      chatId: String(row.chat_id),
      memberId: String(row.member_id),
      sessionId: row.session_id ? String(row.session_id) : undefined,
      messageId: String(row.message_id),
      messageType: String(row.message_type ?? ""),
      rawText: String(row.raw_text),
      parsedTags: JSON.parse(String(row.parsed_tags)) as string[],
      attachmentCount: Number(row.attachment_count),
      attachmentTypes: JSON.parse(String(row.attachment_types)) as string[],
      fileKey: String(row.file_key ?? "") || undefined,
      fileName: String(row.file_name ?? "") || undefined,
      fileExt: String(row.file_ext ?? "") || undefined,
      mimeType: String(row.mime_type ?? "") || undefined,
      documentText: String(row.document_text ?? ""),
      documentParseStatus: String(row.document_parse_status ?? "not_applicable") as RawMessageEvent["documentParseStatus"],
      documentParseReason: String(row.document_parse_reason ?? "") || undefined,
      eventTime: String(row.event_time),
      eventUrl: String(row.event_url),
      parseStatus: String(row.parse_status)
    };
  }

  saveAttempt(attempt: SubmissionAttempt) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO submission_candidates
        (id, camp_id, session_id, member_id, homework_tag, event_id, message_id, event_ids, file_key, combined_text, attachment_count, attachment_types, document_text, document_parse_status, first_event_time, latest_event_time, deadline_at, evaluation_window_end)
        VALUES (@id, @campId, @sessionId, @memberId, @homeworkTag, @eventId, @messageId, @eventIds, @fileKey, @combinedText, @attachmentCount, @attachmentTypes, @documentText, @documentParseStatus, @firstEventTime, @latestEventTime, @deadlineAt, @evaluationWindowEnd)`
      )
      .run({
        ...attempt,
        eventIds: JSON.stringify(attempt.eventIds),
        fileKey: attempt.fileKey ?? "",
        attachmentTypes: JSON.stringify(attempt.attachmentTypes),
        documentText: attempt.documentText ?? "",
        documentParseStatus: attempt.documentParseStatus ?? "not_applicable"
      });

    this.recomputeSessionResult(attempt.campId, attempt.memberId, attempt.sessionId);
  }

  saveCandidate(candidate: SubmissionAttempt) {
    this.saveAttempt(candidate);
  }

  getAttempt(attemptId: string): SubmissionAttempt | undefined {
    const row = this.db
      .prepare("SELECT * FROM submission_candidates WHERE id = ?")
      .get(attemptId) as Record<string, unknown> | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: String(row.id),
      campId: String(row.camp_id),
      sessionId: String(row.session_id),
      memberId: String(row.member_id),
      homeworkTag: String(row.homework_tag),
      eventId: String(row.event_id ?? ""),
      messageId: String(row.message_id ?? ""),
      eventIds: JSON.parse(String(row.event_ids)) as string[],
      fileKey: String(row.file_key ?? "") || undefined,
      combinedText: String(row.combined_text),
      attachmentCount: Number(row.attachment_count),
      attachmentTypes: JSON.parse(String(row.attachment_types)) as string[],
      documentText: String(row.document_text ?? ""),
      documentParseStatus: String(row.document_parse_status ?? "not_applicable") as SubmissionAttempt["documentParseStatus"],
      firstEventTime: String(row.first_event_time),
      latestEventTime: String(row.latest_event_time),
      deadlineAt: String(row.deadline_at),
      evaluationWindowEnd: String(row.evaluation_window_end)
    };
  }

  getCandidate(candidateId: string): SubmissionAttempt | undefined {
    return this.getAttempt(candidateId);
  }

  saveScore(campId: string, score: ScoringResult) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO scores
        (id, camp_id, session_id, member_id, candidate_id, base_score, process_score, quality_score, community_bonus, total_score, score_reason, llm_reason, final_status, manual_override_flag, auto_base_score, auto_process_score, auto_quality_score, auto_community_bonus, review_note, reviewed_by, reviewed_at, llm_model, llm_input_excerpt)
        VALUES (@id, @campId, @sessionId, @memberId, @candidateId, @baseScore, @processScore, @qualityScore, @communityBonus, @totalScore, @scoreReason, @llmReason, @finalStatus, @manualOverrideFlag, @autoBaseScore, @autoProcessScore, @autoQualityScore, @autoCommunityBonus, @reviewNote, @reviewedBy, @reviewedAt, @llmModel, @llmInputExcerpt)`
      )
      .run({
        id: score.candidateId,
        campId,
        ...score,
        manualOverrideFlag: score.manualOverrideFlag ? 1 : 0,
        autoBaseScore: score.autoBaseScore ?? score.baseScore,
        autoProcessScore: score.autoProcessScore ?? score.processScore,
        autoQualityScore: score.autoQualityScore ?? score.qualityScore,
        autoCommunityBonus: score.autoCommunityBonus ?? score.communityBonus,
        reviewNote: score.reviewNote ?? "",
        reviewedBy: score.reviewedBy ?? "",
        reviewedAt: score.reviewedAt ?? "",
          llmModel: score.llmModel ?? "",
          llmInputExcerpt: score.llmInputExcerpt ?? ""
        });

    this.recomputeSessionResult(campId, score.memberId, score.sessionId);
  }

  getScore(candidateId: string): ScoringResult | undefined {
    const row = this.db.prepare("SELECT * FROM scores WHERE id = ?").get(candidateId) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      memberId: String(row.member_id),
      sessionId: String(row.session_id),
      candidateId: String(row.candidate_id),
      baseScore: Number(row.base_score),
      processScore: Number(row.process_score),
      qualityScore: Number(row.quality_score),
      communityBonus: Number(row.community_bonus),
      totalScore: Number(row.total_score),
      finalStatus: row.final_status as ScoringResult["finalStatus"],
      scoreReason: String(row.score_reason),
      llmReason: String(row.llm_reason),
      llmModel: String(row.llm_model),
      llmInputExcerpt: String(row.llm_input_excerpt),
      manualOverrideFlag: asBoolean(Number(row.manual_override_flag)),
      reviewNote: String(row.review_note),
      reviewedBy: String(row.reviewed_by),
      reviewedAt: String(row.reviewed_at),
      autoBaseScore: Number(row.auto_base_score),
      autoProcessScore: Number(row.auto_process_score),
      autoQualityScore: Number(row.auto_quality_score),
      autoCommunityBonus: Number(row.auto_community_bonus)
    };
  }

  listScores(campId: string) {
    return this.db
      .prepare("SELECT member_id, session_id, total_score, community_bonus, final_status FROM scores WHERE camp_id = ?")
      .all(campId) as Array<{
      member_id: string;
      session_id: string;
      total_score: number;
      community_bonus: number;
      final_status: "valid" | "invalid" | "pending_review";
    }>;
  }

  private listScoredAttemptsForSession(campId: string, memberId: string, sessionId: string) {
    const rows = this.db
      .prepare(
        `SELECT
           sc.candidate_id,
           sc.final_status,
           sc.total_score,
           c.latest_event_time
         FROM scores sc
         LEFT JOIN submission_candidates c ON c.id = sc.candidate_id
         WHERE sc.camp_id = ? AND sc.member_id = ? AND sc.session_id = ?`
      )
      .all(campId, memberId, sessionId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      candidateId: String(row.candidate_id),
      finalStatus: String(row.final_status) as ScoringResult["finalStatus"],
      totalScore: Number(row.total_score ?? 0),
      latestEventTime: String(row.latest_event_time ?? "")
    }));
  }

  getSessionResult(campId: string, memberId: string, sessionId: string) {
    const row = this.db
      .prepare(
        `SELECT id, camp_id, session_id, member_id, chosen_attempt_id, final_status, total_score, latest_submitted_at
         FROM session_results
         WHERE camp_id = ? AND member_id = ? AND session_id = ?
         LIMIT 1`
      )
      .get(campId, memberId, sessionId) as Record<string, unknown> | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: String(row.id),
      campId: String(row.camp_id),
      sessionId: String(row.session_id),
      memberId: String(row.member_id),
      chosenAttemptId: row.chosen_attempt_id ? String(row.chosen_attempt_id) : undefined,
      finalStatus: String(row.final_status) as SessionResult["finalStatus"],
      totalScore: Number(row.total_score ?? 0),
      latestSubmittedAt: String(row.latest_submitted_at)
    } satisfies SessionResult;
  }

  private recomputeSessionResult(campId: string, memberId: string, sessionId: string) {
    const attempts = this.listScoredAttemptsForSession(campId, memberId, sessionId);
    const sessionResultId = `${sessionId}:${memberId}`;

    if (attempts.length === 0) {
      this.db.prepare("DELETE FROM session_results WHERE id = ?").run(sessionResultId);
      return undefined;
    }

    const validAttempts = attempts
      .filter((attempt) => attempt.finalStatus === "valid")
      .sort((left, right) => {
        if (right.totalScore !== left.totalScore) {
          return right.totalScore - left.totalScore;
        }

        return right.latestEventTime.localeCompare(left.latestEventTime);
      });

    const latestAttempt = [...attempts].sort((left, right) =>
      right.latestEventTime.localeCompare(left.latestEventTime)
    )[0]!;
    const chosenAttempt = validAttempts[0] ?? latestAttempt;

    const result: SessionResult = {
      id: sessionResultId,
      campId,
      sessionId,
      memberId,
      chosenAttemptId: chosenAttempt.candidateId,
      finalStatus: validAttempts.length > 0 ? "valid" : chosenAttempt.finalStatus,
      totalScore: validAttempts.length > 0 ? chosenAttempt.totalScore : chosenAttempt.totalScore,
      latestSubmittedAt: chosenAttempt.latestEventTime
    };

    this.db
      .prepare(
        `INSERT OR REPLACE INTO session_results
        (id, camp_id, session_id, member_id, chosen_attempt_id, final_status, total_score, latest_submitted_at)
        VALUES (@id, @campId, @sessionId, @memberId, @chosenAttemptId, @finalStatus, @totalScore, @latestSubmittedAt)`
      )
      .run({
        ...result,
        chosenAttemptId: result.chosenAttemptId ?? null
      });

    return result;
  }

  private listSessionResults(campId: string): SessionResult[] {
    const rows = this.db
      .prepare(
        `SELECT id, camp_id, session_id, member_id, chosen_attempt_id, final_status, total_score, latest_submitted_at
         FROM session_results
         WHERE camp_id = ?`
      )
      .all(campId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      campId: String(row.camp_id),
      sessionId: String(row.session_id),
      memberId: String(row.member_id),
      chosenAttemptId: row.chosen_attempt_id ? String(row.chosen_attempt_id) : undefined,
      finalStatus: String(row.final_status) as SessionResult["finalStatus"],
      totalScore: Number(row.total_score ?? 0),
      latestSubmittedAt: String(row.latest_submitted_at)
    }));
  }

  listOperatorSubmissions(campId: string): OperatorSubmissionEntry[] {
    const rows = this.db
      .prepare(
        `SELECT
           c.id AS candidate_id,
           c.member_id,
           m.name AS member_name,
           m.department,
           c.session_id,
           s.title AS session_title,
           c.latest_event_time,
           sc.total_score,
           sc.final_status,
           sc.manual_override_flag,
           sc.review_note
         FROM submission_candidates c
         JOIN members m ON m.id = c.member_id
         JOIN sessions s ON s.id = c.session_id
         LEFT JOIN scores sc ON sc.candidate_id = c.id
         WHERE c.camp_id = ?
         ORDER BY c.latest_event_time DESC`
      )
      .all(campId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      candidateId: String(row.candidate_id),
      memberId: String(row.member_id),
      memberName: String(row.member_name),
      department: String(row.department),
      sessionId: String(row.session_id),
      sessionTitle: String(row.session_title),
      latestEventTime: String(row.latest_event_time),
      totalScore: Number(row.total_score ?? 0),
      finalStatus: (row.final_status ?? "pending_review") as OperatorSubmissionEntry["finalStatus"],
      manualOverrideFlag: asBoolean(Number(row.manual_override_flag ?? 0)),
      reviewNote: String(row.review_note ?? "")
    }));
  }

  private listScoreRowsForMember(campId: string, memberId: string) {
    const rows = this.db
      .prepare(
        `SELECT
           sr.chosen_attempt_id AS candidate_id,
           sr.session_id,
           sr.final_status,
           sc.score_reason,
           sc.reviewed_at,
           sr.latest_submitted_at AS latest_event_time,
           s.course_date,
           s.deadline_at
         FROM session_results sr
         JOIN sessions s ON s.id = sr.session_id
         LEFT JOIN scores sc ON sc.candidate_id = sr.chosen_attempt_id
         WHERE sr.camp_id = ? AND sr.member_id = ?
         ORDER BY s.course_date ASC`
      )
      .all(campId, memberId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      candidateId: String(row.candidate_id),
      sessionId: String(row.session_id),
      finalStatus: String(row.final_status) as ScoringResult["finalStatus"],
      scoreReason: String(row.score_reason ?? ""),
      reviewedAt: String(row.reviewed_at ?? ""),
      latestEventTime: String(row.latest_event_time ?? ""),
      courseDate: String(row.course_date),
      deadlineAt: String(row.deadline_at)
    }));
  }

  private resolveWarningsForSession(campId: string, memberId: string, sessionId: string) {
    const rows = this.db
      .prepare(
        `SELECT * FROM warnings
         WHERE camp_id = ? AND member_id = ? AND session_id = ? AND resolved_flag = 0`
      )
      .all(campId, memberId, sessionId) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      return [];
    }

    this.db
      .prepare(
        `UPDATE warnings
         SET resolved_flag = 1
         WHERE camp_id = ? AND member_id = ? AND session_id = ? AND resolved_flag = 0`
      )
      .run(campId, memberId, sessionId);

    return rows.map((row) => ({
      id: String(row.id),
      campId: String(row.camp_id),
      memberId: String(row.member_id),
      sessionId: row.session_id ? String(row.session_id) : undefined,
      violationType: row.violation_type as WarningRecord["violationType"],
      level: row.level as WarningRecord["level"],
      createdAt: String(row.created_at),
      resolvedFlag: true,
      note: String(row.note)
    }));
  }

  overrideReview(candidateId: string, review: ReviewAction) {
    const existing = this.getScore(candidateId);
    const attempt = this.getAttempt(candidateId);
    if (!existing || !attempt) {
      return undefined;
    }

    const reviewedAt = nowIso();

    if (review.action === "restore_status") {
      this.db
        .prepare("UPDATE members SET status = 'active' WHERE id = ?")
        .run(existing.memberId);
      this.resolveWarningsForSession(attempt.campId, existing.memberId, existing.sessionId);
    } else {
      const override =
        review.action === "mark_no_count"
          ? {
              finalStatus: "invalid" as const,
              baseScore: 0,
              processScore: 0,
              qualityScore: 0,
              communityBonus: 0
            }
          : review.action === "override_score"
          ? (review.override ?? {
              finalStatus: "pending_review" as const,
              baseScore: 0,
              processScore: 0,
              qualityScore: 0,
              communityBonus: 0
            })
          : {
              finalStatus: "pending_review" as const,
              baseScore: 0,
              processScore: 0,
              qualityScore: 0,
              communityBonus: 0
            };

      this.db
        .prepare(
          `UPDATE scores
           SET base_score = @baseScore,
               process_score = @processScore,
               quality_score = @qualityScore,
               community_bonus = @communityBonus,
               total_score = @totalScore,
               final_status = @finalStatus,
               manual_override_flag = 1,
               score_reason = @scoreReason,
               review_note = @reviewNote,
               reviewed_by = @reviewedBy,
               reviewed_at = @reviewedAt
           WHERE candidate_id = @candidateId`
        )
        .run({
          candidateId,
          baseScore: override.baseScore,
          processScore: override.processScore,
          qualityScore: override.qualityScore,
          communityBonus: override.communityBonus,
          totalScore:
            override.baseScore +
            override.processScore +
            override.qualityScore +
            override.communityBonus,
          finalStatus: override.finalStatus,
          scoreReason:
            review.action === "mark_no_count"
              ? "manual_no_count"
              : existing.scoreReason,
          reviewNote: review.note,
          reviewedBy: review.reviewer,
          reviewedAt
        });
    }

    this.recordAudit({
      id: `audit:review:${candidateId}:${Date.now()}`,
      campId: attempt.campId,
      entityType: "score",
      entityId: candidateId,
      action: review.action,
      actor: review.reviewer,
      payload: JSON.stringify(review),
      createdAt: reviewedAt
    });

    this.recomputeSessionResult(attempt.campId, attempt.memberId, attempt.sessionId);
    this.syncMemberWarnings(attempt.campId, attempt.memberId);
    return this.getScore(candidateId);
  }

  syncMemberWarnings(campId: string, memberId: string) {
    const now = Date.now();
    const scoreRows = this.listScoreRowsForMember(campId, memberId);
    const sessions = this.listSessions(campId);
    const sessionById = new Map(sessions.map((session) => [session.id, session] as const));
    const currentWarnings = this.listWarnings(campId).filter((warning) => warning.memberId === memberId);
    const warningByKey = new Map(
      currentWarnings.map((warning) => [buildWarningKey(memberId, warning.sessionId, warning.violationType), warning] as const)
    );

    const desiredFacts: WarningSyncRow[] = [];
    const activeScoreSessionIds = new Set<string>();

    for (const scoreRow of scoreRows) {
      activeScoreSessionIds.add(scoreRow.sessionId);

      if (scoreRow.finalStatus !== "invalid") {
        continue;
      }

      const violationType = classifyWarningViolation(scoreRow.scoreReason) ?? "invalid_submission";
      const key = buildWarningKey(memberId, scoreRow.sessionId, violationType);
      const existingWarning = warningByKey.get(key);

      if (existingWarning?.resolvedFlag) {
        continue;
      }

      const session = sessionById.get(scoreRow.sessionId);
      desiredFacts.push({
        sessionId: scoreRow.sessionId,
        violationType,
        createdAt:
          scoreRow.latestEventTime ||
          scoreRow.reviewedAt ||
          session?.courseDate ||
          nowIso(),
        note: `${violationType}_count=0`,
        key,
        resolved: false,
        existing: existingWarning
      });
    }

    for (const session of sessions) {
      if (new Date(session.deadlineAt).getTime() > now) {
        continue;
      }

      if (activeScoreSessionIds.has(session.id)) {
        continue;
      }

      const key = buildWarningKey(memberId, session.id, "absence");
      const existingWarning = warningByKey.get(key);
      if (existingWarning?.resolvedFlag) {
        continue;
      }

      desiredFacts.push({
        sessionId: session.id,
        violationType: "absence",
        createdAt: session.deadlineAt,
        note: "absence_count=0",
        key,
        resolved: false,
        existing: existingWarning
      });
    }

    desiredFacts.sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    const updatedWarnings: WarningRecord[] = desiredFacts.map((fact, index) => {
      const level = resolveWarningLevel(index + 1);
      const warning =
        fact.existing ??
        ({
          id: `warning:${memberId}:${fact.sessionId}:${fact.violationType}`,
          campId,
          memberId,
          sessionId: fact.sessionId,
          violationType: fact.violationType,
          level,
          createdAt: fact.createdAt,
          resolvedFlag: false,
          note: fact.note
        } satisfies WarningRecord);

      return {
        ...warning,
        level,
        resolvedFlag: false,
        note: `${fact.violationType}_count=${index + 1}`
      };
    });

    const desiredActiveKeys = new Set(desiredFacts.map((fact) => fact.key));
    const warningsToResolve = currentWarnings.filter(
      (warning) => !warning.resolvedFlag && !desiredActiveKeys.has(buildWarningKey(memberId, warning.sessionId, warning.violationType))
    );

    const upsertWarning = this.db.prepare(
      `INSERT OR REPLACE INTO warnings
      (id, camp_id, member_id, session_id, violation_type, level, created_at, resolved_flag, note)
      VALUES (@id, @campId, @memberId, @sessionId, @violationType, @level, @createdAt, @resolvedFlag, @note)`
    );

    for (const warning of updatedWarnings) {
      upsertWarning.run({
        ...warning,
        resolvedFlag: 0
      });
    }

    if (warningsToResolve.length > 0) {
      const resolveWarning = this.db.prepare(
        `UPDATE warnings
         SET resolved_flag = 1
         WHERE id = ?`
      );

      for (const warning of warningsToResolve) {
        resolveWarning.run(warning.id);
      }
    }

    const memberWarnings = this.listWarnings(campId).filter(
      (warning) => warning.memberId === memberId && !warning.resolvedFlag
    );
    const nextStatus = nextMemberStatusFromWarnings(memberWarnings);
    const currentMember = this.getMember(memberId);
    if (currentMember && currentMember.status !== nextStatus) {
      this.db.prepare("UPDATE members SET status = ? WHERE id = ?").run(nextStatus, memberId);
    }

    const shouldAudit = updatedWarnings.length > 0 || warningsToResolve.length > 0 || currentMember?.status !== nextStatus;
    if (shouldAudit) {
      this.recordAudit({
        id: `audit:warning:${memberId}:${Date.now()}`,
        campId,
        entityType: "warning",
        entityId: memberId,
        action: "warning_state_synced",
        actor: "system",
        payload: JSON.stringify({
          activeWarnings: updatedWarnings,
          resolvedWarnings: warningsToResolve,
          nextStatus
        }),
        createdAt: nowIso()
      });
    }

    return updatedWarnings;
  }

  listWarnings(campId: string): WarningRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM warnings WHERE camp_id = ? ORDER BY created_at ASC")
      .all(campId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      campId: String(row.camp_id),
      memberId: String(row.member_id),
      sessionId: row.session_id ? String(row.session_id) : undefined,
      violationType: row.violation_type as WarningRecord["violationType"],
      level: row.level as WarningRecord["level"],
      createdAt: String(row.created_at),
      resolvedFlag: asBoolean(Number(row.resolved_flag)),
      note: String(row.note)
    }));
  }

  getRanking(campId: string) {
    return buildBoardRanking({
      members: this.listMembers(campId),
      scores: this.listSessionResults(campId)
        .filter((row) => row.finalStatus === "valid")
        .map((row) => ({
          memberId: row.memberId,
          sessionId: row.sessionId,
          totalScore: row.totalScore,
          communityBonus: 0,
          finalStatus: row.finalStatus
        }))
    });
  }

  getPublicBoard(campId: string) {
    const entries = this.getRanking(campId);
    return {
      campId,
      entries,
      overview: buildBoardOverview(entries)
    };
  }

  createSnapshot(campId: string, actor = "system") {
    const board = this.getPublicBoard(campId);
    const sessions = this.listSessions(campId);
    const activeSession = sessions.at(-1);
    const snapshot: BoardSnapshotRecord = {
      id: `snapshot:${campId}:${Date.now()}`,
      campId,
      sessionId: activeSession?.id,
      periodStart: activeSession?.windowStart ?? nowIso(),
      periodEnd: activeSession?.windowEnd ?? nowIso(),
      payload: {
        entries: board.entries,
        overview: board.overview
      },
      createdAt: nowIso()
    };

    this.db
      .prepare(
        `INSERT INTO board_snapshots
        (id, camp_id, session_id, period_start, period_end, payload, created_at)
        VALUES (@id, @campId, @sessionId, @periodStart, @periodEnd, @payload, @createdAt)`
      )
      .run({
        ...snapshot,
        payload: JSON.stringify(snapshot.payload)
      });

    this.recordAudit({
      id: `audit:snapshot:${snapshot.id}`,
      campId,
      entityType: "snapshot",
      entityId: snapshot.id,
      action: "snapshot_created",
      actor,
      payload: JSON.stringify(snapshot.payload),
      createdAt: snapshot.createdAt
    });

    return snapshot;
  }

  listSnapshots(campId: string): BoardSnapshotRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM board_snapshots WHERE camp_id = ? ORDER BY created_at DESC")
      .all(campId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      campId: String(row.camp_id),
      sessionId: row.session_id ? String(row.session_id) : undefined,
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      payload: JSON.parse(String(row.payload)) as BoardSnapshotRecord["payload"],
      createdAt: String(row.created_at)
    }));
  }

  createAnnouncementJob(input: {
    campId: string;
    type: AnnouncementType;
    text: string;
    triggeredBy: string;
    status?: AnnouncementJob["status"];
  }): AnnouncementJob {
    const job: AnnouncementJob = {
      id: `announcement:${input.type}:${Date.now()}`,
      campId: input.campId,
      type: input.type,
      text: input.text,
      status: input.status ?? "recorded",
      triggeredBy: input.triggeredBy,
      createdAt: nowIso()
    };

    this.db
      .prepare(
        `INSERT INTO announcement_jobs
        (id, camp_id, type, text, status, triggered_by, created_at)
        VALUES (@id, @campId, @type, @text, @status, @triggeredBy, @createdAt)`
      )
      .run(job);

    this.recordAudit({
      id: `audit:announcement:${job.id}`,
      campId: input.campId,
      entityType: "announcement",
      entityId: job.id,
      action: "announcement_recorded",
      actor: input.triggeredBy,
      payload: JSON.stringify(job),
      createdAt: job.createdAt
    });

    return job;
  }

  recordAudit(event: AuditEvent) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO audit_events
        (id, camp_id, entity_type, entity_id, action, actor, payload, created_at)
        VALUES (@id, @campId, @entityType, @entityId, @action, @actor, @payload, @createdAt)`
      )
      .run(event);
  }
}
