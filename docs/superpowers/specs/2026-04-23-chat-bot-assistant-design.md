# 飞书 AI 助教 Chat Bot — Design Spec

**子项目：** AI Seed Project 扩展功能
**日期：** 2026-04-23
**状态：** Design Pending Approval
**基线：** `src/services/llm/`、`src/services/v2/llm-scoring-client.ts`、`src/services/feishu/message-commands.ts`
**模型：** GLM-5（从 GLM-4.7 升级）

---

## 0. Context

### 0.1 背景

当前飞书 Bot（辉瑞 HBU AI 训练营评估系统）仅作为**评分工具**存在——自动捕获学员消息、异步调用 GLM 进行审核评分。用户希望在此基础上扩展对话能力：**学员 @Bot 提问时，Bot 作为 AI 助教回答问题，并鼓励群内同学补充讨论。**

### 0.2 项目定位

该功能是 AI Seed Project 评分系统的**并列扩展**，不改动评分核心领域。其与评分系统的关系：

```
飞书消息事件
    ├─ @Bot 消息 → 新增：ChatBot 问答流
    ├─ 管理员关键词 → 现有：管理/测验/看板等卡片
    └─ 普通消息 → 现有：自动评分捕获
```

### 0.3 边界

**本 spec 定义：**
- ChatBot 核心对话引擎（chat-engine）
- Bot 人设和 System Prompt 模板
- 短期对话记忆（5 分钟）
- 限流与降级策略
- @Bot 检测与路由

**本 spec 不定义：**
- 新评分项、评分规则变更（不动）
- 长期对话记忆 / RAG 知识库（YAGNI）
- 学员补充内容的追踪与二次加分（D2，延后）
- 跨会话持久化对话历史（不必要）
- 模型微调 / Fine-tuning（不必要）

---

## 1. Principles & Directory Layout

### 1.1 原则

- **隔离优先**：ChatBot 独立目录 `src/services/feishu/chat-bot/`，不污染 `cards/` 或评分领域
- **复用 LLM 基础设施**：扩展 `LlmScoringClient` 接口为 `LlmChatClient`（添加 `chat()` 方法），共用 GLM 配置
- **@Bot 消息与评分互斥**：避免"@Bot 问问题还自动得 K1 签到"的双重计费
- **失败优雅降级**：LLM 超时/错误时返回友好文案，不抛异常打断流程
- **无持久化**：对话记忆只在内存中，进程重启即清空（简单可靠）

### 1.2 模块目录

```
src/services/feishu/chat-bot/
├── chat-engine.ts              # ChatEngine 核心：路由 @Bot 消息到 LLM
├── persona.ts                  # System prompt 模板 + 角色分支
├── conversation-memory.ts      # 5 分钟 TTL × 3 轮 内存缓存
└── rate-limiter.ts             # 30s 冷却 + 20/hr + 群 30/min

src/services/feishu/
├── normalize-message.ts        # 【改】新增 mentionedBotIds / cleanedText 字段
├── message-commands.ts         # 【改】最前端新增 @Bot 分支
└── config.ts                   # 【改】新增 botOpenId 配置

src/services/v2/
└── llm-scoring-client.ts       # 【改】扩展 LlmChatClient 接口 + chat() 方法

tests/services/feishu/chat-bot/
├── chat-engine.test.ts
├── conversation-memory.test.ts
└── rate-limiter.test.ts

tests/services/feishu/
└── normalize-message.mention.test.ts
```

### 1.3 向后兼容

- 现有 `LlmScoringClient.score()` 保持不变；新增 `chat()` 方法走同一 `OpenAiCompatibleLlmScoringClient` 实例
- 现有 `message-commands.ts` 的关键词和自动捕获逻辑顺序靠后，不受影响
- `.env` 新增变量均为可选；未配置时 ChatBot 功能自动降级为"未启用"（返回固定文案）

---

## 2. Data Contracts

