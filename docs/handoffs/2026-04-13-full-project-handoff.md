# AI Seed Project 完整交接文档

> 给没有任何 context 的新线程。目标：上手就能开发，知道项目来龙去脉。

---

## 一句话概述

辉瑞 HBU AI 训练营评估系统——飞书群 Bot + 自动评分 + 排行榜 Dashboard。管理员通过飞书卡片管理（已完成），学员通过群聊自然交互（待实现），Bot 自动捕获消息并 LLM 评分。

---

## 1. 项目背景

### 1.1 业务场景
辉瑞中国 HBU 事业部举办 AI 培训营，12 期课程。系统用 5 维 AQ 评分（知识/动手/创造/社交/成长）评估学员表现，15 个评分项，段位从🌱到⚡共 5 级。

### 1.2 技术架构
```
飞书群 ←→ Bot (WS长连接) ←→ Fastify 后端 ←→ SQLite
                                    ↕
                              LLM Worker (Qwen/GLM-4v)
                                    ↕
                              Dashboard (React/Vite)
```

### 1.3 当前分支和工作树
- **主分支**: `codex/phase-one-feishu`
- **工作树**: `D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu`
- **服务器**: 阿里云杭州 SWAS 114.215.170.79（即将迁移到香港）

---

## 2. 当前状态

### 2.1 已完成（✅ 已验证可工作）
| 功能 | 说明 |
|------|------|
| 管理面板卡片 | 群内发"管理" → 卡片弹出 → 开期/开窗/毕业/刷新全可用 |
| 排行榜 Dashboard | http://114.215.170.79:3000/dashboard/ |
| WS 长连接 | im.message.receive_v1 + card.action.trigger 全部通过 EventDispatcher |
| 评分管道 | Ingestor 10 步验证 + Aggregator 决策 |
| LLM Worker | 异步 LLM 评分任务处理 |
| 段位系统 | 5 级段位自动计算 |
| 15 个评分项 | 配置和 Handler 全部完成 |
| 卡片模板 | 所有 17 种卡片模板已完成 |

### 2.2 未完成（❌ 上线阻塞）
| 功能 | 说明 | 优先级 |
|------|------|--------|
| 自动捕获群消息 | 学员发消息 → Bot 自动识别 → 评分 | P0 |
| 服务器迁移香港 | 域名 + HTTPS + 新 SWAS | P0 |
| 测验卡片触发 | 培训师发"测验"→ 发卡片 | P1 |
| 互评投票触发 | 培训师发"互评"→ 发卡片 | P1 |
| 安全凭据轮换 | FEISHU_APP_SECRET, Aliyun AK/SK | P2 |

### 2.3 数据库当前状态（测试数据）
- 3 个周期（第 1 期破冰 + 第 2 期 + 第 3 期）
- 2 个窗口（W1 关联 1+2，W2 关联 3）
- 4 个成员（3 trainer + 1 student）
- **上线前需执行 `npm run reset` 清除测试数据**

---

## 3. 关键架构决策

### 3.1 学员交互：自动捕获（非卡片）

**决策**：废除卡片驱动设计，改为 Bot 自动捕获群消息。

| 改前（卡片驱动） | 改后（自动捕获） |
|-----------------|-----------------|
| 培训师发关键词 → Bot 发卡片 → 学员点按钮 | 学员自然发消息/文件 → Bot 自动识别 |
| 15 项全靠卡片 | 10 项自动化 + 2 项保留卡片 + 3 项已自动 |

**只保留卡片的评分项**：K2 测验（选择题）、S1 互评投票（结构化投票）

### 3.2 服务器：迁移香港

**决策**：阿里云中国香港 SWAS + 域名 + HTTPS

- 免备案
- 保留现有 Dashboard
- 仍用阿里云体系（CLI/MCP/脚本不变）

详见：`docs/hong-kong-public-ingress-decision-2026-04-12.md`

### 3.3 WS 卡片回调限制

