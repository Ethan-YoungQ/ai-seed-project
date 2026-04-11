# Session Handoff: Phase 2 完成 → Phase 3 接续

> 日期：2026-04-12
> 状态：Phase 2（缺陷修复 + 加固）已完成，准备进入 Phase 3（上线准备）
> 上线目标日：2026-04-15（周二）

---

## 1. 项目概览

**项目名称：** Pfizer HBU AI 训练营评估系统（辉瑞 HBU AI 训练营）

**核心定位：** 飞书群内的游戏化学习评分系统，学员在群里打卡、答题、互动，AI 自动评分 + 管理员审核，实时排行榜 + 段位晋升。

**团队构成：**
- 非技术 PM：YongQ（项目管理者）
- 3 位培训师（operator/trainer 角色）
- 14 名正式学员（student 角色，4/15 入群）
- 飞书群名：HBU奇点玩家

**部署地址：** http://114.215.170.79:3000

---

## 2. 技术架构

### 技术栈
- **后端框架：** TypeScript + Fastify 5.x
- **数据库：** SQLite（better-sqlite3）
- **飞书集成：** @larksuiteoapi/node-sdk 1.42.x（WebSocket 长连接 + 卡片协议 schema 2.0）
- **LLM 评分：** 智谱 GLM-4.7（文本）/ GLM-4.6v（视觉）
- **前端 Dashboard：** React 19 + Vite（静态文件由 Fastify 托管于 `/dashboard/`）
- **部署：** 阿里云 SWAS 轻量应用服务器，systemd 管理

### 关键文件
| 文件 | 职责 |
|------|------|
| `src/server.ts` | 生产入口，创建 repo → wireV2Production → createApp |
| `src/app.ts` | Fastify 应用定义，路由注册，WebSocket 回调，卡片协议 |
| `src/v2-production-wiring.ts` | v2 领域服务工厂（Ingestor, Aggregator, PeriodLifecycle, AdminPanel） |
| `src/services/feishu/message-commands.ts` | 群消息关键词触发处理（"管理" → 发送管理面板卡片） |
| `src/services/feishu/cards/templates/admin-panel-v1.ts` | 管理员面板卡片模板（schema 2.0，column_set 布局） |
| `src/services/feishu/cards/handlers/admin-panel-handler.ts` | 面板卡片回调处理（开期、开窗、毕业、刷新） |
| `src/services/feishu/ws-runtime.ts` | WebSocket 长连接运行时 |
| `src/services/feishu/client.ts` | 飞书 API 客户端（Lark SDK 封装） |
| `src/services/feishu/normalize-message.ts` | 飞书消息标准化 |
| `src/storage/sqlite-repository.ts` | SQLite 数据仓库（所有 DB 操作） |
| `src/domain/v2/ingestor.ts` | 评分事件摄入管道 |
| `src/domain/v2/aggregator.ts` | 评分聚合计算 |
| `.env` | 运行时配置（飞书凭据、LLM key、数据库路径） |

### 启动流程
```
server.ts
  → loadLocalEnv()
  → new SqliteRepository(databaseUrl)
  → wireV2Production(repo) → { ingestor, aggregator, periodLifecycle, windowSettler, llmWorker, adminPanelLifecycle }
  → createApp({ ...v2deps })
    → Fastify 实例化
    → WebSocket 回调绑定（onMessage → message-commands handler）
    → 卡片协议路由注册（feishuCardsPlugin + CardActionDispatcher）
    → v2 API 路由注册（events, periods, windows, graduation, board, admin-review, admin-members, llm-status）
  → app.listen({ port: 3000, host: "0.0.0.0" })
```

---

## 3. 当前分支和工作目录

| 项目 | 值 |
|------|---|
| 主 worktree 路径 | `D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu` |
| 分支 | `codex/phase-one-feishu` |
| 远程仓库 | `https://github.com/Ethan-YoungQ/ai-seed-project.git`（私有） |
| 主分支 | `main` |
| 基线分支 | `codex/integration-baseline`（原始 worktree 所在） |

---

## 4. 已完成的工作

### Phase 1: 核心功能实现
- 飞书 WebSocket 长连接接入
- 评分事件摄入管道（EventIngestor）
- 评分聚合计算（ScoringAggregator）
- 周期/窗口/段位生命周期管理
- 飞书卡片协议（签到、知识分享、审核等）
- LLM 自动评分（GLM-4.7 文本 + GLM-4.6v 视觉）
- React 19 Dashboard（排行榜、成员详情、段位历史）
- 562 单元/集成测试通过