### 2.1 `NormalizedFeishuMessage`（扩展）

```typescript
interface NormalizedFeishuMessage {
  // 现有字段
  messageId: string;
  memberId: string;          // sender open_id
  chatId: string;
  chatType: "group" | "p2p";
  messageType: "text" | "image" | "file" | "post" | "sticker" | "media";
  eventTime: string;
  rawText: string;
  senderType: "user" | "bot";
  parsedTags: string[];
  attachmentCount: number;
  attachmentTypes: string[];
  documentText: string;
  documentParseStatus: string;
  eventUrl: string;

  // 【新增】
  mentionedBotIds: string[]; // 被 @ 的所有 open_id（Bot 或用户），顺序保留
  cleanedText: string;       // rawText 去除所有 @ 前缀后的纯文本
}
```

**解析逻辑：** 从飞书事件 payload 的 `message.mentions[]` 字段读取。飞书事件格式：

```json
{
  "content": "{\"text\":\"@_user_1 什么是 RAG？\"}",
  "mentions": [
    { "key": "@_user_1", "id": { "open_id": "ou_bot_xxx" }, "name": "辉瑞..." }
  ]
}
```

`cleanedText` 生成规则：用正则 `/@_user_\d+\s*/g` 移除所有 `@_user_N ` 占位符并 trim。

### 2.2 `ChatReplyInput` / `ChatReplyResult`

```typescript
export interface ChatReplyInput {
  chatId: string;
  openId: string;            // 提问人 open_id
  messageId: string;         // 用于 reply_to 功能（可选）
  cleanedText: string;       // 已去除 @ 前缀的提问
}

export interface ChatReplyResult {
  replyText: string;
  used: "llm" | "rate_limited" | "error_fallback" | "empty_prompt";
  latencyMs: number;
}
```

### 2.3 `LlmChatClient`（新接口）

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

**实现说明：** `OpenAiCompatibleLlmScoringClient` 同时实现 `LlmScoringClient` 和 `LlmChatClient` 两个接口。`chat()` 不走 `response_format: json_object`，直接返回文本。

### 2.4 `ConversationMemory`

```typescript
export interface ConversationTurn {
  userText: string;
  botText: string;
  timestamp: number;
}

export interface ConversationMemory {
  get(openId: string): ChatMessage[];       // 返回最多 3 轮历史的 user/assistant 消息数组
  append(openId: string, userText: string, botText: string): void;
  clear(openId: string): void;              // 用户主动清空（可选，暂不暴露）
}
```

**实现：** `Map<string, ConversationTurn[]>` + 5 分钟 TTL。每次 `get()` 时过滤掉超过 5 分钟的 turn。`append()` 后若超过 3 轮，丢弃最老的一轮。

### 2.5 `RateLimiter`

```typescript
export interface RateLimitDecision {
  allowed: boolean;
  reason?: "user_cooldown" | "user_hourly" | "chat_per_minute";
  retryAfterSeconds?: number;
}

export interface RateLimiter {
  check(openId: string, chatId: string): RateLimitDecision;
  markUsed(openId: string, chatId: string): void;
}
```

**限流策略（硬编码常量）：**
- `USER_COOLDOWN_MS = 30_000`（每人 30 秒冷却）
- `USER_HOURLY_LIMIT = 20`
- `CHAT_PER_MINUTE_LIMIT = 30`

**实现：** 内存 Map + 滑动窗口计数器。

### 2.6 `MessageCommandDeps` 扩展

`MessageCommandDeps` 接口新增可选 `chatBot` 字段：

```typescript
export interface ChatBotDeps {
  botOpenId: string;         // Bot 自身的 open_id（用于 @ 检测）
  engine: ChatEngine;        // ChatEngine 实例
}

export interface MessageCommandDeps {
  // 现有字段...
  chatBot?: ChatBotDeps;     // 新增：可选，未配置时 @Bot 逻辑不启用
}
```

