# AI Seed Project 完整上线计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**日期**: 2026-04-13
**目标**: 完整上线，全部功能测试跑通
**决策**: 服务器迁移到阿里云中国香港 SWAS + 域名 + HTTPS
**架构转型**: 学员侧从卡片驱动改为 Bot 自动捕获群消息

---

## 关键决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 服务器 | 香港 SWAS | 免备案、保留 Dashboard、最快上线 |
| 学员交互 | 自动捕获群消息 | 卡片设计过重，反人性 |
| 管理员交互 | 保留管理面板卡片 | 已验证可工作 |
| 评分项 | 保持 15 项不变 | 但触发方式改为自动 |
| 仅保留的卡片 | K2 测验 + S1 互评 | 结构化交互无法替代 |

---

## Phase 0: 服务器迁移（人工 + AI 协作）

### Task 0.1: 购买香港 SWAS（人工）
- [ ] 阿里云控制台购买中国香港 SWAS（推荐 2C2G/40G ESSD）
- [ ] 记录实例 ID、公网 IP

### Task 0.2: 购买域名（人工）
- [ ] 购买域名（如 hbu-ai.com 或类似）
- [ ] 配置 DNS A 记录指向香港 SWAS IP

### Task 0.3: 服务器初始化（AI 执行）
**文件**: `scripts/ops/bootstrap-server.sh`
- [ ] SSH 到香港服务器，运行 bootstrap 脚本
- [ ] 安装 Node.js 20+、SQLite、git
- [ ] 配置 systemd 服务
- [ ] 配置 HTTPS（Let's Encrypt + Nginx 或 Caddy）

### Task 0.4: 应用部署（AI 执行）
- [ ] 克隆仓库到 `/opt/ai-seed-project`
- [ ] 切换到 `codex/phase-one-feishu` 分支
- [ ] 复制 `.env` 并更新域名相关变量
- [ ] `npm install && npm run build`
- [ ] 配置 systemd 并启动
- [ ] 验证 `https://domain/api/health` 和 `https://domain/dashboard/`

### Task 0.5: 飞书和 LLM 配置验证（AI 执行）
- [ ] 更新 `FEISHU_LEARNER_HOME_URL`
- [ ] 更新 `FEISHU_OPERATOR_HOME_URL`
- [ ] 更新 `FEISHU_LEADERBOARD_URL`
- [ ] 验证 WS 连接正常（发"管理"测试）
- [ ] **测试 LLM 连通性**：从香港服务器 `curl https://open.bigmodel.cn/api/paas/v4` 确认延迟
- [ ] 如 GLM 延迟过高（>5s），切换 `LLM_PROVIDER=dashscope` 或 `openai_compatible`
- [ ] 测试飞书 API 从香港的连通性

### Task 0.6: 杭州服务器保留回滚
- [ ] 杭州服务器保留 14 天作为回滚位
- [ ] 14 天后评估是否关闭

---

## Phase 1: 自动捕获系统（核心架构改造）

### Task 1.1: 消息意图分类器
**文件**: 新建 `src/services/feishu/message-classifier.ts`

设计自动识别学员消息类型的分类器：

```
规则优先级（从高到低）：
1. 精确关键词：
   - "签到" / "打卡" → K1 每日打卡
   - "完成" + "视频" → H3/G1 视频打卡
2. 内容特征：
   - 消息含 URL → G2 课外资源
   - 消息含图片/文件附件 → H2 实操分享 或 H1 作业提交
3. LLM 分类（文本≥20字）：
   - 知识总结 → K3
   - AI 纠错 → K4
   - 创意用法 → C1
   - 提示词模板 → C3
4. 管理员关键词（已实现）：
   - "管理" → 管理面板
```

- [ ] 实现 `classifyMessage(text, attachments, memberId)` → `ScoringItemCode | null`
- [ ] 对于需要 LLM 分类的消息，使用现有 LLM Worker
- [ ] 分类后调用现有 Ingestor 管道
- [ ] 单元测试覆盖所有分类规则

### Task 1.2: 集成到 onMessage
**文件**: `src/services/feishu/message-commands.ts`, `src/app.ts`

