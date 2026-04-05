import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app";
import { NoopFeishuWsRuntime } from "../../src/services/feishu/ws-runtime";

const validHomeworkText =
  "#HW01 #\u4f5c\u4e1a\u63d0\u4ea4 \u6211\u662f\u5148\u5199 prompt\uff0c\u518d\u505a\u4e24\u8f6e\u8fed\u4ee3\u3002\u6700\u7ec8\u6211\u5b66\u4f1a\u4e86\u62c6\u89e3\u95ee\u9898\uff0c\u4e5f\u4ea7\u51fa\u4e86\u4e00\u9875\u7ed3\u6784\u5316\u603b\u7ed3\u3002";

const disabledFeishuConfig = {
  appId: "",
  appSecret: "",
  eventMode: "disabled" as const,
  botChatId: "",
  botReceiveIdType: "chat_id" as const,
  base: {
    enabled: false,
    appToken: undefined,
    tables: {}
  }
};

function buildEvent(
  messageId: string,
  openId: string,
  createTime: string,
  text: string,
  attachmentType: "image" | "file" = "image",
  chatId = "chat-demo",
  chatType = "group",
  senderType = "user"
) {
  return {
    header: {
      event_type: "im.message.receive_v1"
    },
    event: {
      sender: {
        sender_type: senderType,
        sender_id: {
          open_id: openId
        }
      },
      message: {
        message_id: messageId,
        chat_id: chatId,
        chat_type: chatType,
        message_type: "text",
        create_time: createTime,
        content: JSON.stringify({ text }),
        attachments: [{ type: attachmentType }]
      }
    }
  };
}

function buildFileEvent(
  messageId: string,
  openId: string,
  createTime: string,
  fileName: string,
  chatId = "chat-demo",
  chatType = "group",
  senderType = "user"
) {
  return {
    header: {
      event_type: "im.message.receive_v1"
    },
    event: {
      sender: {
        sender_type: senderType,
        sender_id: {
          open_id: openId
        }
      },
      message: {
        message_id: messageId,
        chat_id: chatId,
        chat_type: chatType,
        message_type: "file",
        create_time: createTime,
        content: JSON.stringify({
          file_key: `file_${messageId}`,
          file_name: fileName
        })
      }
    }
  };
}

