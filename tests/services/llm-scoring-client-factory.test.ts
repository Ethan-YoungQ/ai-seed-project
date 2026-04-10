import { describe, expect, it } from "vitest";
import {
  buildLlmScoringClient,
  isRealLlmEnabled,
} from "../../src/services/v2/llm-scoring-client-factory.js";
import { FakeLlmScoringClient, OpenAiCompatibleLlmScoringClient } from "../../src/services/v2/llm-scoring-client.js";

describe("buildLlmScoringClient", () => {
  it("returns FakeLlmScoringClient when LLM_ENABLED is false", () => {
    const client = buildLlmScoringClient({ LLM_ENABLED: "false" } as NodeJS.ProcessEnv);
    expect(client).toBeInstanceOf(FakeLlmScoringClient);
  });

  it("returns OpenAiCompatibleLlmScoringClient when LLM_ENABLED is true and API key present", () => {
    const client = buildLlmScoringClient({
      LLM_ENABLED: "true",
      LLM_API_KEY: "sk-test",
      LLM_PROVIDER: "glm",
      LLM_BASE_URL: "https://api.example.com/v1",
      LLM_TEXT_MODEL: "test-model",
    } as unknown as NodeJS.ProcessEnv);
    expect(client).toBeInstanceOf(OpenAiCompatibleLlmScoringClient);
  });

  it("returns FakeLlmScoringClient when LLM_ENABLED is true but no API key", () => {
    const client = buildLlmScoringClient({
      LLM_ENABLED: "true",
      LLM_API_KEY: "",
    } as unknown as NodeJS.ProcessEnv);
    expect(client).toBeInstanceOf(FakeLlmScoringClient);
  });
});

describe("isRealLlmEnabled", () => {
  it("returns false when LLM_ENABLED is not true", () => {
    expect(isRealLlmEnabled({ LLM_ENABLED: "false" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("returns false when LLM_ENABLED is true but no API key", () => {
    expect(
      isRealLlmEnabled({ LLM_ENABLED: "true", LLM_API_KEY: "" } as unknown as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it("returns true when both enabled and key present", () => {
    expect(
      isRealLlmEnabled({
        LLM_ENABLED: "true",
        LLM_API_KEY: "sk-test",
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(true);
  });
});
