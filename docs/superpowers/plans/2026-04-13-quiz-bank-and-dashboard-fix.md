# 飞书 Base 题库管理 + Dashboard 修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 运营人员通过飞书多维表格管理测验题目，Dashboard 显示真实头像和分数

**Architecture:** 新建 quiz-bank.ts 从飞书 Base 读取题目 → 替换硬编码 demo → quiz resolver 也从 Base 读取。成员同步脚本增加头像获取。

**Tech Stack:** TypeScript, @larksuiteoapi/node-sdk, 飞书 Base API, SQLite

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/services/feishu/quiz-bank.ts` | **新建** — 从飞书 Base 读取题目并转换为 QuizCardState |
| `src/services/feishu/message-commands.ts` | **修改** — handleQuizTrigger 从 Base 读取替代硬编码 |
| `src/app.ts` | **修改** — quizSetResolver 从 Base 读取替代硬编码 |
| `src/scripts/sync-feishu-group-members.ts` | **修改** — 添加头像获取 |
| `.env` / `.env.example` | **修改** — 新增 FEISHU_BASE_QUIZ_TABLE |

---

### Task 1: 新建 quiz-bank.ts — Base 题库读取模块

**Files:**
- Create: `src/services/feishu/quiz-bank.ts`

- [ ] **Step 1: 创建 quiz-bank.ts**

```typescript
// src/services/feishu/quiz-bank.ts
import type { FeishuApiClient } from "./client.js";
import type { QuizCardState, QuizQuestion } from "./cards/templates/quiz-v1.js";

export interface QuizBankDeps {
  feishuClient: FeishuApiClient;
  appToken: string;
  tableId: string;
}

const ANSWER_MAP: Record<string, string> = { A: "a", B: "b", C: "c", D: "d" };

