export interface BoardRankingEntry {
  memberId: string;
  memberName: string;
  department: string;
  totalScore: number;
  sessionCount: number;
  rank: number;
}

export interface RankingResponse {
  campId: string;
  entries: BoardRankingEntry[];
  overview: {
    participantCount: number;
    leader: BoardRankingEntry | null;
    averageScore: number;
  };
}

export interface MemberEntry {
  id: string;
  campId: string;
  name: string;
  department: string;
  roleType: "student" | "operator" | "trainer" | "observer";
  isParticipant: boolean;
  isExcludedFromBoard: boolean;
  status: "active" | "warned" | "eliminated";
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
  finalStatus: "valid" | "invalid" | "pending_review";
  manualOverrideFlag: boolean;
  reviewNote: string;
}

export interface WarningEntry {
  id: string;
  campId: string;
  memberId: string;
  sessionId?: string;
  violationType: "absence" | "late_submission" | "invalid_submission";
  level: "reminder" | "warning" | "elimination";
  createdAt: string;
  resolvedFlag: boolean;
  note: string;
}

export interface SnapshotEntry {
  id: string;
  campId: string;
  sessionId?: string;
  periodStart: string;
  periodEnd: string;
  payload: {
    entries: BoardRankingEntry[];
    overview: RankingResponse["overview"];
  };
  createdAt: string;
}

export interface AnnouncementPreview {
  type: "deadline_reminder" | "submission_summary" | "biweekly_ranking" | "status_change";
  text: string;
}