### Phase 2: 管理员控制面板 + 修复 + 加固
- **方案 D：管理员控制面板** — 群里发"管理"触发，发送交互式卡片
  - 开期（选择 1-12 期，自动关闭上一期）
  - 开窗（W1-W5 / FINAL）
  - 毕业结算
  - 状态刷新
- **AdminPanelLifecycleDeps** 完整绑定到生产环境（v2-production-wiring.ts）
- **K3 LLM 评分 500 错误修复** — 生产环境 ingestor 缺失导致的空指针
- **飞书卡片 schema 2.0 兼容** — `action` 标签已废弃，全部替换为 `column_set`
- **14 并发压力测试脚本** — 模拟 14 名学员同时提交
- **管理员 open_id 绑定** — 3 位管理员的 feishu_open_id 已写入 members 表
- **安全审查修复** — seed guard, CORS, mock gate, sourceRef idempotency

---

## 5. 当前数据库成员状态

| id | name | role_type | feishu_open_id | 说明 |
|---|---|---|---|---|
| user-ops | YongQ | trainer | `ou_789911abef736a08f44286493d3285c5` | PM / 管理员 |
| user-trainer | Karen | trainer | `ou_84bdbb1c09ed08547cb700a15acdd0c8` | 培训师 |
| user-dorothy | Dorothy Shi | trainer | `ou_0f43d5637375d7914b609b33e8672753` | 培训师 |
| user-huangxy | 黄小燕 | student | `ou_059edde5436664caa3b3e2fab4d6a25b` | 测试学员 |
| user-alice | Alice | student | (demo) | Demo 数据，需清除 |
| user-bob | Bob | student | (demo) | Demo 数据，需清除 |
| user-charlie | Charlie | student | (demo) | Demo 数据，需清除 |
| user-diana | Diana | student | (demo) | Demo 数据，需清除 |

---

## 6. 阿里云部署信息

| 项目 | 值 |
|------|---|
| 服务器类型 | SWAS 轻量应用服务器（**不是 ECS**，API 不同） |
| 地域 | cn-hangzhou |
| 实例 ID | `0cf24a62cd3a463baf31c196913dc3cd` |
| 公网 IP | 114.215.170.79 |
| 部署目录 | `/opt/ai-seed-project` |
| 服务管理 | systemd → `ai-seed-project.service` |
| 云助手 | 可用，通过 `swas-open run-command` 执行远程命令 |
| Aliyun CLI 路径 | `C:\Users\qiyon\Desktop\aliyun-cli-windows-latest-amd64\aliyun.exe` |
| CLI Profile | `deploy-temp`（AK/SK 模式，region cn-hangzhou） |

> **安全提醒：** AK/SK 已在之前的聊天中暴露，需要轮换。

---

## 7. 部署流程（标准操作）

### 方法 A：Git Pull（网络允许时）
```bash
ALIYUN="C:\Users\qiyon\Desktop\aliyun-cli-windows-latest-amd64\aliyun.exe"

# 1. 本地 commit + push
git push origin codex/phase-one-feishu

# 2. 服务器执行 git pull（需要 GitHub token）
GH_TOKEN=$(gh auth token)
$ALIYUN swas-open RunCommand \
  --InstanceId 0cf24a62cd3a463baf31c196913dc3cd \
  --Type RunShellScript \
  --CommandContent "cd /opt/ai-seed-project && git pull https://${GH_TOKEN}@github.com/Ethan-YoungQ/ai-seed-project.git codex/phase-one-feishu" \
  --profile deploy-temp

# 3. 构建 + 重启
$ALIYUN swas-open RunCommand \
  --InstanceId 0cf24a62cd3a463baf31c196913dc3cd \
  --Type RunShellScript \
  --CommandContent "cd /opt/ai-seed-project && npm run build && systemctl restart ai-seed-project" \
  --profile deploy-temp

# 4. 验证
$ALIYUN swas-open RunCommand \
  --InstanceId 0cf24a62cd3a463baf31c196913dc3cd \
  --Type RunShellScript \
  --CommandContent "curl -s http://localhost:3000/api/health" \
  --profile deploy-temp
```

