export type CycleType = "biweekly";
export type MemberStatus = "active" | "warned" | "eliminated";
export type RoleType = "student" | "operator" | "trainer" | "observer";
export type FinalStatus = "valid" | "invalid" | "pending_review";
export type WarningLevel = "reminder" | "warning" | "elimination";
export type ReviewActionType = "override_score" | "mark_no_count" | "restore_status";
export type DocumentParseStatus =
  | "not_applicable"
  | "pending"
  | "parsed"
  | "unsupported"
  | "failed";
export type AnnouncementType =
  | "deadline_reminder"
  | "submission_summary"
  | "biweekly_ranking"
  | "status_change";

export interface CampRecord {
  id: string;
  name: string;
  groupId: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface SessionDefinition {
  id: string;
  campId: string;
  title: string;
  homeworkTag: string;
  courseDate: string;
  deadlineAt: string;
  windowStart: string;
  windowEnd: string;
  cycleType: CycleType;
  active: boolean;
}

export interface MemberProfile {
  id: string;
  campId: string;
  name: string;
  department: string;
  roleType: RoleType;
  isParticipant: boolean;
  isExcludedFromBoard: boolean;
  status: MemberStatus;
}

export interface RawMessageEvent {
  id: string;
  chatId: string;
  memberId: string;
  sessionId?: string;
  messageId: string;
  messageType?: string;
  eventTime: string;
  rawText: string;
  parsedTags: string[];
  attachmentCount: number;
  attachmentTypes: string[];
  fileKey?: string;
  fileName?: string;
  fileExt?: string;
  mimeType?: string;
  documentText?: string;
  documentParseStatus?: DocumentParseStatus;
  documentParseReason?: string;
  eventUrl: string;
}

export interface SubmissionAttempt {
  id: string;
  campId: string;
  sessionId: string;
  memberId: string;
  homeworkTag: string;
  eventId: string;
  messageId: string;
  eventIds: string[];
  fileKey?: string;
  combinedText: string;
  attachmentCount: number;
  attachmentTypes: string[];
  documentText?: string;
  documentParseStatus?: DocumentParseStatus;
  firstEventTime: string;
  latestEventTime: string;
  deadlineAt: string;
  evaluationWindowEnd: string;
}

export type SubmissionCandidate = SubmissionAttempt;

export interface ScoringResult {
  memberId: string;
  sessionId: string;
  candidateId: string;
  baseScore: number;
  processScore: number;
  qualityScore: number;
  communityBonus: number;
  totalScore: number;
  finalStatus: FinalStatus;
  scoreReason: string;
  llmReason: string;
  llmModel?: string;
  llmInputExcerpt?: string;
  manualOverrideFlag?: boolean;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  autoBaseScore?: number;
  autoProcessScore?: number;
  autoQualityScore?: number;
  autoCommunityBonus?: number;
}

export interface SessionResult {
  id: string;
  campId: string;
  sessionId: string;
  memberId: string;
  chosenAttemptId?: string;
  finalStatus: FinalStatus;
  totalScore: number;
  latestSubmittedAt: string;
}

export interface RankingInputScore {
  memberId: string;
  sessionId: string;
  totalScore: number;
  communityBonus: number;
  finalStatus: FinalStatus;
}

export interface BoardRankingEntry {
  memberId: string;
  memberName: string;
  department: string;
  totalScore: number;
  sessionCount: number;
  rank: number;
}

export interface OperatorSubmissionEntry {
  candidateId: string;
  memberId: string;
  memberName: string;
  department: string;
  sessionId: string;
  sessionTitle: string;
  latestEventTime: string;
  totalScore: number;
  finalStatus: FinalStatus;
  manualOverrideFlag: boolean;
  reviewNote: string;
}

export interface WarningRecord {
  id: string;
  campId: string;
  memberId: string;
  sessionId?: string;
  violationType: "absence" | "late_submission" | "invalid_submission";
  level: WarningLevel;
  createdAt: string;
  resolvedFlag: boolean;
  note: string;
}

export interface ReviewAction {
  action: ReviewActionType;
  reviewer: string;
  note: string;
  override?: {
    finalStatus: FinalStatus;
    baseScore: number;
    processScore: number;
    qualityScore: number;
    communityBonus: number;
  };
}

export interface AuditEvent {
  id: string;
  campId: string;
  entityType: "score" | "warning" | "snapshot" | "announcement" | "member";
  entityId: string;
  action: string;
  actor: string;
  payload: string;
  createdAt: string;
}

export interface BoardSnapshotRecord {
  id: string;
  campId: string;
  sessionId?: string;
  periodStart: string;
  periodEnd: string;
  payload: {
    entries: BoardRankingEntry[];
    overview: {
      participantCount: number;
      leader: BoardRankingEntry | null;
      averageScore: number;
    };
  };
  createdAt: string;
}

export interface AnnouncementJob {
  id: string;
  campId: string;
  type: AnnouncementType;
  text: string;
  status: "recorded" | "sent" | "failed";
  triggeredBy: string;
  createdAt: string;
}
