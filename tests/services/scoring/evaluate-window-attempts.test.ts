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
});
