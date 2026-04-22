# 飞书 AI 助教 Chat Bot — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为飞书 Bot 新增 @Bot 问答功能，作为训练营 AI 助教（名"奇点小助"），使用 GLM-5 模型，保留评分系统不变。

**Architecture:** 新建 `src/services/feishu/chat-bot/` 目录，包含 chat-engine / persona / conversation-memory / rate-limiter 四个独立模块。`message-commands.ts` 最前端插入 @Bot 分支，early return 避免与评分冲突。LLM client 扩展 `chat()` 方法复用现有 GLM 连接。

**Tech Stack:** TypeScript + vitest + Fastify + better-sqlite3 + @larksuiteoapi/node-sdk + GLM-5 API

**Spec:** `docs/superpowers/specs/2026-04-23-chat-bot-assistant-design.md`

---

## Task 1: 扩展 NormalizedFeishuMessage 解析 @Bot mentions

**Files:**
- Modify: `src/services/feishu/normalize-message.ts`
- Test: `tests/services/feishu-normalize.test.ts`

- [ ] **Step 1: 在测试文件末尾添加失败的测试**

打开 `tests/services/feishu-normalize.test.ts`，在最后一个 `it()` 后面、describe 结束 `});` 前面追加：

```typescript
  it("extracts mentionedBotIds and cleanedText from @Bot message", () => {
    const normalized = normalizeFeishuMessageEvent({
      event: {
        sender: { sender_type: "user", sender_id: { open_id: "user-alice" } },
        message: {
          message_id: "om_mention_001",
          chat_id: "chat-demo",
          chat_type: "group",
          create_time: "1775210400000",
          message_type: "text",
          content: JSON.stringify({ text: "@_user_1 什么是 RAG？" }),
          mentions: [
            { key: "@_user_1", id: { open_id: "ou_bot_xxx" }, name: "奇点小助" }
          ]
        }
      }
    });

    expect(normalized).toMatchObject({
      mentionedBotIds: ["ou_bot_xxx"],
      cleanedText: "什么是 RAG？"
    });
  });

  it("returns empty mentionedBotIds when no mentions field", () => {
    const normalized = normalizeFeishuMessageEvent({
      event: {
        sender: { sender_type: "user", sender_id: { open_id: "user-alice" } },
        message: {
          message_id: "om_plain_001",
          chat_id: "chat-demo",
          chat_type: "group",
          create_time: "1775210400000",
          message_type: "text",
          content: JSON.stringify({ text: "hello" })
        }
      }
    });

    expect(normalized?.mentionedBotIds).toEqual([]);
    expect(normalized?.cleanedText).toBe("hello");
  });

  it("strips multiple @ prefixes in cleanedText", () => {
    const normalized = normalizeFeishuMessageEvent({
      event: {
        sender: { sender_type: "user", sender_id: { open_id: "user-alice" } },
        message: {
          message_id: "om_multi_001",
          chat_id: "chat-demo",
          chat_type: "group",
          create_time: "1775210400000",
          message_type: "text",
          content: JSON.stringify({ text: "@_user_1 @_user_2 请问" }),
          mentions: [
            { key: "@_user_1", id: { open_id: "ou_bot" }, name: "Bot" },
            { key: "@_user_2", id: { open_id: "ou_karen" }, name: "Karen" }
          ]
        }
      }
    });

    expect(normalized?.mentionedBotIds).toEqual(["ou_bot", "ou_karen"]);
    expect(normalized?.cleanedText).toBe("请问");
  });
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd "D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu"
npx vitest run tests/services/feishu-normalize.test.ts
```

Expected: 3 tests FAIL with "mentionedBotIds is not in types" 或相关错误

- [ ] **Step 3: 修改 NormalizedFeishuMessage 接口**

打开 `src/services/feishu/normalize-message.ts`，在 `export interface NormalizedFeishuMessage {` 的最后一个字段 `eventUrl: string;` 后面添加：

```typescript
  mentionedBotIds: string[];
  cleanedText: string;
```

- [ ] **Step 4: 修改 normalizeFeishuMessageEvent 实现**

在 `normalize-message.ts` 中找到 `normalizeFeishuMessageEvent` 函数，把 `raw` 类型注释里的 message 对象改为：

```typescript
  const raw = payload as {
    event?: {
      sender?: { sender_type?: string; sender_id?: { open_id?: string } };
      message?: {
        message_id?: string;
        chat_id?: string;
        chat_type?: string;
        create_time?: string;
        message_type?: string;
        content?: string;
        attachments?: Array<{ type?: string }>;
        mentions?: Array<{
          key?: string;
          id?: { open_id?: string };
          name?: string;
        }>;
      };
    };
  };
```

然后在 `const fileExt = inferDocumentFileExt({...});` 这一行的**下一行**添加：

```typescript
  const mentions = raw.event?.message?.mentions ?? [];
  const mentionedBotIds = mentions
    .map((m) => m.id?.open_id)
    .filter((id): id is string => Boolean(id));
  const cleanedText = rawText.replace(/@_user_\d+\s*/g, "").trim();
```

在 return 对象里，最后 `eventUrl: \`feishu://message/${messageId}\`` 后面加逗号并添加两个新字段：

```typescript
    eventUrl: `feishu://message/${messageId}`,
    mentionedBotIds,
    cleanedText
  };