### 方法 B：Base64 直接写入（GitHub 连接超时时的备选）
```bash
# 将文件内容 base64 编码后直接写入服务器
FILE_CONTENT=$(base64 -w0 path/to/file)
$ALIYUN swas-open RunCommand \
  --InstanceId 0cf24a62cd3a463baf31c196913dc3cd \
  --Type RunShellScript \
  --CommandContent "echo '${FILE_CONTENT}' | base64 -d > /opt/ai-seed-project/target/path" \
  --profile deploy-temp
```

### 查看远程命令执行结果
```bash
$ALIYUN swas-open DescribeInvocationResult \
  --InvokeId <上一步返回的 InvokeId> \
  --InstanceId 0cf24a62cd3a463baf31c196913dc3cd \
  --profile deploy-temp
```

---

## 8. 飞书配置

| 项目 | 值 |
|------|---|
| App ID | `cli_a95a5b91b8b85cce` |
| 群聊 ID | `oc_a867f87170ab5e892b86ffc2de79790b` |
| 群名 | HBU奇点玩家 |
| 事件接收模式 | WebSocket 长连接 |
| 关键词触发 | "管理" / "管理面板" / "控制面板" → 发送管理员面板卡片 |
| 卡片回调 URL | `http://114.215.170.79:3000/api/v2/feishu/card-action` |
| Dashboard URL | `http://114.215.170.79:3000/dashboard/` |

### 飞书权限范围
- `im:message` — 读取消息
- `im:message:send_as_bot` — Bot 发消息
- `im:chat:readonly` — 读取群信息
- `im:resource` — 读取消息资源
- `contact:user.id:readonly` — 获取用户 ID
- `bitable:app` — 多维表格读写

---

## 9. Phase 3 待办清单（4/14 — 上线准备）

### 数据操作
- [ ] 清除 4 个 Demo 学员（user-alice, user-bob, user-charlie, user-diana）
- [ ] 清除测试期间的评分事件、快照、段位记录
- [ ] 保留 members 表中的 3 位管理员，重置分数

### 成员导入
- [ ] 获取 14 名正式学员的姓名 + 飞书 open_id
- [ ] 通过 API 或 seed 脚本导入到 members 表
- [ ] 绑定每位学员的 feishu_open_id

### 飞书群配置
- [ ] 确认使用现有群还是创建正式群
- [ ] 如新群：更新 `.env` 中的 `FEISHU_BOT_CHAT_ID`
- [ ] 添加 Bot 到正式群
- [ ] 添加 Dashboard Tab 页签到群设置

### 安全
- [ ] 轮换 `FEISHU_APP_SECRET`
- [ ] 轮换阿里云 AK/SK（已在聊天中暴露）
- [ ] 更新 Aliyun CLI profile `deploy-temp`

### 验证
- [ ] 运行最终健康检查（health + feishu/status 全绿）
- [ ] 管理员在正式群发"管理"测试面板
- [ ] 管理员点击卡片按钮测试回调
- [ ] Dashboard 显示 14 人排行榜
- [ ] 上线前最后一次数据库备份

---

## 10. Phase 4 待办（4/15 — D-Day 上线）

详细检查清单参见：`docs/launch-blueprint-2026-04-15.md`

简要流程：
1. 09:00 管理员最终确认系统状态
2. 09:30 邀请 14 名学员入群
3. 10:00 Bot 发送欢迎消息 + 操作指引
4. 10:30 管理员执行"管理" → 开启 Period 1（破冰期）
5. 11:00 学员开始首次互动
6. 全天管理员监控 Dashboard + 审核队列

---

## 11. 用户偏好

| 偏好 | 说明 |
|------|------|
| 语言 | 所有输出用中文，技术标识符保持英文 |
| 自主执行 | 最少提问，自选最佳方案，仅在真正的 gating decision 时提问 |
| 技术深度 | 非技术背景，避免 API/代码细节，用操作步骤描述 |
| 工具链 | 使用 ECC/Superpowers plugins |
| 并行执行 | 独立任务用 agent teams 并行 |

---

## 12. 关键经验教训（坑点记录）

### 飞书卡片
- **schema 2.0 不支持 `action` 标签** — 必须用 `column_set` + `column` 替代，否则卡片渲染失败但无明确错误
- **select_static 的 value 提取** — 有 3 种路径（form_value、actionPayload 直接、value 对象嵌套），handler 需要全部检查

