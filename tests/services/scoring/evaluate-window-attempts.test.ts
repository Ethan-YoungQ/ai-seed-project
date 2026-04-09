import { afterEach, describe, expect, it } from "vitest";

import { demoMembers } from "../../../src/config/defaults";
import { SqliteRepository } from "../../../src/storage/sqlite-repository";
import { evaluateMessageWindow } from "../../../src/services/scoring/evaluate-window";
import type { NormalizedFeishuMessage } from "../../../src/services/feishu/normalize-message";

const lowerValidDocumentText =
  "\u6211\u662f\u5148\u5199\u4e86 prompt\uff0c\u6700\u7ec8\u6211\u4ea7\u51fa\u4e86\u4e00\u4efd\u603b\u7ed3\u3002";

const higherValidDocumentText =
  "\u6211\u662f\u5148\u5199 prompt\uff0c\u518d\u505a\u4e24\u8f6e\u8fed\u4ee3\u3002\u6700\u7ec8\u6211\u5b66\u4f1a\u4e86\u62c6\u89e3\u95ee\u9898\uff0c\u4e5f\u4ea7\u51fa\u4e86\u4e00\u9875\u7ed3\u6784\u5316\u603b\u7ed3\u3002";

function buildFileMessage(
  messageId: string,
  eventTime: string,
  documentText: string
): NormalizedFeishuMessage {
  return {
    messageId,
    memberId: "user-alice",
    chatId: "chat-demo",
    chatType: "group",
    senderType: "user",
    messageType: "file",
    eventTime,
    rawText: "",
    parsedTags: [],
    attachmentCount: 1,
    attachmentTypes: ["file"],
    fileKey: `file_${messageId}`,
    fileName: `${messageId}.pdf`,
    fileExt: "pdf",
    mimeType: "application/pdf",
    documentText,
    documentParseStatus: "parsed",
    eventUrl: `feishu://message/${messageId}`
  };
}

function buildTextMessage(messageId: string, eventTime: string, rawText: string): NormalizedFeishuMessage {
  return {
    messageId,
    memberId: "user-alice",
    chatId: "chat-demo",
    chatType: "group",
    senderType: "user",
    messageType: "text",
    eventTime,
    rawText,
    parsedTags: ["#HW01", "#\u4f5c\u4e1a\u63d0\u4ea4"],
    attachmentCount: 0,
    attachmentTypes: [],
    documentText: "",
    documentParseStatus: "not_applicable",
    eventUrl: `feishu://message/${messageId}`
  };
}