export async function fetchQuizByPeriod(
  deps: QuizBankDeps,
  periodNumber: number,
): Promise<QuizCardState | null> {
  const records = await deps.feishuClient.searchBaseRecords({
    appToken: deps.appToken,
    tableId: deps.tableId,
    fieldName: "期数",
    fieldValue: String(periodNumber),
  });

  if (records.length === 0) return null;

  const questions: QuizQuestion[] = records.map((record) => {
    const f = record.fields ?? {};
    const correctLetter = extractText(f["正确答案"]);
    const correctId = ANSWER_MAP[correctLetter.toUpperCase()] ?? "a";

    const options = (["A", "B", "C", "D"] as const)
      .map((letter) => {
        const text = extractText(f[`选项${letter}`]);
        if (!text) return null;
        return {
          id: letter.toLowerCase(),
          text: `${letter}. ${text}`,
          isCorrect: letter.toLowerCase() === correctId,
        };
      })
      .filter((o): o is NonNullable<typeof o> => o !== null);

    return {
      id: record.recordId,
      text: extractText(f["题目"]),
      options,
    };
  });

  return {
    setCode: `period-${periodNumber}`,
    periodNumber,
    title: `第 ${periodNumber} 期测验`,
    questions,
  };
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "object" && v?.text ? v.text : String(v ?? ""))).join("").trim();
  }
  if (typeof value === "object" && value !== null && "text" in value) {
    return String((value as { text: unknown }).text ?? "").trim();
  }
  return "";
}
```

- [ ] **Step 2: 编译验证**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: 无输出（零错误）

- [ ] **Step 3: Commit**

```bash
git add src/services/feishu/quiz-bank.ts
git commit -m "feat: add quiz-bank.ts — read quiz from Feishu Base"
```

---

### Task 2: 改造 message-commands.ts — 从 Base 读取题目

**Files:**
- Modify: `src/services/feishu/message-commands.ts`

- [ ] **Step 1: 添加 QuizBank deps 到 MessageCommandDeps**

在 `MessageCommandDeps` 接口中新增：

```typescript
/** 飞书 Base 题库依赖 */
quizBank?: QuizBankDeps;
```

并在文件顶部添加 import：

```typescript
import { fetchQuizByPeriod, type QuizBankDeps } from "./quiz-bank.js";
```

- [ ] **Step 2: 改造 handleQuizTrigger — 删除 DEMO_QUIZ，从 Base 读取**

替换整个 `handleQuizTrigger` 函数和 `DEMO_QUIZ` 常量：

```typescript
async function handleQuizTrigger(
  message: NormalizedFeishuMessage,
  deps: MessageCommandDeps,
): Promise<void> {
  const member = deps.cardDeps.repo.findMemberByOpenId(message.memberId);
  if (!member || (member.roleType !== "operator" && member.roleType !== "trainer")) {
    console.log("[Quiz] Denied: not operator/trainer");
    return;
  }
  if (!message.chatId) return;

  if (!deps.quizBank) {
    await deps.feishuClient.sendTextMessage({
      receiveId: message.chatId, receiveIdType: "chat_id",
      text: "⚠️ 题库未配置，请设置 FEISHU_BASE_QUIZ_TABLE 环境变量",
    });
    return;
  }

  // 获取当前期号
  const activePeriod = await deps.lifecycle.getActivePeriod();
  const periodNumber = activePeriod?.number ?? 1;

  const quizState = await fetchQuizByPeriod(deps.quizBank, periodNumber);
  if (!quizState || quizState.questions.length === 0) {
    await deps.feishuClient.sendTextMessage({
      receiveId: message.chatId, receiveIdType: "chat_id",
      text: `⚠️ 第 ${periodNumber} 期暂无测验题目，请在飞书多维表格中录入`,
    });
    return;
  }

  const cardJson = buildQuizCard(quizState);
  await deps.feishuClient.sendCardMessage({
    chatId: message.chatId,
    cardJson: cardJson as unknown as Record<string, unknown>,
  });
  console.log(`[Quiz] Card sent: period=${periodNumber}, questions=${quizState.questions.length}`);
}
```

删除 `DEMO_QUIZ` 常量和相关 import（`QuizCardState` 保留因为 `buildQuizCard` 返回它）。

- [ ] **Step 3: 编译验证**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: 零错误

- [ ] **Step 4: Commit**

```bash
git add src/services/feishu/message-commands.ts
git commit -m "feat: handleQuizTrigger reads from Feishu Base instead of hardcoded demo"
```

---

### Task 3: 改造 app.ts — quizSetResolver 从 Base 读取 + 注入 quizBank deps

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: 添加 quiz-bank import 和环境变量读取**

在 app.ts 顶部添加：

```typescript
import { fetchQuizByPeriod, type QuizBankDeps } from "./services/feishu/quiz-bank.js";
```

在 `createApp` 函数中，读取环境变量并构建 quizBankDeps：

```typescript
const quizTableId = process.env.FEISHU_BASE_QUIZ_TABLE;
const quizBankDeps: QuizBankDeps | undefined =
  feishuApiClient && feishuConfig.phaseOne?.baseAppToken && quizTableId
    ? { feishuClient: feishuApiClient, appToken: feishuConfig.phaseOne.baseAppToken, tableId: quizTableId }
    : undefined;
