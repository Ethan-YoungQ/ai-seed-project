/**
 * Factory for constructing an LlmScoringClient.
 *
 * This factory exists for two reasons:
 * 1. Tests can stub the factory without touching the worker.
 * 2. The real OpenAI client import stays out of the test bundle,
 *    keeping CI cold-start times low.
 *
 * This is the only place that should ever construct an LlmScoringClient.
 */

import { readLlmProviderConfig } from "../llm/provider-config.js";
import {
  FakeLlmScoringClient,
  OpenAiCompatibleLlmScoringClient,
  type LlmScoringClient,
} from "./llm-scoring-client.js";

/**
 * Returns true when the environment is configured for a real LLM backend
 * (LLM_ENABLED=true and a non-empty API key).
 */
export function isRealLlmEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.LLM_ENABLED !== "true") return false;
  const key = env.LLM_API_KEY?.trim();
  return Boolean(key);
}

/**
 * Build the appropriate LlmScoringClient for the given environment.
 *
 * When LLM_ENABLED !== "true" or no API key is present, returns a
 * FakeLlmScoringClient that always passes. Otherwise returns a real
 * OpenAiCompatibleLlmScoringClient backed by the configured provider.
 */
export function buildLlmScoringClient(env: NodeJS.ProcessEnv): LlmScoringClient {
  if (!isRealLlmEnabled(env)) {
    return new FakeLlmScoringClient({
      provider: () => ({
        pass: true,
        score: 100,
        reason: "fake-auto-pass",
        raw: null,
      }),
    });
  }

  const config = readLlmProviderConfig(env);
  return new OpenAiCompatibleLlmScoringClient(config);
}
