import type {
  BoardSnapshotRecord,
  MemberProfile,
  RawMessageEvent,
  ScoringResult,
  WarningRecord
} from "../../domain/types";
import type { FeishuApiClient } from "./client";
import type { FeishuBaseTablesConfig } from "./config";

function stringifyBaseValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((entry) => stringifyBaseValue(entry)).join(",");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function asBaseFields(fields: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, stringifyBaseValue(value)])
  );
}

export interface BaseSyncService {
  syncMember(member: MemberProfile): Promise<void>;
  syncRawEvent(event: RawMessageEvent & { campId: string; parseStatus: string }): Promise<void>;
  syncScore(input: { campId: string; member: MemberProfile; score: ScoringResult }): Promise<void>;
  syncReview(input: { campId: string; member: MemberProfile; score: ScoringResult }): Promise<void>;
  syncWarning(warning: WarningRecord): Promise<void>;
  syncSnapshot(snapshot: BoardSnapshotRecord): Promise<void>;
}

export class NoopBaseSyncService implements BaseSyncService {
  async syncMember() {}

  async syncRawEvent() {}

  async syncScore() {}

  async syncReview() {}

  async syncWarning() {}

  async syncSnapshot() {}
}

export class FeishuBaseSyncService implements BaseSyncService {
  constructor(
    private readonly config: {
      enabled: boolean;
      appToken?: string;
      tables: FeishuBaseTablesConfig;
    },
    private readonly apiClient: FeishuApiClient
  ) {}

  private async write(tableId: string | undefined, fields: Record<string, unknown>) {
    if (!this.config.enabled || !this.config.appToken || !tableId) {
      return;
    }

    const serialized = asBaseFields(fields);
    const businessKeyEntry = Object.entries(serialized).find(([key]) => key.endsWith("_id"));

    if (!businessKeyEntry) {
      await this.apiClient.createBaseRecord({
        appToken: this.config.appToken,
        tableId,
        fields: serialized
      });
      return;
    }

    const [fieldName, fieldValue] = businessKeyEntry;
    const existing = await this.apiClient.searchBaseRecords({
      appToken: this.config.appToken,
      tableId,
      fieldName,
      fieldValue
    });

    if (existing[0]?.recordId) {
      await this.apiClient.updateBaseRecord({
        appToken: this.config.appToken,
        tableId,
        recordId: existing[0].recordId,
        fields: serialized
      });
      return;
    }

    await this.apiClient.createBaseRecord({
      appToken: this.config.appToken,
      tableId,
      fields: serialized
    });
  }

  async syncMember(member: MemberProfile) {
    await this.write(this.config.tables.members, {
      member_id: member.id,
      camp_id: member.campId,
      name: member.name,
      department: member.department,
      role_type: member.roleType,
      is_participant: member.isParticipant,
      is_excluded_from_board: member.isExcludedFromBoard,
      status: member.status
    });
  }

  async syncRawEvent(event: RawMessageEvent & { campId: string; parseStatus: string }) {
    await this.write(this.config.tables.rawEvents, {
      event_id: event.id,
      camp_id: event.campId,
      chat_id: event.chatId,
      member_id: event.memberId,
      session_id: event.sessionId ?? "",
      message_id: event.messageId,
      raw_text: event.rawText,
      parsed_tags: event.parsedTags.join(" "),
      attachment_count: event.attachmentCount,
      attachment_types: event.attachmentTypes.join(","),
      event_time: event.eventTime,
      event_url: event.eventUrl,
      parse_status: event.parseStatus
    });
  }

  async syncScore(input: { campId: string; member: MemberProfile; score: ScoringResult }) {
    await this.write(this.config.tables.scores, {
      candidate_id: input.score.candidateId,
      camp_id: input.campId,
      member_id: input.score.memberId,
      member_name: input.member.name,
      session_id: input.score.sessionId,
      final_status: input.score.finalStatus,
      base_score: input.score.baseScore,
      process_score: input.score.processScore,
      quality_score: input.score.qualityScore,
      community_bonus: input.score.communityBonus,
      total_score: input.score.totalScore,
      score_reason: input.score.scoreReason,
      llm_reason: input.score.llmReason,
      manual_override_flag: input.score.manualOverrideFlag ?? false,
      reviewed_by: input.score.reviewedBy ?? "",
      reviewed_at: input.score.reviewedAt ?? ""
    });
  }

  async syncReview(input: { campId: string; member: MemberProfile; score: ScoringResult }) {
    await this.syncScore(input);
  }

  async syncWarning(warning: WarningRecord) {
    await this.write(this.config.tables.warnings, {
      warning_id: warning.id,
      camp_id: warning.campId,
      member_id: warning.memberId,
      session_id: warning.sessionId ?? "",
      violation_type: warning.violationType,
      level: warning.level,
      created_at: warning.createdAt,
      resolved_flag: warning.resolvedFlag,
      note: warning.note
    });
  }

  async syncSnapshot(snapshot: BoardSnapshotRecord) {
    await this.write(this.config.tables.snapshots, {
      snapshot_id: snapshot.id,
      camp_id: snapshot.campId,
      session_id: snapshot.sessionId ?? "",
      period_start: snapshot.periodStart,
      period_end: snapshot.periodEnd,
      created_at: snapshot.createdAt,
      payload_json: JSON.stringify(snapshot.payload)
    });
  }
}
