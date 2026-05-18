import type { AiBootImageUnderstandingRecord } from "../../../domain/v3/ai-boot-types.js";
import type { NormalizedFeishuMessage } from "../normalize-message.js";
import type { EvidenceBundle } from "./content-extractor.js";
import type { AiBootLlmClient } from "./llm-decision-engine.js";

export const AI_BOOT_IMAGE_UNDERSTANDING_PROMPT_VERSION = "2026-05-17-v1";

export interface AiBootImageUnderstandingRepo {
  findAiBootImageUnderstandingByContentHash(contentHash: string): AiBootImageUnderstandingRecord | null;
  upsertAiBootImageUnderstanding(input: AiBootImageUnderstandingRecord): void;
}

interface FeishuImageFileClient {
  getMessageFile(input: {
    messageId: string;
    fileKey: string;
    resourceType: "image" | "file";
  }): Promise<{
    fileKey?: string;
    mimeType?: string;
    bytes: Buffer;
  }>;
}

export interface AiBootImageUnderstandingService {
  getCachedUnderstanding(evidence: EvidenceBundle): AiBootImageUnderstandingRecord | null;
  enqueueUnderstanding(input: {
    message: NormalizedFeishuMessage;
    evidence: EvidenceBundle;
  }): void;
  understandImage(input: {
    message: NormalizedFeishuMessage;
    evidence: EvidenceBundle;
  }): Promise<AiBootImageUnderstandingRecord>;
}

export function createAiBootImageUnderstandingService(deps: {
  repo: AiBootImageUnderstandingRepo;
  feishuClient: FeishuImageFileClient;
  llmClient?: AiBootLlmClient;
  now: () => string;
  onError?: (error: unknown) => void;
}): AiBootImageUnderstandingService {
  const activeJobs = new Map<string, Promise<AiBootImageUnderstandingRecord>>();

  function getCachedUnderstanding(evidence: EvidenceBundle): AiBootImageUnderstandingRecord | null {
    const cached = deps.repo.findAiBootImageUnderstandingByContentHash(evidence.contentHash);
    if (cached?.status === "succeeded" && cached.caption.trim().length > 0) {
      return cached;
    }
    return null;
  }

  async function understandImage(input: {
    message: NormalizedFeishuMessage;
    evidence: EvidenceBundle;
  }): Promise<AiBootImageUnderstandingRecord> {
    const active = activeJobs.get(input.evidence.contentHash);
    if (active) {
      return active;
    }

    const job = runUnderstandImage(input);
    activeJobs.set(input.evidence.contentHash, job);
    try {
      return await job;
    } finally {
      activeJobs.delete(input.evidence.contentHash);
    }
  }

  async function runUnderstandImage(input: {
    message: NormalizedFeishuMessage;
    evidence: EvidenceBundle;
  }): Promise<AiBootImageUnderstandingRecord> {
    const cached = getCachedUnderstanding(input.evidence);
    if (cached) {
      return cached;
    }

    const startedAt = Date.now();
    const existing = deps.repo.findAiBootImageUnderstandingByContentHash(input.evidence.contentHash);
    const createdAt = existing?.createdAt ?? deps.now();
    const fileKey = imageFileKey(input.message, input.evidence);
    const modelName = deps.llmClient?.visionModel || deps.llmClient?.model || "";

    if (!fileKey) {
      const failed = buildRecord({
        input,
        fileKey: "",
        modelName,
        latencyMs: Date.now() - startedAt,
        status: "failed",
        errorReason: "missing_image_file_key",
        createdAt,
        updatedAt: deps.now(),
      });
      deps.repo.upsertAiBootImageUnderstanding(failed);
      return failed;
    }

    if (!deps.llmClient) {
      const failed = buildRecord({
        input,
        fileKey,
        modelName,
        latencyMs: Date.now() - startedAt,
        status: "failed",
        errorReason: "missing_llm_client",
        createdAt,
        updatedAt: deps.now(),
      });
      deps.repo.upsertAiBootImageUnderstanding(failed);
      return failed;
    }

    deps.repo.upsertAiBootImageUnderstanding(buildRecord({
      input,
      fileKey,
      modelName,
      latencyMs: 0,
      status: "running",
      errorReason: "",
      createdAt,
      updatedAt: deps.now(),
    }));

    try {
      const file = await deps.feishuClient.getMessageFile({
        messageId: input.message.messageId,
        fileKey,
        resourceType: imageResourceType(input.message),
      });
      const mimeType = file.mimeType || "image/png";
      const imageDataUrl = `data:${mimeType};base64,${file.bytes.toString("base64")}`;
      const response = await deps.llmClient.chat(
        [
          {
            role: "system",
            content:
              "You describe Feishu image evidence for audit-grade AI Boot scoring. Return only JSON with caption and scoreHint.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: buildImageUnderstandingPrompt(input.evidence) },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        {
          timeoutMs: 70000,
          temperature: 0.1,
          maxTokens: 500,
        },
      );
      const parsed = parseUnderstandingResponse(response);
      const succeeded = buildRecord({
        input,
        fileKey,
        modelName,
        caption: parsed.caption,
        scoreHint: parsed.scoreHint,
        latencyMs: Date.now() - startedAt,
        status: "succeeded",
        errorReason: "",
        createdAt,
        updatedAt: deps.now(),
      });
      deps.repo.upsertAiBootImageUnderstanding(succeeded);
      return succeeded;
    } catch (err) {
      const failed = buildRecord({
        input,
        fileKey,
        modelName,
        latencyMs: Date.now() - startedAt,
        status: "failed",
        errorReason: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
        createdAt,
        updatedAt: deps.now(),
      });
      deps.repo.upsertAiBootImageUnderstanding(failed);
      return failed;
    }
  }

  function enqueueUnderstanding(input: {
    message: NormalizedFeishuMessage;
    evidence: EvidenceBundle;
  }): void {
    if (!hasImageEvidence(input.evidence)) {
      return;
    }

    const cached = deps.repo.findAiBootImageUnderstandingByContentHash(input.evidence.contentHash);
    if (cached && cached.status !== "failed") {
      return;
    }

    const fileKey = imageFileKey(input.message, input.evidence);
    deps.repo.upsertAiBootImageUnderstanding(buildRecord({
      input,
      fileKey: fileKey ?? "",
      modelName: deps.llmClient?.visionModel || deps.llmClient?.model || "",
      latencyMs: 0,
      status: "pending",
      errorReason: "",
      createdAt: cached?.createdAt ?? deps.now(),
      updatedAt: deps.now(),
    }));

    queueMicrotask(() => {
      void understandImage(input).catch((err) => {
        deps.onError?.(err);
      });
    });
  }

  return {
    getCachedUnderstanding,
    enqueueUnderstanding,
    understandImage,
  };
}

export function buildImageUnderstandingPrompt(evidence: EvidenceBundle): string {
  return `AI_BOOT_IMAGE_UNDERSTANDING_PROMPT_VERSION: ${AI_BOOT_IMAGE_UNDERSTANDING_PROMPT_VERSION}

请用中文描述这张图片里可见的、与 AI 训练营积分审核相关的证据。

要求：
- 只描述图片中能看见的内容，不要推断图片外的信息。
- 如果图片是 AI 产物、工作流结果、提示词截图、实践复盘、学习资源或群内互助证据，请在 scoreHint 中说明可供后续评分模型参考的方向。
- 如果图片无法判断，请如实说明。
- 输出 JSON-only，字段为 caption 和 scoreHint，不要 markdown。

关联文本证据 JSON：
${JSON.stringify({
    sanitizedText: evidence.sanitizedText,
    urls: evidence.urls,
    attachments: evidence.attachments,
    contentHash: evidence.contentHash,
  }, null, 2)}
`;
}

export function hasImageEvidence(evidence: EvidenceBundle): boolean {
  return evidence.attachments.some(isImageAttachment);
}

const IMAGE_FILE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);

