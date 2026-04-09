import { describe, expect, it } from "vitest";

import { readLlmProviderConfig } from "../../../src/services/llm/provider-config";

describe("readLlmProviderConfig", () => {
  it("reads glm defaults from provider-neutral LLM_* keys", () => {
    const config = readLlmProviderConfig({
      LLM_ENABLED: "true",
      LLM_PROVIDER: "glm",
      LLM_API_KEY: "sk-demo",
      LLM_TIMEOUT_MS: "15000",
      LLM_MAX_INPUT_CHARS: "6000",
      LLM_CONCURRENCY: "3"
    });

    expect(config.enabled).toBe(true);
    expect(config.provider).toBe("glm");
    expect(config.baseUrl).toBe("https://open.bigmodel.cn/api/paas/v4");
    expect(config.apiKey).toBe("sk-demo");
    expect(config.textModel).toBe("glm-4.7");
    expect(config.fileModel).toBe("");
    expect(config.fileExtractor).toBe("glm_file_parser");
    expect(config.fileParserToolType).toBe("lite");
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

  it("does not silently switch an old env to aliyun when provider is omitted", () => {
    const config = readLlmProviderConfig({
      LLM_ENABLED: "true",
      LLM_API_KEY: "sk-demo"
    });

    expect(config.provider).toBe("openai_compatible");
    expect(config.baseUrl).toBe("");
    expect(config.enabled).toBe(false);
  });

  it("keeps aliyun defaults available as a rollback path", () => {
    const config = readLlmProviderConfig({
      LLM_ENABLED: "true",
      LLM_PROVIDER: "aliyun",
      LLM_API_KEY: "sk-demo"
    });

    expect(config.provider).toBe("aliyun");
    expect(config.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(config.textModel).toBe("qwen3-flash");
    expect(config.fileModel).toBe("qwen-doc");
    expect(config.fileExtractor).toBe("openai_file_chat");
    expect(config.fileParserToolType).toBe("lite");
  });
});
