# 飞书 Base 题库管理 + Dashboard 修复 设计文档

> 日期: 2026-04-13
> 状态: 待审核

---

## 1. 概述

两个任务：
1. **题库管理**：运营人员（无代码经验）通过飞书多维表格管理测验题目，培训师发"测验"时 Bot 自动从表格读取题目并发卡片
2. **Dashboard 修复**：修复排行榜头像缺失和分数为 0 的问题

---

## 2. 任务1：飞书 Base 题库管理

### 2.1 运营流程

```
培训师在飞书 Base 多维表格中填写题目
  ↓
培训师在群里发"测验"
  ↓
Bot 从 Base 读取当前期的题目
  ↓
Bot 发送测验卡片到群
  ↓
学员点选项 → 点提交 → 系统自动计分（K2）
```

### 2.2 题库表结构

在现有 Base（appToken: `OiclbQXUqaNmY8sthCqc5nbtn7b`）中新建表 `quiz_bank`。

| 列名 | 字段类型 | 说明 |
|------|---------|------|
| 期数 | 数字 | 第几期课程（1, 2, 3...），用于筛选当前期题目 |
| 题目 | 多行文本 | 题目内容 |
| 选项A | 文本 | 选项 A 的内容 |
| 选项B | 文本 | 选项 B 的内容 |
| 选项C | 文本 | 选项 C 的内容（可为空，支持 2-4 个选项） |
| 选项D | 文本 | 选项 D 的内容（可为空） |
| 正确答案 | 单选 | 下拉选 A / B / C / D |

### 2.3 系统读取逻辑

新建 `src/services/feishu/quiz-bank.ts`：

```typescript
interface QuizBankDeps {
  feishuClient: FeishuApiClient;
  appToken: string;
  tableId: string;
}

async function fetchQuizByPeriod(
  deps: QuizBankDeps,
  periodNumber: number
): Promise<QuizCardState | null>
```

流程：
1. 调用 `searchBaseRecords({ appToken, tableId, fieldName: "期数", fieldValue: String(periodNumber) })`
2. 将每行记录转换为 `QuizQuestion`：
   - `id` = recordId
   - `text` = 题目字段
   - `options` = 选项A~D（跳过空值）
   - `isCorrect` = 选项 ID 匹配"正确答案"字段值
3. 组装为 `QuizCardState`，setCode = `period-${periodNumber}`
4. 空结果返回 null（培训师未录入题目）

### 2.4 触发逻辑改造

`message-commands.ts` 中的 `handleQuizTrigger`：
- 从 `deps.lifecycle.getActivePeriod()` 获取当前期号
- 调用 `fetchQuizByPeriod(periodNumber)` 从 Base 读取题目
- 若无题目：发文字消息"当前期暂无测验题目，请在飞书多维表格中录入"
- 若有题目：构建卡片并发送

### 2.5 Quiz Resolver 改造

`app.ts` 中的 `quizSetResolver`：
- 从 `setCode` 解析 periodNumber（`period-1` → 1）
- 调用 `fetchQuizByPeriod` 获取带正确答案的题目
- 供 `quizSubmitHandler` 计算正确率

### 2.6 环境变量

新增：
```
FEISHU_BASE_QUIZ_TABLE=<创建后填入>
```

### 2.7 Bootstrap

在 `bootstrap-feishu.ts` 中添加 quiz_bank 表的自动创建逻辑（如果不存在）。或手动在飞书 Base 中创建后配置 tableId。

---

## 3. 任务2：Dashboard 修复

### 3.1 问题诊断

| 问题 | 根因 | 修复方案 |
|------|------|---------|
| 头像为 null | `sync-feishu-group-members.ts` 同步成员时未获取头像 | 同步时调用 `getMemberProfile` 获取 avatarUrl 写入 DB |
| 分数为 0 | 评分事件写入 `v2_scoring_item_events` 但未关联活跃 period | 确认 Ingestor 能找到活跃 period 并写入维度分数 |

### 3.2 头像修复

修改 `sync-feishu-group-members.ts`：
1. 同步群成员时，对每个成员调用 `client.contact.user.get({ user_id: openId })` 获取头像 URL
2. 将 `avatarUrl` 写入 members 表的 `avatar_url` 字段
3. 现有成员使用 `ON CONFLICT DO UPDATE` 更新头像

### 3.3 分数修复

检查 Ingestor 的 `findActivePeriod()` 返回值：
- 确认 v2_periods 表有活跃期记录
- 确认 v2_member_dimension_scores 表在 Ingestor 写入后有增量
- Dashboard 的 `fetchRankingByCamp` SQL 已正确 JOIN 维度分数表

---

## 4. 不做的事

- 不做题库的版本管理/审核流程 — 培训师直接编辑即生效
- 不做选项数量自适应卡片 — 固定 A/B/C/D 四选项（空选项跳过）
- 不做 Dashboard 的实时 WebSocket 推送 — 刷新页面获取最新数据
- 不做头像本地缓存/CDN — 直接使用飞书 avatar URL

---

## 5. 文件变更清单

| 文件 | 变更 |
|------|------|
| `src/services/feishu/quiz-bank.ts` | **新建** — Base 题库读取 |
| `src/services/feishu/message-commands.ts` | 改造 handleQuizTrigger，从 Base 读取 |
| `src/app.ts` | 改造 quizSetResolver，从 Base 读取 |
| `src/scripts/sync-feishu-group-members.ts` | 添加头像获取 |
| `.env` | 新增 `FEISHU_BASE_QUIZ_TABLE` |
| `.env.example` | 新增 `FEISHU_BASE_QUIZ_TABLE` |
