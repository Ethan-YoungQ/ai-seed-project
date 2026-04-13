<div align="center">

# AI Seed Project

### **让每一次发言都有回响，让每一份努力都被看见。**

*当 AI 遇上企业培训，一场关于「参与感」的革命悄然发生。*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-000?logo=fastify)](https://fastify.dev/)
[![React](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite)](https://sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 培训行业的痛点

企业每年在培训上投入巨额预算，但培训效果评估始终是一道未解的难题。

| 痛点 | 现状 | 后果 |
|:---:|:---:|:---:|
| 评估滞后 | 结营后才统计 | 错过干预窗口 |
| 维度单一 | 只看签到和考试 | 忽视过程表现 |
| 人工成本高 | 助教全程记录 | 疲惫且遗漏 |
| 学员无感 | 不知道自己表现如何 | 缺乏参与动力 |
| 数据孤岛 | 散落在各平台 | 无法沉淀复用 |

> *我们需要的不是另一个打卡工具，而是一个真正理解「学习行为」的智能系统。*

---

## 解决方案：群聊即课堂，发言即评分

一套 **「零摩擦、全自动、AI 驱动」** 的培训评估系统。

学员无需安装任何应用、无需学习任何操作——**在飞书群里自然交流，系统自动捕获一切，AI 实时评分，大屏即时呈现。**

<div align="center">

![系统架构全景](docs/images/architecture.svg)

</div>

---

## 核心功能

### 1. 全域感知：AI 无声记录一切

系统像一位不知疲倦的「超级助教」，7x24 小时在群里默默工作。每一条消息、每一张图片、每一个文件、每一次互动——**全部自动捕获，零遗漏。**

```
学员发了一张 PPT 截图
    ↓
系统自动识别：这是一份「学习成果展示」
    ↓
归入「成果展示」维度，+8 分
    ↓
排行榜实时更新 ← 整个过程 < 3 秒
```

### 2. 五维评分模型：15 项精细指标

<div align="center">

![五维评分模型](docs/images/scoring-dimensions.svg)

</div>

| 维度 | 代号 | 评分项 | 说明 |
|:---:|:---:|:---|:---|
| **知识力** | K | K1 每日签到、K2 随堂测验、K3 知识总结、K4 AI 纠错 | 学了多少、理解了多少 |
| **实操力** | H | H1 作业提交、H2 实操截图、H3 视频打卡 | 有没有动手做、交作业 |
| **创新力** | C | C1 创意分享、C2 点赞互动、C3 深度创作 | 有没有创意和新想法 |
| **社交力** | S | S1 群消息互动、S2 互评贡献 | 活不活跃、有没有帮助别人 |
| **成长力** | G | G1 视频学习、G2 课外资源分享、G3 持续活跃 | 有没有反思进步、分享资源 |

### 3. AI 多模态分类：规则引擎 + LLM 双引擎

简单场景走规则引擎（快速、零成本），复杂内容交给 AI 大模型（GLM-4 Vision）进行多模态理解：

- 一张 PPT 截图 → 识别为「成果展示」而非普通聊天图片
- 一段代码截图 → 识别为「工具实操」并归入执行力维度
- 一段长文思考 → 区分「深度发言」和「日常闲聊」
- 一个表情回复 → 区分「点赞认可」和「无意义水群」

### 4. 赛博朋克实时大屏

纯手写 CSS 赛博朋克主题，适配飞书群 Tab 页签直接嵌入。

**视觉风格：** 霓虹辉光 / 深色背景 / 数据粒子流 / 科幻 HUD 界面

<div align="center">

**实时排行榜 —— 按段位分组，名次变动一目了然**

![排行榜](docs/images/dashboard-leaderboard.png)

**个人详情页 —— 勋章墙 + 雷达图 + 五维分析 + 成长时间线**

![个人详情](docs/images/dashboard-member-detail.png)

</div>

### 5. 五级成长体系

| Level | 称号 | AQ 门槛 | 含义 |
|:-----:|:----:|:------:|:-----|
| 1 | 🌱 **AI 潜力股** | 0+ | 刚刚入营，一切皆有可能 |
| 2 | 🔬 **AI 研究员** | 50+ | 开始深入思考，展现专业素养 |
| 3 | 🎯 **AI 操盘手** | 120+ | 学以致用，成果显著 |
| 4 | 🧠 **AI 智慧顾问** | 200+ | 影响他人，成为团队智囊 |
| 5 | ⚡ **AI 奇点玩家** | 300+ | 全维度卓越，突破认知边界 |

升级时系统自动在群里发送庆祝卡片，营造仪式感和竞争氛围。

### 6. 零代码管理：群聊关键词即指令

培训师不需要懂技术。所有管理操作通过群聊关键词完成：

```
管理 / 管理面板 / 控制面板   → 管理员控制面板（开期、开窗口、毕业结算）
测验 / 随堂测验 / 考试      → 从飞书多维表格题库抽题，发送互动答题卡片
互评 / 互评投票 / 投票      → 学员互评投票卡片，自动计算社交力得分
看板 / 排行 / 排行榜        → 战绩天梯榜卡片，一键跳转 Web Dashboard
调分 / 手动调分             → 运营手动调分卡片（可绕过自动评分上限）
成员 / 成员管理             → 成员角色管理卡片（隐藏排行/更改角色）
```

题库通过飞书多维表格管理，直接在表格里增删改查，系统自动同步。

### 7. 防刷机制

- **每期上限** —— 每个评分项每期有独立分数上限，防止刷分
- **幂等去重** —— 同一消息不会重复计分
- **AI 质量判定** —— 6 项需 LLM 审核的指标经过 AI 内容质量评估
- **管理员审核队列** —— AI 评分结果推送审核卡片，一键批准/驳回
- **运营手动调分** —— 管理员可绕过自动上限进行手动修正

---

## 项目亮点

| | 亮点 | 说明 |
|:--:|:----:|:-----|
| 🎯 | **零摩擦** | 学员无需学习任何工具，群聊即评估 |
| 🤖 | **AI 驱动** | 大模型多模态理解，超越关键词时代 |
| ⚡ | **实时反馈** | 3 秒内评分上榜，即时正向激励 |
| 🎮 | **游戏化** | 五级成长体系 + 勋章 + 排行榜 |
| 📊 | **多维度** | 5 大维度 15 项指标，全面画像 |
| 🔧 | **零代码** | 群聊指令 + 表格管理，培训师即管理员 |
| 🛡️ | **防作弊** | 限频 + 去重 + AI 质检，保障公平 |
| 📦 | **轻部署** | 单机 SQLite + systemd，10 分钟上线 |

---

## 使用场景

| 场景 | 说明 |
|------|------|
| **企业 AI 培训营** | 零助教投入，全程自动化，实时数据可视化 |
| **新员工入职培训** | 自动追踪参与深度，生成个人成长报告 |
| **产品经理训练营** | 五维模型对应产品能力画像，雷达图一目了然 |
| **读书会 / 学习社群** | 游戏化等级体系持续激励，保持长期活跃 |
| **黑客马拉松** | 实时大屏 + 团队维度评分，比赛氛围拉满 |

---

## 技术扩展方向

系统采用模块化架构，以下方向具备低成本扩展能力：

| 数据层 | IM 适配层 | AI 能力增强 |
|--------|----------|------------|
| 多群联动 | 企业微信适配 | AI 个性化学习建议 |
| 跨营期数据对比 | 钉钉适配 | 自适应难度题库 |
| 数据导出报表 | Webhook 集成 | 智能分组匹配 |
| 学员画像沉淀 | 移动端 H5 适配 | 培训 ROI 量化分析 |

---

## Tech Stack

```
Frontend:   React 18 + TypeScript + Vite (手写 CSS，赛博朋克主题)
Backend:    Fastify + TypeScript (Node.js)
Database:   SQLite (better-sqlite3, WAL 模式)
IM:         飞书开放平台 SDK (WebSocket 长连接)
AI:         GLM-4 Vision (智谱 AI，多模态)
Deploy:     systemd + Nginx + Let's Encrypt，单机即可运行
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
├── docs/
│   ├── admin-guide.md      # 管理员操作手册（零技术背景适用）
│   ├── student-rules-guide.md  # 学员评分/晋升/勋章规则
│   ├── feishu-setup.md     # 飞书应用配置详细步骤
│   └── project-pitch.md    # 项目介绍与使用场景
└── .env.example            # 完整环境变量模板
```

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

# Using systemd (推荐)
sudo cp deploy/ai-seed-project.service /etc/systemd/system/
sudo systemctl enable ai-seed-project
sudo systemctl start ai-seed-project

# 或直接运行
node dist/main.js
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

本项目设计为**模板化可复用**：

1. **替换 IM 平台**：修改 `src/services/feishu/` 适配其他 IM（企业微信、钉钉等）
2. **替换 AI 引擎**：修改 `src/services/feishu/message-classifier.ts` 接入其他 LLM
3. **自定义评分维度**：修改 `src/domain/v2/` 中的评分规则和维度定义
4. **自定义 Dashboard 主题**：修改 `apps/dashboard/src/` 中的 CSS 变量

---

## Documentation

| Doc | Description |
|-----|-------------|
| [Admin Guide](docs/admin-guide.md) | 管理员操作手册（零技术背景适用） |
| [Student Rules](docs/student-rules-guide.md) | 学员评分/晋升/勋章规则说明 |
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

**让培训不再是一场独角戏。**

**让 AI 看见每一个人的努力，让数据讲述每一段成长的故事。**

---

*AI Training Camp Evaluation System*
*Powered by Feishu Bot + GLM-4 Vision + Gamification*

</div>
