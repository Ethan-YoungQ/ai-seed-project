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

AI Seed Project 是一套**飞书原生的智能培训评估系统**。它通过飞书机器人自动捕获群聊中的学习行为，利用 LLM 多模态能力进行内容分类和评分，并在赛博朋克风格的实时 Dashboard 上展示排行榜、能力雷达图和成长轨迹。

**核心理念**：学员在飞书群里正常学习交流，系统在后台自动完成一切——无需安装任何额外应用，无需改变任何使用习惯。

```
学员在群里发了一张学习笔记截图
    ↓  飞书 Bot 自动捕获
消息进入分类引擎
    ↓  规则匹配 / LLM 多模态识别
归入「成果展示」维度，自动评分
    ↓  SQLite 实时写入
排行榜 + 雷达图即时更新  ← 全程 < 3 秒
```

---

## Features

### AI 多模态分类

规则引擎 + GLM-4 Vision 双引擎架构。简单消息走规则（零成本），复杂内容交给 LLM 多模态理解。

- 识别 PPT 截图 → 「成果展示」
- 识别代码截图 → 「工具实操」
- 区分深度发言 vs 日常闲聊
- 区分表情互动 vs 无意义灌水

### 五维评分模型

```
                    ★ Knowledge ★
                   ╱              ╲
           ★ Social ★            ★ Hands-on ★
                   ╲              ╱
            ★ Growth ★ ———— ★ Creativity ★
```

5 大维度、15 项评分指标，每位学员都有一份完整的能力画像雷达图。

### 赛博朋克实时 Dashboard

纯手写 CSS 赛博朋克主题（非 Tailwind 模板），包含：

- 实时排行榜（分数变化自带动效）
- 个人五维雷达图
- 段位成长历程
- 勋章成就展示

### 五级成长体系

| Level | 称号 | 门槛 |
|:-----:|:----:|:----:|
| 1 | 🌱 潜力股 | 0 AQ |
| 2 | 🔬 研究员 | 50 AQ |
| 3 | 🎯 操盘手 | 120 AQ |
| 4 | 🧠 智慧顾问 | 200 AQ |
| 5 | ⚡ 奇点玩家 | 300 AQ |

升级时自动在群里发送庆祝卡片，营造仪式感。

### 互动答题系统

管理员在群里发送 `#开始答题`，系统从飞书多维表格题库中随机抽题，生成互动卡片，学员点击选项即时作答并计分。

### 零代码管理

所有管理操作通过群聊指令完成，培训师不需要任何技术背景：

```
#开始答题        → 随机抽题，发送互动答题卡片
#查看排名        → 发送 Top 10 排行卡片
#学员报告 张三    → 发送个人评估报告
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

### Dimensions

| Key | Dimension | Examples |
|-----|-----------|----------|
| K | Knowledge (思维深度) | 深度发言、提问质疑、案例分析 |
| H | Hands-on (执行力) | 作业提交、成果展示、工具实操 |
| C | Creativity (创新力) | 创新提案、跨界联想、独特视角 |
| S | Social (协作能力) | 互助答疑、团队贡献、反馈点评 |
| G | Growth (影响力) | 获赞数量、观点被引、带动讨论 |

### Anti-Cheat

- 频率限制：同一评分项在时间窗口内有次数上限
- 内容去重：重复发送相同内容不会重复计分
- AI 质量判定：水群灌水内容被 AI 识别并过滤
- 管理员审计：所有评分记录可追溯，支持人工修正

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
