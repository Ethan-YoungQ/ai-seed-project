import type { GlmFileParserToolType, LlmProviderConfig } from "./provider-config.js";

export interface GlmFileParserClientDeps {
  fetchImpl?: typeof fetch;
  maxPollAttempts?: number;
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface GlmFileParserInput {
  bytes: Buffer;
  fileName: string;
  fileType: string;
  toolType: GlmFileParserToolType;
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

function normalizeTaskStatus(payload: Record<string, unknown>) {
  return String(payload.task_status ?? payload.status ?? "").trim().toLowerCase();
}

function normalizeError(payload: Record<string, unknown>) {
  return String(payload.error ?? payload.message ?? payload.msg ?? "parser_failed");
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createGlmFileParserClient(
  config: LlmProviderConfig,
  deps: GlmFileParserClientDeps = {}
) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const maxPollAttempts = deps.maxPollAttempts ?? 5;
  const sleepImpl = deps.sleepImpl ?? delay;

  async function createTask(input: GlmFileParserInput) {
    const form = new FormData();
    const byteBuffer = Uint8Array.from(input.bytes).buffer;
    form.append("file", new Blob([byteBuffer]), input.fileName);
    form.append("tool_type", input.toolType);
    form.append("file_type", input.fileType);

    const response = await fetchImpl(joinUrl(config.baseUrl, "/files/parser/create"), {
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
        `glm_file_parser_create_failed:${response.status}:${String(payload.error ?? payload.raw ?? "unknown")}`
      );
    }

    const taskId = String(payload.task_id ?? payload.taskId ?? "").trim();
    if (!taskId) {
      throw new Error("missing_parser_task_id");
    }

    return taskId;
  }

  async function getText(taskId: string) {
    for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
      const response = await fetchImpl(joinUrl(config.baseUrl, `/files/parser/result/${taskId}/text`), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey ?? ""}`
        },
        signal: AbortSignal.timeout(config.timeoutMs)
      });

      const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
      if (response.ok && !contentType.includes("application/json")) {
        const text = (await response.text()).trim();
        if (!text) {
          throw new Error("empty_parser_content");
        }

        return text;
      }

      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(
          `glm_file_parser_result_failed:${response.status}:${String(payload.error ?? payload.raw ?? "unknown")}`
        );
      }

      const status = normalizeTaskStatus(payload);
      if (status === "failed" || status === "error") {
        throw new Error(normalizeError(payload));
      }

      const maybeText = String(payload.text ?? payload.content ?? "").trim();
      if (status === "success" || status === "succeeded" || maybeText) {
        if (!maybeText) {
          throw new Error("empty_parser_content");
        }

        return maybeText;
      }

      if (attempt < maxPollAttempts - 1) {
        await sleepImpl(1000);
      }
    }

    throw new Error("parser_poll_timeout");
  }

  async function parse(input: GlmFileParserInput) {
    const taskId = await createTask(input);
    const text = await getText(taskId);

    return {
      taskId,
      text
    };
  }

  return {
    parse
  };
}
