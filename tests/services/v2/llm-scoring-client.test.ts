import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  FakeLlmScoringClient,
  type LlmScoringResult
} from "../../../src/services/v2/llm-scoring-client.js";
import { LlmRetryableError } from "../../../src/domain/v2/errors.js";

function ok(score: number): LlmScoringResult {
  return { pass: true, score, reason: "ok", raw: {} };
}

describe("FakeLlmScoringClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("queue mode pops responses in order", async () => {
    const client = new FakeLlmScoringClient({
      responses: [ok(1), ok(2), ok(3)]
    });
    const a = await client.score("prompt", { timeoutMs: 1000 });
    const b = await client.score("prompt", { timeoutMs: 1000 });
    const c = await client.score("prompt", { timeoutMs: 1000 });
    expect(a.score).toBe(1);
    expect(b.score).toBe(2);
    expect(c.score).toBe(3);
  });

  test("queue mode throws when exhausted", async () => {
    const client = new FakeLlmScoringClient({ responses: [] });
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toThrow(/fake queue exhausted/i);
  });

  test("function mode calls provider callback with prompt", async () => {
    const fn = vi.fn((prompt: string) =>
      Promise.resolve<LlmScoringResult>({
        pass: prompt.includes("good"),
        score: prompt.length,
        reason: "computed",
        raw: {}
      })
    );
    const client = new FakeLlmScoringClient({ provider: fn });
    const result = await client.score("good prompt", { timeoutMs: 1000 });
    expect(result.pass).toBe(true);
    expect(result.score).toBe("good prompt".length);
    expect(fn).toHaveBeenCalledWith("good prompt");
  });

  test("delayMs option delays resolution", async () => {
    const client = new FakeLlmScoringClient({
      responses: [ok(1)],
      delayMs: 500
    });
    const p = client.score("prompt", { timeoutMs: 1000 });
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });

  test("function mode can throw retryable error", async () => {
    const client = new FakeLlmScoringClient({
      provider: () => {
        throw new LlmRetryableError("network");
      }
    });
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmRetryableError);
  });

  test("exposes provider and model for task logging", () => {
    const client = new FakeLlmScoringClient({
      responses: [],
      provider_name: "fake",
      model: "fake-v1"
    });
    expect(client.provider).toBe("fake");
    expect(client.model).toBe("fake-v1");
  });
});