- [ ] 在现有 `onMessage` 中，"管理" 关键词之后添加自动分类逻辑
- [ ] 非管理员/培训师的消息 → 走分类器
- [ ] 分类成功 → 调用 Ingestor → Bot 回复确认（文字消息，非卡片）
- [ ] 分类失败或不匹配 → 静默忽略（不打扰群聊）

### Task 1.3: Bot 确认消息
**文件**: 新建 `src/services/feishu/auto-reply.ts`

操作成功后 Bot 发一条简短的文字回复（不是卡片）：
```
✅ @学员名 签到成功！K +3
✅ @学员名 实操分享已提交，等待审核
✅ @学员名 课外资源已记录！G +3
```

- [ ] 实现 `sendConfirmReply(chatId, memberId, itemCode, status)`
- [ ] 使用 `im.message.reply` API 回复原消息（而非新发消息）
- [ ] 控制频率：同一学员同一评分项 5 分钟内不重复确认

### Task 1.4: 图片/文件处理
**文件**: `src/services/feishu/message-classifier.ts`

- [ ] 通过 `im.message.resource` API 下载图片/文件
- [ ] 图片 → 传给 LLM 多模态评分（已有 GLM-4v 集成）
- [ ] PDF → 提取文本或传给多模态模型
- [ ] 大文件（>10MB）→ 跳过，提示学员压缩

---

## Phase 2: 保留的卡片功能

### Task 2.1: 测验卡片（K2）触发
**文件**: `src/services/feishu/message-commands.ts`

- [ ] 培训师发"测验"→ Bot 发测验卡片
- [ ] 需要题库数据源：`data/quiz/period-{n}.json`
- [ ] 测验 Handler 已完成，只需接通触发

### Task 2.2: 互评投票卡片（S1）触发
**文件**: `src/services/feishu/message-commands.ts`

- [ ] 培训师发"互评"→ Bot 发互评卡片
- [ ] 互评 Handler 已完成，只需接通触发

### Task 2.3: 测验题库管理
**文件**: 新建 `data/quiz/` 目录

- [ ] 每期一个 JSON 文件：`period-1.json`, `period-2.json` ...
- [ ] 格式：`{ questions: [{ q: "问题", options: ["A","B","C","D"], answer: 0 }] }`
- [ ] 管理面板增加"当前期测验题数"状态显示

---

## Phase 3: Dashboard 与运营工具

### Task 3.1: Dashboard 适配新域名
**文件**: `apps/dashboard/src/lib/api.ts`, `apps/dashboard/vite.config.ts`

- [ ] API_BASE 改为相对路径（当前已是 ""，无需改）
- [ ] 验证 HTTPS 下 Dashboard 正常加载
- [ ] 验证排行榜实时更新

### Task 3.2: 管理员审核优化
**文件**: `src/services/feishu/cards/handlers/review-handler.ts`

- [ ] 审核卡片自动推送到群（LLM 完成后，已有此链路）
- [ ] 管理员点击批准/拒绝 → toast 确认
- [ ] 审核完成后 Bot 发文字消息通知学员

### Task 3.3: 数据重置脚本
**文件**: `src/scripts/reset-for-launch.ts`

- [ ] 已有重置脚本，验证可用
- [ ] 上线前执行：清除测试数据，保留成员信息

---

## Phase 4: 上线与验收

### Task 4.1: Smoke Test
- [ ] 管理面板全流程：开期 → 开窗 → 刷新 → 毕业
- [ ] 自动捕获：学员发"签到" → Bot 确认 → 分数入账
- [ ] 自动捕获：学员发截图 → LLM 评分 → 审核 → 分数入账
- [ ] 自动捕获：学员发 URL → Bot 确认 → 分数入账
- [ ] 测验：培训师发"测验" → 学员答题 → 分数入账
- [ ] Dashboard：排行榜显示正确分数
- [ ] HTTPS：域名访问正常

### Task 4.2: 安全检查
- [ ] 飞书 App Secret 已轮换
- [ ] 阿里云 AK/SK 已轮换
- [ ] .env 不在 git 中
- [ ] HTTPS 证书有效

### Task 4.3: 正式上线
- [ ] 执行数据重置
- [ ] 通知培训师使用流程
- [ ] 更新管理员操作手册
- [ ] 开始第 1 期（破冰期）