**已验证事实**：
- 卡片操作只能返回 toast，不能返回 card 更新（200672）
- form_submit 按钮事件不通过 WS 到达
- 下拉选择值需服务端缓存

详见：`memory/project_feishu_ws_card_action_lessons.md` 和 `.agents/skills/feishu-card-ws/SKILL.md`

---

## 4. 下一步开发计划

完整计划见：`docs/superpowers/plans/2026-04-13-launch-plan.md`

### 4.1 P0 任务（上线阻塞）

**Task 1: 服务器迁移**（用户正在购买香港 SWAS）
- 初始化新服务器
- 部署应用 + 配置 HTTPS
- 更新飞书环境变量

**Task 2: 消息意图分类器**（核心新功能）
- 新建 `src/services/feishu/message-classifier.ts`
- 规则优先：签到/URL/文件/视频 → 精确匹配
- LLM 兜底：长文本 → LLM 分类为 K3/K4/C1/C3
- 集成到 `message-commands.ts` 的 onMessage

**Task 3: Bot 确认回复**
- 操作成功后 Bot 发文字回复（非卡片）
- 格式：`✅ @学员名 签到成功！K +3`

### 4.2 P1 任务（功能完整性）

- 测验卡片触发（培训师发"测验"）
- 互评投票触发（培训师发"互评"）
- 图片/文件处理（下载 → LLM 多模态评分）

### 4.3 P2 任务（上线后完善）

- 异步卡片刷新（patchCard/sendCard）
- 测验题库管理
- 安全凭据轮换

---

## 5. 部署指南

### 5.1 阿里云 CLI
```bash
ALIYUN="/c/Users/qiyon/Desktop/aliyun-cli-windows-latest-amd64/aliyun.exe"
PROFILE="deploy-temp"
REGION="cn-hangzhou"  # 杭州，迁移后改为 cn-hongkong
INSTANCE="0cf24a62cd3a463baf31c196913dc3cd"  # 杭州实例，迁移后更新
```

### 5.2 部署方式
1. **小文件**（<10KB）：Base64 直写
2. **大文件**：git pull（香港服务器连 GitHub 应更稳定）
3. **紧急 patch**：直接 node -e 修改 dist JS

### 5.3 部署检查清单（每次必做）
1. `npm run build` 退出码 = 0（不用 `| tail` 管道）
2. `systemctl restart ai-seed-project`
3. 等待 `[ws] ws client ready` 日志
4. 等 2-3 分钟
5. 发"管理"确认卡片弹出
6. 测试按钮功能

详见：`docs/skills/aliyun-swas-deploy.md`

### 5.4 环境变量
```
PORT=3000
APP_ENV=production
DATABASE_URL=./data/app.db

# 飞书
FEISHU_APP_ID=cli_a95a5b91b8b85cce
FEISHU_APP_SECRET=<secret>
FEISHU_EVENT_MODE=long_connection
FEISHU_BOT_CHAT_ID=oc_a867f87170ab5e892b86ffc2de79790b
FEISHU_BOT_RECEIVE_ID_TYPE=chat_id
FEISHU_BASE_ENABLED=true
FEISHU_BASE_APP_TOKEN=OiclbQXUqaNmY8sthCqc5nbtn7b
FEISHU_BASE_MEMBERS_TABLE=tblZCvjCzzguQPUF
FEISHU_BASE_RAW_EVENTS_TABLE=tblDVP971lvEGOo2
FEISHU_BASE_SCORES_TABLE=tblOM8WqrywdNhBe
FEISHU_BASE_WARNINGS_TABLE=tblzJII00iyHdsb2
FEISHU_BASE_SNAPSHOTS_TABLE=tblrv8ZvKjmm4iPH
FEISHU_LEARNER_HOME_URL=<新域名>/dashboard/
FEISHU_OPERATOR_HOME_URL=<新域名>/dashboard/
FEISHU_LEADERBOARD_URL=<新域名>/dashboard/

# LLM（当前用智谱 GLM，从香港可能需要调整）
LLM_ENABLED=true
LLM_PROVIDER=glm
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_API_KEY=<key>
LLM_TEXT_MODEL=glm-4.7
LLM_VISION_MODEL=glm-4.6v
LLM_TIMEOUT_MS=60000
LLM_CONCURRENCY=3
```

