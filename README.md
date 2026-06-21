<div align="center">

**English** | [中文](README_zh.md)

# AI Seed Project - 飞书机器人培训评估系统 / AI Training Evaluation

AI Seed Project 是一个面向企业培训、AI 训练营和学习社群的飞书机器人培训评估系统：把群聊发言、图片、文件、测验卡片和互动行为转成学习行为证据，再通过 LLM 辅助评分、管理员审核、学习积分和排行榜看板追踪培训参与度。

English: a self-hosted TypeScript system for AI bootcamps, corporate training, and learning communities, with Feishu bot capture, LLM-assisted scoring, admin review cards, and a gamified learning dashboard.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.x-000?logo=fastify)](https://fastify.dev/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite)](https://sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Start here:** [Quick Start](#quick-start) | [Feishu setup](docs/feishu-setup.md) | [Admin guide](docs/admin-guide.md) | [Student scoring rules](docs/student-rules-guide.md)

</div>

**Search intent:** for teams searching for 飞书机器人, 培训评估/企业培训系统, and 学习积分/排行榜/助教机器人.

> **Boundary:** This is a self-hosted engineering template, not an official Feishu product. It requires a Feishu self-built app, Feishu group/Base configuration, and an OpenAI-compatible LLM provider; review consent, privacy, and data retention before using real learner data.

---

## The Training Industry's Pain Points

Companies invest massive budgets in training every year, yet evaluating training effectiveness remains an unsolved challenge.

| Pain Point | Current Situation | Consequence |
|:---:|:---:|:---:|
| Delayed Assessment | Statistics gathered only after training ends | Missed intervention window |
| Single-Dimensional | Only attendance and exams considered | Overlooking process performance |
| High Manual Cost | TAs record everything manually | Exhaustion and omissions |
| Learner Disengagement | Participants unaware of their performance | Lack of motivation to participate |
| Data Silos | Scattered across platforms | Cannot be consolidated or reused |

> *What we need is not another check-in tool, but an intelligent system that truly understands learning behavior.*

---

## Solution: Group Chat as Classroom, Messages as Scores

A **zero-friction, fully automated, AI-driven** training evaluation system.

No app installation required, no new tools to learn---**just communicate naturally in the Feishu group chat, and the system automatically captures everything, AI scores in real time, and the dashboard displays results instantly.**

<div align="center">

![System Architecture Overview](docs/images/architecture.svg)

</div>

---

## Core Features

### 1. Full-Spectrum Awareness: AI Silently Records Everything

The system works like an indefatigable "super teaching assistant," silently active in the group 24/7. Every message, every image, every file, every interaction---all automatically captured, zero omissions.

```
Student posts a PPT screenshot
    ↓
System auto-identifies: this is a "learning outcome showcase"
    ↓
Classified under "Outcome Showcase" dimension, +8 points
    ↓
Leaderboard updates in real time ← entire process < 3 seconds
```

### 2. Five-Dimension Scoring Model: 15 Granular Metrics

<div align="center">

![Five-Dimension Scoring Model](docs/images/scoring-dimensions.svg)

</div>

| Dimension | Code | Scoring Items | Description |
|:---:|:---:|:---|:---|
| **Knowledge** | K | K1 Daily Check-in, K2 In-class Quiz, K3 Knowledge Summary, K4 AI Correction | How much was learned and understood |
| **Hands-on** | H | H1 Assignment Submission, H2 Practice Screenshots, H3 Video Check-in | Whether they practiced and submitted work |
| **Creativity** | C | C1 Creative Sharing, C2 Like Interaction, C3 Deep Creation | Whether they showed creativity and new ideas |
| **Social** | S | S1 Group Message Interaction, S2 Peer Review Contribution | Whether they were active and helped others |
| **Growth** | G | G1 Video Learning, G2 Extracurricular Resource Sharing, G3 Sustained Activity | Whether they reflected, improved, and shared resources |

### 3. AI Boot v3: Semantic Scoring + Low-Noise Operations

**Semantic Scoring**: Upgraded from keyword whitelists to LLM-based semantic understanding. When a message arrives, AI combines text, image understanding results, and file summaries to determine the contribution type, covering daily participation, AI-generated content, practice reviews, methodology sharing, resource recommendations, peer assistance, and formal tasks.

- `qwen3.5-flash` powers text scoring, image understanding, and TA Q&A, all via a unified OpenAI-compatible API
- Images are asynchronously understood and cached first; subsequent scoring reads only the image descriptions to avoid blocking group chat replies with heavy image recognition
- Image-only messages support background re-scoring and restart recovery; real group message replay waits for async tasks to complete before closing the database
- AI Boot v3 supports `v3_shadow` bypass mode: real database writes, auditable, replayable, but does not directly affect existing leaderboard scores

**Proactive Praise Bot**: The bot no longer passively waits for @ mentions. When it detects a student's outstanding contribution (total score ≥ 3), it proactively posts short, specific encouragement in the group. Production frequency can be controlled via toggle---defaulting to fewer but more precise, to avoid disrupting the group chat:

```
@Yang Bin This AI workflow nails the business pain points---the implementation feel is off the charts 🔥
@Wang Jing Effie The poster aesthetics and prompt approach are both on point---this creation is absolutely legendary 👏
```

> Praise messaging adopts a "Xiaohongshu/Douyin comment section" style---short, specific, and internet-savvy, avoiding repetitive canned phrases like "great question" or "welcome other students."

**Context-Aware Group Chat TA**: When @-mentioned, the Singularity TA answers questions using recent group chat messages and files. Current scope: the 10 most recent chat messages + 2 most recent files, suitable for low-frequency training camp group chats; operational intents like score withdrawal, no-scoring, admin/review/adjustment are routed through dedicated handlers to avoid falling into casual conversation replies.

**Weekly Leaderboard Settlement**: Automatically posts the leaderboard report in the group every Thursday at 12:00---top 3 (🥇🥈🥉 with congratulatory messages) and bottom 3 (📌 with encouraging messages), powered by a systemd timer.

### 4. Cyberpunk Real-Time Dashboard

Hand-crafted CSS cyberpunk theme, designed to embed directly in Feishu group Tab pages.

**Visual Style:** Neon glow / Dark backgrounds / Data particle streams / Sci-fi HUD interface

<div align="center">

**Real-Time Leaderboard --- Grouped by tier, rank changes at a glance**

![Leaderboard](docs/images/dashboard-leaderboard.png)

**Member Detail Page --- Badge wall + Radar chart + Five-dimension analysis + Growth timeline**

![Member Detail](docs/images/dashboard-member-detail.png)

</div>

### 5. Five-Level Growth System

| Level | Title | AQ Threshold | Meaning |
|:-----:|:----:|:------:|:-----|
| 1 | 🌱 **AI Prospect** | 0+ | Just joined the camp, everything is possible |
| 2 | 🔬 **AI Researcher** | 32+ or meet Lv2 multi-path | Starting to think deeply, showing professional growth |
| 3 | 🎯 **AI Operator** | 64+ | Applying knowledge with significant results |
| 4 | 🧠 **AI Advisor** | 128+ | Influencing others, becoming a team thought leader |
| 5 | ⚡ **AI Singularity Player** | 224+ | Excellence across all dimensions, pushing cognitive boundaries |

Level-ups no longer depend on settlement cycles---promotions happen continuously once requirements are met. Lv2 additionally supports multi-path evaluation: 24+ points with C/S/G signals, 32+ points on the strong practice path, or 20+ points on the multi-dimensional activity path can all trigger promotion, preventing "hollow promotions" built solely from check-ins and video points.

### 6. Zero-Code Management: Group Chat Keywords as Commands

Trainers don't need any technical knowledge. All management operations are performed via group chat keywords:

```
admin / admin panel / control panel   → Admin control panel (open camp, open window, graduation settlement)
quiz / in-class quiz / exam            → Draw questions from Feishu Base question bank, send interactive quiz cards
peer review / peer vote / vote         → Peer review voting card, auto-calculate social scores
board / ranking / leaderboard           → Ranking ladder card, one-click jump to Web Dashboard
adjust / manual adjustment             → Manual score adjustment card (bypass auto-scoring limits)
member / member management             → Member role management card (hide ranking / change role)
```

The question bank is managed via Feishu Base spreadsheets---add, delete, edit, and query directly in the spreadsheet, and the system syncs automatically.

### 7. Anti-Abuse Mechanisms

- **Per-camp caps** --- Each scoring item has an independent score cap per camp to prevent score farming
- **Idempotent deduplication** --- The same message will not be scored multiple times
- **AI quality verification** --- Scoring must include contribution type, evidence, confidence level, and reasoning
- **Admin review queue** --- AI scoring results push review cards for one-click approve/reject
- **Shadow safety valve** --- v3 scores can be written to the database for observation without directly affecting the leaderboard
- **Operational correction intents** --- Messages like "don't add points / withdraw points / just casual chat" won't enter open conversation
- **Manual score adjustment** --- Admins can bypass auto-caps for manual corrections

---

## Project Highlights

| | Highlight | Description |
|:--:|:----:|:-----|
| 🎯 | **Zero Friction** | No tools to learn---group chat is the assessment |
| 🤖 | **AI-Driven** | Multi-modal LLM understanding, beyond the keyword era |
| ⚡ | **Real-Time Feedback** | Scored and on the leaderboard within 3 seconds, instant positive reinforcement |
| 🎮 | **Gamified** | Five-level growth system + badges + leaderboard |
| 📊 | **Multi-Dimensional** | 5 dimensions, 15 metrics---comprehensive profiling |
| 🔧 | **Zero-Code** | Group chat commands + spreadsheet management---trainers are admins |
| 🛡️ | **Anti-Cheat** | Rate limiting + deduplication + AI quality checks---ensuring fairness |
| 📦 | **Lightweight Deploy** | Single-server SQLite + systemd, live in 10 minutes |

---

## Use Cases

| Scenario | Description |
|------|------|
| **Corporate AI Training Camp** | Zero TA overhead, fully automated, real-time data visualization |
| **New Employee Onboarding** | Auto-track participation depth, generate personal growth reports |
| **Product Manager Bootcamp** | Five-dimension model maps to product competency profiles, radar chart at a glance |
| **Book Club / Learning Community** | Gamified level system for sustained engagement, maintaining long-term activity |
| **Hackathon** | Real-time dashboard + team dimension scoring, maximizing competition atmosphere |

---

## Technical Extension Roadmap

The system uses a modular architecture, with the following directions offering low-cost extensibility:

| Data Layer | IM Adapter Layer | AI Capability Enhancement |
|--------|----------|------------|
| Multi-group linkage | WeCom adapter | AI personalized learning suggestions |
| Cross-camp data comparison | DingTalk adapter | Adaptive difficulty question bank |
| Data export reports | Webhook integration | Smart group matching |
| Student profile accumulation | Mobile H5 adaptation | Training ROI quantitative analysis |

---

## Tech Stack

```
Frontend:   React 18 + TypeScript + Vite (hand-crafted CSS, cyberpunk theme)
Backend:    Fastify + TypeScript (Node.js)
Database:   SQLite (better-sqlite3, WAL mode)
IM:         Feishu Open Platform SDK (WebSocket long connection)
AI:         Qwen3.5 Flash / OpenAI-compatible LLM (text scoring, vision understanding, TA Q&A)
Schedule:   systemd timer (leaderboard settlement every Thursday at 12:00)
Deploy:     systemd + Nginx + Let's Encrypt, runs on a single server
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

Edit the `.env` file and fill in:

| Variable | Description |
|------|------|
| `FEISHU_APP_ID` | Feishu custom app App ID |
| `FEISHU_APP_SECRET` | Feishu custom app App Secret |
| `FEISHU_BOT_CHAT_ID` | Chat ID of the group where the bot resides |
| `LLM_PROVIDER` | LLM provider (recommended: `aliyun`, compatible with OpenAI-style Chat API) |
| `LLM_API_KEY` | LLM API Key |
| `LLM_TEXT_MODEL` | Text scoring / TA Q&A model (production recommended: `qwen3.5-flash`) |
| `LLM_VISION_MODEL` | Image understanding model (production recommended: `qwen3.5-flash`) |
| `AI_BOOT_ENGINE_MODE` | AI Boot engine mode: `legacy` / `v3_shadow` / `v3_live` |

See `.env.example` for complete environment variable documentation.

### 3. Create Feishu Bot

1. Go to [Feishu Open Platform](https://open.feishu.cn/) to create a custom app
2. Enable the **Bot** capability
3. Add permissions: `im:message:receive`, `im:chat`, `im:message:send`
4. Set up event subscription: `im.message.receive_v1`
5. Select **Long Connection mode** (recommended)

See [docs/feishu-setup.md](docs/feishu-setup.md) for detailed steps.

### 4. Run

```bash
# Development
npm run dev

# Production build
npm run build
node dist/main.js

# Run tests
npm test

# Replay existing Feishu group messages in dry-run mode
npm run ai-boot:replay-feishu-messages -- \
  --messages /tmp/feishu-messages.json \
  --database-url ./data/app.db \
  --camp-id default \
  --chat-id oc_xxx
```

### 5. Open Dashboard

Open `http://localhost:3000/dashboard` in your browser

---

## Project Structure

```
ai-seed-project/
├── src/
│   ├── domain/v2/          # Scoring domain model (ingestor, settler, levels, promotion-announcer)
│   ├── routes/v2/          # API routes (board, ranking, member detail)
│   ├── services/feishu/    # Feishu integration (bot, cards, message handling, AI Boot v3, promotion announcement)
│   ├── storage/            # SQLite repository
│   └── config/             # Configuration and defaults
├── apps/dashboard/         # React Dashboard (Vite)
│   ├── src/components/     # UI components (cyberpunk theme)
│   ├── src/hooks/          # Data hooks (useRanking, useMemberDetail)
│   ├── src/lib/            # Utility functions (badge-engine, colors, api)
│   └── src/routes/         # Page routes
├── tests/                  # Vitest test suite
├── scripts/                # Operations and deployment scripts
│   ├── ops/deploy-app.sh   # Application deployment
│   ├── ops/deploy-timer.sh # Timer deployment
│   └── ops/backup-db.sh    # Database backup
├── deploy/systemd/         # systemd units
│   ├── ai-seed-project.service  # Main service
│   ├── weekly-ranking.service   # Ranking script service
│   └── weekly-ranking.timer     # Timer for every Thursday at 12:00
├── docs/
│   ├── admin-guide.md      # Admin guide (no technical background required)
│   ├── student-rules-guide.md  # Student scoring/promotion/badge rules
│   ├── feishu-setup.md     # Feishu app configuration steps
│   └── project-pitch.md    # Project introduction and use cases
└── .env.example            # Complete environment variable template
```

---

## Deployment

### Minimum Requirements

- Node.js 18+
- 1 Core / 1 GB RAM
- Feishu Enterprise Edition (Open Platform permissions)
- Alibaba Cloud Bailian or other OpenAI-compatible LLM API account

### Production

```bash
npm install
npm run build

# Using systemd (recommended)
sudo cp deploy/ai-seed-project.service /etc/systemd/system/
sudo systemctl enable ai-seed-project
sudo systemctl start ai-seed-project

# Or run directly
node dist/main.js
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/v2/board/ranking` | Leaderboard data |
| GET | `/api/v2/board/member/:id` | Member details |
| GET | `/dashboard` | Dashboard SPA |

---

## Customization

This project is designed as a **reusable template**:

1. **Swap IM platform**: Modify `src/services/feishu/` to adapt to other IM platforms (WeCom, DingTalk, etc.)
2. **Swap AI engine**: Modify `src/services/llm/provider-config.ts` and `src/services/v2/llm-scoring-client.ts` to integrate other OpenAI-compatible LLMs
3. **Customize scoring dimensions**: Modify the scoring rules and dimension definitions in `src/domain/v2/`
4. **Customize dashboard theme**: Modify the CSS variables in `apps/dashboard/src/`

---

## Documentation

| Doc | Description |
|-----|-------------|
| [Admin Guide](docs/admin-guide.md) | Admin guide (no technical background required) |
| [Student Rules](docs/student-rules-guide.md) | Student scoring/promotion/badge rules documentation |
| [Feishu Setup](docs/feishu-setup.md) | Detailed Feishu app configuration steps |
| [Project Pitch](docs/project-pitch.md) | Project introduction and use cases |
| [.env.example](.env.example) | Complete environment variable documentation |

---

## Contributing

Issues and Pull Requests are welcome!

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

[MIT](LICENSE)

---

<div align="center">

**Let training be more than a one-person show.**

**Let AI see everyone's effort. Let data tell every growth story.**

---

*AI Training Camp Evaluation System*
*Powered by Feishu Bot + Qwen3.5 Flash + Gamification*

</div>
