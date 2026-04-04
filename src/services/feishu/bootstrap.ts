import { SqliteRepository } from "../../storage/sqlite-repository";
import type { FeishuApiClient } from "./client";
import type { FeishuBaseTablesConfig, FeishuConfig } from "./config";

const TEXT_FIELD_TYPE = 1;

const tableSchemas: Array<{ key: keyof FeishuBaseTablesConfig; name: string; fields: string[] }> = [
  {
    key: "rawEvents",
    name: "raw_events",
    fields: [
      "event_id",
      "camp_id",
      "chat_id",
      "member_id",
      "session_id",
      "message_id",
      "raw_text",
      "parsed_tags",
      "attachment_count",
      "attachment_types",
      "event_time",
      "event_url",
      "parse_status"
    ]
  },
  {
    key: "scores",
    name: "scores",
    fields: [
      "candidate_id",
      "camp_id",
      "member_id",
      "member_name",
      "session_id",
      "final_status",
      "base_score",
      "process_score",
      "quality_score",
      "community_bonus",
      "total_score",
      "score_reason",
      "llm_reason",
      "manual_override_flag",
      "reviewed_by",
      "reviewed_at"
    ]
  },
  {
    key: "warnings",
    name: "warnings",
    fields: [
      "warning_id",
      "camp_id",
      "member_id",
      "session_id",
      "violation_type",
      "level",
      "created_at",
      "resolved_flag",
      "note"
    ]
  },
  {
    key: "snapshots",
    name: "snapshots",
    fields: [
      "snapshot_id",
      "camp_id",
      "session_id",
      "period_start",
      "period_end",
      "created_at",
      "payload_json"
    ]
  }
];

export class FeishuBootstrapService {
  constructor(
    private readonly repository: SqliteRepository,
    private readonly apiClient: FeishuApiClient,
    private readonly config: FeishuConfig
  ) {}

  async bootstrap(input: {
    campId?: string;
    chatId?: string;
    chatName?: string;
    chatMemberOpenIds?: string[];
    chatOwnerOpenId?: string;
    baseName?: string;
  }) {
    if (!this.config.appId || !this.config.appSecret) {
      throw new Error("FEISHU_APP_ID and FEISHU_APP_SECRET are required before bootstrap.");
    }

    const appId = this.config.appId;
    await this.apiClient.validateCredentials();

    const campId = input.campId ?? this.repository.getDefaultCampId();
    if (!campId) {
      throw new Error("No camp found to bind the test chat.");
    }

    const chat = await this.resolveChat(input, appId);
    this.repository.updateCampGroupId(campId, chat.chatId);

    const base = await this.createBaseSchema(input.baseName ?? "Pfizer HBU AI Evaluator Base");

    return {
      campId,
      chat,
      base,
      env: {
        FEISHU_BOT_CHAT_ID: chat.chatId,
        FEISHU_BOT_RECEIVE_ID_TYPE: "chat_id",
        FEISHU_BASE_ENABLED: "true",
        FEISHU_BASE_APP_TOKEN: base.appToken,
        FEISHU_BASE_MEMBERS_TABLE: base.tables.members ?? "",
        FEISHU_BASE_RAW_EVENTS_TABLE: base.tables.rawEvents ?? "",
        FEISHU_BASE_SCORES_TABLE: base.tables.scores ?? "",
        FEISHU_BASE_WARNINGS_TABLE: base.tables.warnings ?? "",
        FEISHU_BASE_SNAPSHOTS_TABLE: base.tables.snapshots ?? ""
      }
    };
  }

  private async resolveChat(input: {
    chatId?: string;
    chatName?: string;
    chatMemberOpenIds?: string[];
    chatOwnerOpenId?: string;
  }, appId: string) {
    if (input.chatId) {
      return {
        chatId: input.chatId,
        source: "provided" as const
      };
    }

    if (this.config.botChatId) {
      return {
        chatId: this.config.botChatId,
        source: "configured" as const
      };
    }

    if (input.chatName) {
      const existing = await this.apiClient.searchChats({
        query: input.chatName,
        pageSize: 20
      });
      const exactMatch = existing.find((entry) => entry.name === input.chatName);
      if (exactMatch) {
        return {
          chatId: exactMatch.chatId,
          source: "searched" as const
        };
      }
    }

    if (!input.chatMemberOpenIds?.length) {
      throw new Error(
        "No visible test chat was found. Provide FEISHU_TEST_CHAT_ID or FEISHU_TEST_CHAT_MEMBER_OPEN_IDS to continue."
      );
    }

    try {
      const created = await this.apiClient.createChat({
        name: input.chatName ?? "Pfizer HBU AI Evaluator Test Group",
        description: "Bootstrap-created test group for Feishu integration verification.",
        ownerOpenId: input.chatOwnerOpenId,
        userOpenIds: input.chatMemberOpenIds,
        botAppIds: [appId],
        external: true
      });

      if (!created.chatId) {
        throw new Error("chat_id missing from chat.create response");
      }

      return {
        chatId: created.chatId,
        source: "created" as const
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "chat create failed";
      throw new Error(
        `Unable to auto-create a test chat (${detail}). Provide FEISHU_TEST_CHAT_ID or FEISHU_TEST_CHAT_MEMBER_OPEN_IDS for manual fallback.`
      );
    }
  }

  private async createBaseSchema(baseName: string) {
    const createdApp = await this.apiClient.createBaseApp({
      name: baseName,
      timeZone: "Asia/Shanghai"
    });

    if (!createdApp.appToken || !createdApp.defaultTableId) {
      throw new Error("Failed to create Feishu Base app.");
    }

    await this.apiClient.renameBaseTable({
      appToken: createdApp.appToken,
      tableId: createdApp.defaultTableId,
      name: "members"
    });

    const tables: FeishuBaseTablesConfig = {
      members: createdApp.defaultTableId
    };

    for (const schema of tableSchemas) {
      const created = await this.apiClient.createBaseTable({
        appToken: createdApp.appToken,
        name: schema.name,
        fields: schema.fields.map((fieldName) => ({
          fieldName,
          type: TEXT_FIELD_TYPE
        }))
      });

      tables[schema.key] = created.tableId;
    }

    return {
      appToken: createdApp.appToken,
      url: createdApp.url,
      tables
    };
  }
}