```

- [ ] **Step 5: 再次运行测试，确认通过**

```bash
npx vitest run tests/services/feishu-normalize.test.ts
```

Expected: 所有测试 PASS

- [ ] **Step 6: 提交**

```bash
git add src/services/feishu/normalize-message.ts tests/services/feishu-normalize.test.ts
git commit -m "feat(chat-bot): extract mentionedBotIds and cleanedText from Feishu mentions"
```

---

## Task 2: 扩展 LlmChatClient 接口和 chat() 方法

**Files:**
- Modify: `src/services/v2/llm-scoring-client.ts`
- Test: `tests/services/v2/llm-chat-client.test.ts` (create)

- [ ] **Step 1: 创建失败的测试**

创建文件 `tests/services/v2/llm-chat-client.test.ts`：

```typescript
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/services/v2/llm-chat-client.test.ts
```

Expected: FAIL with "client.chat is not a function" 或 "chat does not exist"

- [ ] **Step 3: 在 llm-scoring-client.ts 中添加 LlmChatClient 接口**

在 `src/services/v2/llm-scoring-client.ts` 文件顶部，`LlmScoringClient` 接口之后（约第 25 行后）添加：

```typescript
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
```

- [ ] **Step 4: 让 OpenAiCompatibleLlmScoringClient 实现 LlmChatClient**

修改类声明：

```typescript
export class OpenAiCompatibleLlmScoringClient implements LlmScoringClient, LlmChatClient {
```

然后在类的 `score()` 方法之后添加 `chat()` 方法：

```typescript
  async chat(
    messages: ChatMessage[],
    options: ChatOptions
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);

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
          max_tokens: options.maxTokens ?? 800
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
```

- [ ] **Step 5: 运行测试，确认通过**

```bash
npx vitest run tests/services/v2/llm-chat-client.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 6: 提交**

```bash
git add src/services/v2/llm-scoring-client.ts tests/services/v2/llm-chat-client.test.ts
git commit -m "feat(chat-bot): add LlmChatClient interface and chat() method"
```

---

## Task 3: 创建 ConversationMemory

**Files:**
- Create: `src/services/feishu/chat-bot/conversation-memory.ts`
- Create: `tests/services/feishu/chat-bot/conversation-memory.test.ts`

- [ ] **Step 1: 创建失败的测试**

创建目录并新建 `tests/services/feishu/chat-bot/conversation-memory.test.ts`：

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createConversationMemory } from "../../../../src/services/feishu/chat-bot/conversation-memory";

describe("ConversationMemory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty array for unknown user", () => {
    const mem = createConversationMemory();
    expect(mem.get("unknown")).toEqual([]);
  });

  it("returns user and assistant messages after append", () => {
    const mem = createConversationMemory();
    mem.append("u1", "你好", "你好，我是助教");
    expect(mem.get("u1")).toEqual([
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好，我是助教" }
    ]);
  });

  it("caps at 3 turns, dropping oldest", () => {
    const mem = createConversationMemory();
    mem.append("u1", "q1", "a1");
    mem.append("u1", "q2", "a2");
    mem.append("u1", "q3", "a3");
    mem.append("u1", "q4", "a4");

    const history = mem.get("u1");
    expect(history).toHaveLength(6); // 3 turns × 2 messages
    expect(history[0]).toEqual({ role: "user", content: "q2" });
    expect(history[5]).toEqual({ role: "assistant", content: "a4" });
  });

  it("expires turns older than 5 minutes", () => {
    const mem = createConversationMemory();
    mem.append("u1", "q1", "a1");

    // Advance 6 minutes
    vi.advanceTimersByTime(6 * 60 * 1000);

    expect(mem.get("u1")).toEqual([]);
  });

  it("keeps recent turns when some expire", () => {
    const mem = createConversationMemory();
    mem.append("u1", "q1", "a1");

    vi.advanceTimersByTime(4 * 60 * 1000); // 4 min
    mem.append("u1", "q2", "a2");

    vi.advanceTimersByTime(2 * 60 * 1000); // 6 min since q1, 2 min since q2

    const history = mem.get("u1");
    expect(history).toEqual([
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" }
    ]);
  });

  it("isolates memory per user", () => {
    const mem = createConversationMemory();
    mem.append("u1", "q1", "a1");
    mem.append("u2", "q2", "a2");

    expect(mem.get("u1")).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" }
    ]);
    expect(mem.get("u2")).toEqual([
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" }
    ]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/services/feishu/chat-bot/conversation-memory.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 创建实现**

创建目录 `src/services/feishu/chat-bot/`，然后创建文件 `conversation-memory.ts`：

```typescript
import type { ChatMessage } from "../../v2/llm-scoring-client.js";

const MAX_TURNS = 3;
const TTL_MS = 5 * 60 * 1000;

interface Turn {
  userText: string;
  botText: string;
  timestamp: number;
}

export interface ConversationMemory {
  get(openId: string): ChatMessage[];
  append(openId: string, userText: string, botText: string): void;
  clear(openId: string): void;
}

export function createConversationMemory(): ConversationMemory {
  const store = new Map<string, Turn[]>();

  function pruneExpired(turns: Turn[]): Turn[] {
    const cutoff = Date.now() - TTL_MS;
    return turns.filter((t) => t.timestamp >= cutoff);
  }

  return {
    get(openId: string): ChatMessage[] {
      const turns = store.get(openId);
      if (!turns) return [];

      const alive = pruneExpired(turns);
      if (alive.length !== turns.length) {
        if (alive.length === 0) {
          store.delete(openId);
        } else {
          store.set(openId, alive);
        }
      }

      const messages: ChatMessage[] = [];
      for (const t of alive) {
        messages.push({ role: "user", content: t.userText });
        messages.push({ role: "assistant", content: t.botText });
      }
      return messages;
    },

    append(openId: string, userText: string, botText: string): void {
      const existing = store.get(openId) ?? [];
      const alive = pruneExpired(existing);
      alive.push({ userText, botText, timestamp: Date.now() });
      while (alive.length > MAX_TURNS) {
        alive.shift();
      }
      store.set(openId, alive);
    },

    clear(openId: string): void {
      store.delete(openId);
    }
  };
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/services/feishu/chat-bot/conversation-memory.test.ts
```

Expected: 6 tests PASS

- [ ] **Step 5: 提交**

```bash
git add src/services/feishu/chat-bot/conversation-memory.ts tests/services/feishu/chat-bot/conversation-memory.test.ts
git commit -m "feat(chat-bot): add in-memory conversation history with 5min TTL and 3-turn cap"
```

---

## Task 4: 创建 RateLimiter

**Files:**
- Create: `src/services/feishu/chat-bot/rate-limiter.ts`
- Create: `tests/services/feishu/chat-bot/rate-limiter.test.ts`

- [ ] **Step 1: 创建失败的测试**

`tests/services/feishu/chat-bot/rate-limiter.test.ts`：

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRateLimiter } from "../../../../src/services/feishu/chat-bot/rate-limiter";

