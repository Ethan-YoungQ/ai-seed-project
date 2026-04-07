import { describe, expect, it } from "vitest";

import { readLlmProviderConfig } from "../../../src/services/llm/provider-config";

describe("readLlmProviderConfig", () => {
  it("reads aliyun defaults from LLM_* keys", () => {
    const config = readLlmProviderConfig({
      LLM_ENABLED: "true",
      LLM_PROVIDER: "aliyun",
      LLM_API_KEY: "sk-demo",
      LLM_TEXT_MODEL: "qwen3-flash",
      LLM_FILE_MODEL: "qwen-doc-turbo",
      LLM_TIMEOUT_MS: "15000",
      LLM_MAX_INPUT_CHARS: "6000",
      LLM_CONCURRENCY: "3"
    });

    expect(config.enabled).toBe(true);
    expect(config.provider).toBe("aliyun");
    expect(config.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(config.textModel).toBe("qwen3-flash");
    expect(config.fileModel).toBe("qwen-doc-turbo");
    expect(config.timeoutMs).toBe(15000);
    expect(config.maxInputChars).toBe(6000);
    expect(config.concurrency).toBe(3);
  });
});