```

- [ ] **Step 2: 注入 quizBank 到 MessageCommandHandler**

在 `createMessageCommandHandler` 调用中添加 `quizBank: quizBankDeps`。

- [ ] **Step 3: 改造 quizSetResolver — 从 Base 读取替代硬编码**

替换 `[QUIZ_SET_RESOLVER_KEY]` 的整个实现：

```typescript
[QUIZ_SET_RESOLVER_KEY]: async (setCode: string): Promise<ResolvedQuizSet | null> => {
  if (!quizBankDeps) return null;
  const match = setCode.match(/^period-(\d+)$/);
  if (!match) return null;
  const periodNumber = parseInt(match[1], 10);
  const state = await fetchQuizByPeriod(quizBankDeps, periodNumber);
  return state ? { questions: state.questions } : null;
},
```

删除 `QUIZ_BANK` 硬编码数据和 `QuizQuestion` import（如果不再使用）。

- [ ] **Step 4: 编译验证**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: 零错误

- [ ] **Step 5: Commit**

```bash
git add src/app.ts
git commit -m "feat: wire quizBank deps + resolver reads from Feishu Base"
```

---

### Task 4: 更新环境变量

**Files:**
- Modify: `.env`
- Modify: `.env.example`

- [ ] **Step 1: 在 .env.example 中添加**

```
FEISHU_BASE_QUIZ_TABLE=
```

- [ ] **Step 2: 在服务器 .env 中设置（部署时）**

创建 Base 表后，将 tableId 写入服务器 `.env`。

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add FEISHU_BASE_QUIZ_TABLE to .env.example"
```

---

### Task 5: 成员同步添加头像获取

**Files:**
- Modify: `src/scripts/sync-feishu-group-members.ts`

- [ ] **Step 1: 在成员同步中获取头像**

在 `main()` 函数的成员列表获取之后，对每个成员调用飞书 contact API 获取头像：

```typescript
// 在 members.push 循环后，添加头像获取
for (const m of members) {
  try {
    const profile = await client.contact.user.get({
      path: { user_id: m.openId },
      params: { user_id_type: "open_id" },
    });
    m.avatarUrl = profile?.data?.user?.avatar?.avatar_240 ?? "";
  } catch {
    m.avatarUrl = "";
  }
}
```

需要扩展 members 数组的类型定义以包含 `avatarUrl`。

- [ ] **Step 2: 更新 upsert SQL 写入 avatar_url**

```typescript
const upsert = db.prepare(`
  INSERT INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, source_feishu_open_id, is_participant, is_excluded_from_board, status)
  VALUES (?, ?, ?, '', ?, '', 'student', ?, 1, 0, 'active')
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    source_feishu_open_id = excluded.source_feishu_open_id,
    avatar_url = excluded.avatar_url
`);
```

upsert.run 调用中加入 `s.avatarUrl`。

- [ ] **Step 3: 编译验证**

Run: `npx tsc --noEmit 2>&1 | grep "^src/" | head -5`
Expected: 零错误

- [ ] **Step 4: Commit**

```bash
git add src/scripts/sync-feishu-group-members.ts
git commit -m "feat: fetch member avatars from Feishu during sync"
```

---

### Task 6: 部署 + 创建 Base 题库表 + 运行同步 + 端到端验证

- [ ] **Step 1: Push 并部署到韩国服务器**

```bash
git push origin codex/phase-one-feishu
# 通过 aliyun CLI 执行 git pull + build + restart
```

- [ ] **Step 2: 在飞书 Base 中创建 quiz_bank 表**

通过 `feishuClient.createBaseTable` 或手动在飞书中创建。列：期数(数字)、题目(文本)、选项A(文本)、选项B(文本)、选项C(文本)、选项D(文本)、正确答案(单选A/B/C/D)。

- [ ] **Step 3: 在 quiz_bank 表中填入测试题目**

至少填入 2-3 道第 2 期的题目（当前活跃期）用于验证。

- [ ] **Step 4: 更新服务器 .env 中的 FEISHU_BASE_QUIZ_TABLE**

设置为新创建的 tableId，重启服务。

- [ ] **Step 5: 在服务器运行成员同步获取头像**

```bash
node dist/scripts/sync-feishu-group-members.js
```

- [ ] **Step 6: 端到端验证**

1. 发"测验" → 确认卡片显示 Base 中的题目（非 demo）
2. 点选项 + 提交 → 确认评分正确
3. 访问 Dashboard → 确认头像显示
4. 确认排行榜分数非 0（如果有评分事件）
