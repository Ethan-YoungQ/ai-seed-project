import {
  LlmNonRetryableError,
  LlmRetryableError
} from "../../domain/v2/errors.js";
import type { LlmProviderConfig } from "../llm/provider-config.js";

export interface LlmScoringResult {
  pass: boolean;
  score: number;
  reason: string;
  raw: unknown;
}

export interface LlmScoringOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  /** When present, the client sends a multimodal message with image_url */
  imageUrl?: string;
}

export interface LlmScoringClient {
  readonly provider: string;
  readonly model: string;
  score(promptText: string, options: LlmScoringOptions): Promise<LlmScoringResult>;
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  timeoutMs: number;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmChatClient {
  readonly provider: string;
  readonly model: string;
  chat(messages: ChatMessage[], options: ChatOptions): Promise<string>;
}

export type FakeProviderFn = (prompt: string) => Promise<LlmScoringResult> | LlmScoringResult;

export interface FakeLlmScoringClientOptions {
  responses?: LlmScoringResult[];
  provider?: FakeProviderFn;
  delayMs?: number;
  provider_name?: string;
  model?: string;
}

export class FakeLlmScoringClient implements LlmScoringClient {
  readonly provider: string;
  readonly model: string;
  private readonly queue: LlmScoringResult[];
  private readonly providerFn: FakeProviderFn | null;
  private readonly delayMs: number;

  constructor(options: FakeLlmScoringClientOptions) {
    this.provider = options.provider_name ?? "fake";
    this.model = options.model ?? "fake-v1";
    this.queue = options.responses ? [...options.responses] : [];
    this.providerFn = options.provider ?? null;
    this.delayMs = options.delayMs ?? 0;
  }

  async score(
    promptText: string,
    _options: LlmScoringOptions
  ): Promise<LlmScoringResult> {
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.providerFn) {
      return await this.providerFn(promptText);
    }
    const next = this.queue.shift();
    if (!next) {
      throw new Error("fake queue exhausted");
    }
    return next;
  }
}

/* ------------------------------------------------------------------ */
/*  OpenAiCompatibleLlmScoringClient — real HTTP implementation       */
/* ------------------------------------------------------------------ */

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

type MessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export class OpenAiCompatibleLlmScoringClient implements LlmScoringClient, LlmChatClient {
  readonly provider: string;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: LlmProviderConfig) {
    if (!config.apiKey) {
      throw new Error("LlmProviderConfig.apiKey is required");
    }
    if (!config.baseUrl) {
      throw new Error("LlmProviderConfig.baseUrl is required");
    }
    this.provider = config.provider;
    this.model = config.textModel;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
  }

  async score(
    promptText: string,
    options: LlmScoringOptions
  ): Promise<LlmScoringResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    const signal = options.signal
      ? anySignal([options.signal, controller.signal])
      : controller.signal;

    const content: MessageContent = options.imageUrl
      ? [
          { type: "text", text: promptText },
          { type: "image_url", image_url: { url: options.imageUrl } }
        ]
      : promptText;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content }]
        }),
        signal
      });
    } catch (error) {
      clearTimeout(timer);
      throw new LlmRetryableError(
        error instanceof Error ? error.message : "network error"
      );
    }
    clearTimeout(timer);

    if (response.status >= 500) {
      throw new LlmRetryableError(`http ${response.status}`);
    }
    if (response.status === 429) {
      throw new LlmRetryableError("rate limited");
    }
    if (response.status >= 400) {
      throw new LlmNonRetryableError(`http ${response.status}`);
    }

    let body: ChatCompletionResponse;
    try {
      body = (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      throw new LlmNonRetryableError(
        `failed to parse response json: ${error instanceof Error ? error.message : "unknown"}`
      );
    }

    const rawContent = body.choices?.[0]?.message?.content;
    if (typeof rawContent !== "string") {
      throw new LlmNonRetryableError("missing choices[0].message.content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch (error) {
      throw new LlmNonRetryableError(
        `content is not json: ${error instanceof Error ? error.message : "unknown"}`
      );
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { pass?: unknown }).pass !== "boolean" ||
      typeof (parsed as { score?: unknown }).score !== "number" ||
      typeof (parsed as { reason?: unknown }).reason !== "string"
    ) {
      throw new LlmNonRetryableError("missing pass/score/reason fields");
    }

    const result = parsed as { pass: boolean; score: number; reason: string };
    return {
      pass: result.pass,
      score: result.score,
      reason: result.reason,
      raw: body
    };
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);

    // GLM-4.7 / GLM-5 默认启用思考模式（先推理再回答），这会显著增加延迟
    // 和 token 成本。助教问答场景属于"lightweight requests"，官方推荐关闭。
    // 参考：https://docs.z.ai/guides/capabilities/thinking-mode
    const isGlmModel = this.model.toLowerCase().startsWith("glm-");

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 800,
          ...(isGlmModel ? { thinking: { type: "disabled" } } : {})
        }),
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timer);
      throw new LlmRetryableError(
        error instanceof Error ? error.message : "network error"
      );
    }
    clearTimeout(timer);

    if (response.status >= 500) {
      throw new LlmRetryableError(`http ${response.status}`);
    }
    if (response.status === 429) {
      throw new LlmRetryableError("rate limited");
    }
    if (response.status >= 400) {
      throw new LlmNonRetryableError(`http ${response.status}`);
    }

    let body: ChatCompletionResponse;
    try {
      body = (await response.json()) as ChatCompletionResponse;
    } catch (error) {
      throw new LlmNonRetryableError(
        `failed to parse response json: ${error instanceof Error ? error.message : "unknown"}`
      );
    }

    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new LlmNonRetryableError("missing choices[0].message.content");
    }

    return content;
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort();
      return controller.signal;
    }
    sig.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}