export function isImageAttachment(
  attachment: EvidenceBundle["attachments"][number],
): boolean {
  return attachment.type === "image" ||
    Boolean(attachment.fileExt && IMAGE_FILE_EXTS.has(attachment.fileExt.toLowerCase()));
}

function imageFileKey(
  message: NormalizedFeishuMessage,
  evidence: EvidenceBundle,
): string | undefined {
  return message.fileKey ?? evidence.attachments.find(isImageAttachment)?.fileKey;
}

function imageResourceType(message: NormalizedFeishuMessage): "image" | "file" {
  return message.messageType === "file" ? "file" : "image";
}

function parseUnderstandingResponse(response: string): { caption: string; scoreHint: string } {
  const parsed = JSON.parse(response.trim()) as Record<string, unknown>;
  const caption = typeof parsed.caption === "string" ? parsed.caption.trim() : "";
  const scoreHint = typeof parsed.scoreHint === "string" ? parsed.scoreHint.trim() : "";
  if (!caption) {
    throw new Error("image understanding response missing caption");
  }
  return {
    caption,
    scoreHint,
  };
}

function buildRecord(input: {
  input: {
    message: NormalizedFeishuMessage;
    evidence: EvidenceBundle;
  };
  fileKey: string;
  modelName: string;
  caption?: string;
  scoreHint?: string;
  latencyMs: number;
  status: AiBootImageUnderstandingRecord["status"];
  errorReason: string;
  createdAt: string;
  updatedAt: string;
}): AiBootImageUnderstandingRecord {
  return {
    fileKey: input.fileKey,
    messageId: input.input.message.messageId,
    contentHash: input.input.evidence.contentHash,
    modelName: input.modelName,
    caption: input.caption ?? "",
    scoreHint: input.scoreHint ?? "",
    latencyMs: input.latencyMs,
    status: input.status,
    errorReason: input.errorReason,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}
