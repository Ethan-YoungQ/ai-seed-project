import { describe, expect, it, vi } from "vitest";

import type { MemberProfile, RawMessageEvent, ScoringResult, WarningRecord } from "../../src/domain/types";
import { FeishuBaseSyncService } from "../../src/services/feishu/base-sync";

describe("FeishuBaseSyncService", () => {
  it("writes configured records to Base without changing the fact-source flow", async () => {
    const createRecord = vi.fn(async () => ({ recordId: "rec_001" }));
    const searchRecords = vi.fn(async () => []);
    const updateRecord = vi.fn(async () => ({ recordId: "rec_001" }));
    const service = new FeishuBaseSyncService(
      {
        enabled: true,
        appToken: "bitable_app_token",
        tables: {
          members: "tbl_members",
          rawEvents: "tbl_raw_events",
          scores: "tbl_scores",
          warnings: "tbl_warnings",
          snapshots: "tbl_snapshots"
        }
      },
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
        createBaseRecord: createRecord,
        searchBaseRecords: searchRecords,
        updateBaseRecord: updateRecord,
        searchChats: vi.fn(async () => []),
        createChat: vi.fn(async () => ({ chatId: "chat-demo" })),
        createBaseApp: vi.fn(async () => ({ appToken: "bitable_app_token", defaultTableId: "tbl_default" })),
        renameBaseTable: vi.fn(async () => undefined),
        createBaseTable: vi.fn(async () => ({ tableId: "tbl_generated" }))
      }
    );

    const member: MemberProfile = {
      id: "user-alice",
      campId: "camp-demo",
      name: "Alice",
      department: "HBU",
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: false,
      status: "active"
    };

    const event: RawMessageEvent = {
      id: "user-alice:om_001",
      chatId: "chat-demo",
      memberId: "user-alice",
      sessionId: "session-01",
      messageId: "om_001",
      eventTime: "2026-04-03T00:00:00.000Z",
      rawText: "#HW01 #\u4f5c\u4e1a\u63d0\u4ea4",
      parsedTags: ["#HW01", "#\u4f5c\u4e1a\u63d0\u4ea4"],
      attachmentCount: 1,
      attachmentTypes: ["image"],
      eventUrl: "feishu://message/om_001"
    };

    const score: ScoringResult = {
      memberId: "user-alice",
      sessionId: "session-01",
      candidateId: "session-01:user-alice",
      baseScore: 5,
      processScore: 3,
      qualityScore: 2,
      communityBonus: 0,
      totalScore: 10,
      finalStatus: "valid",
      scoreReason: "evidence + process + result",
      llmReason: "fallback"
    };

    const warning: WarningRecord = {
      id: "warning:user-alice:session-01",
      campId: "camp-demo",
      memberId: "user-alice",
      sessionId: "session-01",
      violationType: "invalid_submission",
      level: "reminder",
      createdAt: "2026-04-03T00:00:00.000Z",
      resolvedFlag: false,
      note: "invalid_submission_count=1"
    };

    await service.syncMember(member);
    await service.syncRawEvent({
      campId: "camp-demo",
      parseStatus: "parsed",
      ...event
    });
    await service.syncScore({
      campId: "camp-demo",
      member,
      score
    });
    await service.syncWarning(warning);

    expect(searchRecords).toHaveBeenCalledTimes(4);
    expect(createRecord).toHaveBeenCalledTimes(4);
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("updates existing Base records instead of creating duplicates when the business key already exists", async () => {
    const createRecord = vi.fn(async () => ({ recordId: "rec_001" }));
    const searchRecords = vi.fn(async () => [{ recordId: "rec_existing" }]);
    const updateRecord = vi.fn(async () => ({ recordId: "rec_existing" }));
    const service = new FeishuBaseSyncService(
      {
        enabled: true,
        appToken: "bitable_app_token",
        tables: {
          members: "tbl_members",
          rawEvents: "tbl_raw_events",
          scores: "tbl_scores",
          warnings: "tbl_warnings",
          snapshots: "tbl_snapshots"
        }
      },
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
        createBaseRecord: createRecord,
        searchBaseRecords: searchRecords,
        updateBaseRecord: updateRecord,
        searchChats: vi.fn(async () => []),
        createChat: vi.fn(async () => ({ chatId: "chat-demo" })),
        createBaseApp: vi.fn(async () => ({ appToken: "bitable_app_token", defaultTableId: "tbl_default" })),
        renameBaseTable: vi.fn(async () => undefined),
        createBaseTable: vi.fn(async () => ({ tableId: "tbl_generated" }))
      }
    );

    const member: MemberProfile = {
      id: "user-alice",
      campId: "camp-demo",
      name: "Alice",
      department: "HBU",
      roleType: "student",
      isParticipant: true,
      isExcludedFromBoard: false,
      status: "active"
    };

    const score: ScoringResult = {
      memberId: "user-alice",
      sessionId: "session-01",
      candidateId: "session-01:user-alice",
      baseScore: 5,
      processScore: 3,
      qualityScore: 2,
      communityBonus: 0,
      totalScore: 10,
      finalStatus: "valid",
      scoreReason: "evidence + process + result",
      llmReason: "fallback"
    };

    await service.syncMember(member);
    await service.syncScore({
      campId: "camp-demo",
      member,
      score
    });

    expect(createRecord).not.toHaveBeenCalled();
    expect(updateRecord).toHaveBeenCalledTimes(2);
    expect(searchRecords).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tableId: "tbl_members",
        fieldName: "member_id",
        fieldValue: "user-alice"
      })
    );
    expect(searchRecords).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tableId: "tbl_scores",
        fieldName: "candidate_id",
        fieldValue: "session-01:user-alice"
      })
    );
  });
});