### 5.5 香港迁移特别注意

| 风险 | 说明 | 应对 |
|------|------|------|
| **LLM 连通性** | 智谱 GLM API (open.bigmodel.cn) 是大陆服务，从香港访问可能有延迟或限制 | 迁移后测试延迟，必要时切换到阿里云 DashScope 或 OpenAI |
| **飞书 API** | feishu.cn 域名从香港访问应该正常（飞书有国际版 lark） | 验证 WS 连接稳定性 |
| **GitHub** | 香港连 GitHub 通常比大陆稳定 | git pull 部署应更可靠 |
| **SWAS 可用性** | 确认阿里云香港有 SWAS，否则需用 ECS | 购买前确认 |
| **systemd 服务** | 模板在 `deploy/systemd/ai-seed-project.service`，bootstrap 脚本自动配置 | 运行 bootstrap-server.sh |

---

## 6. 经验教训（重要！）

### 6.1 飞书卡片 WS 回调
- **必须读**：`memory/project_feishu_ws_card_action_lessons.md`
- **必须读**：`.agents/skills/feishu-card-ws/SKILL.md`
- 不要 monkey-patch、不要 form_submit、不要返回 card 更新

### 6.2 部署
- tsc 编译失败 + 管道吞退出码 = 静默用旧产物运行 → 功能回退
- 国内服务器 git pull 经常超时 → Base64 直写
- 频繁重启 WS 不稳定 → 等 2-3 分钟

### 6.3 幂等性
- 开期/开窗操作必须先查后插
- 已存在的资源 → early return，不执行后续逻辑

---

## 7. 15 个评分项速查

| 代码 | 名称 | 分值 | 触发方式 | 状态 |
|------|------|------|---------|------|
| K1 | 每日打卡 | 3 | 学员发"签到" → 自动 | 待实现 |
| K2 | 测验答题 | 10 | 培训师发"测验" → 卡片 | 待接通 |
| K3 | 知识总结 | 3 | 学员发长文 → LLM → 审核 | 待实现 |
| K4 | AI纠错 | 4 | 学员发长文 → LLM → 审核 | 待实现 |
| H1 | 作业提交 | 5 | 学员发文件 → 自动 | 待实现 |
| H2 | 实操分享 | 3 | 学员发截图+描述 → LLM → 审核 | 待实现 |
| H3 | 视频打卡 | 2 | 学员发"完成" → 自动 | 待实现 |
| C1 | 创意用法 | 4 | 学员发创意文本 → LLM → 审核 | 待实现 |
| C2 | 表情回应 | 1 | 自动（im.message.reaction） | ✅ |
| C3 | 提示词模板 | 5 | 学员发 prompt → LLM → 审核 | 待实现 |
| S1 | 互评投票(投) | 3 | 培训师发"互评" → 卡片 | 待接通 |
| S2 | 互评投票(被投) | 2 | 自动计算 | ✅ |
| G1 | 视频学习 | 3 | 学员发"完成" → 自动 | 待实现 |
| G2 | 课外资源 | 3 | 学员发 URL → 自动 | 待实现 |
| G3 | 全勤加成 | 4 | 自动聚合 | ✅ |

---

## 8. 关键文件索引

### 核心业务
| 文件 | 作用 |
|------|------|
| `src/domain/v2/scoring-items-config.ts` | 15 个评分项配置 |
| `src/domain/v2/ingestor.ts` | 10 步评分管道 |
| `src/domain/v2/aggregator.ts` | 决策聚合器 |
| `src/v2-production-wiring.ts` | 生命周期管理 |
| `src/storage/sqlite-repository.ts` | 数据访问层 |