---

## 优先级排序

```
P0 — 上线前必须完成（阻塞上线）:
  ├── Phase 0: 服务器迁移（正在进行）
  ├── Task 1.1: 消息意图分类器
  ├── Task 1.2: 集成到 onMessage
  ├── Task 1.3: Bot 确认消息
  └── Task 4.1: Smoke Test

P1 — 上线前应完成（影响功能完整性）:
  ├── Task 1.4: 图片/文件处理
  ├── Task 2.1: 测验卡片触发
  ├── Task 2.2: 互评投票卡片触发
  └── Task 3.2: 管理员审核优化

P2 — 上线后完善:
  ├── Task 2.3: 测验题库管理
  ├── Task 3.3: 数据重置
  ├── Task 4.2: 安全检查
  └── 异步卡片刷新（patchCard/sendCard）
```

---

## 关键文件索引

| 文件 | 作用 | 当前状态 |
|------|------|---------|
| `src/services/feishu/ws-runtime.ts` | WS 运行时 | ✅ 完成 |
| `src/services/feishu/message-commands.ts` | 关键词触发 | ⚠️ 仅"管理"接通 |
| `src/services/feishu/cards/handlers/admin-panel-handler.ts` | 管理面板 | ✅ 完成 |
| `src/domain/v2/ingestor.ts` | 10 步评分管道 | ✅ 完成 |
| `src/domain/v2/scoring-items-config.ts` | 15 个评分项 | ✅ 完成 |
| `src/v2-production-wiring.ts` | 生命周期管理 | ✅ 完成 |
| `src/services/feishu/cards/adapters.ts` | 卡片适配器 | ⚠️ patchCard/sendCard 是 stub |
| `src/services/feishu/cards/router.ts` | HTTP 路由 | ✅ 完成但未使用 |
| `apps/dashboard/` | 排行榜 Dashboard | ✅ 完成 |
| `scripts/ops/deploy-app.sh` | 部署脚本 | ✅ 完成 |
| `scripts/ops/bootstrap-server.sh` | 服务器初始化 | ✅ 完成 |

---

## 经验教训参考

- 飞书 WS 卡片回调：`memory/project_feishu_ws_card_action_lessons.md`
- 飞书卡片 Skill：`.agents/skills/feishu-card-ws/SKILL.md`
- 部署技巧：`docs/skills/aliyun-swas-deploy.md`
- 香港迁移分析：`docs/hong-kong-public-ingress-decision-2026-04-12.md`

---

## 代码审计补充发现（2026-04-13 审计代理）

### 已完成的代码资产
- **17 种卡片模板** 全部完成（15 个 .ts 文件 + common/ 子目录）
- **12 个卡片 Handler** 全部完成（含 daily-checkin, quiz, homework, video-checkin, peer-review 等）
- **评分配置** 13 个评分项完整定义（scoring-items-config.ts）
- **路由** 17 种 cardType 的 action routing 完整（router.ts 188 行）
- **测试** 562 个测试通过

### 适配器 Stub 状态
`src/services/feishu/cards/adapters.ts` 中以下方法是 stub（throw on call）：
- `insertLiveCard` — 需要实现（用于异步卡片刷新）
- `closeLiveCard` — 需要实现
- `findEventById` — 需要实现
- `listReviewRequiredEvents` — 需要实现
- `listPriorQuizSelections` — 需要实现
- `insertPeerReviewVote` — 需要实现
- `insertReactionTrackedMessage` — 需要实现

**注意**：这些 stub 不影响当前管理面板功能，但接通测验/互评/审核时需要补全。

### message-commands.ts 现状
仅 131 行，只处理"管理"/"管理面板"/"控制面板"三个关键词。
需要在此文件添加自动捕获逻辑（意图分类器）。

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Node.js + Fastify + TypeScript |
| 数据库 | SQLite (better-sqlite3) |
| 前端 | React + Vite (Dashboard) |
| 飞书 SDK | @larksuiteoapi/node-sdk v1.60.0 |
| LLM | Qwen/GLM-4v via OpenAI-compatible API |
| 部署 | 阿里云 SWAS + systemd |
| 事件接收 | WebSocket 长连接 |
| 测试 | Vitest (562 tests passing) |
