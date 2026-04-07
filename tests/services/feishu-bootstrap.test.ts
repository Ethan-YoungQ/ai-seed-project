import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeishuBootstrapService } from "../../src/services/feishu/bootstrap";
import { SqliteRepository } from "../../src/storage/sqlite-repository";

describe("FeishuBootstrapService", () => {
  let repository: SqliteRepository;

  beforeEach(() => {
    repository = new SqliteRepository(":memory:");
    repository.seedDemo();
  });

  it("creates and binds a test chat plus a fresh Base schema for the default camp", async () => {
    const service = new FeishuBootstrapService(
      repository,
      {
        validateCredentials: vi.fn(async () => ({ tenantKey: "tenant-demo" })),
        sendTextMessage: vi.fn(async () => ({ messageId: "om_bot_001" })),
        getMessageFile: vi.fn(async () => ({
          fileKey: "file-demo",
          fileName: "demo.pdf",
          fileExt: "pdf",
          mimeType: "application/pdf",
          bytes: Buffer.from("demo")
        })),
        createBaseRecord: vi.fn(async () => ({ recordId: "rec_001" })),
        searchBaseRecords: vi.fn(async () => []),
        updateBaseRecord: vi.fn(async () => ({ recordId: "rec_001" })),
        searchChats: vi.fn(async () => []),
        createChat: vi.fn(async () => ({ chatId: "chat-test-001", name: "Pfizer Test Group" })),
        createBaseApp: vi.fn(async () => ({
          appToken: "bitable_app_token",
          defaultTableId: "tbl_default"
        })),
        renameBaseTable: vi.fn(async () => undefined),
        createBaseTable: vi.fn(async ({ name }) => ({
          tableId: `tbl_${name}`
        }))
      },
      {
        enabled: true,
        appId: "cli_test",
        appSecret: "secret_test",
        eventMode: "long_connection",
        botReceiveIdType: "chat_id",
        base: {
          enabled: true,
          tables: {}
        }
      }
    );

    const result = await service.bootstrap({
      chatName: "Pfizer Test Group",
      chatMemberOpenIds: ["ou_member_001"],
      baseName: "Pfizer Evaluator Base"
    });

    expect(result.chat.chatId).toBe("chat-test-001");
    expect(result.base.appToken).toBe("bitable_app_token");
    expect(result.base.tables).toMatchObject({
      members: "tbl_default",
      rawEvents: "tbl_raw_events",
      scores: "tbl_scores",
      warnings: "tbl_warnings",
      snapshots: "tbl_snapshots"
    });
    expect(result.phaseOne).toMatchObject({
      homeTemplates: {
        learner: "docs/feishu/learner-homepage-copy.md",
        operator: "docs/feishu/operator-homepage-copy.md"
      },
      entryContract: {
        learnerHomeUrl: "",
        operatorHomeUrl: "",
        leaderboardUrl: ""
      }
    });
    expect(result.env.FEISHU_BOT_CHAT_ID).toBe("chat-test-001");
    expect(result.env).toMatchObject({
      FEISHU_LEARNER_HOME_URL: "",
      FEISHU_OPERATOR_HOME_URL: "",
      FEISHU_LEADERBOARD_URL: "",
      FEISHU_LEARNER_HOME_DOC_TOKEN: "",
      FEISHU_OPERATOR_HOME_DOC_TOKEN: ""
    });
    expect(repository.getCamp("camp-demo")).toMatchObject({
      groupId: "chat-test-001"
    });
  });

  it("fails with a manual fallback message when no chat can be found or created", async () => {
    const service = new FeishuBootstrapService(
      repository,
      {
        validateCredentials: vi.fn(async () => ({ tenantKey: "tenant-demo" })),
        sendTextMessage: vi.fn(async () => ({ messageId: "om_bot_001" })),
        getMessageFile: vi.fn(async () => ({
          fileKey: "file-demo",
          fileName: "demo.pdf",
          fileExt: "pdf",
          mimeType: "application/pdf",
          bytes: Buffer.from("demo")
        })),
        createBaseRecord: vi.fn(async () => ({ recordId: "rec_001" })),
        searchBaseRecords: vi.fn(async () => []),
        updateBaseRecord: vi.fn(async () => ({ recordId: "rec_001" })),
        searchChats: vi.fn(async () => []),
        createChat: vi.fn(async () => {
          throw new Error("chat creation blocked");
        }),
        createBaseApp: vi.fn(async () => ({
          appToken: "bitable_app_token",
          defaultTableId: "tbl_default"
        })),
        renameBaseTable: vi.fn(async () => undefined),
        createBaseTable: vi.fn(async ({ name }) => ({
          tableId: `tbl_${name}`
        }))
      },
      {
        enabled: true,
        appId: "cli_test",
        appSecret: "secret_test",
        eventMode: "long_connection",
        botReceiveIdType: "chat_id",
        base: {
          enabled: true,
          tables: {}
        }
      }
    );

    await expect(
      service.bootstrap({
        chatName: "Pfizer Test Group"
      })
    ).rejects.toThrow(/FEISHU_TEST_CHAT_ID|FEISHU_TEST_CHAT_MEMBER_OPEN_IDS/);
  });
});