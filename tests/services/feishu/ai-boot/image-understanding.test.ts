import { describe, expect, it, vi } from "vitest";

import type { AiBootImageUnderstandingRecord } from "../../../../src/domain/v3/ai-boot-types";
import {
  createAiBootImageUnderstandingService,
  hasImageEvidence,
  type AiBootImageUnderstandingRepo,
} from "../../../../src/services/feishu/ai-boot/image-understanding";
import type { EvidenceBundle } from "../../../../src/services/feishu/ai-boot/content-extractor";
import type { NormalizedFeishuMessage } from "../../../../src/services/feishu/normalize-message";
import type { AiBootLlmClient } from "../../../../src/services/feishu/ai-boot/llm-decision-engine";

function imageMessage(overrides: Partial<NormalizedFeishuMessage> = {}): NormalizedFeishuMessage {
  return {
    messageId: "om-image-1",
    memberId: "ou-student",
    chatId: "chat-1",
    chatType: "group",
    senderType: "user",
    messageType: "image",
    eventTime: "2026-05-16T09:00:00.000Z",
    rawText: "",
    parsedTags: [],
    attachmentCount: 1,
    attachmentTypes: ["image"],
    fileKey: "img-key-1",
    documentText: "",
    documentParseStatus: "not_applicable",
    eventUrl: "feishu://message/om-image-1",
    mentionedBotIds: [],
    cleanedText: "",
    ...overrides,
  };
}

function imageEvidence(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    sanitizedText: "",
    urls: [],
    attachments: [{ type: "image", fileKey: "img-key-1" }],
    documentText: "",
    extractionStatus: "not_applicable",
    extractionReason: "non_file_message",
    contentHash: "hash-image-1",
    ...overrides,
  };
}

function understanding(
  overrides: Partial<AiBootImageUnderstandingRecord> = {},
): AiBootImageUnderstandingRecord {
  return {
    fileKey: "img-key-1",
    messageId: "om-image-1",
    contentHash: "hash-image-1",
    modelName: "vision-model",
    caption: "截图展示了一个 AI 生成的客户拜访复盘表。",
    scoreHint: "可按 ai_artifact 审核，证据是图片中的表格产物。",
    latencyMs: 42,
    status: "succeeded",
    errorReason: "",
    createdAt: "2026-05-16T09:00:00.000Z",
    updatedAt: "2026-05-16T09:00:00.000Z",
    ...overrides,
  };
}

function repoWith(
  rows: AiBootImageUnderstandingRecord[] = [],
): AiBootImageUnderstandingRepo & { rows: AiBootImageUnderstandingRecord[] } {
  return {
    rows,
    findAiBootImageUnderstandingByContentHash: vi.fn((contentHash: string) =>
      rows.find((row) => row.contentHash === contentHash) ?? null,
    ),
    upsertAiBootImageUnderstanding: vi.fn((record: AiBootImageUnderstandingRecord) => {
      const index = rows.findIndex((row) => row.contentHash === record.contentHash);
      if (index >= 0) {
        rows[index] = record;
      } else {
        rows.push(record);
      }
    }),
  };
}

function llmClient(response: Record<string, unknown>): AiBootLlmClient {
  return {
    provider: "test-provider",
    model: "text-model",
    visionModel: "vision-model",
    chat: vi.fn().mockResolvedValue(JSON.stringify(response)),
  };
}

describe("createAiBootImageUnderstandingService", () => {
  it("treats image files uploaded as Feishu file messages as image evidence", () => {
    expect(hasImageEvidence(imageEvidence({
      attachments: [{
        type: "file",
        fileKey: "file-png-1",
        fileName: "Gemini海报.png",
        fileExt: "png",
      }],
    }))).toBe(true);
  });

  it("returns a succeeded cached understanding without downloading the Feishu image", async () => {
    const repo = repoWith([understanding()]);
    const feishuClient = {
      getMessageFile: vi.fn(),
    };
    const service = createAiBootImageUnderstandingService({
      repo,
      feishuClient,
      llmClient: llmClient({ caption: "unused", scoreHint: "unused" }),
      now: () => "2026-05-16T09:00:00.000Z",
    });

    const result = await service.understandImage({
      message: imageMessage(),
      evidence: imageEvidence(),
    });

    expect(result).toMatchObject({
      status: "succeeded",
      caption: "截图展示了一个 AI 生成的客户拜访复盘表。",
    });
    expect(feishuClient.getMessageFile).not.toHaveBeenCalled();
    expect(repo.upsertAiBootImageUnderstanding).not.toHaveBeenCalled();
  });

  it("downloads the image on a cache miss, asks the vision model, and stores the caption", async () => {
    const repo = repoWith();
    const feishuClient = {
      getMessageFile: vi.fn().mockResolvedValue({
        fileKey: "img-key-1",
        mimeType: "image/png",
        bytes: Buffer.from("fake-image"),
      }),
    };
    const client = llmClient({
      caption: "图片中是 AI 生成的客户拜访复盘表，包含三条行动建议。",
      scoreHint: "可作为 ai_artifact 进入评分。",
    });
    const service = createAiBootImageUnderstandingService({
      repo,
      feishuClient,
      llmClient: client,
      now: () => "2026-05-16T09:00:00.000Z",
    });

    const result = await service.understandImage({
      message: imageMessage(),
      evidence: imageEvidence(),
    });

    expect(feishuClient.getMessageFile).toHaveBeenCalledWith({
      messageId: "om-image-1",
      fileKey: "img-key-1",
      resourceType: "image",
    });
    expect(client.chat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: [
            expect.objectContaining({ type: "text" }),
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,ZmFrZS1pbWFnZQ==" },
            },
          ],
        }),
      ]),
      expect.objectContaining({ timeoutMs: 70000 }),
    );
    expect(result).toMatchObject({
      contentHash: "hash-image-1",
      status: "succeeded",
      caption: "图片中是 AI 生成的客户拜访复盘表，包含三条行动建议。",
      scoreHint: "可作为 ai_artifact 进入评分。",
    });
    expect(repo.rows.at(-1)).toMatchObject(result);
  });

  it("downloads image-like file attachments with Feishu file resource type", async () => {
    const repo = repoWith();
    const feishuClient = {
      getMessageFile: vi.fn().mockResolvedValue({
        fileKey: "file-png-1",
        mimeType: "image/png",
        bytes: Buffer.from("fake-image"),
      }),
    };
    const client = llmClient({
      caption: "图片中是一张 AI 生成海报。",
      scoreHint: "可作为 ai_artifact 进入评分。",
    });
    const service = createAiBootImageUnderstandingService({
      repo,
      feishuClient,
      llmClient: client,
      now: () => "2026-05-16T09:00:00.000Z",
    });

    const result = await service.understandImage({
      message: imageMessage({
        messageType: "file",
        attachmentTypes: ["file"],
        fileKey: "file-png-1",
        fileName: "Gemini海报.png",
        fileExt: "png",
      }),
      evidence: imageEvidence({
        attachments: [{
          type: "file",
          fileKey: "file-png-1",
          fileName: "Gemini海报.png",
          fileExt: "png",
        }],
      }),
    });

    expect(feishuClient.getMessageFile).toHaveBeenCalledWith({
      messageId: "om-image-1",
      fileKey: "file-png-1",
      resourceType: "file",
    });
    expect(result).toMatchObject({
      status: "succeeded",
      caption: "图片中是一张 AI 生成海报。",
    });
  });
});
