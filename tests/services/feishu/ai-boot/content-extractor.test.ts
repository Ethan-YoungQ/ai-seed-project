import { describe, expect, it, vi } from "vitest";

import { extractEvidence } from "../../../../src/services/feishu/ai-boot/content-extractor";
import type { NormalizedFeishuMessage } from "../../../../src/services/feishu/normalize-message";

function makeMsg(overrides: Partial<NormalizedFeishuMessage>): NormalizedFeishuMessage {
  return {
    messageId: "m1",
    memberId: "u1",
    chatId: "c1",
    chatType: "group",
    senderType: "user",
    messageType: "text",
    eventTime: "2026-05-03T12:00:00.000Z",
    rawText: "",
    parsedTags: [],
    attachmentCount: 0,
    attachmentTypes: [],
    documentText: "",
    documentParseStatus: "not_applicable",
    eventUrl: "",
    mentionedBotIds: [],
    cleanedText: "",
    ...overrides,
  };
}

describe("extractEvidence", () => {
  it("strips bot and user mention tokens from text while preserving meaningful content", async () => {
    const evidence = await extractEvidence(makeMsg({
      rawText: '<at user_id="ou_bot">AI助教</at> @_user_1 请看 <at id="ou_123">张三</at> 的方案  https://example.com/a',
      cleanedText: '<at user_id="ou_bot">AI助教</at> @_user_1 请看 <at id="ou_123">张三</at> 的方案  https://example.com/a',
    }));

    expect(evidence.sanitizedText).toBe("请看 的方案 https://example.com/a");
    expect(evidence.urls).toEqual(["https://example.com/a"]);
    expect(evidence.extractionStatus).toBe("not_applicable");
  });

  it("records pure URL evidence without adding scoring or recommendation classification fields", async () => {
    const evidence = await extractEvidence(makeMsg({
      rawText: "https://example.com/resource",
      cleanedText: "https://example.com/resource",
    }));

    expect(evidence.sanitizedText).toBe("https://example.com/resource");
    expect(evidence.urls).toEqual(["https://example.com/resource"]);
    expect(evidence).not.toHaveProperty("category");
    expect(evidence).not.toHaveProperty("resourceRecommendation");
    expect(evidence).not.toHaveProperty("score");
  });

  it("records image file key, message type, and raw text context", async () => {
    const evidence = await extractEvidence(makeMsg({
      messageType: "image",
      rawText: "这是截图证据",
      cleanedText: "",
      fileKey: "img-key-1",
    }));

    expect(evidence.sanitizedText).toBe("这是截图证据");
    expect(evidence.attachments).toEqual([{ type: "image", fileKey: "img-key-1" }]);
    expect(evidence.extractionStatus).toBe("not_applicable");
  });

  it("uses existing parsed PDF or DOCX text without downloading the file again", async () => {
    const feishuClient = {
      getMessageFile: vi.fn(),
    };
    const documentExtractor = {
      extract: vi.fn(),
    };

    const evidence = await extractEvidence(makeMsg({
      messageType: "file",
      fileKey: "file-key-1",
      fileName: "作业.pdf",
      fileExt: "pdf",
      documentText: "文件里已经解析出的证据文本",
      documentParseStatus: "parsed",
    }), {
      feishuClient,
      documentExtractor,
    });

    expect(evidence.attachments).toEqual([{
      type: "file",
      fileKey: "file-key-1",
      fileName: "作业.pdf",
      fileExt: "pdf",
    }]);
    expect(evidence.documentText).toBe("文件里已经解析出的证据文本");
    expect(evidence.extractionStatus).toBe("parsed");
    expect(evidence.extractionReason).toBe("existing_document_text");
    expect(feishuClient.getMessageFile).not.toHaveBeenCalled();
    expect(documentExtractor.extract).not.toHaveBeenCalled();
  });

  it("downloads and extracts supported PDF or DOCX files when parsed text is not already present", async () => {
    const feishuClient = {
      getMessageFile: vi.fn().mockResolvedValue({
        bytes: Buffer.from("fake pdf"),
        fileName: "作业.pdf",
        fileExt: "pdf",
        mimeType: "application/pdf",
      }),
    };
    const documentExtractor = {
      extract: vi.fn().mockResolvedValue({
        status: "parsed",
        text: "下载后解析出的证据文本",
        reason: "ok",
      }),
    };

    const evidence = await extractEvidence(makeMsg({
      messageId: "m-file",
      messageType: "file",
      fileKey: "file-key-2",
      fileName: "作业.pdf",
      fileExt: "pdf",
      mimeType: "application/pdf",
      documentParseStatus: "pending",
    }), {
      feishuClient,
      documentExtractor,
    });

    expect(feishuClient.getMessageFile).toHaveBeenCalledWith({
      messageId: "m-file",
      fileKey: "file-key-2",
      fileName: "作业.pdf",
    });
    expect(documentExtractor.extract).toHaveBeenCalledWith({
      bytes: Buffer.from("fake pdf"),
      fileExt: "pdf",
      fileName: "作业.pdf",
      mimeType: "application/pdf",
    });
    expect(evidence.documentText).toBe("下载后解析出的证据文本");
    expect(evidence.extractionStatus).toBe("parsed");
    expect(evidence.extractionReason).toBe("ok");
  });

  it("returns failed evidence with a reason when extraction throws", async () => {
    const evidence = await extractEvidence(makeMsg({
      messageId: "m-file",
      messageType: "file",
      fileKey: "file-key-3",
      fileName: "作业.docx",
      fileExt: "docx",
      documentParseStatus: "pending",
    }), {
      feishuClient: {
        getMessageFile: vi.fn().mockRejectedValue(new Error("download unavailable")),
      },
      documentExtractor: {
        extract: vi.fn(),
      },
    });

    expect(evidence.documentText).toBe("");
    expect(evidence.extractionStatus).toBe("failed");
    expect(evidence.extractionReason).toBe("download unavailable");
  });

  it("changes content hash when sanitized text or attachment key changes", async () => {
    const first = await extractEvidence(makeMsg({
      rawText: "同一段文字",
      cleanedText: "同一段文字",
      messageType: "image",
      fileKey: "img-1",
    }));
    const same = await extractEvidence(makeMsg({
      rawText: "同一段文字",
      cleanedText: "同一段文字",
      messageType: "image",
      fileKey: "img-1",
    }));
    const differentText = await extractEvidence(makeMsg({
      rawText: "另一段文字",
      cleanedText: "另一段文字",
      messageType: "image",
      fileKey: "img-1",
    }));
    const differentAttachment = await extractEvidence(makeMsg({
      rawText: "同一段文字",
      cleanedText: "同一段文字",
      messageType: "image",
      fileKey: "img-2",
    }));

    expect(first.contentHash).toBe(same.contentHash);
    expect(first.contentHash).not.toBe(differentText.contentHash);
    expect(first.contentHash).not.toBe(differentAttachment.contentHash);
  });
});
