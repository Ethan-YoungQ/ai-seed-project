export type AiBootEventType = "text" | "image" | "file" | "reaction" | "card" | "mention";
export type AiBootEventStatus = "received" | "extracted" | "decided" | "ignored" | "failed";
export type AiBootScoreCategory =
  | "daily_participation"
  | "ai_artifact"
  | "ai_practice_reflection"
  | "prompt_or_method"
  | "resource_recommendation"
  | "peer_help"
  | "formal_task"
  | "operator_adjustment";
export type AiBootDecisionStatus =
  | "approved"
  | "review_required"
  | "rejected"
  | "no_score"
  | "shadow";
export type AiBootNotifyPolicy =
  | "silent"
  | "personal_reply"
  | "group_praise"
  | "daily_digest";
export type AiBootConfidence = "high" | "medium" | "low";
export type AiBootImageUnderstandingStatus = "pending" | "running" | "succeeded" | "failed";

export interface AiBootEventRecord {
  id: string;
  campId: string;
  chatId: string;
  memberId: string;
  sourceMessageId: string;
  eventType: AiBootEventType;
  rawText: string;
  sanitizedText: string;
  attachmentJson: string;
  evidenceJson: string;
  contentHash: string;
  status: AiBootEventStatus;
  engineVersion: string;
  rulesetVersion: string;
  createdAt: string;
}

export interface AiBootScoreEventRecord {
  id: string;
  eventId: string;
  campId: string;
  memberId: string;
  category: AiBootScoreCategory;
  scoreDelta: number;
  confidence: AiBootConfidence;
  status: AiBootDecisionStatus;
  notifyPolicy: AiBootNotifyPolicy;
  reason: string;
  evidence: string;
  badgesJson: string;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  reviewedByOpId: string | null;
  reviewNote: string | null;
  decidedAt: string;
}

export interface AiBootNotificationEventRecord {
  id: string;
  scoreEventId: string;
  campId: string;
  memberId: string;
  chatId: string;
  topicHash: string;
  notifyPolicy: AiBootNotifyPolicy;
  sentAt: string;
  textHash: string;
}

export interface AiBootImageUnderstandingRecord {
  fileKey: string;
  messageId: string;
  contentHash: string;
  modelName: string;
  caption: string;
  scoreHint: string;
  latencyMs: number;
  status: AiBootImageUnderstandingStatus;
  errorReason: string;
  createdAt: string;
  updatedAt: string;
}
