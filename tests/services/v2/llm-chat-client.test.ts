import { describe, expect, it, vi, beforeEach } from "vitest";
import { OpenAiCompatibleLlmScoringClient } from "../../../src/services/v2/llm-scoring-client";
import type { LlmProviderConfig } from "../../../src/services/llm/provider-config";

describe("OpenAiCompatibleLlmScoringClient.chat", () => {
  const config: LlmProviderConfig = {
    enabled: true,
    provider: "glm",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: "test-key",
    textModel: "glm-5",
    fileModel: "",
    fileExtractor: "glm_file_parser",
    fileParserToolType: "lite",
    timeoutMs: 15000,
    maxInputChars: 6000,
    concurrency: 3
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends messages and returns assistant text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "你好，我是助教" } }]
      })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new OpenAiCompatibleLlmScoringClient(config);
    const reply = await client.chat(
      [{ role: "user", content: "你好" }],
      { timeoutMs: 5000 }
    );

    expect(reply).toBe("你好，我是助教");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("glm-5");
    expect(body.messages).toEqual([{ role: "user", content: "你好" }]);
    // chat() should NOT set response_format
    expect(body.response_format).toBeUndefined();
    // GLM 模型应关闭思考模式以降低延迟
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("does not set thinking field for non-GLM models", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ choices: [{ message: { content: "hi" } }] })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const nonGlmConfig: LlmProviderConfig = {
      ...config,
      provider: "openai_compatible",
      textModel: "gpt-4"
    };
    const client = new OpenAiCompatibleLlmScoringClient(nonGlmConfig);
    await client.chat([{ role: "user", content: "hi" }], { timeoutMs: 5000 });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.thinking).toBeUndefined();
  });

  it("throws when response is missing content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ choices: [{ message: {} }] })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new OpenAiCompatibleLlmScoringClient(config);
    await expect(
      client.chat([{ role: "user", content: "hi" }], { timeoutMs: 5000 })
    ).rejects.toThrow();
  });

  it("throws retryable error on 5xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 503,
      ok: false,
      json: async () => ({})
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new OpenAiCompatibleLlmScoringClient(config);
    await expect(
      client.chat([{ role: "user", content: "hi" }], { timeoutMs: 5000 })
    ).rejects.toThrow(/http 503/);
  });
});
