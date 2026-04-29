import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  FakeLlmScoringClient,
  OpenAiCompatibleLlmScoringClient,
  type LlmScoringResult,
  type MultiScoreResult
} from "../../../src/services/v2/llm-scoring-client.js";
import {
  LlmNonRetryableError,
  LlmRetryableError
} from "../../../src/domain/v2/errors.js";

function ok(score: number): LlmScoringResult {
  return { pass: true, score, reason: "ok", raw: {} };
}

function multiOk(items: MultiScoreResult["items"]): MultiScoreResult {
  return { items, raw: {} };
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

  /* ---------------------------------------------------------------- */
  /*  FakeLlmScoringClient — multiScore()                             */
  /* ---------------------------------------------------------------- */

  test("multiScore: pops multiScoreResponses in order", async () => {
    const client = new FakeLlmScoringClient({
      multiScoreResponses: [
        multiOk([{ code: "K3", score: 3, reason: "good" }]),
        multiOk([{ code: "C1", score: 4, reason: "creative" }])
      ]
    });
    const a = await client.multiScore("p1", { timeoutMs: 1000 });
    const b = await client.multiScore("p2", { timeoutMs: 1000 });
    expect(a.items).toEqual([{ code: "K3", score: 3, reason: "good" }]);
    expect(b.items).toEqual([{ code: "C1", score: 4, reason: "creative" }]);
  });

  test("multiScore: uses providerFn when configured", async () => {
    const fn = vi.fn((prompt: string) => {
      const parts = prompt.split(":");
      return Promise.resolve(multiOk([
        { code: parts[0] ?? "K1", score: Number(parts[1]) || 1, reason: "fn" }
      ]));
    });
    const client = new FakeLlmScoringClient({ multiScoreProvider: fn });
    const result = await client.multiScore("C3:5", { timeoutMs: 1000 });
    expect(result.items).toEqual([{ code: "C3", score: 5, reason: "fn" }]);
  });

  test("multiScore: falls back to auto-pass when no responses configured", async () => {
    const client = new FakeLlmScoringClient({});
    const result = await client.multiScore("any prompt", { timeoutMs: 1000 });
    expect(result.items).toEqual([{ code: "K1", score: 0, reason: "fake-auto-pass" }]);
  });
});

/* ------------------------------------------------------------------ */
/*  OpenAiCompatibleLlmScoringClient                                  */
/* ------------------------------------------------------------------ */

function makeConfig() {
  return {
    enabled: true,
    provider: "openai_compatible" as const,
    baseUrl: "https://llm.example.com/v1",
    apiKey: "sk-test",
    textModel: "test-model",
    fileModel: "",
    fileExtractor: "openai_file_chat" as const,
    fileParserToolType: "lite" as const,
    timeoutMs: 15000,
    maxInputChars: 6000,
    concurrency: 3
  };
}

function fetchOk(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  );
}

describe("OpenAiCompatibleLlmScoringClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("parses successful JSON-mode response into LlmScoringResult", async () => {
    const body = {
      choices: [
        {
          message: {
            content: JSON.stringify({ pass: true, score: 3, reason: "good" })
          }
        }
      ]
    };
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => fetchOk(body));
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    const result = await client.score("prompt", { timeoutMs: 1000 });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(3);
    expect(result.reason).toBe("good");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("sends correct request shape to /chat/completions", async () => {
    const body = {
      choices: [
        {
          message: {
            content: JSON.stringify({ pass: false, score: 1, reason: "bad" })
          }
        }
      ]
    };
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => fetchOk(body));
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await client.score("evaluate this", { timeoutMs: 2000 });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://llm.example.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers.authorization).toBe("Bearer sk-test");

    const parsed = JSON.parse(init.body as string);
    expect(parsed.model).toBe("test-model");
    expect(parsed.response_format).toEqual({ type: "json_object" });
    expect(parsed.messages).toEqual([
      { role: "user", content: "evaluate this" }
    ]);
  });

  test("HTTP 500 throws LlmRetryableError", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response("upstream error", { status: 500 }))
    );
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmRetryableError);
  });

  test("HTTP 429 throws LlmRetryableError", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response("rate limited", { status: 429 }))
    );
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmRetryableError);
  });

  test("HTTP 400 throws LlmNonRetryableError", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response("bad request", { status: 400 }))
    );
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmNonRetryableError);
  });

  test("JSON parse failure throws LlmNonRetryableError", async () => {
    const body = {
      choices: [{ message: { content: "not json at all" } }]
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => fetchOk(body));
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmNonRetryableError);
  });

  test("missing pass/score/reason fields throws LlmNonRetryableError", async () => {
    const body = {
      choices: [
        { message: { content: JSON.stringify({ pass: true }) } }
      ]
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => fetchOk(body));
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmNonRetryableError);
  });

  test("network rejection throws LlmRetryableError", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.reject(new TypeError("network unreachable"))
    );
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await expect(
      client.score("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmRetryableError);
  });

  test("constructor throws when apiKey is missing", () => {
    const cfg = makeConfig();
    delete (cfg as Record<string, unknown>).apiKey;
    expect(() => new OpenAiCompatibleLlmScoringClient(cfg)).toThrow(
      /apiKey/i
    );
  });

  test("constructor throws when baseUrl is empty", () => {
    const cfg = makeConfig();
    cfg.baseUrl = "";
    expect(() => new OpenAiCompatibleLlmScoringClient(cfg)).toThrow(
      /baseUrl/i
    );
  });

  test("multimodal: sends image_url content block when imageUrl is provided", async () => {
    const body = {
      choices: [
        {
          message: {
            content: JSON.stringify({ pass: true, score: 5, reason: "image ok" })
          }
        }
      ]
    };
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => fetchOk(body));
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    const result = await client.score("describe image", {
      timeoutMs: 2000,
      imageUrl: "https://cdn.example.com/img.png"
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(5);

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(init.body as string);
    expect(parsed.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "describe image" },
          {
            type: "image_url",
            image_url: { url: "https://cdn.example.com/img.png" }
          }
        ]
      }
    ]);
  });

  test("text-only: sends plain string content when imageUrl is absent", async () => {
    const body = {
      choices: [
        {
          message: {
            content: JSON.stringify({ pass: false, score: 1, reason: "no" })
          }
        }
      ]
    };
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => fetchOk(body));
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await client.score("just text", { timeoutMs: 1000 });

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(init.body as string);
    expect(parsed.messages).toEqual([
      { role: "user", content: "just text" }
    ]);
  });

  /* ---------------------------------------------------------------- */
  /*  multiScore() — unified multi-dimension scoring                   */
  /* ---------------------------------------------------------------- */

  test("multiScore: parses {items:[...]} response", async () => {
    const body = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                { code: "K3", score: 3, reason: "不错的总结" },
                { code: "C1", score: 4, reason: "创意用法" }
              ]
            })
          }
        }
      ]
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => fetchOk(body));
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    const result = await client.multiScore("evaluate this", { timeoutMs: 1000 });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ code: "K3", score: 3, reason: "不错的总结" });
    expect(result.items[1]).toEqual({ code: "C1", score: 4, reason: "创意用法" });
  });

  test("multiScore: returns empty items array when none qualify", async () => {
    const body = {
      choices: [
        {
          message: {
            content: JSON.stringify({ items: [] })
          }
        }
      ]
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => fetchOk(body));
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    const result = await client.multiScore("hello", { timeoutMs: 1000 });

    expect(result.items).toEqual([]);
  });

  test("multiScore: throws LlmNonRetryableError on invalid JSON", async () => {
    const body = {
      choices: [{ message: { content: "not json" } }]
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => fetchOk(body));
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await expect(
      client.multiScore("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmNonRetryableError);
  });

  test("multiScore: throws LlmNonRetryableError when items field missing", async () => {
    const body = {
      choices: [
        { message: { content: JSON.stringify({ wrong: "format" }) } }
      ]
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => fetchOk(body));
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await expect(
      client.multiScore("prompt", { timeoutMs: 1000 })
    ).rejects.toBeInstanceOf(LlmNonRetryableError);
  });

  test("multiScore: sends text content without response_format json_object", async () => {
    const body = {
      choices: [
        {
          message: {
            content: JSON.stringify({ items: [{ code: "K3", score: 2, reason: "ok" }] })
          }
        }
      ]
    };
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => fetchOk(body));
    const client = new OpenAiCompatibleLlmScoringClient(makeConfig());
    await client.multiScore("some text", { timeoutMs: 2000 });

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(init.body as string);
    expect(parsed.response_format).toEqual({ type: "json_object" });
    expect(parsed.messages).toEqual([
      { role: "user", content: "some text" }
    ]);
  });
});