describe("phase-2 and phase-3 API", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    app = await createApp({
      databaseUrl: ":memory:",
      wsRuntime: new NoopFeishuWsRuntime(),
      feishuConfigOverride: disabledFeishuConfig
    });
    await app.ready();
    await app.inject({
      method: "POST",
      url: "/api/demo/seed",
      payload: {}
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("ingests a Feishu event and returns a valid scored submission with UTF-8 rules", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/feishu/events",
      payload: buildEvent("om_001", "user-alice", "1775210400000", validHomeworkText)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: true,
      sessionId: "session-01",
      finalStatus: "valid"
    });
  });

  it("ignores events from chats that are not bound to the current camp", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/feishu/events",
      payload: buildEvent("om_unbound", "user-alice", "1775210400000", validHomeworkText, "image", "chat-other")
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: false,
      reason: "unbound_chat"
    });

    const submissions = await app.inject({
      method: "GET",
      url: "/api/operator/submissions?campId=camp-demo"
    });

    expect(submissions.json().entries).toHaveLength(0);
  });

  it("returns operator submissions for review after scoring", async () => {
    await app.inject({
      method: "POST",
      url: "/api/feishu/events",
      payload: buildEvent("om_002", "user-alice", "1775210400000", validHomeworkText)
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/operator/submissions?campId=camp-demo"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().entries).toHaveLength(1);
    expect(response.json().entries[0]).toMatchObject({
      candidateId: "session-01:user-alice",
      memberId: "user-alice",
      finalStatus: "valid"
    });
  });

  it("escalates warning levels to elimination after three invalid submissions", async () => {
    const invalidText =
      "#HW01 #\u4f5c\u4e1a\u63d0\u4ea4 \u6211\u662f\u5148\u5c1d\u8bd5\u4e86\u4e00\u4e0b\u63d0\u793a\u8bcd\u3002";

    await app.inject({
      method: "POST",
      url: "/api/feishu/events",
      payload: buildEvent("om_101", "user-alice", "1775210400000", invalidText)
    });
    await app.inject({
      method: "POST",
      url: "/api/feishu/events",
      payload: buildEvent(
        "om_102",
        "user-alice",
        "1776420000000",
        invalidText.replace("#HW01", "#HW02")
      )
    });
    await app.inject({
      method: "POST",
      url: "/api/feishu/events",
      payload: buildEvent(
        "om_103",
        "user-alice",
        "1777629600000",
        invalidText.replace("#HW01", "#HW03")
      )
    });

    const warningsResponse = await app.inject({
      method: "GET",
      url: "/api/operator/warnings?campId=camp-demo"
    });

    expect(warningsResponse.statusCode).toBe(200);
    expect(warningsResponse.json().entries.at(-1)).toMatchObject({
      memberId: "user-alice",
      level: "elimination"
    });
  });

  it("lets operators override a candidate and restores the member to the public board", async () => {
    const invalidText =
      "#HW01 #\u4f5c\u4e1a\u63d0\u4ea4 \u6211\u662f\u5148\u5c1d\u8bd5\u4e86\u4e00\u4e0b\u63d0\u793a\u8bcd\u3002";

    await app.inject({
      method: "POST",
      url: "/api/feishu/events",
      payload: buildEvent("om_201", "user-alice", "1775210400000", invalidText)
    });

    const reviewResponse = await app.inject({
      method: "POST",
      url: "/api/reviews/session-01:user-alice",
      payload: {
        action: "override_score",
        reviewer: "ops-demo",
        note: "\u8fd0\u8425\u786e\u8ba4\u8fd9\u6761\u63d0\u4ea4\u5e94\u8ba1\u5165\u6709\u6548\u4f5c\u4e1a",
        override: {
          finalStatus: "valid",
          baseScore: 5,
          processScore: 2,
          qualityScore: 1,
          communityBonus: 0
        }
      }
    });

    expect(reviewResponse.statusCode).toBe(200);

    const boardResponse = await app.inject({
      method: "GET",
      url: "/api/public-board?campId=camp-demo"
    });

    expect(boardResponse.statusCode).toBe(200);
    expect(boardResponse.json().entries[0]).toMatchObject({
      memberId: "user-alice",
      totalScore: 8
    });
  });

  it("creates announcement previews and stores snapshots when announcements run", async () => {
    await app.inject({
      method: "POST",
      url: "/api/feishu/events",
      payload: buildEvent("om_301", "user-alice", "1775210400000", validHomeworkText)
    });

    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/announcements/preview",
      payload: {
        type: "biweekly_ranking",
        campId: "camp-demo"
      }
    });

    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json().text).toContain("Alice");

    const runResponse = await app.inject({
      method: "POST",
      url: "/api/announcements/run",
      payload: {
        type: "biweekly_ranking",
        campId: "camp-demo",
        triggeredBy: "ops-demo"
      }
    });

    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json()).toMatchObject({
      status: "recorded"
    });

    const snapshotResponse = await app.inject({
      method: "GET",
      url: "/api/public-board/snapshots?campId=camp-demo"
    });

    expect(snapshotResponse.statusCode).toBe(200);
    expect(snapshotResponse.json().entries).toHaveLength(1);
    expect(snapshotResponse.json().entries[0].payload.entries[0]).toMatchObject({
      memberId: "user-alice"
    });
  });

  it("reports Feishu readiness details for credentials, bound chat, and Base tables", async () => {
    await app.close();
    app = await createApp({
      databaseUrl: ":memory:",
      feishuConfigOverride: {
        appId: "cli_test",
        appSecret: "secret_test",
        eventMode: "long_connection",
        botChatId: "chat-demo",
        botReceiveIdType: "chat_id",
        base: {
          enabled: true,
          appToken: "bitable_app_token",
          tables: {
            members: "tbl_members",
            rawEvents: "tbl_raw_events",
            scores: "tbl_scores",
            warnings: "tbl_warnings",
            snapshots: "tbl_snapshots"
          }
        }
      },
      wsRuntime: new NoopFeishuWsRuntime(),
      feishuApiClient: {
        validateCredentials: async () => ({ tenantKey: "tenant-demo" }),
        sendTextMessage: async () => ({ messageId: "om_bot_001" }),
        probeGroupMessageAccess: async () => ({ ok: true }),
        getMessageFile: async () => ({
          fileKey: "file-demo",
          fileName: "demo.pdf",
          fileExt: "pdf",
          mimeType: "application/pdf",
          bytes: Buffer.from("demo")
        }),
        createBaseRecord: async () => ({ recordId: "rec_001" }),
        searchBaseRecords: async () => [],
        updateBaseRecord: async () => ({ recordId: "rec_001" }),
        searchChats: async () => [],
        createChat: async () => ({ chatId: "chat-demo" }),
        createBaseApp: async () => ({ appToken: "bitable_app_token", defaultTableId: "tbl_default" }),
        renameBaseTable: async () => undefined,
        createBaseTable: async () => ({ tableId: "tbl_generated" })
      }
    });
    await app.ready();
    await app.inject({
      method: "POST",
      url: "/api/demo/seed",
      payload: {}
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/feishu/status"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      enabled: true,
      credentialsConfigured: true,
      credentialsValid: true,
      longConnectionEnabled: true,
      botConfigured: true,
      campBound: true,
      boundChatId: "chat-demo",
      baseEnabled: true,
      baseReady: true,
      groupMessageReadAccess: true
    });
    expect(response.json().baseTablesConfigured).toMatchObject({
      members: true,
      rawEvents: true,
      scores: true,
      warnings: true,
      snapshots: true
    });
    expect(response.json().lastInboundEventAt).toBeNull();
    expect(response.json().lastInboundReason).toBeNull();
    expect(response.json().groupMessageReadProbe).toMatchObject({
      ok: true
    });
  });

  it("surfaces document download failures in the Feishu status diagnostics", async () => {
    await app.close();
    app = await createApp({
      databaseUrl: ":memory:",
      wsRuntime: new NoopFeishuWsRuntime(),
      feishuConfigOverride: {
        ...disabledFeishuConfig,
        botChatId: "chat-demo",
        botReceiveIdType: "chat_id"
      },
      feishuApiClient: {
        validateCredentials: async () => ({ tenantKey: "tenant-demo" }),
        sendTextMessage: async () => ({ messageId: "om_bot_001" }),
        probeGroupMessageAccess: async () => ({ ok: true }),
        getMessageFile: async () => {
          throw new Error("Request failed with status code 400");
        },
        createBaseRecord: async () => ({ recordId: "rec_001" }),
        searchBaseRecords: async () => [],
        updateBaseRecord: async () => ({ recordId: "rec_001" }),
        searchChats: async () => [],
        createChat: async () => ({ chatId: "chat-demo" }),
        createBaseApp: async () => ({ appToken: "bitable_app_token", defaultTableId: "tbl_default" }),
        renameBaseTable: async () => undefined,
        createBaseTable: async () => ({ tableId: "tbl_generated" })
      }
    });
    await app.ready();
    await app.inject({
      method: "POST",
      url: "/api/demo/seed",
      payload: {}
    });

    await app.inject({
      method: "POST",
      url: "/api/feishu/events",
      payload: buildFileEvent("om_file_777", "user-alice", "1775210400000", "final report.pdf")
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/feishu/status"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      lastInboundReason: "pending_review_parse_failed",
      lastNormalizedMessage: {
        messageId: "om_file_777",
        documentParseStatus: "failed",
        documentTextLength: 0,
        documentParseReason: "Request failed with status code 400"
      }
    });
  });

  it("sends an announcement through the Feishu bot when a messenger is configured", async () => {
    const sent: Array<{ receiveId: string; receiveIdType: "chat_id" | "open_id" | "email" | "union_id"; text: string }> = [];

    await app.close();
    app = await createApp({
      databaseUrl: ":memory:",
      feishuConfigOverride: {
        ...disabledFeishuConfig,
        botChatId: "chat_test_group",
        botReceiveIdType: "chat_id"
      },
      wsRuntime: new NoopFeishuWsRuntime(),
      feishuMessenger: {
        async sendTextMessage(input) {
          sent.push(input);
          return { messageId: "om_bot_001" };
        }
      }
    });
    await app.ready();
    await app.inject({
      method: "POST",
      url: "/api/demo/seed",
      payload: {}
    });

    await app.inject({
      method: "POST",
      url: "/api/feishu/events",
      payload: buildEvent("om_401", "user-alice", "1775210400000", validHomeworkText)
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/announcements/run",
      payload: {
        type: "biweekly_ranking",
        campId: "camp-demo",
        triggeredBy: "ops-demo"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "sent"
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("Alice");
  });

  it("accepts a file submission without tags when the parsed document text is available", async () => {
    await app.close();
    app = await createApp({
      databaseUrl: ":memory:",
      wsRuntime: new NoopFeishuWsRuntime(),
      documentTextExtractor: {
        async extract() {
          return {
            text: "我是先写了提示词，再根据输出做了两轮迭代。最终我产出了一份结构化总结，也学会了怎么拆解问题。",
            status: "parsed"
          };
        }
      },
      feishuApiClient: {
        validateCredentials: async () => ({ tenantKey: "tenant-demo" }),
        sendTextMessage: async () => ({ messageId: "om_bot_001" }),
        createBaseRecord: async () => ({ recordId: "rec_001" }),
        searchBaseRecords: async () => [],
        updateBaseRecord: async () => ({ recordId: "rec_001" }),
        searchChats: async () => [],
        createChat: async () => ({ chatId: "chat-demo" }),
        createBaseApp: async () => ({ appToken: "bitable_app_token", defaultTableId: "tbl_default" }),
        renameBaseTable: async () => undefined,
        createBaseTable: async () => ({ tableId: "tbl_generated" }),
        getMessageFile: async () => ({
          fileKey: "file_om_file_501",
          fileName: "final report.pdf",
          fileExt: "pdf",
          mimeType: "application/pdf",
          bytes: Buffer.from("fake-pdf")
        })
      }
    });
    await app.ready();
    await app.inject({
      method: "POST",
      url: "/api/demo/seed",
      payload: {}
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/feishu/events",
      payload: buildFileEvent("om_file_501", "user-alice", "1775210400000", "final report.pdf")
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: true,
      sessionId: "session-01",
      finalStatus: "valid"
    });

    const submissions = await app.inject({
      method: "GET",
      url: "/api/operator/submissions?campId=camp-demo"
    });

    expect(submissions.json().entries).toHaveLength(1);
    expect(submissions.json().entries[0]).toMatchObject({
      candidateId: "session-01:user-alice",
      finalStatus: "valid"
    });
  });
});