describe("evaluateMessageWindow document attempts", () => {
  let repository: SqliteRepository | undefined;

  afterEach(() => {
    repository?.close();
    repository = undefined;
  });

  it("keeps one operator submission per document upload but only counts the best valid score on the board", async () => {
    repository = new SqliteRepository(":memory:");
    repository.seedDemo();
    const member = demoMembers.find((entry) => entry.id === "user-alice");

    if (!member) {
      throw new Error("Demo member user-alice is missing.");
    }

    await evaluateMessageWindow(
      repository,
      member,
      buildFileMessage(
        "om_file_101",
        "2026-04-10T08:00:00.000Z",
        lowerValidDocumentText
      )
    );

    await evaluateMessageWindow(
      repository,
      member,
      buildFileMessage(
        "om_file_102",
        "2026-04-11T08:00:00.000Z",
        higherValidDocumentText
      )
    );

    const submissions = repository.listOperatorSubmissions("camp-demo");
    expect(submissions).toHaveLength(2);
    expect(submissions.map((entry) => entry.candidateId)).toEqual([
      "session-01:user-alice:om_file_102",
      "session-01:user-alice:om_file_101"
    ]);

    const board = repository.getPublicBoard("camp-demo");
    expect(board.entries).toHaveLength(1);
    expect(board.entries[0]).toMatchObject({
      memberId: "user-alice",
      totalScore: 10
    });

    const sessionResult = repository.getSessionResult("camp-demo", "user-alice", "session-01");
    expect(sessionResult).toMatchObject({
      chosenAttemptId: "session-01:user-alice:om_file_102",
      finalStatus: "valid",
      totalScore: 10,
      latestSubmittedAt: "2026-04-11T08:00:00.000Z"
    });
  });

  it("keeps the latest non-valid attempt when no valid attempt exists", async () => {
    repository = new SqliteRepository(":memory:");
    repository.seedDemo();
    const member = demoMembers.find((entry) => entry.id === "user-alice");

    if (!member) {
      throw new Error("Demo member user-alice is missing.");
    }

    await evaluateMessageWindow(
      repository,
      member,
      buildFileMessage("om_file_201", "2026-04-10T08:00:00.000Z", "只有材料，没有过程。")
    );

    await evaluateMessageWindow(
      repository,
      member,
      buildFileMessage("om_file_202", "2026-04-11T08:00:00.000Z", "只有材料，没有结果。")
    );

    const sessionResult = repository.getSessionResult("camp-demo", "user-alice", "session-01");
    expect(sessionResult).toMatchObject({
      chosenAttemptId: "session-01:user-alice:om_file_202",
      finalStatus: "invalid",
      totalScore: 0,
      latestSubmittedAt: "2026-04-11T08:00:00.000Z"
    });
  });

  it("keeps pending review when a later text follow-up is merged into a parse-failed attempt", async () => {
    repository = new SqliteRepository(":memory:");
    repository.seedDemo();
    const member = demoMembers.find((entry) => entry.id === "user-alice");

    if (!member) {
      throw new Error("Demo member user-alice is missing.");
    }

    await evaluateMessageWindow(
      repository,
      member,
      buildFileMessage("om_file_401", "2026-04-10T08:00:00.000Z", "只有材料，没有过程。")
    );

    await evaluateMessageWindow(
      repository,
      member,
      buildFileMessage("om_file_402", "2026-04-11T08:00:00.000Z", "只有材料，没有结果。")
    );

    await evaluateMessageWindow(
      repository,
      member,
      {
        ...buildFileMessage("om_file_403", "2026-04-12T08:00:00.000Z", lowerValidDocumentText),
        documentParseStatus: "failed",
        documentParseReason: "parse failed"
      }
    );

    await evaluateMessageWindow(
      repository,
      member,
      buildTextMessage(
        "om_text_403_followup",
        "2026-04-12T08:05:00.000Z",
        "\u8fd9\u662f\u6211\u7684\u8fc7\u7a0b\u8bf4\u660e\uff0c\u6700\u7ec8\u7ed3\u679c\u662f\u5df2\u7ecf\u63d0\u4ea4\u6210\u529f\u3002"
      )
    );

    const sessionResult = repository.getSessionResult("camp-demo", "user-alice", "session-01");
    expect(sessionResult).toMatchObject({
      chosenAttemptId: "session-01:user-alice:om_file_403",
      finalStatus: "pending_review",
      totalScore: 0,
      latestSubmittedAt: "2026-04-12T08:05:00.000Z"
    });

    expect(repository.getAttempt("session-01:user-alice:om_file_403")).toMatchObject({
      combinedText: expect.stringContaining("\u8fd9\u662f\u6211\u7684\u8fc7\u7a0b\u8bf4\u660e"),
      latestEventTime: "2026-04-12T08:05:00.000Z"
    });

    expect(repository.getScore("session-01:user-alice:om_file_403")).toMatchObject({
      finalStatus: "pending_review",
      llmReason: "\u6587\u6863\u89e3\u6790\u5931\u8d25\uff0c\u5df2\u8f6c\u5165\u4eba\u5de5\u590d\u6838"
    });
  });

  it("chooses the latest valid attempt when valid attempts have the same score", async () => {
    repository = new SqliteRepository(":memory:");
    repository.seedDemo();
    const member = demoMembers.find((entry) => entry.id === "user-alice");

    if (!member) {
      throw new Error("Demo member user-alice is missing.");
    }

    await evaluateMessageWindow(
      repository,
      member,
      buildFileMessage(
        "om_file_301",
        "2026-04-10T08:00:00.000Z",
        lowerValidDocumentText
      )
    );

    await evaluateMessageWindow(
      repository,
      member,
      buildFileMessage(
        "om_file_302",
        "2026-04-11T08:00:00.000Z",
        lowerValidDocumentText
      )
    );

    const sessionResult = repository.getSessionResult("camp-demo", "user-alice", "session-01");
    expect(sessionResult).toMatchObject({
      chosenAttemptId: "session-01:user-alice:om_file_302",
      finalStatus: "valid",
      totalScore: 8,
      latestSubmittedAt: "2026-04-11T08:00:00.000Z"
    });
  });

  it("keeps a valid attempt valid when a later text follow-up arrives", async () => {
    repository = new SqliteRepository(":memory:");
    repository.seedDemo();
    const member = demoMembers.find((entry) => entry.id === "user-alice");

    if (!member) {
      throw new Error("Demo member user-alice is missing.");
    }

    await evaluateMessageWindow(
      repository,
      member,
      buildFileMessage("om_file_501", "2026-04-10T08:00:00.000Z", higherValidDocumentText)
    );

    await evaluateMessageWindow(
      repository,
      member,
      buildTextMessage(
        "om_text_501_followup",
        "2026-04-12T08:05:00.000Z",
        "\u8fd9\u662f\u6211\u8865\u5145\u7684\u8fc7\u7a0b\u8bf4\u660e\uff0c\u540e\u7eed\u8fd8\u4f1a\u5171\u4eab\u66f4\u591a\u8ba8\u8bba\u8fc7\u7a0b\u3002"
      )
    );

    const sessionResult = repository.getSessionResult("camp-demo", "user-alice", "session-01");
    expect(sessionResult).toMatchObject({
      chosenAttemptId: "session-01:user-alice:om_file_501",
      finalStatus: "valid",
      totalScore: 10,
      latestSubmittedAt: "2026-04-12T08:05:00.000Z"
    });

    expect(repository.getAttempt("session-01:user-alice:om_file_501")).toMatchObject({
      combinedText: expect.stringContaining("\u8fd9\u662f\u6211\u8865\u5145\u7684\u8fc7\u7a0b\u8bf4\u660e"),
      latestEventTime: "2026-04-12T08:05:00.000Z"
    });
  });
});