### 飞书集成
| 文件 | 作用 |
|------|------|
| `src/services/feishu/ws-runtime.ts` | WS 运行时 |
| `src/services/feishu/message-commands.ts` | 关键词触发 |
| `src/services/feishu/client.ts` | 飞书 API 客户端 |
| `src/services/feishu/normalize-message.ts` | 消息标准化 |
| `src/services/feishu/config.ts` | 飞书配置 |

### 卡片系统
| 文件 | 作用 |
|------|------|
| `src/services/feishu/cards/templates/` | 所有卡片模板 |
| `src/services/feishu/cards/handlers/` | 所有卡片处理器 |
| `src/services/feishu/cards/card-action-dispatcher.ts` | 卡片动作分发 |
| `src/services/feishu/cards/adapters.ts` | 领域适配器 |
| `src/services/feishu/cards/router.ts` | HTTP 路由 |

### 前端
| 文件 | 作用 |
|------|------|
| `apps/dashboard/` | React 排行榜 Dashboard |
| `apps/dashboard/src/lib/api.ts` | API 调用层 |

### 运维
| 文件 | 作用 |
|------|------|
| `scripts/ops/deploy-app.sh` | 部署脚本 |
| `scripts/ops/bootstrap-server.sh` | 服务器初始化 |
| `src/scripts/reset-for-launch.ts` | 数据重置脚本 |

### 文档
| 文件 | 作用 |
|------|------|
| `docs/superpowers/plans/2026-04-13-launch-plan.md` | **完整上线计划** |
| `docs/project-status-and-redesign-2026-04-13.md` | 项目状态分析 |
| `docs/hong-kong-public-ingress-decision-2026-04-12.md` | 服务器迁移分析 |
| `docs/handoffs/2026-04-12-card-trigger-gaps.md` | 卡片断路清单 |
| `docs/admin-operations-manual.md` | 管理员操作手册 |
| `docs/skills/aliyun-swas-deploy.md` | SWAS 部署 Skill |
| `.agents/skills/feishu-card-ws/SKILL.md` | 飞书卡片 WS Skill |

### 经验教训
| 文件 | 作用 |
|------|------|
| `~/.claude/projects/.../memory/project_feishu_ws_card_action_lessons.md` | WS 卡片回调经验 |

---

## 9. 快速上手

### 第一步：读计划
```
docs/superpowers/plans/2026-04-13-launch-plan.md
```

### 第二步：确认服务器状态
```bash
ALIYUN="/c/Users/qiyon/Desktop/aliyun-cli-windows-latest-amd64/aliyun.exe"
"$ALIYUN" swas-open run-command --profile deploy-temp --biz-region-id cn-hangzhou \
  --instance-id 0cf24a62cd3a463baf31c196913dc3cd --type RunShellScript \
  --name "health" --command-content 'systemctl is-active ai-seed-project && curl -s http://localhost:3000/api/health'
```

### 第三步：按计划优先级执行
P0 → P1 → P2，每完成一个 Task 验证后再进下一个。

---

## 10. 适配器 Stub 状态

`src/services/feishu/cards/adapters.ts` 中以下方法目前是 throw-on-call stub：
- `insertLiveCard` — 异步卡片刷新需要
- `closeLiveCard` — 异步卡片刷新需要
- `findEventById` — 审核流程需要
- `listReviewRequiredEvents` — 审核队列需要
- `listPriorQuizSelections` — 测验防重复需要
- `insertPeerReviewVote` — 互评投票需要
- `insertReactionTrackedMessage` — C2 表情追踪需要

**接通测验（K2）和互评（S1）卡片前必须补全相关 stub。**
当前管理面板不依赖这些 stub，所以管理功能不受影响。

---

## 11. 审计发现摘要

- 17 种卡片模板 ✅ 全部完成
- 12 个卡片 Handler ✅ 全部完成
- 562 个测试 ✅ 通过
- 路由 ✅ 17 种 cardType 完整
- message-commands.ts ⚠️ 仅 131 行，仅处理"管理"关键词
- adapters.ts ⚠️ 7 个方法是 stub
- 日志 ⚠️ 生产日志较少（logger: false 在某些地方）
