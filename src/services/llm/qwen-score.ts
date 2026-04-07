import type { SubmissionAttempt } from "../../domain/types";
import { createOpenAiCompatibleClient, type OpenAiCompatibleClientDeps } from "./openai-compatible";
import type { LlmProviderConfig } from "./provider-config";

export interface QwenScoreResult {
  processScore: number;
  qualityScore: number;
  reason: string;
  model: string;
  inputExcerpt: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getAssistantText(payload: Record<string, unknown>) {
  const message = (
    Array.isArray(payload.choices) &&
    payload.choices[0] &&
    typeof payload.choices[0] === "object" &&
    (payload.choices[0] as { message?: unknown }).message &&
    typeof (payload.choices[0] as { message?: unknown }).message === "object"
  )
    ? ((payload.choices[0] as { message: { content?: unknown } }).message.content ?? "")
    : "";

  if (typeof message === "string") {
    return message;
  }

  if (Array.isArray(message)) {
    return message
      .map((entry) =>
        entry && typeof entry === "object" && "text" in entry
          ? String((entry as { text?: unknown }).text ?? "")
          : ""
      )
      .join("");
  }

  return "";
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("empty_llm_response");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("missing_json_object");
  }

  return JSON.parse(candidate.slice(start, end + 1)) as {
    processScore?: number;
    qualityScore?: number;
    reason?: string;
  };
}

export async function scoreAttemptWithQwen(
  attempt: SubmissionAttempt,
  config: LlmProviderConfig,
  deps: OpenAiCompatibleClientDeps = {}
): Promise<QwenScoreResult> {
  const sourceText = [attempt.combinedText.trim(), attempt.documentText?.trim() ?? ""]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, config.maxInputChars);
  const client = createOpenAiCompatibleClient(config, deps);
  const payload = await client.chatCompletion({
    model: config.textModel,
    messages: [
      {
        role: "system",
        content:
          "You score homework submissions. Return JSON only with keys processScore, qualityScore, reason. processScore must be 0-3. qualityScore must be 0-2."
      },
      {
        role: "user",
        content: `Score this submission text.\n\n${sourceText}`
      }
    ],
    responseFormatJson: true
  });
  const content = getAssistantText(payload);
  const parsed = extractJsonObject(content);

  return {
    processScore: clamp(Number(parsed.processScore ?? 0), 0, 3),
    qualityScore: clamp(Number(parsed.qualityScore ?? 0), 0, 2),
    reason: String(parsed.reason ?? "").trim() || "model_scored",
    model: String(payload.model ?? config.textModel),
    inputExcerpt: sourceText.slice(0, 160)
  };
}

export async function extractTextWithQwenDoc(
  input: {
    bytes: Buffer;
    fileName?: string;
  },
  config: LlmProviderConfig,
  deps: OpenAiCompatibleClientDeps = {}
) {
  const client = createOpenAiCompatibleClient(config, deps);
  const uploaded = await client.uploadFile({
    bytes: input.bytes,
    fileName: input.fileName || "submission.pdf",
    purpose: "file-extract"
  });
  const payload = await client.chatCompletion({
    model: config.fileModel,
    messages: [
      {
        role: "system",
        content:
          "Extract readable plain text from the uploaded document. Return text only, without commentary."
      },
      {
        role: "user",
        content: `Read the uploaded file and return its plain text. file_id=${uploaded.id}`
      }
    ]
  });

  return {
    text: getAssistantText(payload).trim(),
    model: String(payload.model ?? config.fileModel),
    fileId: uploaded.id
  };
}
