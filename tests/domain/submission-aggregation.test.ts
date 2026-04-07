import { describe, expect, it } from "vitest";

import { aggregateSubmissionWindow } from "../../src/domain/submission-aggregation";
import type { MemberProfile, RawMessageEvent, SessionDefinition } from "../../src/domain/types";

describe("aggregateSubmissionWindow", () => {
  const member: MemberProfile = {
    id: "member-01",
    campId: "camp-01",
    name: "Alice",
    department: "HBU",
    roleType: "student",
    isParticipant: true,
    isExcludedFromBoard: false,
    status: "active"
  };

  const session: SessionDefinition = {
    id: "session-01",
    campId: "camp-01",
    title: "Kickoff",
    homeworkTag: "#HW01",
    courseDate: "2026-04-03T09:00:00.000Z",
    deadlineAt: "2026-04-17T08:59:59.000Z",
    windowStart: "2026-04-03T09:00:00.000Z",
    windowEnd: "2026-04-17T08:59:59.000Z",
    cycleType: "biweekly",
    active: true
  };

  it("returns no attempt for text/image only windows", () => {
    const events: RawMessageEvent[] = [
      {
        id: "evt-1",
        chatId: "chat-demo",
        memberId: "member-01",
        sessionId: "session-01",
        messageId: "om_1",
        eventTime: "2026-04-10T08:00:00.000Z",
        rawText: "#HW01 #\u4f5c\u4e1a\u63d0\u4ea4 \u6211\u662f\u5148\u7528\u63d0\u793a\u8bcd\u62c6\u89e3\u95ee\u9898\u3002",
        parsedTags: ["#HW01", "#\u4f5c\u4e1a\u63d0\u4ea4"],
        attachmentCount: 0,
        attachmentTypes: [],
        eventUrl: "https://example.com/1"
      },
      {
        id: "evt-2",
        chatId: "chat-demo",
        memberId: "member-01",
        sessionId: "session-01",
        messageId: "om_2",
        eventTime: "2026-04-10T08:05:00.000Z",
        rawText: "\u8fd9\u662f\u7ed3\u679c\u603b\u7ed3\uff0c\u6211\u5b66\u4f1a\u4e86\u600e\u4e48\u8fed\u4ee3\u63d0\u793a\u8bcd\u3002",
        parsedTags: ["#HW01"],
        attachmentCount: 1,
        attachmentTypes: ["image"],
        eventUrl: "https://example.com/2"
      }
    ];

    const attempts = aggregateSubmissionWindow({ member, session, events });

    expect(attempts).toHaveLength(0);
  });

  it("returns one attempt per document upload event", () => {
    const events: RawMessageEvent[] = [
      {
        id: "evt-doc-1",
        chatId: "chat-demo",
        memberId: "member-01",
        sessionId: "session-01",
        messageId: "om_file_1",
        messageType: "file",
        eventTime: "2026-04-10T08:00:00.000Z",
        rawText: "",
        parsedTags: [],
        attachmentCount: 1,
        attachmentTypes: ["file"],
        fileKey: "file_1",
        fileName: "homework-1.pdf",
        fileExt: "pdf",
        mimeType: "application/pdf",
        documentText: "绗竴娆℃彁浜?鎴戝厛鍐?prompt锛屽啀杩唬锛屾渶缁堝畬鎴愭€荤粨銆?",
        documentParseStatus: "parsed",
        eventUrl: "https://example.com/doc-1"
      },
      {
        id: "evt-doc-2",
        chatId: "chat-demo",
        memberId: "member-01",
        sessionId: "session-01",
        messageId: "om_file_2",
        messageType: "file",
        eventTime: "2026-04-11T08:00:00.000Z",
        rawText: "",
        parsedTags: [],
        attachmentCount: 1,
        attachmentTypes: ["file"],
        fileKey: "file_2",
        fileName: "homework-2.docx",
        fileExt: "docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        documentText: "绗簩娆℃彁浜?鎴戞洿鏂颁簡 prompt锛屾湁鏇寸粨鏋勫寲鐨勭粨鏋溿€?",
        documentParseStatus: "parsed",
        eventUrl: "https://example.com/doc-2"
      }
    ];

    const attempts = aggregateSubmissionWindow({ member, session, events });

    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      id: "session-01:member-01:om_file_1",
      messageId: "om_file_1",
      eventId: "evt-doc-1",
      fileKey: "file_1"
    });
    expect(attempts[1]).toMatchObject({
      id: "session-01:member-01:om_file_2",
      messageId: "om_file_2",
      eventId: "evt-doc-2",
      fileKey: "file_2"
    });
  });

  it("folds related text follow-ups into the nearest document attempt", () => {
    const events: RawMessageEvent[] = [
      {
        id: "evt-doc-1",
        chatId: "chat-demo",
        memberId: "member-01",
        sessionId: "session-01",
        messageId: "om_file_1",
        messageType: "file",
        eventTime: "2026-04-10T08:00:00.000Z",
        rawText: "#HW01 #\u4f5c\u4e1a\u63d0\u4ea4 \u6211\u5148\u4e0a\u4f20\u6587\u4ef6\u3002",
        parsedTags: ["#HW01", "#\u4f5c\u4e1a\u63d0\u4ea4"],
        attachmentCount: 1,
        attachmentTypes: ["file"],
        fileKey: "file_1",
        fileName: "homework-1.pdf",
        fileExt: "pdf",
        mimeType: "application/pdf",
        documentText: "\u63d0\u793a\u8bcd\u3001\u7ed3\u679c\u3001\u603b\u7ed3",
        documentParseStatus: "parsed",
        eventUrl: "https://example.com/doc-1"
      },
      {
        id: "evt-text-1",
        chatId: "chat-demo",
        memberId: "member-01",
        sessionId: "session-01",
        messageId: "om_text_1",
        messageType: "text",
        eventTime: "2026-04-10T08:05:00.000Z",
        rawText: "\u8fd9\u662f\u6211\u8865\u5145\u7684\u8fc7\u7a0b\u8bf4\u660e\uff0c\u6700\u7ec8\u7ed3\u679c\u662f\u901a\u8fc7\u7ed3\u6784\u5316\u603b\u7ed3\u51fa\u6765\u7684\u3002",
        parsedTags: ["#HW01"],
        attachmentCount: 0,
        attachmentTypes: [],
        eventUrl: "https://example.com/text-1"
      }
    ];

    const attempts = aggregateSubmissionWindow({ member, session, events });

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      id: "session-01:member-01:om_file_1",
      messageId: "om_file_1",
      latestEventTime: "2026-04-10T08:05:00.000Z"
    });
    expect(attempts[0].combinedText).toContain("\u6211\u5148\u4e0a\u4f20\u6587\u4ef6");
    expect(attempts[0].combinedText).toContain("\u8fd9\u662f\u6211\u8865\u5145\u7684\u8fc7\u7a0b\u8bf4\u660e");
    expect(attempts[0].eventIds).toEqual(["evt-doc-1", "evt-text-1"]);
  });
});
