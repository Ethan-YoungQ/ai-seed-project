<div align="center">

# AI Seed Project

### Feishu Bot + LLM + Gamified Dashboard

**群聊即课堂，发言即评分，成长可视化。**

一套零摩擦、全自动、AI 驱动的培训评估系统。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-000?logo=fastify)](https://fastify.dev/)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite)](https://sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## What is this?

AI Seed Project 是一套**飞书原生的智能培训评估系统**——为企业 AI 培训营场景设计的「零摩擦、全自动、AI 驱动」评估方案。

系统通过飞书机器人 7x24 小时自动捕获群聊中的学习行为（文字、图片、文件、表情互动），利用**规则引擎 + LLM 多模态双引擎**进行内容分类和评分，并在赛博朋克风格的实时 Dashboard 上展示排行榜、五维能力雷达图和成长轨迹。

**核心理念**：学员在飞书群里正常学习交流，系统在后台自动完成一切——无需安装任何额外应用，无需改变任何使用习惯。

```
学员在群里发了一张学习笔记截图
    ↓  飞书 Bot WebSocket 实时捕获
消息进入分类引擎
    ↓  规则匹配（零成本） / LLM 多模态识别（复杂内容）
归入「成果展示」维度，自动评分
    ↓  SQLite 实时写入
排行榜 + 雷达图即时更新  ← 全程 < 3 秒
```

---

## Features

### AI 多模态分类

规则引擎 + GLM-4 Vision **双引擎架构**。简单场景走规则引擎（快速、零成本），复杂内容交给 LLM 多模态理解。学员感知到的是正常群聊，背后却有精密的行为分析引擎在运转。

- 一张 PPT 截图 → 识别为「成果展示」而非普通聊天图片
- 一段代码截图 → 识别为「工具实操」并归入执行力维度
- 一段长文思考 → 区分「深度发言」和「日常闲聊」
- 一个表情回复 → 区分「点赞认可」和「无意义灌水」

### 五维评分模型

```
                    ★ Knowledge (思维深度) ★
                   ╱                        ╲
      ★ Social (协作能力) ★            ★ Hands-on (执行力) ★
                   ╲                        ╱
        ★ Growth (影响力) ★ ———— ★ Creativity (创新力) ★
```

5 大维度、**15 项精细评分指标**，覆盖从签到打卡到深度思考、从作业提交到互评贡献的完整学习行为谱。每位学员都有一份完整的能力画像雷达图。

### 赛博朋克实时 Dashboard

纯手写 CSS 赛博朋克主题（非 Tailwind 模板），适配飞书群 Tab 页签直接嵌入：

- **实时排行榜** —— 按段位分组展示，分数变化自带动效
- **个人详情页** —— 五维 AQ 雷达图 + 维度得分分解 + 成长时间线
- **段位晋升动画** —— 升级瞬间全屏播放赛博朋克风格晋升特效
- **勋章墙** —— 根据行为自动授予成就徽章，可视化成长足迹

### 五级成长体系

| Level | 称号 | 门槛 |
|:-----:|:----:|:----:|
| 1 | 🌱 潜力股 | 0 AQ |
| 2 | 🔬 研究员 | 50 AQ |
| 3 | 🎯 操盘手 | 120 AQ |
| 4 | 🧠 智慧顾问 | 200 AQ |
| 5 | ⚡ 奇点玩家 | 300 AQ |

升级时自动在群里发送庆祝卡片，营造仪式感和竞争氛围。

### 互动答题与互评

管理员在群里发送 `测验`，系统从飞书多维表格题库中按当前期数抽题，生成互动卡片，学员点击选项即时作答并计分。发送 `互评` 触发学员互评投票卡片。

### 零代码管理

所有管理操作通过群聊关键词完成，培训师不需要任何技术背景：

```
管理 / 管理面板   → 发送管理员控制面板卡片（开期、审核、调分）
测验 / 随堂测验   → 从飞书多维表格题库抽题，发送互动答题卡片
互评 / 互评投票   → 发送学员互评投票卡片
看板 / 排行榜     → 发送 Top 5 排行卡片并置顶，附 Dashboard 链接
```

---

## Tech Stack

```
Frontend:   React 18 + TypeScript + Vite (手写 CSS，赛博朋克主题)
Backend:    Fastify + TypeScript (Node.js)
Database:   SQLite (better-sqlite3, WAL 模式)
IM:         飞书开放平台 SDK (WebSocket 长连接)
AI:         GLM-4 Vision (智谱 AI，多模态)
Deploy:     PM2 + Nginx，单机即可运行
```

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/Ethan-YoungQ/ai-seed-project.git
cd ai-seed-project
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入：

| 变量 | 说明 |
|------|------|
| `FEISHU_APP_ID` | 飞书自建应用 App ID |
| `FEISHU_APP_SECRET` | 飞书自建应用 App Secret |
| `FEISHU_BOT_CHAT_ID` | 机器人所在群聊的 chat_id |
| `LLM_API_KEY` | 智谱 AI API Key |

完整环境变量说明见 `.env.example`。

### 3. Create Feishu Bot

1. 前往 [飞书开放平台](https://open.feishu.cn/) 创建自建应用
2. 开启**机器人**能力
3. 添加权限：`im:message:receive`、`im:chat`、`im:message:send`
4. 设置事件订阅：`im.message.receive_v1`
5. 选择**长连接模式**（推荐）

详细步骤见 [docs/feishu-setup.md](docs/feishu-setup.md)。

### 4. Run

```bash
# Development
npm run dev

# Production build
npm run build
node dist/main.js

# Run tests
npm test
```

### 5. Open Dashboard

浏览器打开 `http://localhost:3000/dashboard`

### 6. Seed Demo Data (Optional)

```bash
npm run seed:demo
```

---

## Project Structure

```
ai-seed-project/
├── src/
│   ├── domain/v2/          # 评分领域模型 (ingestor, settler, levels)
│   ├── routes/v2/          # API 路由 (board, ranking, member detail)
│   ├── services/feishu/    # 飞书集成 (bot, cards, message handling)
│   ├── storage/            # SQLite repository
│   └── config/             # 配置与默认值
├── apps/dashboard/         # React Dashboard (Vite)
│   ├── src/components/     # UI 组件 (赛博朋克主题)
│   ├── src/hooks/          # 数据 hooks (useRanking, useMemberDetail)
│   ├── src/lib/            # 工具函数 (badge-engine, colors, api)
│   └── src/routes/         # 页面路由
├── tests/                  # Vitest 测试套件
├── scripts/                # 运维与部署脚本
│   ├── ops/                # 一键部署脚本 (Linux/Mac/Windows)
│   └── seed-demo-dashboard.sql
├── docs/
│   ├── admin-guide.md      # 管理员操作手册（零技术背景适用）
│   ├── feishu-setup.md     # 飞书应用配置详细步骤
│   └── project-pitch.md    # 项目介绍与使用场景
└── .env.example            # 完整环境变量模板
```

---

## Scoring Model

### Dimensions (5 维度 / 15 指标)

| Key | Dimension | Items | Source |
|-----|-----------|-------|--------|
| K | Knowledge (思维深度) | K1 签到、K2 测验、K3 知识分享、K4 深度思考 | 卡片交互 / 测验 / LLM |
| H | Hands-on (执行力) | H1 作业提交、H2 多模态实操、H3 工具使用 | 卡片交互 / LLM |
| C | Creativity (创新力) | C1 回声确认、C2 表情互动、C3 社区贡献 | 卡片交互 / 表情 / LLM |
| S | Social (协作能力) | S1 互助答疑、S2 团队贡献 | 卡片交互 |
| G | Growth (影响力) | G1 带动讨论、G2 成长反思、G3 被引用统计 | 卡片交互 / LLM / 聚合 |

### Anti-Cheat

每个评分项均配置 `perPeriodCap`（单期上限），防止刷分：

- **频率限制** —— 同一评分项在同一期内有次数上限（如 K3 每期最多 3 次）
- **内容去重** —— 重复发送相同内容不会重复计分（sourceRef 唯一性约束）
- **LLM 质量判定** —— 需要 LLM 审核的项（`needsLlm: true`）经过 AI 内容质量评估
- **管理员审核** —— LLM 评分结果进入审核队列，管理员可批准/拒绝/手动调分

---

## Deployment

### Minimum Requirements

- Node.js 18+
- 1 Core / 1 GB RAM
- 飞书企业版（开放平台权限）
- 智谱 AI API 账号

### Production

```bash
npm install
npm run build

# Using PM2
pm2 start dist/main.js --name ai-seed

# Or with the included ops scripts
npm run ops:deploy       # Linux
npm run ops:mac:deploy   # macOS
npm run ops:windows:deploy  # Windows
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/v2/board/ranking` | 排行榜数据 |
| GET | `/api/v2/board/member/:id` | 学员详情 |
| GET | `/dashboard` | Dashboard SPA |

---

## Customization

本项目设计为**模板化可复用**。你可以：

1. **替换 IM 平台**：修改 `src/services/feishu/` 适配其他 IM（企业微信、钉钉等）
2. **替换 AI 引擎**：修改 `src/services/feishu/message-classifier.ts` 接入其他 LLM
3. **自定义评分维度**：修改 `src/domain/v2/` 中的评分规则和维度定义
4. **自定义 Dashboard 主题**：修改 `apps/dashboard/src/` 中的 CSS 变量

---

## Documentation

| Doc | Description |
|-----|-------------|
| [Admin Guide](docs/admin-guide.md) | 管理员操作手册（零技术背景适用） |
| [Feishu Setup](docs/feishu-setup.md) | 飞书应用配置详细步骤 |
| [Project Pitch](docs/project-pitch.md) | 项目介绍与使用场景 |
| [.env.example](.env.example) | 完整环境变量说明 |

---

## Contributing

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 发起 Pull Request

---

## License

[MIT](LICENSE)

---

<div align="center">

**让每一次发言都有回响，让每一份努力都被看见。**

*Built with TypeScript, powered by LLM, gamified with Cyberpunk Dashboard.*

</div>