### 飞书消息
- **rawText 含 @mention 前缀** — 格式为 `@_user_1 管理`，需要 `stripAtMentionPrefix()` 后再匹配关键词
- **WebSocket onMessage callback 必须有 try/catch** — 否则错误被 Lark SDK 静默吞掉，无任何日志

### 成员匹配
- **findMemberByOpenId 依赖 source_feishu_open_id 列** — 成员必须预先在 members 表中绑定 open_id，否则权限检查永远失败

### 服务器
- **SWAS 不是 ECS** — API 是 `swas-open` 而非 `ecs`，所有命令参数不同
- **GitHub 从服务器直连经常超时** — 备选方案是 base64 编码文件内容直接写入
- **RunCommand 是异步的** — 执行后需要用 `DescribeInvocationResult` 查看结果

### LLM
- **K3 评分曾返回 500** — 原因是生产环境 ingestor/aggregator 未注入导致空指针，已通过 v2-production-wiring.ts 修复
- **GLM-4.7 推荐生产使用** — 盲评准确率 100% + 稳定性 83%

---

## 13. 环境变量参考

完整模板见 `.env.example`，关键变量：

```env
# 服务
PORT=3000
APP_ENV=production
DATABASE_URL=./data/app.db

# 飞书
FEISHU_APP_ID=cli_a95a5b91b8b85cce
FEISHU_APP_SECRET=<需轮换>
FEISHU_EVENT_MODE=long_connection
FEISHU_BOT_CHAT_ID=oc_a867f87170ab5e892b86ffc2de79790b

# LLM
LLM_ENABLED=true
LLM_PROVIDER=glm
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_TEXT_MODEL=glm-4.7
LLM_VISION_MODEL=glm-4.6v
LLM_CONCURRENCY=3
LLM_RATE_LIMIT_PER_SEC=5

# 管理员自动提权
BOOTSTRAP_OPERATOR_OPEN_IDS=ou_789911abef736a08f44286493d3285c5
```

---

## 14. npm 脚本参考

| 命令 | 用途 |
|------|------|
| `npm run dev` | 本地开发（tsx watch） |
| `npm run build` | TypeScript 编译 |
| `npm test` | 运行 vitest 测试 |
| `npm run seed:ensure` | 确保数据库基线数据 |
| `npm run seed:demo` | 插入 Demo 数据 |
| `npm run bootstrap:feishu` | 飞书初始化引导 |

---

## 15. Git 提交历史（关键节点）

```
fdbd475 fix: replace deprecated action tag with column_set for Feishu card schema 2.0
23eff54 feat: admin panel card + K3 LLM fix + production wiring
3b7d7cf fix(smoke-test): adapt tests to production behavior
ecd95b4 feat: wire v2 domain services in production entry point
bb55379 fix(security): address security review findings for deployment
8732cba fix: address 5 HIGH code review findings
dd303cf chore(sub4): update LLM config with blind eval recommendations
edbf6c7 feat(dashboard): add Fastify static serving and system status page
340ffb1 feat(dashboard): add animations, responsive layouts, and accessibility
f7146b4 feat(dashboard): scaffold Vite + React 19 + TypeScript dashboard
```

---

## 16. 新线程启动提示词（Resume Prompt）

复制以下内容作为新线程的第一条消息：

---

```
我正在继续 Pfizer HBU AI 训练营评估系统的开发。

请先阅读 handoff 文档了解完整上下文：
D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\docs\handoffs\2026-04-12-phase2-completion-handoff.md

当前状态：
- 工作目录：D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu
- 分支：codex/phase-one-feishu
- Phase 2（管理员面板 + 缺陷修复 + 加固）已完成
- 部署地址：http://114.215.170.79:3000
- 系统已在阿里云 SWAS 服务器运行

下一步工作（Phase 3 — 4/14 上线准备）：
1. 清除 4 个 Demo 学员（user-alice/bob/charlie/diana），保留 3 位管理员
2. 等我提供 14 名正式学员的飞书 open_id 列表后导入
3. 轮换 FEISHU_APP_SECRET 和阿里云 AK/SK
4. 最终验证部署

详细计划参见：docs/launch-blueprint-2026-04-15.md
管理员操作手册：docs/admin-guide.md

用户偏好：中文输出，自主执行，最少提问。
```

---

*文档生成时间：2026-04-12*
*生成者：Claude Code Agent*
