import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const camps = sqliteTable("camps", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  groupId: text("group_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull()
});

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  campId: text("camp_id").notNull(),
  name: text("name").notNull(),
  department: text("department").notNull(),
  roleType: text("role_type").notNull(),
  isParticipant: integer("is_participant", { mode: "boolean" }).notNull().default(true),
  isExcludedFromBoard: integer("is_excluded_from_board", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("active")
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  campId: text("camp_id").notNull(),
  title: text("title").notNull(),
  homeworkTag: text("homework_tag").notNull(),
  cycleType: text("cycle_type").notNull().default("biweekly"),
  courseDate: text("course_date").notNull(),
  deadlineAt: text("deadline_at").notNull(),
  windowStart: text("window_start").notNull(),
  windowEnd: text("window_end").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true)
});

export const rawEvents = sqliteTable("raw_events", {
  id: text("id").primaryKey(),
  campId: text("camp_id").notNull(),
  chatId: text("chat_id").notNull().default(""),
  memberId: text("member_id").notNull(),
  sessionId: text("session_id"),
  messageId: text("message_id").notNull().unique(),
  rawText: text("raw_text").notNull(),
  parsedTags: text("parsed_tags").notNull(),
  attachmentCount: integer("attachment_count").notNull().default(0),
  attachmentTypes: text("attachment_types").notNull(),
  eventTime: text("event_time").notNull(),
  eventUrl: text("event_url").notNull(),
  parseStatus: text("parse_status").notNull().default("raw")
});

export const submissionCandidates = sqliteTable("submission_candidates", {
  id: text("id").primaryKey(),
  campId: text("camp_id").notNull(),
  sessionId: text("session_id").notNull(),
  memberId: text("member_id").notNull(),
  homeworkTag: text("homework_tag").notNull(),
  eventId: text("event_id").notNull().default(""),
  messageId: text("message_id").notNull().default(""),
  eventIds: text("event_ids").notNull(),
  fileKey: text("file_key").notNull().default(""),
  combinedText: text("combined_text").notNull(),
  attachmentCount: integer("attachment_count").notNull().default(0),
  attachmentTypes: text("attachment_types").notNull(),
  documentText: text("document_text").notNull().default(""),
  documentParseStatus: text("document_parse_status").notNull().default("not_applicable"),
  firstEventTime: text("first_event_time").notNull(),
  latestEventTime: text("latest_event_time").notNull(),
  deadlineAt: text("deadline_at").notNull(),
  evaluationWindowEnd: text("evaluation_window_end").notNull()
});

export const sessionResults = sqliteTable("session_results", {
  id: text("id").primaryKey(),
  campId: text("camp_id").notNull(),
  sessionId: text("session_id").notNull(),
  memberId: text("member_id").notNull(),
  chosenAttemptId: text("chosen_attempt_id"),
  finalStatus: text("final_status").notNull(),
  totalScore: integer("total_score").notNull().default(0),
  latestSubmittedAt: text("latest_submitted_at").notNull()
});

export const scores = sqliteTable("scores", {
  id: text("id").primaryKey(),
  campId: text("camp_id").notNull(),
  sessionId: text("session_id").notNull(),
  memberId: text("member_id").notNull(),
  candidateId: text("candidate_id").notNull(),
  baseScore: integer("base_score").notNull().default(0),
  processScore: integer("process_score").notNull().default(0),
  qualityScore: integer("quality_score").notNull().default(0),
  communityBonus: integer("community_bonus").notNull().default(0),
  totalScore: integer("total_score").notNull().default(0),
  scoreReason: text("score_reason").notNull(),
  llmReason: text("llm_reason").notNull(),
  finalStatus: text("final_status").notNull(),
  manualOverrideFlag: integer("manual_override_flag", { mode: "boolean" }).notNull().default(false)
});

export const warnings = sqliteTable("warnings", {
  id: text("id").primaryKey(),
  campId: text("camp_id").notNull(),
  memberId: text("member_id").notNull(),
  sessionId: text("session_id"),
  violationType: text("violation_type").notNull(),
  level: text("level").notNull(),
  createdAt: text("created_at").notNull(),
  resolvedFlag: integer("resolved_flag", { mode: "boolean" }).notNull().default(false),
  note: text("note").notNull().default("")
});

export const boardSnapshots = sqliteTable("board_snapshots", {
  id: text("id").primaryKey(),
  campId: text("camp_id").notNull(),
  sessionId: text("session_id"),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull()
});
