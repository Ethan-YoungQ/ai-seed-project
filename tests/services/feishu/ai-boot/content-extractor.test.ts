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

  it("trims common trailing punctuation from extracted URLs", async () => {
    const evidence = await extractEvidence(makeMsg({
      rawText: "参考 https://example.com/a).",
      cleanedText: "参考 https://example.com/a).",
    }));

    expect(evidence.urls).toEqual(["https://example.com/a"]);
  });

  it("preserves balanced parentheses that are part of the URL", async () => {
    const evidence = await extractEvidence(makeMsg({
      rawText: "参考 https://example.com/a_(b)",
      cleanedText: "参考 https://example.com/a_(b)",
    }));

    expect(evidence.urls).toEqual(["https://example.com/a_(b)"]);
  });

  it("trims wrapping ASCII parentheses outside the URL", async () => {
    const evidence = await extractEvidence(makeMsg({
      rawText: "参考 (https://example.com/a)",
      cleanedText: "参考 (https://example.com/a)",
    }));

    expect(evidence.urls).toEqual(["https://example.com/a"]);
  });

  it("trims wrapping full-width parentheses outside the URL", async () => {
    const evidence = await extractEvidence(makeMsg({
      rawText: "参考 （https://例子.cn/路径）",
      cleanedText: "参考 （https://例子.cn/路径）",
    }));

    expect(evidence.urls).toEqual(["https://例子.cn/路径"]);
  });

  it("trims Chinese punctuation after URLs", async () => {
    const evidence = await extractEvidence(makeMsg({
      rawText: "一 https://example.com/a。二 https://example.com/b！三 https://example.com/c？四 https://example.com/d；五 https://example.com/e、六 https://example.com/f，",
      cleanedText: "一 https://example.com/a。二 https://example.com/b！三 https://example.com/c？四 https://example.com/d；五 https://example.com/e、六 https://example.com/f，",
    }));

    expect(evidence.urls).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
      "https://example.com/d",
      "https://example.com/e",
      "https://example.com/f",
    ]);
  });

  it("keeps unique URLs in first-seen order after punctuation trimming", async () => {
    const evidence = await extractEvidence(makeMsg({
      rawText: "先看 https://example.com/b，再看 https://example.com/a).，再看 https://example.com/b.",
      cleanedText: "先看 https://example.com/b，再看 https://example.com/a).，再看 https://example.com/b.",
    }));

    expect(evidence.urls).toEqual(["https://example.com/b", "https://example.com/a"]);
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

  it("records available file metadata for non-file attachments", async () => {
    const evidence = await extractEvidence(makeMsg({
      messageType: "media",
      rawText: "视频 evidence",
      fileKey: "media-key-1",
      fileName: "demo.mp4",
      fileExt: "mp4",
    }));

    expect(evidence.attachments).toEqual([{
      type: "media",
      fileKey: "media-key-1",
      fileName: "demo.mp4",
      fileExt: "mp4",
    }]);
  });

  it("returns not_applicable extraction status for non-file text", async () => {
    const evidence = await extractEvidence(makeMsg({
      messageType: "text",
      rawText: "普通文本",
      cleanedText: "普通文本",
    }));

    expect(evidence.documentText).toBe("");
    expect(evidence.extractionStatus).toBe("not_applicable");
    expect(evidence.extractionReason).toBe("non_file_message");
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

  it("returns failed evidence when a supported file has no Feishu client", async () => {
    const evidence = await extractEvidence(makeMsg({
      messageType: "file",
      fileKey: "file-key-missing-client",
      fileName: "作业.pdf",
      fileExt: "pdf",
      documentParseStatus: "pending",
    }));

    expect(evidence.documentText).toBe("");
    expect(evidence.extractionStatus).toBe("failed");
    expect(evidence.extractionReason).toBe("missing_feishu_client");
  });

  it("returns unsupported evidence for unsupported file extensions", async () => {
    const evidence = await extractEvidence(makeMsg({
      messageType: "file",
      fileKey: "file-key-unsupported",
      fileName: "archive.zip",
      fileExt: "zip",
      documentParseStatus: "unsupported",
    }));

    expect(evidence.documentText).toBe("");
    expect(evidence.extractionStatus).toBe("unsupported");
    expect(evidence.extractionReason).toBe("unsupported_file_ext:zip");
  });

  it("returns failed evidence when a file message is missing fileKey", async () => {
    const evidence = await extractEvidence(makeMsg({
      messageType: "file",
      fileName: "作业.pdf",
      fileExt: "pdf",
      documentParseStatus: "pending",
    }));

    expect(evidence.documentText).toBe("");
    expect(evidence.extractionStatus).toBe("failed");
    expect(evidence.extractionReason).toBe("missing_file_key");
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

  it("keeps the same hash for the same attachment metadata in different order", async () => {
    const first = await extractEvidence(makeMsg({
      messageType: "post",
      rawText: "同一段文字",
      cleanedText: "同一段文字",
      attachmentTypes: ["media", "image"],
      fileKey: "shared-file-key",
      fileName: "evidence.bin",
      fileExt: "bin",
    }));
    const reordered = await extractEvidence(makeMsg({
      messageType: "post",
      rawText: "同一段文字",
      cleanedText: "同一段文字",
      attachmentTypes: ["image", "media"],
      fileKey: "shared-file-key",
      fileName: "evidence.bin",
      fileExt: "bin",
    }));

    expect(first.attachments.map((attachment) => attachment.type)).toEqual(["media", "image"]);
    expect(reordered.attachments.map((attachment) => attachment.type)).toEqual(["image", "media"]);
    expect(first.contentHash).toBe(reordered.contentHash);
  });

  it("keeps the same hash for the same document text", async () => {
    const first = await extractEvidence(makeMsg({
      messageType: "file",
      fileKey: "file-key-doc",
      fileName: "作业.pdf",
      fileExt: "pdf",
      documentText: "同一份文件内容",
      documentParseStatus: "parsed",
    }));
    const same = await extractEvidence(makeMsg({
      messageType: "file",
      fileKey: "file-key-doc",
      fileName: "作业.pdf",
      fileExt: "pdf",
      documentText: "同一份文件内容",
      documentParseStatus: "parsed",
    }));

    expect(first.contentHash).toBe(same.contentHash);
  });

  it("changes the hash when document text changes", async () => {
    const first = await extractEvidence(makeMsg({
      messageType: "file",
      fileKey: "file-key-doc",
      fileName: "作业.pdf",
      fileExt: "pdf",
      documentText: "第一版文件内容",
      documentParseStatus: "parsed",
    }));
    const differentDocumentText = await extractEvidence(makeMsg({
      messageType: "file",
      fileKey: "file-key-doc",
      fileName: "作业.pdf",
      fileExt: "pdf",
      documentText: "第二版文件内容",
      documentParseStatus: "parsed",
    }));

    expect(first.contentHash).not.toBe(differentDocumentText.contentHash);
  });
});