`chatBot` 在 `app.ts` 启动时根据 `FEISHU_CHAT_BOT_ENABLED` / `FEISHU_BOT_OPEN_ID` / `LLM_ENABLED` 三个条件决定是否构造。

---

## 3. Core Logic: ChatEngine

### 3.1 `reply()` 流水线

```typescript
async function reply(input: ChatReplyInput): Promise<ChatReplyResult> {
  const t0 = Date.now();

  // 1. 空问题过滤（@Bot 但没说话）
  if (!input.cleanedText.trim()) {
    return {
      replyText: "你好！有什么可以帮你的吗？可以直接告诉我你的问题 🤖",
      used: "empty_prompt",
      latencyMs: Date.now() - t0
    };
  }

  // 2. 限流检查
  const decision = deps.rateLimiter.check(input.openId, input.chatId);
  if (!decision.allowed) {
    return {
      replyText: buildRateLimitedReply(decision),
      used: "rate_limited",
      latencyMs: Date.now() - t0
    };
  }

  // 3. 角色识别
  const member = deps.repo.findMemberByOpenId(input.openId);
  const role = member?.roleType ?? "student";
  const memberName = member?.displayName ?? "同学";

  // 4. 构造 LLM messages
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(role, memberName) },
    ...deps.memory.get(input.openId),
    { role: "user", content: input.cleanedText }
  ];

  // 5. 调用 LLM（带超时 + 1 次重试）
  let content: string;
  try {
    content = await callWithRetry(() =>
      deps.llmClient.chat(messages, { timeoutMs: 15000, temperature: 0.7 })
    );
  } catch (err) {
    return {
      replyText: `@${memberName} 我现在有点忙，稍后再问我哦 🤖`,
      used: "error_fallback",
      latencyMs: Date.now() - t0
    };
  }

  // 6. 记录限流和记忆
  deps.rateLimiter.markUsed(input.openId, input.chatId);
  deps.memory.append(input.openId, input.cleanedText, content);

  // 7. 格式化回复（加鼓励语）
  return {
    replyText: formatReply(memberName, content, role),
    used: "llm",
    latencyMs: Date.now() - t0
  };
}
```

### 3.2 `formatReply()`

```typescript
function formatReply(name: string, content: string, role: Role): string {
  if (role === "student") {
    return `${content}\n\n💬 欢迎其他同学也来分享你们的想法！`;
  }
  return content;  // trainer / operator：纯回答
}
```

### 3.3 `callWithRetry()`

```typescript
async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // 只重试可重试错误，并等待 1s
    if (err instanceof LlmRetryableError) {
      await sleep(1000);
      return await fn();
    }
    throw err;
  }
}
```

---

## 4. System Prompt (persona.ts)

```typescript
export function buildSystemPrompt(role: Role, memberName: string): string {
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

---

## 5. Message Routing

### 5.1 `message-commands.ts` 改动

在 `createMessageCommandHandler` 的返回 handler 最前端（在所有关键词检测之前）插入：

```typescript
return async (message: NormalizedFeishuMessage): Promise<void> => {
  if (message.chatType !== "group") return;

  // 【新增】第 0 步：@Bot 问答分支（最高优先级）
  if (
    deps.chatBot &&
    message.mentionedBotIds.includes(deps.chatBot.botOpenId) &&
    message.messageType === "text"
  ) {
    await handleChatBotMention(message, deps);
    return;  // ⚠️ 关键：return 后不走评分
  }

  // 现有逻辑不变...
  if (message.messageType === "text") {
    const text = stripAtMentionPrefix(message.rawText.trim());
    if (ADMIN_PANEL_KEYWORDS.some(...)) { ... }
    // ...
  }

  await handleAutoCapture(message, deps);
};
```

### 5.2 `handleChatBotMention()`

```typescript
async function handleChatBotMention(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps
): Promise<void> {
  const result = await deps.chatBot!.engine.reply({
    chatId: message.chatId,
    openId: message.memberId,
    messageId: message.messageId,
    cleanedText: message.cleanedText
  });

  console.log(
    `[ChatBot] reply to ${message.memberId}: used=${result.used}, latency=${result.latencyMs}ms`
  );

  await deps.feishuClient.sendTextMessage({
    receiveId: message.chatId,
    receiveIdType: "chat_id",
    text: result.replyText
  });
}
```

---

## 6. Configuration

### 6.1 `.env` 新增变量

```bash
# ChatBot 开关与配置
FEISHU_CHAT_BOT_ENABLED=true
FEISHU_BOT_OPEN_ID=ou_xxxxx              # Bot 自己的 open_id，用于识别 @Bot

