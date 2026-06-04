# 追赶与临近晋升提醒实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不污染原始模型评分的前提下，为临近晋升学员提供一次性提醒，并为第三期仍未晋升 Lv2 的学员提供透明、封顶、可审计的追赶倍率。

**Architecture:** 追赶逻辑拆成纯领域函数、SQLite 持久化方法、v3 评分编排层、连续晋升 runtime 四部分。原始得分照常入库，追赶额外分以独立 `operator_adjustment` 审计事件入库；提醒记录以 `member_id + target_level` 唯一保护防刷屏。

**Tech Stack:** TypeScript, Vitest, better-sqlite3, Fastify runtime, Feishu card JSON.

---

### Task 1: 领域规则

**Files:**
- Create: `src/domain/v2/catch-up.ts`
- Test: `tests/domain/v2/catch-up.test.ts`

- [ ] 写测试：Lv1 且第 3 期时，高价值类别按 1.5 倍或 1.2 倍产生额外分。
- [ ] 写测试：闲聊/日常参与不产生追赶额外分。
- [ ] 写测试：每人每期额外分最多 8 AQ。
- [ ] 写测试：已晋升 Lv2 的学员不再获得强追赶额外分。
- [ ] 实现 `calculateCatchUpBonus` 和 `findNearPromotionNudge`。

### Task 2: SQLite 持久化

**Files:**
- Modify: `src/storage/sqlite-repository.ts`
- Test: `tests/storage/v3/sqlite-ai-boot-repository.test.ts`

- [ ] 增加 `v2_promotion_nudge_records` 表。
- [ ] 增加 `insertPromotionNudgeRecord`，以 `member_id + target_level` 去重。
- [ ] 增加 `sumCatchUpBonusForPeriod`，只统计 `review_note` 标记为 `catch_up_bonus` 的 approved 事件。
- [ ] 写测试验证提醒记录去重。
- [ ] 写测试验证追赶额外分按周期统计。

### Task 3: v3 评分编排接入

**Files:**
- Modify: `src/services/feishu/ai-boot/orchestrator.ts`
- Test: `tests/services/feishu/ai-boot/orchestrator.test.ts`

- [ ] 在原始 approved 得分写入后，根据当前段位、活跃周期和类别计算追赶额外分。
- [ ] 追赶额外分写入独立 `operator_adjustment` 事件，`event_id` 使用源事件 `:catch-up` 后缀。
- [ ] `review_note` 记录源事件、原始类别、原始分、倍率、额外分和周期。
- [ ] 插入追赶额外分后再触发连续晋升，确保晋升判断看到完整总分。

### Task 4: 连续晋升回填与一次性提醒

**Files:**
- Modify: `src/v2-production-wiring.ts`
- Create: `src/services/feishu/cards/templates/promotion-nudge-v1.ts`
- Test: targeted service/domain tests

- [ ] 启动时默认执行连续晋升 backfill，允许 `V2_CONTINUOUS_PROMOTION_BACKFILL=false` 显式关闭。
- [ ] 对未晋升但临近下一段位的成员构建提醒。
- [ ] 插入提醒记录成功后才发送提醒卡片。
- [ ] 每个用户每个目标段位只提醒一次。

### Task 5: 验证、部署、GitHub

**Files:**
- Server: `/opt/ai-seed-project`

- [ ] 运行定向 Vitest。
- [ ] 运行 TypeScript build。
- [ ] 部署到 3001 项目，不触碰 3000 VPS 项目。
- [ ] 线上备份数据库。
- [ ] 重启 `ai-seed-project.service`。
- [ ] 验证 `/api/v2/board/ranking` 中李克亚自动晋升。
- [ ] 推送到 GitHub main。
