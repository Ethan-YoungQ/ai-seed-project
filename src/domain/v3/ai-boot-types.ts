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
