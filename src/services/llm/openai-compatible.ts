import type { LlmProviderConfig } from "./provider-config";

export interface OpenAiCompatibleClientDeps {
  fetchImpl?: typeof fetch;
}

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionInput {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  responseFormatJson?: boolean;
}

export interface UploadedFile {
  id: string;
  filename?: string;
  purpose?: string;
  status?: string;
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      raw: text
    };
  }
}

export function createOpenAiCompatibleClient(
  config: LlmProviderConfig,
  deps: OpenAiCompatibleClientDeps = {}
) {
  const fetchImpl = deps.fetchImpl ?? fetch;

  async function chatCompletion(input: ChatCompletionInput) {
    const response = await fetchImpl(joinUrl(config.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey ?? ""}`
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0,
        ...(input.responseFormatJson
          ? {
              response_format: {
                type: "json_object"
              }
            }
          : {})
      }),
      signal: AbortSignal.timeout(config.timeoutMs)
    });

    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(
        `openai_compatible_chat_failed:${response.status}:${String(payload.error ?? payload.raw ?? "unknown")}`
      );
    }

    return payload;
  }

  async function uploadFile(input: {
    bytes: Buffer;
    fileName: string;
    purpose?: string;
  }): Promise<UploadedFile> {
    const form = new FormData();
    const byteBuffer = Uint8Array.from(input.bytes).buffer;
    form.append("file", new Blob([byteBuffer]), input.fileName);
    form.append("purpose", input.purpose ?? "file-extract");

    const response = await fetchImpl(joinUrl(config.baseUrl, "/files"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey ?? ""}`
      },
      body: form,
      signal: AbortSignal.timeout(config.timeoutMs)
    });

    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(
        `openai_compatible_file_upload_failed:${response.status}:${String(payload.error ?? payload.raw ?? "unknown")}`
      );
    }

    return {
      id: String(payload.id ?? ""),
      filename: typeof payload.filename === "string" ? payload.filename : undefined,
      purpose: typeof payload.purpose === "string" ? payload.purpose : undefined,
      status: typeof payload.status === "string" ? payload.status : undefined
    };
  }

  return {
    chatCompletion,
    uploadFile
  };
}
