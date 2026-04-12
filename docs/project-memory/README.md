# 项目记忆体系

> 新线程/新开发者启动时，先读此文件了解项目全貌，再按需读取子文件夹。

## 目录结构

```
docs/project-memory/
├── README.md              ← 你在这里（入口 + 全局状态）
├── status/                ← 项目当前状态快照
│   ├── infrastructure.md  ← 服务器、环境、部署信息
│   ├── scoring-system.md  ← 15 项评分规则实现状态
│   └── feishu-base.md     ← 飞书多维表格配置
├── sessions/              ← 每次开发会话的记录
│   └── 2026-04-12.md      ← 会话完成清单
├── learnings/             ← 经验教训（跨会话持久）
│   ├── feishu-card.md     ← 飞书卡片开发经验
│   ├── aliyun-deploy.md   ← 阿里云部署经验
│   └── scoring-gotchas.md ← 评分系统踩坑记录
```

## 使用方式

1. **新线程启动** → 读 `README.md` + `status/` 下所有文件
2. **遇到飞书卡片问题** → 读 `learnings/feishu-card.md`
3. **需要部署** → 读 `learnings/aliyun-deploy.md`
4. **了解历史** → 读 `sessions/` 下对应日期文件

## 项目一句话

辉瑞 HBU AI 训练营评估系统 — 飞书群 Bot 自动捕获学员行为 + LLM 评分 + 排行榜 Dashboard。

## 团队

| 成员 | 角色 | 飞书 open_id |
|------|------|-------------|
| YongQ | operator (项目负责人) | ou_789911abef736a08f44286493d3285c5 |
| Karen | trainer | ou_84bdbb1c09ed08547cb700a15acdd0c8 |
| Dorothy | trainer | ou_0f43d5637375d7914b609b33e8672753 |
| 黄小燕 | student (测试) | ou_059edde5436664caa3b3e2fab4d6a25b |

## 技术栈

Node.js + Fastify + TypeScript + SQLite + React (Dashboard) + 飞书 SDK WS 长连接

## 主分支

`codex/phase-one-feishu` — worktree 在 `.worktrees/phase-one-feishu`