# LLM 模型升级（原 glm-4.7 改为 glm-5）
LLM_TEXT_MODEL=glm-5
```

### 6.2 启用条件

ChatBot 只在以下条件全部满足时启用：
- `FEISHU_CHAT_BOT_ENABLED=true`
- `FEISHU_BOT_OPEN_ID` 非空
- `LLM_ENABLED=true` 且 LLM 配置有效

否则 @Bot 消息不被响应（fallthrough 到现有关键词/自动捕获流程，因为 @ 前缀被清除后可能匹配关键词，如 "@Bot 管理" → 触发管理面板）。

### 6.3 获取 Bot open_id

启动时调用 `auth.v3.appAccessToken` 或配置手动填入。采用**手动填入**：
- 首次部署时，从飞书开放平台「应用详情 → 基本信息 → 应用凭证」复制
- 简单、可靠、不增加启动耗时
- 若 Bot 换了，手动更新 `.env` 一次即可

---

## 7. Error Handling & Observability

### 7.1 错误降级矩阵

| 错误类型 | 处理 | 用户可见文案 |
|---|---|---|
| LLM 超时（15s） | 重试 1 次，仍失败则降级 | "我现在有点忙，稍后再问我哦 🤖" |
| LLM 429 限流 | 重试 1 次（+1s backoff），仍失败则降级 | 同上 |
| LLM 5xx | 重试 1 次，仍失败则降级 | 同上 |
| LLM 4xx（不可重试） | 直接降级 | 同上 |
| LLM 响应为空 | 直接降级 | 同上 |
| 限流触发 | 不调 LLM，直接返回提示 | "@xx 你问得太快啦，30 秒后再问我哦 ⏰" |
| 空提问（只 @Bot） | 不调 LLM，直接返回提示 | "你好！有什么可以帮你的吗？" |

### 7.2 日志

使用现有 `console.log` 机制（与其他模块一致），关键事件：

```
[ChatBot] reply to ou_xxx: used=llm, latency=3245ms
[ChatBot] rate_limited: user_cooldown, retryAfter=23s
[ChatBot] error_fallback: LlmRetryableError: timeout
[ChatBot] empty_prompt for ou_xxx
```

后续可接入 structured logging 或 Prometheus metrics，不在本 spec 范围。

---

## 8. Testing Strategy

### 8.1 单元测试

| 测试文件 | 覆盖内容 |
|---|---|
| `chat-engine.test.ts` | 空提问降级、限流降级、LLM 成功路径、LLM 失败降级、角色分支、记忆注入 |
| `conversation-memory.test.ts` | TTL 过期、3 轮 FIFO、多用户隔离 |
| `rate-limiter.test.ts` | 30s 冷却、小时级计数、全群分钟级计数、多维度独立计数 |
| `normalize-message.mention.test.ts` | @Bot 识别、多 @ 处理、cleanedText 清理、@ 多人场景 |

### 8.2 集成测试

- 用 `FakeLlmScoringClient` 的 chat 变体（`FakeLlmChatClient`）作为注入项
- 测试 `handleChatBotMention` 完整路径：消息解析 → 路由 → engine.reply() → sendTextMessage mock
- 验证 @Bot 消息不触发 `handleAutoCapture`（通过 spy 验证未调用）

### 8.3 覆盖率目标

新增代码 **≥ 90%** 行覆盖率（因为这部分代码逻辑相对独立，容易覆盖）。

### 8.4 手动验收

部署后飞书群内验证：
1. 学员 @Bot 问基础问题 → 返回助教回答 + "欢迎同学补充"
2. 学员 @Bot 问作业答案 → 返回思路引导，不给答案
3. 管理员 @Bot 问专业问题 → 返回专业回答，不加鼓励语
4. 30 秒内连续 @Bot → 第二次触发冷却提示
5. 连续 3 轮对话 → 第 2 轮能正确理解"它""这个"等代词
6. 关掉 LLM key → 触发降级文案

---

## 9. Deployment

### 9.1 本地改动 → Git

- 本 spec 提交为一个 commit
- 实现按 writing-plans 拆分的任务分批提交
- 合并到 `main` 前先跑全量测试

### 9.2 服务器部署

通过现有 SWAS 流程（参考 `docs/skills/aliyun-swas-deploy.md`）：
1. 推送代码到 GitHub main 分支
2. 服务器 `git pull` + `npm run build`
3. 更新 `/opt/ai-seed-project/.env`：
   - `FEISHU_CHAT_BOT_ENABLED=true`
   - `FEISHU_BOT_OPEN_ID=ou_xxxxx`（从飞书开放平台取）
   - `LLM_TEXT_MODEL=glm-5`
4. `systemctl restart ai-seed-project`
5. 手动验收清单（8.4）

### 9.3 回滚

设置 `FEISHU_CHAT_BOT_ENABLED=false` 即可立刻停用（不需要重启代码）。

---

## 10. Out of Scope（延后/不做）

- ❌ **长期对话记忆**：每次进程重启清空，不持久化
- ❌ **D2 学员补充追踪加分**：现有 classifier 已能给"长文本补充"自动加 K3/C1 分，足够覆盖
- ❌ **RAG 知识库**：训练营内容短期稳定，GLM-5 通用能力足够
- ❌ **多模态问答**：学员发图片问 Bot 不支持（文字 @Bot 才响应）
- ❌ **Function Calling / 查分**：要查分数用"看板"卡片即可
- ❌ **微调 / 知识蒸馏**：成本收益不划算

以上功能如未来需要，各自独立开 spec。

---

## 11. Acceptance Criteria

- [ ] `npm test` 全绿，新增代码 ≥90% 覆盖率
- [ ] `npm run build` 零 TS 错误
- [ ] 飞书群内 @Bot 问答正常工作（8.4 六条手动验收通过）
- [ ] 关键词触发（管理/测验/看板）不受影响
- [ ] 自动评分（K1/H1/...）不受影响
- [ ] `FEISHU_CHAT_BOT_ENABLED=false` 时功能无感下线
- [ ] LLM 故障时优雅降级，不打断评分系统

---

## 12. Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| GLM-5 响应质量不达预期 | 学员体验差 | 可随时通过环境变量切回 GLM-4.7 或升级 GLM-5.1 |
| 学员滥用 @Bot 刷屏 | 群噪音、成本上升 | 30s 冷却 + 20/hr + 群 30/min 三层限流 |
| Bot 给出错误信息 | 学员被误导 | System prompt 要求"不确定就说不确定" + 后续可加人工审核日志 |
| @Bot 消息被误识别为评分 | 双重计费 | @Bot 分支 early return，单元测试强制验证 |
| 记忆泄露（OOM） | 进程崩溃 | TTL 过期清理 + 每用户最多 3 轮（上限约 15 学员 × 3 轮 × 1KB = 45KB，可忽略） |
| LLM API key 泄露 | 成本飙升 | 已通过环境变量管理 + GitHub 已扫描无泄露 |

---

**Spec End.**