describe("RateLimiter", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("allows first request", () => {
    const rl = createRateLimiter();
    const decision = rl.check("u1", "chat1");
    expect(decision.allowed).toBe(true);
  });

  it("blocks second request within 30 seconds (user cooldown)", () => {
    const rl = createRateLimiter();
    rl.markUsed("u1", "chat1");
    const decision = rl.check("u1", "chat1");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("user_cooldown");
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows request after 30 seconds", () => {
    const rl = createRateLimiter();
    rl.markUsed("u1", "chat1");
    vi.advanceTimersByTime(31_000);
    const decision = rl.check("u1", "chat1");
    expect(decision.allowed).toBe(true);
  });

  it("blocks after 20 requests within an hour (user hourly)", () => {
    const rl = createRateLimiter();
    // Use 20 times with enough gap to skip cooldown
    for (let i = 0; i < 20; i++) {
      rl.markUsed("u1", "chat1");
      vi.advanceTimersByTime(31_000);
    }
    const decision = rl.check("u1", "chat1");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("user_hourly");
  });

  it("allows requests from different users independently", () => {
    const rl = createRateLimiter();
    rl.markUsed("u1", "chat1");
    const decision = rl.check("u2", "chat1");
    expect(decision.allowed).toBe(true);
  });

  it("blocks when chat exceeds 30 requests per minute", () => {
    const rl = createRateLimiter();
    // 30 different users in same chat, all within 60s
    for (let i = 0; i < 30; i++) {
      rl.markUsed(`user-${i}`, "chat1");
    }
    const decision = rl.check("user-30", "chat1");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("chat_per_minute");
  });

  it("resets chat-per-minute window after 60 seconds", () => {
    const rl = createRateLimiter();
    for (let i = 0; i < 30; i++) {
      rl.markUsed(`user-${i}`, "chat1");
    }
    vi.advanceTimersByTime(61_000);
    const decision = rl.check("user-new", "chat1");
    expect(decision.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/services/feishu/chat-bot/rate-limiter.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 创建实现**

`src/services/feishu/chat-bot/rate-limiter.ts`：

```typescript
const USER_COOLDOWN_MS = 30_000;
const USER_HOURLY_LIMIT = 20;
const USER_HOURLY_WINDOW_MS = 60 * 60 * 1000;
const CHAT_PER_MINUTE_LIMIT = 30;
const CHAT_WINDOW_MS = 60 * 1000;

export type RateLimitReason =
  | "user_cooldown"
  | "user_hourly"
  | "chat_per_minute";

export interface RateLimitDecision {
  allowed: boolean;
  reason?: RateLimitReason;
  retryAfterSeconds?: number;
}

export interface RateLimiter {
  check(openId: string, chatId: string): RateLimitDecision;
  markUsed(openId: string, chatId: string): void;
}

interface UserState {
  lastUsedAt: number;
  hourlyTimestamps: number[];
}

export function createRateLimiter(): RateLimiter {
  const userStore = new Map<string, UserState>();
  const chatStore = new Map<string, number[]>();

  function pruneHourly(ts: number[]): number[] {
    const cutoff = Date.now() - USER_HOURLY_WINDOW_MS;
    return ts.filter((t) => t >= cutoff);
  }

  function pruneChat(ts: number[]): number[] {
    const cutoff = Date.now() - CHAT_WINDOW_MS;
    return ts.filter((t) => t >= cutoff);
  }

  return {
    check(openId: string, chatId: string): RateLimitDecision {
      const now = Date.now();
      const user = userStore.get(openId);

      if (user) {
        const elapsed = now - user.lastUsedAt;
        if (elapsed < USER_COOLDOWN_MS) {
          return {
            allowed: false,
            reason: "user_cooldown",
            retryAfterSeconds: Math.ceil((USER_COOLDOWN_MS - elapsed) / 1000)
          };
        }

        const recent = pruneHourly(user.hourlyTimestamps);
        if (recent.length >= USER_HOURLY_LIMIT) {
          const oldest = recent[0];
          return {
            allowed: false,
            reason: "user_hourly",
            retryAfterSeconds: Math.ceil(
              (oldest + USER_HOURLY_WINDOW_MS - now) / 1000
            )
          };
        }
      }

      const chat = chatStore.get(chatId) ?? [];
      const recentChat = pruneChat(chat);
      if (recentChat.length >= CHAT_PER_MINUTE_LIMIT) {
        return {
          allowed: false,
          reason: "chat_per_minute",
          retryAfterSeconds: Math.ceil(
            (recentChat[0] + CHAT_WINDOW_MS - now) / 1000
          )
        };
      }

      return { allowed: true };
    },

    markUsed(openId: string, chatId: string): void {
      const now = Date.now();
      const existing = userStore.get(openId);
      const hourlyTimestamps = existing
        ? pruneHourly([...existing.hourlyTimestamps, now])
        : [now];
      userStore.set(openId, { lastUsedAt: now, hourlyTimestamps });

      const existingChat = chatStore.get(chatId) ?? [];
      chatStore.set(chatId, pruneChat([...existingChat, now]));
    }
  };
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/services/feishu/chat-bot/rate-limiter.test.ts
```

Expected: 7 tests PASS

- [ ] **Step 5: 提交**

```bash
git add src/services/feishu/chat-bot/rate-limiter.ts tests/services/feishu/chat-bot/rate-limiter.test.ts
git commit -m "feat(chat-bot): add three-tier rate limiter (cooldown/hourly/chat-per-minute)"
```

---

## Task 5: 创建 Persona (System Prompt Builder)

**Files:**
- Create: `src/services/feishu/chat-bot/persona.ts`
- Create: `tests/services/feishu/chat-bot/persona.test.ts`

- [ ] **Step 1: 创建失败的测试**

`tests/services/feishu/chat-bot/persona.test.ts`：

```typescript
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../../../src/services/feishu/chat-bot/persona";

describe("buildSystemPrompt", () => {
  it("includes bot name 奇点小助", () => {
    const prompt = buildSystemPrompt("student", "李明");
    expect(prompt).toContain("奇点小助");
  });

  it("includes member name in prompt", () => {
    const prompt = buildSystemPrompt("student", "李明");
    expect(prompt).toContain("李明");
  });

  it("tells LLM to NOT give homework answers for students", () => {
    const prompt = buildSystemPrompt("student", "李明");
    expect(prompt).toContain("不要直接给答案");
    expect(prompt).toContain("引导");
  });

  it("allows trainer to get direct answers", () => {
    const prompt = buildSystemPrompt("trainer", "Karen");
    expect(prompt).toContain("管理员");
    expect(prompt).toContain("更自由");
  });

  it("allows operator to get direct answers", () => {
    const prompt = buildSystemPrompt("operator", "YongQ");
    expect(prompt).toContain("管理员");
    expect(prompt).toContain("更自由");
  });

  it("includes behavior guidelines", () => {
    const prompt = buildSystemPrompt("student", "李明");
    expect(prompt).toContain("温暖");
    expect(prompt).toContain("鼓励");
    expect(prompt).toContain("200 字");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/services/feishu/chat-bot/persona.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 创建实现**

`src/services/feishu/chat-bot/persona.ts`：

```typescript
export type AssistantRole = "student" | "trainer" | "operator" | "observer";

export function buildSystemPrompt(role: AssistantRole, memberName: string): string {
  const roleHint = role === "student"
    ? "当前提问者是学员。对学员问及作业答案或测验题选项时，不要直接给答案，要引导思考。"
    : "当前提问者是管理员或讲师，你可以更自由地回答专业问题，包括给出测验答案或作业参考。";

  return `你是「辉瑞 HBU AI 训练营」的 AI 助教，名叫"奇点小助"。你的职责：

【核心定位】
- 你是训练营学员的陪伴式助教，不是冰冷的问答机器
- 你熟悉 AI 基础知识、prompt 工程、大模型应用场景
- 你用温暖、鼓励、专业的语气回答问题

【行为准则】
1. 永远先肯定学员的提问 —— 哪怕问题很基础，也要说"这个问题问得好"类似的话
2. 回答简洁 —— 200 字以内为佳，避免冗长说教
3. 给思路不给答案 —— 学员问作业答案时，不要直接给答案，要引导他思考：
   "这题考察的是 X 概念，你可以从 Y 角度思考..."
4. 主动鼓励互助 —— 回答末尾可以加"欢迎其他同学也来分享你们的想法！"
5. 承认局限 —— 不确定的内容直接说"这个我不确定，建议问讲师 Karen 或 Dorothy"

【语气示例】
✅ "这个问题问得很好！RAG（检索增强生成）的核心思路是……简单来说就是让 AI 先查资料再回答。"
❌ "RAG 是 Retrieval-Augmented Generation 的缩写，它结合了……"（过于学术）

【身份识别】
当前提问者：${memberName}（角色：${role}）
${roleHint}
`;
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/services/feishu/chat-bot/persona.test.ts
```

Expected: 6 tests PASS

- [ ] **Step 5: 提交**

```bash
git add src/services/feishu/chat-bot/persona.ts tests/services/feishu/chat-bot/persona.test.ts
git commit -m "feat(chat-bot): add '奇点小助' persona with role-aware system prompt"
```

---

## Task 6: 创建 ChatEngine

**Files:**
- Create: `src/services/feishu/chat-bot/chat-engine.ts`
- Create: `tests/services/feishu/chat-bot/chat-engine.test.ts`

- [ ] **Step 1: 创建失败的测试**

`tests/services/feishu/chat-bot/chat-engine.test.ts`：

```typescript
import { describe, expect, it, vi } from "vitest";
import { createChatEngine } from "../../../../src/services/feishu/chat-bot/chat-engine";
import { createConversationMemory } from "../../../../src/services/feishu/chat-bot/conversation-memory";
import { createRateLimiter } from "../../../../src/services/feishu/chat-bot/rate-limiter";
import type { LlmChatClient, ChatMessage } from "../../../../src/services/v2/llm-scoring-client";
import { LlmRetryableError } from "../../../../src/domain/v2/errors";

function makeFakeClient(responses: string[]): LlmChatClient {
  const queue = [...responses];
  return {
    provider: "fake",
    model: "fake-v1",
    async chat(_messages: ChatMessage[]): Promise<string> {
      const next = queue.shift();
      if (next === undefined) throw new Error("fake queue exhausted");
      return next;
    }
  };
}

function makeThrowingClient(err: Error): LlmChatClient {
  return {
    provider: "fake",
    model: "fake-v1",
    async chat(): Promise<string> {
      throw err;
    }
  };
}

function makeRepoStub(members: Record<string, { displayName: string; roleType: string }>) {
  return {
    findMemberByOpenId(openId: string) {
      const m = members[openId];
      if (!m) return null;
      return {
        id: `id-${openId}`,
        displayName: m.displayName,
        roleType: m.roleType as "student" | "operator" | "trainer" | "observer",
        isParticipant: true,
        isExcludedFromBoard: false,
        currentLevel: 1
      };
    }
  };
}

describe("ChatEngine.reply", () => {
  it("returns empty_prompt when cleanedText is blank", async () => {
    const engine = createChatEngine({
      llmClient: makeFakeClient([]),
      memory: createConversationMemory(),
      rateLimiter: createRateLimiter(),
      repo: makeRepoStub({})
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "u1",
      messageId: "m1",
      cleanedText: ""
    });

    expect(result.used).toBe("empty_prompt");
    expect(result.replyText).toContain("有什么可以帮你的");
  });

  it("returns LLM response with encouragement for student", async () => {
    const engine = createChatEngine({
      llmClient: makeFakeClient(["RAG 是检索增强生成"]),
      memory: createConversationMemory(),
      rateLimiter: createRateLimiter(),
      repo: makeRepoStub({ u1: { displayName: "李明", roleType: "student" } })
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "u1",
      messageId: "m1",
      cleanedText: "什么是 RAG？"
    });

    expect(result.used).toBe("llm");
    expect(result.replyText).toContain("RAG 是检索增强生成");
    expect(result.replyText).toContain("欢迎其他同学");
  });

  it("returns LLM response without encouragement for trainer", async () => {
    const engine = createChatEngine({
      llmClient: makeFakeClient(["答案是 C"]),
      memory: createConversationMemory(),
      rateLimiter: createRateLimiter(),
      repo: makeRepoStub({ k1: { displayName: "Karen", roleType: "trainer" } })
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "k1",
      messageId: "m1",
      cleanedText: "测验第三题选什么"
    });

    expect(result.used).toBe("llm");
    expect(result.replyText).toContain("答案是 C");
    expect(result.replyText).not.toContain("欢迎其他同学");
  });

  it("returns rate_limited when cooldown active", async () => {
    const rl = createRateLimiter();
    rl.markUsed("u1", "c1");

    const engine = createChatEngine({
      llmClient: makeFakeClient([]),
      memory: createConversationMemory(),
      rateLimiter: rl,
      repo: makeRepoStub({ u1: { displayName: "李明", roleType: "student" } })
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "u1",
      messageId: "m1",
      cleanedText: "hello"
    });

    expect(result.used).toBe("rate_limited");
    expect(result.replyText).toContain("30");
  });

  it("returns error_fallback when LLM fails after retry", async () => {
    const engine = createChatEngine({
      llmClient: makeThrowingClient(new LlmRetryableError("timeout")),
      memory: createConversationMemory(),
      rateLimiter: createRateLimiter(),
      repo: makeRepoStub({ u1: { displayName: "李明", roleType: "student" } })
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "u1",
      messageId: "m1",
      cleanedText: "hello"
    });

    expect(result.used).toBe("error_fallback");
    expect(result.replyText).toContain("稍后再问");
  });

  it("includes conversation history in second turn", async () => {
    const llm = vi.fn().mockResolvedValueOnce("R1").mockResolvedValueOnce("R2");
    const engine = createChatEngine({
      llmClient: {
        provider: "fake",
        model: "fake-v1",
        chat: llm
      },
      memory: createConversationMemory(),
      rateLimiter: { check: () => ({ allowed: true }), markUsed: () => {} },
      repo: makeRepoStub({ u1: { displayName: "李明", roleType: "student" } })
    });

    await engine.reply({ chatId: "c1", openId: "u1", messageId: "m1", cleanedText: "Q1" });
    await engine.reply({ chatId: "c1", openId: "u1", messageId: "m2", cleanedText: "Q2" });

    expect(llm).toHaveBeenCalledTimes(2);
    const secondCallMessages = llm.mock.calls[1][0];
    // system + user Q1 + assistant R1 + user Q2 = 4 messages
    expect(secondCallMessages).toHaveLength(4);
    expect(secondCallMessages[0].role).toBe("system");
    expect(secondCallMessages[1]).toEqual({ role: "user", content: "Q1" });
    expect(secondCallMessages[2]).toEqual({ role: "assistant", content: "R1" });
    expect(secondCallMessages[3]).toEqual({ role: "user", content: "Q2" });
  });

  it("defaults to student role when member not found", async () => {
    const engine = createChatEngine({
      llmClient: makeFakeClient(["answer"]),
      memory: createConversationMemory(),
      rateLimiter: createRateLimiter(),
      repo: makeRepoStub({}) // no members
    });

    const result = await engine.reply({
      chatId: "c1",
      openId: "unknown",
      messageId: "m1",
      cleanedText: "hi"
    });

    expect(result.used).toBe("llm");
    expect(result.replyText).toContain("欢迎其他同学"); // student encouragement
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/services/feishu/chat-bot/chat-engine.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 创建实现**

`src/services/feishu/chat-bot/chat-engine.ts`：

```typescript
import type { LlmChatClient, ChatMessage } from "../../v2/llm-scoring-client.js";
import { LlmRetryableError } from "../../../domain/v2/errors.js";
import type { ConversationMemory } from "./conversation-memory.js";
import type { RateLimiter } from "./rate-limiter.js";
import { buildSystemPrompt, type AssistantRole } from "./persona.js";

export interface ChatEngineRepo {
  findMemberByOpenId(openId: string): {
    id: string;
    displayName: string;
    roleType: string;
    isParticipant: boolean;
    isExcludedFromBoard: boolean;
    currentLevel: number;
  } | null;
}

export interface ChatEngineDeps {
  llmClient: LlmChatClient;
  memory: ConversationMemory;
  rateLimiter: RateLimiter;
  repo: ChatEngineRepo;
}

export interface ChatReplyInput {
  chatId: string;
  openId: string;
  messageId: string;
  cleanedText: string;
}

export type ChatReplyUsed =
  | "llm"
  | "rate_limited"
  | "error_fallback"
  | "empty_prompt";

export interface ChatReplyResult {
  replyText: string;
  used: ChatReplyUsed;
  latencyMs: number;
}

export interface ChatEngine {
  reply(input: ChatReplyInput): Promise<ChatReplyResult>;
}

const LLM_TIMEOUT_MS = 15000;
const LLM_TEMPERATURE = 0.7;

function buildRateLimitedReply(
  memberName: string,
  retryAfterSeconds: number | undefined,
  reason: string | undefined
): string {
  const secs = retryAfterSeconds ?? 30;
  if (reason === "user_hourly") {
    return `@${memberName} 你今天问得有点多啦，歇会儿再来找我吧 ⏰`;
  }
  if (reason === "chat_per_minute") {
    return `@${memberName} 群里大家都在问我，稍等 ${secs} 秒再来哦 ⏰`;
  }
  return `@${memberName} 你问得太快啦，${secs} 秒后再问我哦 ⏰`;
}

function formatReply(
  memberName: string,
  content: string,
  role: AssistantRole
): string {
  if (role === "student") {
    return `${content}\n\n💬 欢迎其他同学也来分享你们的想法！`;
  }
  return content;
}

async function callWithRetry(
  fn: () => Promise<string>
): Promise<string> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LlmRetryableError) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return await fn();
    }
    throw err;
  }
}

export function createChatEngine(deps: ChatEngineDeps): ChatEngine {
  return {
    async reply(input: ChatReplyInput): Promise<ChatReplyResult> {
      const t0 = Date.now();

      if (!input.cleanedText.trim()) {
        return {
          replyText: "你好！有什么可以帮你的吗？可以直接告诉我你的问题 🤖",
          used: "empty_prompt",
          latencyMs: Date.now() - t0
        };
      }

      const member = deps.repo.findMemberByOpenId(input.openId);
      const role = (member?.roleType ?? "student") as AssistantRole;
      const memberName = member?.displayName ?? "同学";

      const decision = deps.rateLimiter.check(input.openId, input.chatId);
      if (!decision.allowed) {
        return {
          replyText: buildRateLimitedReply(
            memberName,
            decision.retryAfterSeconds,
            decision.reason
          ),
          used: "rate_limited",
          latencyMs: Date.now() - t0
        };
      }

      const messages: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt(role, memberName) },
        ...deps.memory.get(input.openId),
        { role: "user", content: input.cleanedText }
      ];

      let content: string;
      try {
        content = await callWithRetry(() =>
          deps.llmClient.chat(messages, {
            timeoutMs: LLM_TIMEOUT_MS,
            temperature: LLM_TEMPERATURE
          })
        );
      } catch {
        return {
          replyText: `@${memberName} 我现在有点忙，稍后再问我哦 🤖`,
          used: "error_fallback",
          latencyMs: Date.now() - t0
        };
      }

      deps.rateLimiter.markUsed(input.openId, input.chatId);
      deps.memory.append(input.openId, input.cleanedText, content);

      return {
        replyText: formatReply(memberName, content, role),
        used: "llm",
        latencyMs: Date.now() - t0
      };
    }
  };
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/services/feishu/chat-bot/chat-engine.test.ts
```

Expected: 7 tests PASS

- [ ] **Step 5: 提交**

```bash
git add src/services/feishu/chat-bot/chat-engine.ts tests/services/feishu/chat-bot/chat-engine.test.ts
git commit -m "feat(chat-bot): add ChatEngine orchestrating persona/memory/rate-limiter/llm"
```

---

## Task 7: 接入 message-commands.ts 路由

**Files:**
- Modify: `src/services/feishu/message-commands.ts`

- [ ] **Step 1: 添加 ChatBotDeps 接口到 MessageCommandDeps**

打开 `src/services/feishu/message-commands.ts`。在文件顶部已有的 imports 部分，追加：

```typescript
import type { ChatEngine } from "./chat-bot/chat-engine.js";
```

找到 `export interface MessageCommandDeps {`，在最后一个字段（`memberListProvider?: MemberListProvider;`）之后添加：

```typescript
  /** ChatBot @ 问答依赖（可选，未配置则不启用 @Bot 功能） */
  chatBot?: {
    botOpenId: string;
    engine: ChatEngine;
  };
```

- [ ] **Step 2: 在 handler 顶部插入 @Bot 分支**

在 `createMessageCommandHandler` 返回的 handler 内部，找到：

```typescript
    // Only process group chat messages (not DMs)
    if (message.chatType !== "group") return;
```

这一行的**下面**插入：

```typescript
    // 【新增】第 0 步：@Bot 问答分支（最高优先级，return 后不走评分）
    if (
      deps.chatBot &&
      message.mentionedBotIds.includes(deps.chatBot.botOpenId) &&
      message.messageType === "text"
    ) {
      await handleChatBotMention(message, deps);
      return;
    }
```

- [ ] **Step 3: 在文件末尾添加 handleChatBotMention 函数**

在文件最末端添加：

```typescript
// ============================================================================
// ChatBot @ 问答：学员/管理员 @Bot 提问 → LLM 回答
// ============================================================================

async function handleChatBotMention(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps,
): Promise<void> {
  if (!deps.chatBot || !message.chatId) return;

  try {
    const result = await deps.chatBot.engine.reply({
      chatId: message.chatId,
      openId: message.memberId,
      messageId: message.messageId,
      cleanedText: message.cleanedText,
    });

    console.log(
      `[ChatBot] reply to ${message.memberId}: used=${result.used}, latency=${result.latencyMs}ms`,
    );

    await deps.feishuClient.sendTextMessage({
      receiveId: message.chatId,
      receiveIdType: "chat_id",
      text: result.replyText,
    });
  } catch (err) {
    console.error("[ChatBot] unexpected error:", err);
  }
}
```

- [ ] **Step 4: 运行 TypeScript 检查**

```bash
npx tsc --noEmit --pretty 2>&1 | grep "^src/" | head -10
```

Expected: 无输出（零错误）

- [ ] **Step 5: 跑全部单元测试确保无回归**

```bash
npx vitest run tests/services/feishu
```

Expected: 所有测试 PASS（既有测试不受影响，新测试可能需要新增，见 Task 8）

- [ ] **Step 6: 提交**

```bash
git add src/services/feishu/message-commands.ts
git commit -m "feat(chat-bot): route @Bot messages to ChatEngine (early return before scoring)"
```

---

## Task 8: 在 app.ts 中连接 ChatBot 依赖

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: 添加 imports**

打开 `src/app.ts`。在现有的 `import { createMessageCommandHandler } ...` 行附近新增：

```typescript
import { createChatEngine } from "./services/feishu/chat-bot/chat-engine.js";
import { createConversationMemory } from "./services/feishu/chat-bot/conversation-memory.js";
import { createRateLimiter } from "./services/feishu/chat-bot/rate-limiter.js";
import { OpenAiCompatibleLlmScoringClient } from "./services/v2/llm-scoring-client.js";
import { readLlmProviderConfig } from "./services/llm/provider-config.js";
```

（注意：`readLlmProviderConfig` 和 `OpenAiCompatibleLlmScoringClient` 可能已经导入过了，如果有就不要重复）

- [ ] **Step 2: 在 createMessageCommandHandler 调用之前构造 chatBot deps**

在 `app.ts` 里找到 `createMessageCommandHandler({` 这一行（应该在 ws-runtime 的 onMessage 回调里）。在**这一行之前**插入一段构造 chatBot deps 的代码：

```typescript
            // 构造 ChatBot 依赖（可选，根据环境变量启用）
            const chatBotEnabled =
              (process.env.FEISHU_CHAT_BOT_ENABLED ?? "false").toLowerCase() === "true";
            const botOpenId = process.env.FEISHU_BOT_OPEN_ID?.trim();
            const llmConfigForChat = readLlmProviderConfig(process.env);
            const chatBot = chatBotEnabled && botOpenId && llmConfigForChat.enabled
              ? {
                  botOpenId,
                  engine: createChatEngine({
                    llmClient: new OpenAiCompatibleLlmScoringClient(llmConfigForChat),
                    memory: createConversationMemory(),
                    rateLimiter: createRateLimiter(),
                    repo: {
                      findMemberByOpenId(openId: string) {
                        const m = repository.findMemberByFeishuOpenId(openId);
                        if (!m) return null;
                        return {
                          id: m.id,
                          displayName: m.displayName || m.name || "同学",
                          roleType: m.roleType,
                          isParticipant: m.isParticipant,
                          isExcludedFromBoard: m.isExcludedFromBoard,
                          currentLevel: 1,
                        };
                      }
                    }
                  })
                }
              : undefined;
```

- [ ] **Step 3: 把 chatBot 加入 createMessageCommandHandler 的参数**

在 `createMessageCommandHandler({ ... })` 调用里，加入 `chatBot` 字段（与其他字段并列）：

```typescript
            const handler = createMessageCommandHandler({
              feishuClient: feishuApiClient,
              lifecycle: options.adminPanelLifecycle,
              cardDeps: { repo: cardRepoDeps },
              autoReply: {
                sendTextMessage: (input) => feishuApiClient.sendTextMessage(input),
              },
              ingestor: ingestorInstance ?? undefined,
              listStudents: () => {
                // ... existing code ...
              },
              quizBank: quizBankDeps,
              dashboardPin: { dashboardUrl },
              memberListProvider: {
                // ... existing code ...
              },
              autoRegister: async (openId: string) => {
                // ... existing code ...
              },
              chatBot,   // ← 新增
            });
```

注意：具体的 existing code 部分保留原样，只需要在合适位置（比如 autoRegister 之后）加一行 `chatBot,`。

- [ ] **Step 4: 构建确认无 TS 错误**

```bash
npm run build 2>&1 | tail -5
```

Expected: `> tsc -p tsconfig.build.json` 无报错输出

- [ ] **Step 5: 提交**

```bash
git add src/app.ts
git commit -m "feat(chat-bot): wire ChatBot deps in app.ts based on env config"
```

---

## Task 9: 更新 .env.example 和文档

**Files:**
- Modify: `.env.example`
- Modify: `docs/admin-guide.md`

- [ ] **Step 1: 更新 .env.example**

打开 `.env.example`，在 `FEISHU_LEADERBOARD_URL=` 行下方添加：

```bash

# --- ChatBot AI 助教 ---
# 启用 @Bot 问答功能（默认 false）
FEISHU_CHAT_BOT_ENABLED=false
# Bot 自身的 open_id（用于识别 @Bot 消息），从飞书开放平台应用详情获取
FEISHU_BOT_OPEN_ID=
```

同时在 LLM 配置部分（如有 `LLM_TEXT_MODEL`），更新注释提及 GLM-5：

```bash
# 推荐值：glm-5（聊天/助教场景），glm-4.7（评分场景，性价比）
LLM_TEXT_MODEL=
```

- [ ] **Step 2: 在 admin-guide.md 新增章节**

在 `docs/admin-guide.md` 里找到"功能实现状态总览"表格，在对应表格前面插入新章节：

```markdown
### 2.9 AI 助教 Chat Bot（已实现）

**什么时候用：** 学员或管理员有任何问题想问 AI 时。

**怎么操作：**

在飞书群里 **@ 机器人** 并跟上你的问题即可，例如：

> @辉瑞 HBU AI 训练营评估系统 什么是 RAG？

Bot 会以**奇点小助**的身份回答，并鼓励群内其他同学补充。

**使用规则：**

- 必须显式 @ 机器人才会响应，直接发问题不会触发
- 对学员：Bot 会引导思考，不直接给作业答案/测验答案
- 对管理员（运营/讲师）：Bot 可以给更直接的专业回答
- Bot 有短期记忆：**5 分钟内**的追问会保持上下文（最多记住 3 轮对话）
- 限流：同一个人 **30 秒冷却 + 每小时 20 次**；全群每分钟最多 30 次

**@Bot 消息不会触发评分**：避免"@Bot 问问题" 也算一次签到的双重计费。
```

并把"功能实现状态总览"表格中新增一行：

```markdown
| AI 助教 Chat Bot | 已实现 | @机器人 提问 → 奇点小助 LLM 回答 |
```

- [ ] **Step 3: 提交**

```bash
git add .env.example docs/admin-guide.md
git commit -m "docs(chat-bot): update env example and admin guide for ChatBot feature"
```

---

## Task 10: 全量测试 + 覆盖率验证

- [ ] **Step 1: 跑全部测试**

```bash
cd "D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu"
npx vitest run 2>&1 | tail -20
```

Expected: 所有测试 PASS；新增的 chat-bot 测试文件约 27 个 test case 全绿

- [ ] **Step 2: 构建验证**

```bash
npm run build
```

Expected: 零 TS 错误

- [ ] **Step 3: 如果有失败，修复**

根据测试报告修复（通常是 import 路径或 mock 不完整）。修复后重跑直到全绿。

- [ ] **Step 4: 推送到 main**

```bash
git push origin codex/phase-one-feishu:main --force
```

Expected: push 成功

---

## Task 11: 部署到服务器

- [ ] **Step 1: 获取 Bot open_id**

手动操作（需要人工）：
1. 登录飞书开放平台 `https://open.feishu.cn/app/cli_a95a5b91b8b85cce`
2. 进入"基本信息" → 找到"App ID"对应的"Bot"标签页
3. 复制 Bot 的 `open_id`（格式：`ou_xxxxxxxxxxxx`）

**备选方案**（如果找不到）：在服务器上运行命令打印：

```bash
# 在服务器上执行（通过 aliyun swas-open run-command）
cd /opt/ai-seed-project && node -e "
const lark = require('@larksuiteoapi/node-sdk');
const c = new lark.Client({ appId: process.env.FEISHU_APP_ID, appSecret: process.env.FEISHU_APP_SECRET, appType: lark.AppType.SelfBuild });
c.im.chat.members({ path: { chat_id: process.env.FEISHU_BOT_CHAT_ID }, params: { member_id_type: 'open_id', page_size: 100 } }).then(r => {
  const items = r.data?.items ?? [];
  console.log('Look for bot entries:');
  items.forEach(m => console.log(m.member_id, '|', m.name));
});
"
```

或使用 tenant_access_token 调用 `/open-apis/bot/v3/info` 接口。

- [ ] **Step 2: 更新服务器 .env**

通过 SWAS run-command 在服务器上追加环境变量：

```bash
ALIYUN="/c/Users/qiyon/Desktop/aliyun-cli-windows-latest-amd64/aliyun.exe"
# 假设通过 step 1 获取到 BOT_OPEN_ID=ou_xxxxxxxx

"$ALIYUN" swas-open run-command \
  --profile korea-deploy \
  --region ap-northeast-2 \
  --instance-id 09495b57b769406a95c0c718f22c9d13 \
  --biz-region-id ap-northeast-2 \
  --type RunShellScript \
  --name "update-chatbot-env" \
  --command-content 'cd /opt/ai-seed-project && grep -q FEISHU_CHAT_BOT_ENABLED .env || echo "FEISHU_CHAT_BOT_ENABLED=true" >> .env && grep -q FEISHU_BOT_OPEN_ID .env || echo "FEISHU_BOT_OPEN_ID=<REPLACE_WITH_BOT_OPEN_ID>" >> .env && sed -i "s/LLM_TEXT_MODEL=.*/LLM_TEXT_MODEL=glm-5/" .env && grep -E "^(FEISHU_CHAT_BOT|FEISHU_BOT_OPEN_ID|LLM_TEXT_MODEL)" .env'
```

将 `<REPLACE_WITH_BOT_OPEN_ID>` 替换为 Step 1 获取的值。

- [ ] **Step 3: 拉代码 + 构建 + 重启**

```bash
"$ALIYUN" swas-open run-command \
  --profile korea-deploy \
  --region ap-northeast-2 \
  --instance-id 09495b57b769406a95c0c718f22c9d13 \
  --biz-region-id ap-northeast-2 \
  --type RunShellScript \
  --name "deploy-chat-bot" \
  --command-content 'cd /opt/ai-seed-project && git fetch origin main && git reset --hard origin/main && npm run build 2>&1 | tail -3 && systemctl restart ai-seed-project && sleep 5 && systemctl is-active ai-seed-project && curl -s http://localhost:3000/api/health && echo DEPLOY_OK'
```

- [ ] **Step 4: 查询执行结果**

```bash
until "$ALIYUN" swas-open describe-invocation-result \
  --profile korea-deploy --region ap-northeast-2 \
  --instance-id 09495b57b769406a95c0c718f22c9d13 \
  --invoke-id <INVOKE_ID> --biz-region-id ap-northeast-2 2>&1 | grep -q '"Finished"'; do sleep 3; done
```

Expected: 输出包含 `DEPLOY_OK` 和 `{"ok":true}`

- [ ] **Step 5: 验证 WebSocket 和日志**

```bash
"$ALIYUN" swas-open run-command \
  --profile korea-deploy \
  --region ap-northeast-2 \
  --instance-id 09495b57b769406a95c0c718f22c9d13 \
  --biz-region-id ap-northeast-2 \
  --type RunShellScript \
  --name "check-chat-bot-wiring" \
  --command-content 'journalctl -u ai-seed-project --no-pager --since "2 minutes ago" | grep -iE "ws client ready|ChatBot|error" | tail -20'
```

Expected: 看到 `ws client ready`，无 `error`

---

## Task 12: 飞书群内手动端到端验收

**在飞书群内由人工操作**（不是命令行可以做的）：

- [ ] **Step 1: 学员 @Bot 问基础问题**

在群里：`@辉瑞 HBU AI 训练营评估系统 什么是 RAG？`
Expected:
- Bot 在 3-15 秒内回复
- 回复以"这个问题问得好"或类似鼓励语开头
- 回复末尾有"💬 欢迎其他同学也来分享你们的想法！"

- [ ] **Step 2: 学员问作业答案**

在群里：`@辉瑞 HBU AI 训练营评估系统 测验第三题选什么`
Expected:
- Bot 不直接给答案
- 回复包含"引导思考"、"你可以从 X 角度思考"类似内容

- [ ] **Step 3: 管理员问专业问题**

（由 YongQ/Karen/Dorothy 操作）：`@辉瑞 HBU AI 训练营评估系统 什么是 RAG？`
Expected:
- Bot 直接回答，不含"欢迎其他同学"鼓励语

- [ ] **Step 4: 冷却限流**

同一人 30 秒内连续 @ 两次
Expected: 第二次收到"你问得太快啦，30 秒后再问我哦"类似提示

- [ ] **Step 5: 多轮上下文**

学员连续两问：
1. `@Bot 什么是 RAG？`（等 Bot 回复）
2. `@Bot 它有哪些应用？`

Expected: 第二问中的"它"被正确理解为 RAG

- [ ] **Step 6: 验证不冲突评分**

学员普通发消息 `今天学了 Prompt 工程`（不 @Bot）
Expected: 排行榜 AQ 正常增加（K1 签到等），Bot 不回复

- [ ] **Step 7: 验证 @Bot 消息不计评分**

学员 @Bot 问问题，看排行榜
Expected: 问问题这条消息本身不计 K1/K3 等分数（因为 @Bot 早退出，不走评分）

---

## Self-Review 结果

**Spec 覆盖检查：**

| Spec §  | 内容 | 对应 Task |
|--------|------|----------|
| §1.2 模块目录 | chat-bot/ 四文件 + 改动点 | Task 1,2,3,4,5,6,7,8 |
| §2.1 NormalizedFeishuMessage | mentionedBotIds + cleanedText | Task 1 |
| §2.3 LlmChatClient | chat() 方法 | Task 2 |
| §2.4 ConversationMemory | 5min TTL + 3 turns | Task 3 |
| §2.5 RateLimiter | 30s/20hr/30min | Task 4 |
| §2.6 MessageCommandDeps 扩展 | chatBot 字段 | Task 7 |
| §3 ChatEngine reply() 流水线 | 7 步 | Task 6 |
| §4 Persona | 奇点小助 | Task 5 |
| §5 Message Routing | 0 优先级 | Task 7 |
| §6 Configuration | 3 个 env 变量 | Task 8, 9, 11 |
| §7 Error Handling | 降级矩阵 | Task 6 (retry + fallback) |
| §8 Testing | ≥90% + 6 条验收 | Task 10, 12 |
| §9 Deployment | SWAS | Task 11 |

无空缺，所有 spec 章节都有对应 task 覆盖。

**类型一致性：** 所有接口（`ChatMessage`, `LlmChatClient`, `ConversationMemory`, `RateLimiter`, `ChatEngine`）在 Task 2-6 中定义，Task 7-8 正确引用。无命名冲突。

**占位符扫描：** 唯一的占位符 `<REPLACE_WITH_BOT_OPEN_ID>` 是部署时人工操作需要替换的值，不是代码占位符，符合预期。

---
