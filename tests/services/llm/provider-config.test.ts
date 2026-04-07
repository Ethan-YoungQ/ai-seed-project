import { describe, expect, it } from "vitest";

import { readLlmProviderConfig } from "../../../src/services/llm/provider-config";

describe("readLlmProviderConfig", () => {
  it("reads provider-neutral defaults from LLM_* keys", () => {
    const config = readLlmProviderConfig({
      LLM_ENABLED: "true",
      LLM_PROVIDER: "aliyun",
      LLM_API_KEY: "sk-demo",
      LLM_TIMEOUT_MS: "15000",
      LLM_MAX_INPUT_CHARS: "6000",
      LLM_CONCURRENCY: "3"
    });

    expect(config.enabled).toBe(true);
    expect(config.provider).toBe("aliyun");
    expect(config.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(config.apiKey).toBe("sk-demo");
    expect(config.textModel).toBe("qwen3-flash");
    expect(config.fileModel).toBe("qwen-doc");
    expect(config.timeoutMs).toBe(15000);
    expect(config.maxInputChars).toBe(6000);
    expect(config.concurrency).toBe(3);
  });

  it("keeps an openai-compatible provider when explicitly requested", () => {
    const config = readLlmProviderConfig({
      LLM_ENABLED: "true",
      LLM_PROVIDER: "openai_compatible",
      LLM_BASE_URL: "https://example.com/v1/",
      LLM_API_KEY: "sk-demo"
    });

    expect(config.enabled).toBe(true);
    expect(config.provider).toBe("openai_compatible");
    expect(config.baseUrl).toBe("https://example.com/v1");
  });
});
