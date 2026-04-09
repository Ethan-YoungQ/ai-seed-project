# Scoring v2 Core Domain — Design Spec

**子项目:** 1 / 4 (AI Seed Project 新主线)
**日期:** 2026-04-10
**状态:** Design Approved · 待写 implementation plan
**规则来源:** `output/AI训练营_14人进阶规则.md` v1.1
**输入背景:** `docs/handoffs/2026-04-09-new-ide-handoff.md`, `docs/aliyun-capability-baseline-2026-04-10.md`
**下一步:** `superpowers:writing-plans`

---

## 0. Context

### 0.1 项目业务

AI 训练营评分与段位进阶系统,服务对象是辉瑞中国 HBU 的 14 名 AI 零基础员工。课程 12 期,每 2 周一次,学员在飞书群通过交互式卡片按钮完成各类学习活动(课后测验、作业提交、知识总结、提示词模板、视频学习、互评等),系统自动聚合 AQ 五维积分、评定段位进阶、推送游戏化排行榜与勋章体系。

### 0.2 项目主线 Decomposition (2026-04-10 确认)

1. **子项目 1 (本 spec)** — Scoring v2 核心领域:数据模型 / 聚合引擎 / 段位进阶判定器 / LLM 异步工作流 / 运营 gating
2. **子项目 2** — 飞书卡片协议:讲师指令卡、日常打卡卡、action callback、成员/头像同步
3. **子项目 3** — 游戏化看板 + 群内访问:前端模板 / 段位徽章 / 五维雷达 / 运营后台 / 飞书 H5 入口
4. **子项目 4** — LLM 经济性重选:候选对比、成本测算、provider 替换

依赖关系:

```
  子项目 1  ─┬─→  子项目 2
            ├─→  子项目 4
            └─→  子项目 3 ←── 子项目 2
```

旧 master plan 中的"二期 / 三期增强"路线图已作废。以本次对话定义的 4 个子项目为新主线。

### 0.3 本 spec 的作用边界

本 spec **只定义子项目 1**:纯领域层 + LLM 异步工作流 + 运营 gating 的接口与数据契约。它不定义:
- 飞书卡片的具体 JSON 结构(子项目 2)
- 飞书 action callback 的订阅与路由(子项目 2)
- 前端 UI(子项目 3)
- 群内访问通道的具体选型(子项目 3)
- 具体 LLM provider 和模型的选型(子项目 4)

本 spec 会预留**接口和配置入口**,让后续子项目可以独立落地而不反向修改子项目 1。

---

## 1. Principles & Directory Layout

### 1.1 新旧并存原则

- 新代码全部落 `src/domain/v2/` 和 `src/services/v2/` 目录
- 不修改任何旧表的结构;新表以独立名字存在
- API 路由分层:旧路由保留 `/api/*`,新路由 `/api/v2/*`
- 旧代码在 Section 6 列出明确废弃清单,通过单独 commit 一次性删除,不做 feature flag

### 1.2 模块目录

```
src/
├── domain/
│   ├── v2/
│   │   ├── types.ts                   # v2 领域类型(TS interface / union)
│   │   ├── errors.ts                  # typed DomainError 层级
│   │   ├── eligibility.ts             # isEligibleStudent 唯一真相源
│   │   ├── scoring-items-config.ts    # 15 项评分配置表
│   │   ├── ingestor.ts                # EventIngestor
│   │   ├── aggregator.ts              # ScoringAggregator
│   │   ├── period-lifecycle.ts        # PeriodLifecycle / /开期 / /开窗
│   │   ├── window-settler.ts          # WindowSettler 窗口结算
│   │   ├── promotion-judge.ts         # LevelPromotionJudge 段位判定器
│   │   ├── llm-prompts.ts             # 6 项 LLM 评分的 Prompt 模板
│   │   └── member-sync.ts             # MemberSyncService 接口 + StubImpl
│   └── (旧 domain 文件 — 见 Section 6 废弃清单)
├── services/
│   ├── v2/
│   │   ├── llm-scoring-worker.ts      # LlmScoringWorker 异步 worker
│   │   ├── llm-scoring-client.ts      # LlmScoringClient 接口 + Fake/OpenAI-compatible
│   │   └── reaction-tracker.ts        # C2 点赞 emoji 统计
│   ├── feishu/ (保留,子项目 2 会扩展)
│   └── (其他旧 services — 见 Section 6)
├── db/
│   ├── v2/
│   │   └── schema.ts                  # drizzle v2 schema
│   └── (现有 db/ 保留)
├── storage/
│   └── sqlite-repository.ts           # 扩展 v2 方法
├── app.ts                              # 扩展 /api/v2/* 路由
└── server.ts                           # 启动 LlmScoringWorker
```

### 1.3 API 命名

- `/api/v2/events` — POST 手工投递事件(主要给子项目 2 调用)
- `/api/v2/periods` — GET/POST period 操作
- `/api/v2/windows` — GET/POST window 操作
- `/api/v2/board/ranking` — GET 排行榜(按段位分组 + 维度分解)
- `/api/v2/board/member/:id` — GET 成员详情(当前段位 / 五维分 / 进阶历史)
- `/api/v2/admin/review-queue` — GET/POST LLM 复核队列
- `/api/v2/admin/members` — GET/PATCH 运营管理成员
- `/api/v2/llm/worker/status` — GET LLM worker 监控

鉴权详见 Section 5.

---

## 2. Data Model

### 2.1 关系图

```
         camps (existing)
             │
             ▼
         periods ─────────┐
             │            │
             │            ▼
             │       windows
             │            │
             ▼            ▼
  card_interactions  window_snapshots
             │            ▲
             ▼            │
  scoring_item_events ────┼──→ member_dimension_scores
             │            │
             ▼            │
  llm_scoring_tasks       │
                          ▼
                  promotion_records
                          │
                          ▼
                   member_levels
```

### 2.2 表定义

下列表格全部使用 SQLite。drizzle schema 定义在 `src/db/v2/schema.ts`,DB 列名使用 `snake_case`,TS 字段名使用 `camelCase`,通过 drizzle 的列映射完成。

#### 2.2.1 `periods` — 课次

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | `period-{campId}-{number}` |
| `camp_id` | TEXT | NOT NULL FK→camps.id | |
| `number` | INTEGER | NOT NULL, 1..12 | |
| `is_ice_breaker` | INTEGER | NOT NULL DEFAULT 0 | 仅 number=1 为 1,**不计分** |
| `started_at` | TEXT | NOT NULL | ISO 8601,讲师 `/开期` 时刻 |
| `ended_at` | TEXT | NULL | 下一期 `/开期` 时自动填 |
| `opened_by_op_id` | TEXT | NULL | 讲师 openId(审计) |
| `closed_reason` | TEXT | NULL | `next_period_opened` / `manual_close` / `force_close_by_timeout` |
| `created_at` / `updated_at` | TEXT | NOT NULL | |

**约束:** `UNIQUE(camp_id, number)`
**索引:** `(camp_id, started_at DESC)`

#### 2.2.2 `windows` — 段位评定窗口

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | `window-{campId}-{code}` |
| `camp_id` | TEXT | NOT NULL | |
| `code` | TEXT | NOT NULL | `W1` / `W2` / `W3` / `W4` / `W5` / `FINAL` |
| `first_period_id` | TEXT | **NULL** FK→periods.id | 讲师 `/开期` 时按序绑定,可空表示尚未开始 |
| `last_period_id` | TEXT | **NULL** FK→periods.id | 同上 |
| `is_final` | INTEGER | NOT NULL DEFAULT 0 | |
| `settlement_state` | TEXT | NOT NULL DEFAULT `'open'` | `open` / `settling` / `settled` |
| `settled_at` | TEXT | NULL | |
| `created_at` | TEXT | NOT NULL | |

**约束:** `UNIQUE(camp_id, code)`

**懒加载策略(关键规则)**:
- `seed:ensure` 时**只预建 W1 和 W2 空壳**(`first_period_id` / `last_period_id` 均 NULL)
- W3 / W4 / W5 / FINAL 由讲师通过 `/开窗 <code>` 命令手动懒加载创建
- 见 Section 3.5 `PeriodLifecycle` 的 `/开窗` 处理

#### 2.2.3 `card_interactions` — 卡片交互审计

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | uuid |
| `member_id` | TEXT | NOT NULL FK→members.id | |
| `period_id` | TEXT | NOT NULL FK→periods.id | |
| `card_type` | TEXT | NOT NULL | `daily_checkin` / `quiz` / `homework` / `video` / `peer_review` / `command` |
| `action_name` | TEXT | NOT NULL | `submit_k3_summary` / `submit_k4_correction` / `select_peer_help` / ... |
| `action_payload` | TEXT | NULL | JSON 字符串,学员提交的完整 payload |
| `feishu_message_id` | TEXT | NULL | 卡片 message id |
| `feishu_card_version` | TEXT | NULL | 卡片 schema 版本,便于追溯 |
| `received_at` | TEXT | NOT NULL | |

**索引:** `(member_id, period_id, card_type)`, `(feishu_message_id)`

#### 2.2.4 `scoring_item_events` — 评分事件流(真相源)

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | uuid |
| `member_id` | TEXT | NOT NULL | |
| `period_id` | TEXT | NOT NULL | |
| `item_code` | TEXT | NOT NULL | `K1` / `K2` / ... / `G3` |
| `dimension` | TEXT | NOT NULL | `K` / `H` / `C` / `S` / `G`(冗余,查询优化) |
| `score_delta` | INTEGER | NOT NULL | 本次事件贡献分(可能被上限裁剪) |
| `source_type` | TEXT | NOT NULL | `card_interaction` / `quiz_result` / `emoji_reaction` / `raw_event_aggregation` / `operator_manual` / `growth_bonus` |
| `source_ref` | TEXT | **NOT NULL** | 弱外键,不做 DB 级 FK,因 source_type 变化时指向不同表。对于无天然引用的来源(operator_manual / growth_bonus),由 ingestor 自动生成 uuid 作为 source_ref,确保 UNIQUE 去重生效(SQLite 允许多个 NULL,NOT NULL 保证唯一性) |
| `status` | TEXT | NOT NULL DEFAULT `'pending'` | `pending` / `approved` / `rejected` / `review_required` |
| `llm_task_id` | TEXT | NULL FK→llm_scoring_tasks.id | 仅需 LLM 的事件非空 |
| `reviewed_by_op_id` | TEXT | NULL | |
| `review_note` | TEXT | NULL | |
| `created_at` | TEXT | NOT NULL | |
| `decided_at` | TEXT | NULL | status 从 pending 翻转时刻 |

**约束:** `UNIQUE(member_id, period_id, item_code, source_ref)` — 幂等去重,防重放
**索引:** `(member_id, period_id, status)`, `(status, decided_at)`

#### 2.2.5 `member_dimension_scores` — 物化维度得分

只统计 `status='approved'` 的事件。排行榜和窗口结算的直接查询表。

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `member_id` | TEXT | NOT NULL | |
| `period_id` | TEXT | NOT NULL | |
| `dimension` | TEXT | NOT NULL | K/H/C/S/G |
| `period_score` | INTEGER | NOT NULL DEFAULT 0 | 当期该维度得分 |
| `event_count` | INTEGER | NOT NULL DEFAULT 0 | |
| `last_event_at` | TEXT | NULL | |

**主键:** `(member_id, period_id, dimension)`
**索引:** `(period_id, dimension, period_score DESC)`

#### 2.2.6 `window_snapshots` — 窗口结算快照

窗口结算时一次性写入,不可变。段位进阶判定器的唯一输入源之一。

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | uuid |
| `window_id` | TEXT | NOT NULL | |
| `member_id` | TEXT | NOT NULL | |
| `window_aq` | INTEGER | NOT NULL | 本窗口 2 期 AQ 合计(含成长力加权) |
| `cumulative_aq` | INTEGER | NOT NULL | 历史累计 AQ(至本窗口含) |
| `k_score` | INTEGER | NOT NULL | |
| `h_score` | INTEGER | NOT NULL | |
| `c_score` | INTEGER | NOT NULL | |
| `s_score` | INTEGER | NOT NULL | |
| `g_score` | INTEGER | NOT NULL | 含 growth_bonus |
| `growth_bonus` | INTEGER | NOT NULL DEFAULT 0 | 本窗口成长力加权 +0/+3/+6/+10 |
| `consec_missed_on_entry` | INTEGER | NOT NULL DEFAULT 0 | 进入本窗口判定前的连续未进阶次数 |
| `snapshot_at` | TEXT | NOT NULL | |

**约束:** `UNIQUE(window_id, member_id)`
**索引:** `(member_id, window_id)`

#### 2.2.7 `member_levels` — 成员当前段位

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `member_id` | TEXT | PK | |
| `current_level` | INTEGER | NOT NULL DEFAULT 1 | 1..5 |
| `level_attained_at` | TEXT | NOT NULL | 首次达到该段位的时刻 |
| `last_window_id` | TEXT | NULL | 最近一次评定窗口 |
| `updated_at` | TEXT | NOT NULL | |

**说明:** 初始化时所有 student 默认 `current_level=1, level_attained_at=seed_time`。

#### 2.2.8 `promotion_records` — 进阶评定历史

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `window_id` | TEXT | NOT NULL | |
| `member_id` | TEXT | NOT NULL | |
| `evaluated_at` | TEXT | NOT NULL | |
| `from_level` | INTEGER | NOT NULL | |
| `to_level` | INTEGER | NOT NULL | to == from 表示未进阶 |
| `promoted` | INTEGER | NOT NULL | 0/1 |
| `path_taken` | TEXT | NOT NULL | `primary` / `alternate` / `protection_discounted` / `final_bonus` / `none` |
| `reason` | TEXT | NOT NULL | JSON: 完整判定依据,含每条 conditionCheck 的命中情况 |

**约束:** `UNIQUE(window_id, member_id)`

#### 2.2.9 `llm_scoring_tasks` — LLM 任务队列

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | |
| `event_id` | TEXT | NOT NULL FK→scoring_item_events.id | |
| `provider` | TEXT | NOT NULL | `glm` / `qwen` / `openai_compatible` / ... |
| `model` | TEXT | NOT NULL | |
| `prompt_text` | TEXT | NOT NULL | 冻结的 prompt,便于 replay |
| `status` | TEXT | NOT NULL DEFAULT `'pending'` | `pending` / `running` / `succeeded` / `failed` |
| `attempts` | INTEGER | NOT NULL DEFAULT 0 | |
| `max_attempts` | INTEGER | NOT NULL DEFAULT 3 | |
| `result_json` | TEXT | NULL | LLM 原始结构化输出 |
| `error_reason` | TEXT | NULL | |
| `enqueued_at` | TEXT | NOT NULL | |
| `started_at` | TEXT | NULL | |
| `finished_at` | TEXT | NULL | |

**索引:** `(status, enqueued_at)` — worker FIFO 拉取主索引

### 2.3 `members` 表增量字段(不改动旧列)

```sql
ALTER TABLE members ADD COLUMN avatar_url TEXT;
ALTER TABLE members ADD COLUMN source_feishu_open_id TEXT;
ALTER TABLE members ADD COLUMN display_name_override TEXT;
ALTER TABLE members ADD COLUMN hidden_from_board INTEGER NOT NULL DEFAULT 0;
```

- `avatar_url`:从飞书 `contact/v3/users` 拉,子项目 2 填充
- `source_feishu_open_id`:绑定飞书 OpenID,便于同步幂等
- `display_name_override`:运营在后台改昵称(不覆盖 `name` 源字段)
- `hidden_from_board`:运营手动隐藏(临时不上榜)

注:`role_type` / `is_participant` / `is_excluded_from_board` 已在旧 `members` 表,复用。

### 2.4 数据量估算

12 期 × 14 学员:

| 表 | 估算行数 |
|---|---|
| `card_interactions` | ~2,000 |
| `scoring_item_events` | ~1,500 |
| `member_dimension_scores` | 770(固定:14 × 11 × 5) |
| `window_snapshots` | 84(固定:14 × 6) |
| `promotion_records` | 84(固定:14 × 6) |
| `llm_scoring_tasks` | ~1,500 |
| `card_interactions` 以外的所有表合计 | <5 MB |

SQLite 处理毫无压力。

---

## 3. Core Aggregation & Promotion Judge

### 3.1 模块职责图

```
EventIngestor → LlmScoringWorker → ScoringAggregator → PeriodLifecycle → WindowSettler → LevelPromotionJudge
```

- `EventIngestor`:接收事件 → 资格检查 → 上限裁剪 → 写 `scoring_item_events`(pending/approved) → 必要时投递 LLM 任务
- `LlmScoringWorker`:异步拉 LLM 任务 → 回写 decision(见 Section 4)
- `ScoringAggregator`:处理 decision → 事务更新 `member_dimension_scores`
- `PeriodLifecycle`:处理 `/开期` / `/开窗` / `/结业` 命令
- `WindowSettler`:窗口结算 → 生成 `window_snapshots` → 对每位 eligible student 调用判定器
- `LevelPromotionJudge`:段位进阶决策树(60 条路径)

### 3.2 Scoring Items Config (`src/domain/v2/scoring-items-config.ts`)

15 项评分配置表,**唯一真相源**。所有上限检查、LLM 路由、评分维度归类引用此表。

| itemCode | dimension | scoreDelta | perPeriodCap | needsLlm | sourceType |
|---|---|---|---|---|---|
| K1 | K | 3 | 3 | false | card_interaction |
| K2 | K | 0-10 | 10 | false | quiz_result |
| **K3** | K | **3** | **3** | true | card_interaction |
| K4 | K | 4 | 4 | true | card_interaction |
| H1 | H | 5 | 5 | false | card_interaction |
| H2 | H | 3 | 3 | true | card_interaction |
| H3 | H | 2 | 2 | false | card_interaction |
| C1 | C | 4 | 8 | true | card_interaction |
| C2 | C | 1 per 3 reactions | 4 | false | emoji_reaction |
| C3 | C | 5 | 5 | true | card_interaction |
| S1 | S | 3 | 6 | false | card_interaction(peer_review) |
| S2 | S | 2 | 2 | false | card_interaction(peer_review) |
| G1 | G | 5 | 5 | false | card_interaction |
| G2 | G | 3 | 6 | true | card_interaction |
| G3 | G | 4 | 4 | false | raw_event_aggregation |

**K3 上限修正:** 附件原文 K3 上限 6,但 K 维度每期满分 20 和 K1+K2+K3+K4 合计不一致(3+10+6+4=23)。本 spec 将 K3 上限从 6 改为 3,使 K 每期上限合计 3+10+3+4=20 与附件维度总满分对齐。该修正已记录在 §8.1 Regulatory Divergence。

### 3.3 EventIngestor 上限裁剪算法

```
ingest(memberId, itemCode, scoreDelta, sourceRef, payload):
  # 1. 资格
  if not isEligibleStudent(memberId):
    return { accepted: false, reason: 'not_eligible' }

  # 2. 定位当前 active period
  period = currentActivePeriod()
  if period is None:
    return { accepted: false, reason: 'no_active_period' }
  if period.isIceBreaker:
    return { accepted: false, reason: 'ice_breaker_no_scoring' }

  # 3. 查 approved 和 pending 的累计
  approvedSum = SELECT SUM(score_delta) FROM scoring_item_events
                WHERE member_id=? AND period_id=? AND item_code=? AND status='approved'
  pendingSum  = SELECT SUM(score_delta) FROM scoring_item_events
                WHERE member_id=? AND period_id=? AND item_code=? AND status='pending'

  # 4. 上限裁剪
  cap = scoringItemsConfig[itemCode].perPeriodCap
  remaining = cap - approvedSum - pendingSum
  if remaining <= 0:
    insert rejected event (score_delta=0, status='rejected', review_note='per_period_cap_exceeded')
    return { accepted: false, reason: 'cap_exceeded' }
  effectiveDelta = min(scoreDelta, remaining)

  # 5. 幂等去重
  if exists sourceRef with same (memberId, periodId, itemCode):
    return { accepted: false, reason: 'duplicate' }

  # 6. 插入事件
  needsLlm = scoringItemsConfig[itemCode].needsLlm
  status = needsLlm ? 'pending' : 'approved'
  eventId = insert scoring_item_events { ..., score_delta=effectiveDelta, status, source_ref=sourceRef }

  # 7. 非 LLM 路径同事务写物化表
  if not needsLlm:
    upsert member_dimension_scores { member_id, period_id, dimension } += effectiveDelta

  # 8. LLM 路径投递任务
  if needsLlm:
    llmTaskId = insert llm_scoring_tasks {
      event_id=eventId, provider, model, prompt_text=renderPrompt(itemCode, payload),
      status='pending', enqueued_at=now
    }
    update scoring_item_events set llm_task_id=llmTaskId where id=eventId

  return { accepted: true, eventId }
```

**关键策略:** `pendingSum` **计入上限**,防止学员通过多次提交抢占上限额度。

### 3.4 ScoringAggregator

```
applyDecision(eventId, decision, note):
  # decision: 'approved' | 'rejected' | 'review_required'
  begin tx
    event = SELECT * FROM scoring_item_events WHERE id=eventId FOR UPDATE
    if event.status == decision: return (幂等)

    oldStatus = event.status
    UPDATE scoring_item_events SET status=decision, decided_at=now, review_note=note WHERE id=eventId

    # 物化表增量同步
    if oldStatus == 'approved' and decision != 'approved':
      upsert member_dimension_scores -= event.score_delta
    elif oldStatus != 'approved' and decision == 'approved':
      upsert member_dimension_scores += event.score_delta
    # (review_required → approved 经讲师复核也走这里)
  commit
```

### 3.5 PeriodLifecycle — /开期 / /开窗 / /结业 处理

#### `/开窗 <code>` — 讲师手动创建窗口空壳

```
openWindow(code):
  if exists windows with code: return { ok: true, already: true }
  insert windows {
    id='window-' + code.toLowerCase(),
    camp_id=activeCamp,
    code,
    first_period_id=null,
    last_period_id=null,
    is_final=(code == 'FINAL' ? 1 : 0),
    settlement_state='open',
    created_at=now
  }
  return { ok: true, windowId }
```

幂等:同名 window 已存在则直接返回;只有 operator/trainer 可调用;成功后机器人在群内推确认卡片(子项目 2 负责)。

#### `/开期 <number>` — 讲师手动创建 period

```
openNewPeriod(number):
  begin tx
    # 1. 关闭前一期
    prevPeriod = currentActivePeriod()
    if prevPeriod and prevPeriod.ended_at is null:
      UPDATE prevPeriod SET ended_at=now, closed_reason='next_period_opened'

    # 2. 创建新 period
    newPeriod = insert periods {
      id='period-' + campId + '-' + number,
      camp_id, number,
      is_ice_breaker=(number == 1 ? 1 : 0),
      started_at=now, opened_by_op_id, created_at=now, updated_at=now
    }

    # 3. 破冰期不绑 window
    if newPeriod.isIceBreaker:
      return { ok: true, period: newPeriod, window: null }

    # 4. 找可承接的 active window(first_period_id or last_period_id 为 NULL 的 open 窗口)
    activeWindow = SELECT FROM windows
                   WHERE camp_id=? AND settlement_state='open'
                     AND (first_period_id IS NULL OR last_period_id IS NULL)
                   ORDER BY code ASC LIMIT 1

    if activeWindow is None:
      # 阻塞:讲师忘记 /开窗
      rollback
      return {
        ok: false,
        reason: 'no_active_window',
        hint: '当前没有开放中的评定窗口, 请先 /开窗 <code> 后再 /开期'
      }

    # 5. 绑到 active window
    if activeWindow.first_period_id is null:
      UPDATE windows SET first_period_id=newPeriod.id WHERE id=activeWindow.id
    elif activeWindow.last_period_id is null:
      UPDATE windows SET last_period_id=newPeriod.id WHERE id=activeWindow.id

    # 6. 检查是否刚把上一个 window 填满, 触发 settle
    if prevPeriod:
      prevWindow = SELECT FROM windows WHERE last_period_id=prevPeriod.id AND settlement_state='open'
      if prevWindow:
        enqueueAsync(WindowSettler.settle(prevWindow.id))
  commit

  return { ok: true, period: newPeriod, assignedWindowId: activeWindow.id }
```

#### `/结业` — 触发 FINAL 窗口结算

```
closeFinal():
  finalWindow = SELECT FROM windows WHERE code='FINAL' AND settlement_state='open'
  if finalWindow is None:
    return { ok: false, reason: 'no_final_window' }
  
  # 关闭第 12 期(如果还 open)
  period12 = SELECT FROM periods WHERE number=12
  if period12.ended_at is null:
    UPDATE periods SET ended_at=now, closed_reason='graduation' WHERE id=period12.id

  enqueueAsync(WindowSettler.settle(finalWindow.id))
  return { ok: true, windowId: finalWindow.id }
```

#### 兜底 cron

每小时运行一次,检查:
```
for each window with settlement_state='open':
  lastPeriod = fetch last_period_id
  if lastPeriod and lastPeriod.ended_at is not null and (now - lastPeriod.ended_at) > 72h:
    log warning + 推送运营通知"窗口 W_ 未按时结算, 请检查"
```

不自动强制结算(避免错过延迟到达的事件),只报警。

### 3.6 WindowSettler

```
settle(windowId):
  window = fetch windowId
  if window.settlement_state != 'open': return (幂等)
  UPDATE window SET settlement_state='settling'

  for each eligibleStudent:
    # 1. 聚合本窗口两期的 5 维分
    [p1, p2] = [window.first_period_id, window.last_period_id]
    dimRows = SELECT dimension, SUM(period_score)
              FROM member_dimension_scores
              WHERE member_id=? AND period_id IN (p1, p2)
              GROUP BY dimension
    k = dimRows.K, h = dimRows.H, c = dimRows.C, s = dimRows.S, g = dimRows.G

    # 2. 成长力加权
    growthBonus = 0
    if not isFirstWindow(window):
      prevSnap = fetch previous window_snapshot for memberId
      prevAq = prevSnap.window_aq
      currentAqBeforeBonus = k + h + c + s + g

      # 2a. 基数归一化: 上窗口基数极低(躺平防爆)
      effectivePrevAq = max(prevAq, 30)

      ratio = currentAqBeforeBonus / effectivePrevAq
      absoluteDiff = currentAqBeforeBonus - prevAq

      if ratio >= 1.50:
        growthBonus = 10
      elif ratio >= 1.30:
        growthBonus = 6
      elif ratio >= 1.15:
        growthBonus = 3
      elif prevAq >= 140 and absoluteDiff >= 12:
        # 2b. 绝对值兜底: 高基数时 +12 也算小幅进步
        growthBonus = 3

      g += growthBonus

    # 3. windowAq 和 cumulativeAq
    windowAq = k + h + c + s + g
    cumulativeAq = (prevSnap?.cumulative_aq ?? 0) + windowAq

    # 4. 进入本窗口判定时的 consecMissed(基于上一窗口结果)
    consecMissedOnEntry = prevSnap?.consec_missed_on_entry ?? 0
    if prevSnap and prevPromotionRecord(prevSnap).promoted == false:
      consecMissedOnEntry += 1

    # 5. 写快照
    snapshot = insert window_snapshots {
      window_id=windowId, member_id,
      window_aq=windowAq, cumulative_aq=cumulativeAq,
      k_score=k, h_score=h, c_score=c, s_score=s, g_score=g,
      growth_bonus=growthBonus,
      consec_missed_on_entry=consecMissedOnEntry,
      snapshot_at=now
    }

    # 6. 调用判定器
    level = fetch member_levels[memberId]
    decision = LevelPromotionJudge.judge({
      snapshot, currentLevel: level.current_level,
      consecMissedOnEntry, isFinal: window.is_final,
      dimensionRankContext: computeRankContext(memberId),
      attendedAllPeriods: computeAttendance(memberId),
      homeworkAllSubmitted: computeHomeworkAllSubmitted(memberId, window),
      sBehaviorScore: s, cBehaviorScore: c
    })

    # 7. 写进阶记录
    insert promotion_records {
      window_id=windowId, member_id,
      evaluated_at=now,
      from_level=level.current_level,
      to_level=decision.toLevel,
      promoted=decision.promoted ? 1 : 0,
      path_taken=decision.pathTaken,
      reason=JSON.stringify(decision.reason)
    }

    # 8. 更新成员段位
    if decision.promoted:
      UPDATE member_levels SET
        current_level=decision.toLevel,
        level_attained_at=now,
        last_window_id=windowId,
        updated_at=now
      WHERE member_id=memberId

  UPDATE window SET settlement_state='settled', settled_at=now
  notifyMembersWindowSettled(windowId)  # 子项目 2 推段位卡片
```

### 3.7 LevelPromotionJudge

#### 接口

```typescript
interface JudgeInput {
  snapshot: WindowSnapshot
  currentLevel: 1 | 2 | 3 | 4 | 5
  consecMissedOnEntry: number
  isFinal: boolean
  dimensionRankContext: {
    K: { rank: number; cumulativeScore: number }
    H: { rank: number; cumulativeScore: number }
    C: { rank: number; cumulativeScore: number }
    S: { rank: number; cumulativeScore: number }
    G: { rank: number; cumulativeScore: number }
    eligibleStudentCount: number  // 分母,用于 top-N / bottom-N 判断
    dimensionsInBottom1: Set<'K'|'H'|'C'|'S'|'G'>  // rank == eligibleStudentCount (倒数第 1)
    dimensionsInBottom3: Set<'K'|'H'|'C'|'S'|'G'>  // rank >= eligibleStudentCount - 2 (倒数 3 名)
    dimensionsInTop3: Set<'K'|'H'|'C'|'S'|'G'>     // rank <= 3
    dimensionsInTop5: Set<'K'|'H'|'C'|'S'|'G'>     // rank <= 5
    elapsedScoringPeriods: number  // 不含破冰期 + 不含本窗口两期
  }
  attendedAllPeriods: boolean
  homeworkAllSubmitted: boolean
  sBehaviorScore: number
  cBehaviorScore: number
}

interface JudgeOutput {
  promoted: boolean
  toLevel: 1 | 2 | 3 | 4 | 5
  pathTaken: 'primary' | 'alternate' | 'protection_discounted' | 'final_bonus' | 'none'
  reason: {
    attemptedPath: 'primary' | 'alternate' | 'both'
    conditionChecks: Array<{ name: string; passed: boolean; actual: unknown; required: unknown }>
    discount: number
    notes?: string[]
  }
}
```

#### 决策树逻辑

```
judge(input):
  if currentLevel == 5:
    return { promoted: false, toLevel: 5, pathTaken: 'none', reason: 'already_at_max' }

  # 折扣
  discount = 0
  dimCountRelax = 0
  if consecMissedOnEntry == 1:
    discount = 0.15
  elif consecMissedOnEntry >= 2:
    discount = 0.25
    dimCountRelax = 1

  # 终极评定门槛减半
  finalHalving = isFinal ? 0.5 : 1.0

  targetLevel = currentLevel + 1
  thresholds = BASE_THRESHOLDS[targetLevel]

  # 终极评定 + 全勤特权: 跳过维度条件
  skipDimensionChecks = isFinal and attendedAllPeriods

  # 尝试主路径
  primary = tryPrimary(...)
  if primary.passed:
    path = 'primary'
    if consecMissedOnEntry >= 1: path = 'protection_discounted'
    return { promoted: true, toLevel: targetLevel, pathTaken: path, reason: primary }

  # 尝试备选路径
  alternate = tryAlternate(...)
  if alternate.passed:
    path = 'alternate'
    if consecMissedOnEntry >= 1: path = 'protection_discounted'
    return { promoted: true, toLevel: targetLevel, pathTaken: path, reason: alternate }

  # 终极结业展示加分补救
  if isFinal and hasClosingShowcaseBonus:
    boostedSnapshot = { ...snapshot, k+5, h+5, c+5, s+5, g+5 }
    retryPrimary = tryPrimary(boostedSnapshot, ...)
    retryAlternate = tryAlternate(boostedSnapshot, ...)
    if retryPrimary.passed or retryAlternate.passed:
      return { promoted: true, toLevel: targetLevel, pathTaken: 'final_bonus', reason: ... }

  return { promoted: false, toLevel: currentLevel, pathTaken: 'none', reason: [primary, alternate] }
```

#### 门槛表 `BASE_THRESHOLDS`

```
Lv.2:
  primary:
    windowAq >= ceil(32 * (1-discount) * finalHalving)
    exists >= 1 dim with period_score >= 8
  alternate:
    cumulativeAq >= 56
    exists >= 2 dims with period_score >= 5

Lv.3:
  primary:
    windowAq >= ceil(42 * (1-discount) * finalHalving)
    exists >= (2 - dimCountRelax) dims with period_score >= 10
    homeworkAllSubmitted == true
  alternate:
    cumulativeAq >= 155 AND windowAq >= ceil(32 * (1-discount) * finalHalving)
    exists >= (3 - dimCountRelax) dims with dimCumulativeScore >= elapsedScoringPeriods * 4

Lv.4:
  primary:
    windowAq >= ceil(50 * (1-discount) * finalHalving) AND cumulativeAq >= 245
    count(dims with dimCumulativeScore >= elapsedScoringPeriods * 5) >= (4 - dimCountRelax)
    sBehaviorScore >= 5
  alternate:
    cumulativeAq >= 295 AND windowAq >= ceil(39 * (1-discount) * finalHalving)
    dimensionsInBottom1.size == 0                     # 无维度排名倒数第 1
    cBehaviorScore >= 8

Lv.5:
  primary:
    windowAq >= ceil(56 * (1-discount) * finalHalving) AND cumulativeAq >= 392
    all 5 dims with dimCumulativeScore >= elapsedScoringPeriods * 5
    dimensionsInTop3.size >= 1                        # 至少 1 维累计排名前 3
  alternate:
    cumulativeAq >= 434 AND windowAq >= ceil(46 * (1-discount) * finalHalving)
    dimensionsInTop5.size >= 4 AND dimensionsInBottom3.size == 0
    dimensionsInTop5.size >= 2                        # 行为条件,被上行维度条件蕴含,保留以对齐附件
```

**注意:** 连续未进阶保护**不降低 `cumulativeAq` 门槛**,只降低 `windowAq` 门槛和维度数要求。

#### 全勤特权

`isFinal && attendedAllPeriods` 时,跳过所有 `conditionChecks` 中的 "exists >= N dims with ..." 维度条件,只校验 AQ 和行为条件。

**attendedAllPeriods 定义:** 该学员在除破冰期外的**每一期**都至少有 1 条 `scoring_item_events.status='approved'` 的事件。

### 3.8 Dimension Rank Context 计算

在 `WindowSettler` 调用 `judge()` 前计算:

```
computeRankContext(memberId, window):
  eligibleStudentCount = count of eligible students
  dimensionsInBottom1 = empty set
  dimensionsInBottom3 = empty set
  dimensionsInTop3 = empty set
  dimensionsInTop5 = empty set
  dimResults = {}

  for each dimension in ['K','H','C','S','G']:
    allRanking = SELECT member_id, SUM(period_score) AS s
                 FROM member_dimension_scores
                 WHERE dimension=?
                   AND member_id IN eligibleStudents
                 GROUP BY member_id
                 ORDER BY s DESC, member_id ASC   # 稳定排序,避免 tie 时随机
    rankOfMember = index of memberId in allRanking + 1
    cumulativeScore = (sum for memberId, default 0)
    dimResults[dimension] = { rank: rankOfMember, cumulativeScore }

    if rankOfMember == eligibleStudentCount:
      dimensionsInBottom1.add(dimension)
    if rankOfMember >= eligibleStudentCount - 2:
      dimensionsInBottom3.add(dimension)
    if rankOfMember <= 3:
      dimensionsInTop3.add(dimension)
    if rankOfMember <= 5:
      dimensionsInTop5.add(dimension)

  elapsedScoringPeriods = count of periods
    WHERE camp_id = window.camp_id
      AND is_ice_breaker = 0
      AND number < (SELECT number FROM periods WHERE id = window.first_period_id)

  return {
    ...dimResults,
    eligibleStudentCount,
    dimensionsInBottom1,
    dimensionsInBottom3,
    dimensionsInTop3,
    dimensionsInTop5,
    elapsedScoringPeriods
  }
```

**Tie-breaking:** 排名按 `(cumulativeScore DESC, member_id ASC)` 稳定排序。相同分数时按 `member_id` 字母序排列,避免评定时的随机性。这意味着如果两人同分,字母序靠后的会排在后面,在 Top3/Top5/Bottom1/Bottom3 边界上可能有影响。如果业务方希望改为"同分并列"语义(比如 2 人都在第 1 名),需要在 writing-plans 阶段单独澄清。

---

## 4. LLM Async Workflow

### 4.1 LlmScoringWorker

常驻后台 worker,由 `src/server.ts` 启动时创建。抢占 `llm_scoring_tasks` 并异步执行。

```typescript
interface LlmScoringWorkerConfig {
  concurrency: number          // 默认 3
  rateLimitPerSec: number      // 默认 5
  pollIntervalMs: number       // 默认 500
  taskTimeoutMs: number        // 默认 30_000
  maxAttempts: number          // 默认 3
}
```

### 4.2 事件循环

```
start():
  tokenBucket = new TokenBucket(rateLimitPerSec)
  semaphore = new Semaphore(concurrency)

  while not stopped:
    task = beginTx {
      SELECT * FROM llm_scoring_tasks
      WHERE status='pending' AND attempts < max_attempts AND enqueued_at <= now
      ORDER BY enqueued_at ASC LIMIT 1 FOR UPDATE
      if found: UPDATE status='running', started_at=now, attempts=attempts+1
    }

    if task is None: sleep(pollIntervalMs); continue

    await semaphore.acquire()
    await tokenBucket.acquire()

    spawn:
      try:
        result = await llmClient.score(task.prompt_text, { timeoutMs: taskTimeoutMs })
        handleSuccess(task, result)
      catch error:
        handleFailure(task, error)
      finally:
        semaphore.release()
```

### 4.3 成功 / 失败处理

```
handleSuccess(task, result):
  begin tx
    UPDATE llm_scoring_tasks SET status='succeeded', finished_at=now, result_json=JSON.stringify(result)
    decision = result.pass ? 'approved' : 'review_required'
    ScoringAggregator.applyDecision(task.event_id, decision, result.reason)
  commit
  notifyMemberScoringDecision(task.event_id, decision)  # 子项目 2 stub

handleFailure(task, error):
  if task.attempts >= task.max_attempts:
    begin tx
      UPDATE llm_scoring_tasks SET status='failed', error_reason=error.message, finished_at=now
      ScoringAggregator.applyDecision(task.event_id, 'review_required', 'llm_exhausted: ' + error.message)
    commit
  else:
    # 指数退避: 2^attempts 秒
    backoff = 2 ** task.attempts
    UPDATE llm_scoring_tasks SET
      status='pending',
      enqueued_at=now + backoff seconds,
      error_reason=error.message
    WHERE id=task.id
```

### 4.4 LlmScoringClient 接口

```typescript
export interface LlmScoringClient {
  readonly provider: string
  readonly model: string
  score(promptText: string, options: {
    timeoutMs: number
    signal?: AbortSignal
  }): Promise<LlmScoringResult>
}

export interface LlmScoringResult {
  pass: boolean
  score: number
  reason: string
  raw: unknown
}
```

**子项目 1 提供的实现:**
1. `FakeLlmScoringClient`(单测用,可配置返回值)
2. `OpenAiCompatibleLlmScoringClient`(基于现有 `openai-compatible.ts`,配合 `LlmProviderConfig`)

**子项目 4 可能替换或新增其他 provider 的 Client,但不改动 Worker。**

### 4.5 Structured Output 约束

LLM 必须返回严格 JSON:
```json
{ "pass": true, "score": 3, "reason": "…" }
```

**优先**使用 provider 的 JSON mode(`response_format: { type: "json_object" }`)。
**Fallback**:Prompt 末尾强制"只输出 JSON",parse 失败抛 `LlmNonRetryableError`(不重试,直接进复核)。

### 4.6 Prompt 模板(6 项)

Prompt 模板全部放在 `src/domain/v2/llm-prompts.ts`,在 `EventIngestor.ingest` 时调用 `renderPrompt(itemCode, payload)` 冻结为文本,写入 `llm_scoring_tasks.prompt_text`。

共同 System prompt 前缀:

```
你是 AI 训练营评分助手。根据学员的提交内容判断是否合格。
必须只输出严格 JSON,格式: {"pass": boolean, "score": number, "reason": string}
reason 必须用中文口语化表达,便于学员理解。
```

**K3 知识总结:**
```
评分项: K3 知识总结打卡
合格标准:
1. 有明确的 AI 相关知识点(至少 1 个)
2. 用学员自己的话表达,不是复制粘贴官方定义
3. 字数 >= 30
满分 3, 不合格 0。
学员提交:
"""
{PAYLOAD_TEXT}
"""
```

**K4 纠错/补充:**
```
评分项: K4 AI 纠错或补充
合格标准:
1. 指出 AI 输出的具体错误或遗漏
2. 有明确的纠正或补充内容
3. 不是笼统的"AI 说错了"
满分 4, 不合格 0。
学员提交:
"""
{PAYLOAD_TEXT}
"""
```

**C1 创意用法:**
```
评分项: C1 AI 创意用法
合格标准:
1. 描述一个具体的 AI 应用场景或新玩法
2. 有可执行性(不是空想)
3. 和学员本职工作或日常生活相关
满分 4, 不合格 0。
学员提交:
"""
{PAYLOAD_TEXT}
"""
```

**C3 提示词模板:**
```
评分项: C3 自创提示词模板
合格标准:
1. 模板有明确的结构(角色 / 任务 / 约束 / 输出 至少覆盖其中 2 项)
2. 可复用,不绑定单次对话
3. 有具体场景说明
满分 5, 不合格 0。
学员提交:
"""
{PAYLOAD_TEXT}
"""
```

**H2 实操分享:**
```
评分项: H2 AI 实操分享
合格标准:
1. 描述清楚用了什么 AI 工具
2. 描述清楚做了什么任务
3. 描述清楚结果如何
满分 3, 不合格 0。
学员提交:
"""
{PAYLOAD_TEXT}
"""
```

**G2 课外资源分享:**
```
评分项: G2 课外好资源
合格标准:
1. 链接或内容确实和 AI 相关
2. 有简单的为什么推荐(至少一句话理由)
3. 不是纯广告
满分 3, 不合格 0。
学员提交:
"""
{PAYLOAD_TEXT}
"""
```

### 4.7 崩溃恢复

worker 启动时:
```
UPDATE llm_scoring_tasks
SET status='pending'
WHERE status='running' AND started_at < now - 2 * task_timeout_ms
```

将"running 但已经超过 2 倍超时"的任务重置为 pending,下一轮重抢。

### 4.8 观测 API

`GET /api/v2/llm/worker/status` 返回:
```json
{
  "running": true,
  "concurrencyInUse": 2,
  "concurrencyMax": 3,
  "pendingCount": 7,
  "runningCount": 2,
  "succeededLast1h": 34,
  "failedLast1h": 1,
  "reviewQueueDepth": 3,
  "avgLatencyMs": 1240,
  "recentFailures": [
    { "eventId": "...", "errorReason": "timeout", "at": "..." }
  ]
}
```

### 4.9 .env 配置入口

```
LLM_PROVIDER=glm
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_API_KEY=<secret>
LLM_TEXT_MODEL=glm-4.5-flash      # 待子项目 4 决定
LLM_CONCURRENCY=3
LLM_RATE_LIMIT_PER_SEC=5
LLM_POLL_INTERVAL_MS=500
LLM_TASK_TIMEOUT_MS=30000
LLM_MAX_ATTEMPTS=3
```

具体 `LLM_TEXT_MODEL` 的默认值和 provider 的选型由子项目 4 决定,子项目 1 只提供配置入口。

---

## 5. External Data Reflows & Operator Gating

### 5.1 K2 课后测验:内嵌卡片(不跳外部问卷)

**决策:** 测验题目内嵌到交互式卡片,不使用飞书问卷。

**数据表:**
```
question_sets:
  id | code | title | created_by_op_id | created_at

questions:
  id | question_set_id | seq | stem | options_json | answer_key | weight
```

**流程:**
1. 讲师 `/测验 <questionSetCode>` → 拉 question_set 的 N 道题 → 推送包含 N 个题目的交互式卡片
2. 学员逐题点答案按钮 → callback 到 `card_interactions`(子项目 2 负责路由)
3. 卡片全部答完 → 计算正确率 → 触发 `EventIngestor.ingest('K2', scoreDelta=round(correctRate*10))`

题库管理由子项目 3 的运营后台实现。

### 5.2 C2 点赞统计

**数据表:**
```
reaction_tracked_messages:
  message_id | member_id | period_id | score_item_code | reaction_count | created_at
```

**流程:**
1. 学员 C1 创意用法 LLM 判通过 → `ScoringAggregator.applyDecision` 钩子触发"回显到群"
2. `messenger.forwardAsBotMessage(memberId, text)` → 飞书返回 `messageId`
3. 插入 `reaction_tracked_messages { message_id, member_id, ..., reaction_count: 0 }`
4. 子项目 2 订阅 `im.message.reaction.created_v1` 事件 → 反查 `reaction_tracked_messages[messageId]`:
   - **去重:** 如 `reaction.user_id == memberId`,跳过(不允许自赞)
   - `reaction_count += 1`
   - 每累计 3 个 → `EventIngestor.ingest('C2', scoreDelta=1, sourceRef=messageId + ':' + reactionBatchIndex)`

**防污染:** C1 被 LLM 判**不通过**时不转发到群,避免把低质内容推广。

### 5.3 S1 + S2 互评

**决策:** 每期 1 次互评卡片,每学员最多选 2 人。

**数据表:**
```
peer_review_sessions:
  id | period_id | started_at | ended_at | created_by_op_id | status('open'|'closed')

peer_review_votes:
  id | session_id | voter_member_id | selected_member_id | vote_order(1 or 2) | created_at
  UNIQUE(session_id, voter_member_id, selected_member_id)
```

**流程:**
1. 讲师 `/互评` → 创建 `peer_review_sessions(status='open')` → 对每个 eligible student 推互评卡片(按钮是其他 13 位学员)
2. 学员最多选 2 人(不能选自己)→ 每次点按钮插入 `peer_review_votes` → 卡片显示"已选 X/2"
3. 讲师 `/互评结算 <sessionId>` → `UPDATE sessions SET status='closed'`
4. 对每个 `selected_member_id` 按 vote count 调 `EventIngestor.ingest('S1', scoreDelta=3)`(上限裁剪自动处理)
5. 对每个 voter 调 `EventIngestor.ingest('S2', scoreDelta=2)`

### 5.4 G3 连续活跃

**决策:** 复用现有 `raw_events` 表聚合,不调外部飞书历史消息 API。

**流程:**
1. 现有系统已订阅 `im.message.receive_v1`,所有入群消息落 `raw_events`
2. `WindowSettler.settle` 中(或 period 关闭时钩子)聚合:
```sql
SELECT sender_member_id, COUNT(DISTINCT DATE(event_time)) as active_days
FROM raw_events
WHERE event_time BETWEEN period.started_at AND period.ended_at
  AND chat_id = period.bound_chat_id
  AND sender_member_id IS NOT NULL
  AND message_type != 'card_action'
GROUP BY sender_member_id
HAVING active_days >= 4
```
3. 命中的学员 → `EventIngestor.ingest('G3', scoreDelta=4, sourceRef='period-' + periodId)`

**sourceRef 幂等:** `period-<periodId>` 作为 sourceRef,防止窗口重算时重复 ingest。

### 5.5 运营 Gating 5 层防御

```
Layer 1: EventIngestor 入口 — isEligibleStudent check
Layer 2: ScoringAggregator — upsert 前 JOIN 检查(冗余)
Layer 3: WindowSettler — 只对 eligibleStudents 生成 snapshot
Layer 4: Board 查询接口 — WHERE role_type='student' AND hidden_from_board=0
Layer 5: Admin API — 要求 X-Feishu-Open-Id 对应的 member role in ('operator','trainer')
```

### 5.6 `isEligibleStudent` 唯一真相源

```typescript
// src/domain/v2/eligibility.ts
export function isEligibleStudent(memberId: string, repo: Repository): boolean {
  const m = repo.findMemberById(memberId)
  if (!m) return false
  if (m.roleType !== 'student') return false
  if (!m.isParticipant) return false
  if (m.isExcludedFromBoard) return false
  return true
}
```

所有 5 层 gate **都引用同一函数**,避免重复逻辑。

### 5.7 统计分母

- 排行榜总人数:`count of eligibleStudents`
- `computeRankContext.elapsedScoringPeriods` 以 `count(periods where is_ice_breaker=0 AND number < window.first_period.number)` 计算
- 14 人预估分布(附件 §6)以 eligibleStudents 为分母

### 5.8 历史数据清理策略

某学员从 student 改为 operator 后:
- 所有 `scoring_item_events` / `member_dimension_scores` / `window_snapshots` / `promotion_records` **保留**(审计可追溯)
- 所有排行榜和新窗口判定**自动过滤**(查询时 JOIN gate)
- 效果:旧数据"静默消失"

### 5.9 运营 Bootstrap

`.env` 新增:
```
BOOTSTRAP_OPERATOR_OPEN_IDS=ou_xxx,ou_yyy
```

`seed:ensure` 和成员同步流程中:
- 如果 `members` 表某条记录的 `source_feishu_open_id` 在 `BOOTSTRAP_OPERATOR_OPEN_IDS` 列表里
- 自动 `UPDATE members SET role_type='operator', hidden_from_board=1`
- 后续运营可在运营面板相互提权(子项目 3 实现)

### 5.10 MemberSyncService Stub

子项目 1 定义接口:
```typescript
export interface MemberSyncService {
  syncGroupMembers(chatId: string): Promise<SyncResult>
  syncUserAvatars(openIds: string[]): Promise<void>
}

export interface SyncResult {
  added: number
  updated: number
  totalInGroup: number
  syncedAt: string
}
```

子项目 1 提供 `StubMemberSyncService`(只 log,不调飞书);子项目 2 提供 `FeishuMemberSyncService`(真实调飞书 OpenAPI)。

### 5.11 Admin 鉴权中间件

```typescript
// src/app.ts 新增中间件
async function requireAdmin(request, reply) {
  const openId = request.headers['x-feishu-open-id']
  if (!openId) {
    return reply.code(401).send({ code: 'no_identity' })
  }
  const member = repo.findMemberByFeishuOpenId(openId as string)
  if (!member || !['operator', 'trainer'].includes(member.roleType)) {
    return reply.code(403).send({ code: 'not_admin' })
  }
  request.currentAdmin = member
}
```

所有 `/api/v2/admin/*` 路由添加此中间件。学员只读接口不强制要求 `X-Feishu-Open-Id`,但如果有会显示"我的位置"。

---

## 6. Deprecation / Error Handling / Testing / Deployment Assumptions

### 6.1 Deployment Assumptions(新增)

```
子项目 1 交付的所有 HTTP API(/api/v2/*)不假设公网可达。

- 飞书事件仍走 FEISHU_EVENT_MODE=long_connection(SWAS 主动出站)
- SWAS 80/443 部署时对公网收口,不对外暴露
- 看板 / 运营入口由子项目 3 选型(主假设: 飞书 H5 应用 + Cloudflare Tunnel)
- Admin API 鉴权通过 X-Feishu-Open-Id 请求头 + members.role_type 判断
- 无需密码登录、无需 session、无需 JWT
```

这条假设对应阿里云 cn-hangzhou SWAS 的备案合规约束(见 `docs/aliyun-capability-baseline-2026-04-10.md` §4.1)。

### 6.2 废弃清单

#### 完全删除(不保留兼容)

| 文件 | 原因 |
|---|---|
| `src/domain/scoring.ts` | 启发式 + 二元 LLM 评分,和 v2 十五项体系冲突 |
| `src/domain/warnings.ts` | warning/elimination 语义作废(新规则不降级不淘汰) |
| `src/domain/ranking.ts` | 纯累计分排序,不支持段位/雷达/累计排名 |
| `src/domain/session-windows.ts` | 旧 SessionDefinition tag 匹配,新规则不用 hashtag |
| `src/domain/submission-aggregation.ts` | 旧"单文件提交聚合"语义作废 |
| `src/domain/tag-parser.ts` | 新规则全卡片按钮,不解析 hashtag |
| `src/services/llm/glm-file-parser.ts` | 新规则不再做 PDF/DOCX 解析 |
| `src/services/llm/llm-evaluator.ts` | 被 v2 llm-scoring-worker 取代 |
| `src/services/documents/extract-text.ts` | 新规则不做文档解析 |
| `src/services/documents/file-format.ts` | 同上 |
| `src/services/scoring/evaluate-window.ts` | 被 v2 window-settler 取代 |
| `src/services/feishu/base-sync.ts` | 新方案不用 Feishu Base 做数据镜像 |
| `web/src/` 全部 | 子项目 3 重写 |
| 上述每个文件对应的 `tests/**/*.test.ts` | 废弃 |

#### 保留复用

| 文件 | 保留原因 |
|---|---|
| `src/services/feishu/client.ts` | 飞书 API Client |
| `src/services/feishu/ws-runtime.ts` | 长连接运行时 |
| `src/services/feishu/config.ts` | 飞书配置读取 |
| `src/services/feishu/messenger.ts` | 机器人发消息,子项目 2 扩展 |
| `src/services/feishu/bootstrap.ts` | bootstrap 流程 |
| `src/services/feishu/normalize-message.ts` | 保留非文件消息的规整,文件消息分支废弃 |
| `src/storage/sqlite-repository.ts` | 数据访问层,v2 方法追加 |
| `src/db/*` | schema 管理,追加 v2 |
| `src/config/*` | 配置加载 |
| `src/domain/types.ts` | 旧类型,不破坏;新增 v2 类型 |
| `src/app.ts` | 主入口,扩展 v2 路由 |
| `src/server.ts` | 启动入口 |

#### 归档策略

- `git rm` 直接移除,不 comment out
- 单独一个 commit `chore: drop legacy v1 scoring surface`

### 6.3 Typed Error Hierarchy

```typescript
// src/domain/v2/errors.ts
export class DomainError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = this.constructor.name
  }
}

export class NotEligibleError extends DomainError { /* code: 'not_eligible' */ }
export class PerPeriodCapExceededError extends DomainError { /* code: 'cap_exceeded' */ }
export class DuplicateEventError extends DomainError { /* code: 'duplicate' */ }
export class NoActivePeriodError extends DomainError { /* code: 'no_active_period' */ }
export class IceBreakerPeriodError extends DomainError { /* code: 'ice_breaker_no_scoring' */ }
export class NoActiveWindowError extends DomainError { /* code: 'no_active_window' */ }
export class WindowAlreadySettledError extends DomainError { /* code: 'window_already_settled' */ }
export class InvalidLevelTransitionError extends DomainError { /* code: 'invalid_level_transition' */ }
export class LlmRetryableError extends DomainError { /* code: 'llm_retryable' */ }
export class LlmNonRetryableError extends DomainError { /* code: 'llm_non_retryable' */ }
export class LlmExhaustedError extends DomainError { /* code: 'llm_exhausted' */ }
```

### 6.4 错误处理原则

1. 领域层只抛 `DomainError` 子类,不抛通用 `Error`/`TypeError`
2. `EventIngestor` 把业务拒绝原因(not_eligible / cap_exceeded / duplicate)转成 `{ accepted: false, reason }` 返回,不通过 throw 传播
3. `InvalidLevelTransitionError` 等"代码层 bug"直接 throw,让调用栈崩溃,便于定位
4. `LlmScoringWorker` 区分 retryable / non-retryable:
   - retryable(网络超时、5xx、rate limit) → 重新入队 + 指数退避
   - non-retryable(4xx、JSON parse 失败、prompt 违反内容策略) → 直接标 review_required
   - attempts 耗尽 → `LlmExhaustedError` → review_required
5. API 层捕获 `DomainError` → HTTP 映射:
   - `not_eligible` / `cap_exceeded` / `duplicate` → 400 + `{ ok: false, code, message }`
   - `no_active_period` / `no_active_window` / `ice_breaker_no_scoring` → 409 + hint
   - `llm_exhausted` 不对外暴露
   - 未捕获 → 500 + 不泄露 stack trace

### 6.5 测试策略

#### 覆盖率目标

- `src/domain/v2/**`: lines ≥ 85%, branches ≥ 90%
- `src/services/v2/**`: lines ≥ 80%
- `src/app.ts` v2 路由部分: 主流程集成测试覆盖

#### 测试分层

| 层 | 工具 | 范围 |
|---|---|---|
| 单元 | vitest | `eligibility`, `ingestor`, `aggregator`, `window-settler`, **`promotion-judge`**, `scoring-items-config`, `llm-prompts` |
| 单元 | vitest + fake time | `llm-scoring-worker` (重试/超时/限流/崩溃恢复) |
| 集成 | vitest + in-memory SQLite | repository + `period → events → settle → snapshot → promotion` 完整流水 |
| 集成 | vitest + fastify inject | `/api/v2/*` 路由 |
| E2E | 不做 | 子项目 3 决定 |

#### promotion-judge 的 60 条路径

5 段跃迁 × 2 路径 × 3 折扣状态(0 / -15% / -25%) × 2 终极态 = 60 条。使用 `describe.each` 参数化,每条一条断言:`{ promoted, pathTaken }`。

#### LLM 测试

- 不在 CI 中真调 LLM
- `FakeLlmScoringClient` 实现可配置返回
- 独立脚本 `npm run llm:smoke`(可选,手动触发)真调 provider 对 6 个 prompt 做冒烟

#### CI 门

- `npm test` 全绿
- `npm run build` 全绿
- `npm run test:coverage` lines ≥ 85%(vitest config 落地)

---

## 7. Out of Scope

下列内容**不在**本 spec 范围,由后续子项目负责:

| 子项目 | 负责范围 |
|---|---|
| 2 | 飞书交互式卡片的具体 JSON 结构、卡片下发、`im.message.card.action` 订阅与路由、成员/头像实际同步实现、群消息转发、emoji reaction 订阅、飞书 API scope 与权限配置 |
| 3 | 前端 UI、段位徽章设计、五维雷达图、排行榜动画、运营后台 UI、题库管理 UI、复核队列 UI、飞书 H5 应用注册、Cloudflare Tunnel / SWAS 网络接入、`X-Feishu-Open-Id` 中间件的 H5 侧注入 |
| 4 | LLM provider 选型、`LLM_TEXT_MODEL` 的默认值决定、成本测算、实际替换 `provider-config.ts` 默认值 |

---

## 8. Regulatory Divergence from Attachment

本 spec 相对于 `output/AI训练营_14人进阶规则.md` v1.1 有以下偏差或细化,用于消除模糊并与实现对齐。如果业务方希望回到原文口径,需要重新 brainstorming。

| # | 偏差项 | 附件口径 | 本 spec 口径 | 理由 |
|---|---|---|---|---|
| 8.1 | K3 每期上限 | 6 | **3** | K 维度每期满分 20 = 3+10+6+4=23 不成立;改 K3 上限为 3 后合计 20 对齐 |
| 8.2 | 窗口懒加载 | 未定义 | **seed 预建 W1/W2,其余由讲师 `/开窗` 手动创建** | 讲师应对不可抗力有控制感;避免系统盲目预建 |
| 8.3 | `/结业` 命令 | 未提 | **新增作为 FINAL 窗口结算触发点** | 第 12 期无"下一期 /开期"可自动触发,必须显式命令 |
| 8.4 | 破冰期与 window 的关系 | 未明说 | **破冰期不绑定任何 window,不计分** | 避免学员在第 1 期点按钮污染 AQ |
| 8.5 | 全勤特权定义 | 未明说 | **11 期(不含破冰期)每一期至少 1 条 `approved` 事件** | 严格但可审计 |
| 8.6 | LLM 评分范围 | 暗示 K3/K4/C1/C3 | **K3/K4/C1/C3 + H2/G2 共 6 项** | 扩展到 H2 描述和 G2 链接相关性 |
| 8.7 | LLM 输出形态 | 未定义 | **通过直接给分 + 不通过进入讲师复核队列** | 平衡学员体验和质量把关 |
| 8.8 | 互评每期次数和选人数 | 未明说 | **每期 1 次,每人最多选 2 人(不能选自己)** | 与 S1 上限 6 精确对齐 |
| 8.9 | G3 活跃时间窗口 | "两期之间" | **period.started_at 到 period.ended_at 之间** | "两期之间"字面歧义大,取每期内部窗口最严谨 |
| 8.10 | 成长力加权能连续享受 | 未明说 | **可以,每窗口独立判定** | 鼓励持续进步,不惩罚连续 |
| 8.11 | `pendingSum` 计入上限 | 未提 | **是,pending+approved 同时占上限** | 防止多次提交抢占额度 |
| 8.12 | 运营不计分 | "有运营人员" | **5 层 gate + `isEligibleStudent` 唯一真相源** | 多层防御,单层失效不穿透 |

---

## 9. Open Questions Tracked

以下问题**不阻塞**子项目 1 的 spec 定稿和实现,但应在相应子项目 brainstorming 时澄清:

1. **测验题库的来源** — 讲师上传 Excel?运营后台手动录入?题库管理 UI 的细节在子项目 3 决定。
2. **运营能否手动调分** — `operator_manual` 的 sourceType 预留了,但运营后台具体支持什么操作在子项目 3 决定。
3. **讲师复核队列的 SLA** — 复核队列的默认处理时长和超时行为由运营流程决定,本 spec 只提供数据结构。
4. **LLM Prompt 的多语言** — 当前 prompt 固定中文,如果未来有英文培训,需要多语言支持。暂不处理。
5. **C2 点赞上限的时序公平性** — 如果一条转发消息在短时间内被多人点同一个 emoji,reaction 计数可能有并发写入。建议在子项目 2 的 `reaction-tracker` 用 SQL `UPDATE ... SET reaction_count = reaction_count + 1` 原子操作。

---

## 10. Acceptance Criteria

本 spec 被认为"可进入 writing-plans"的条件:

- [x] 9 张新表 schema 全部字段明确(无 TBD)
- [x] 15 个评分项配置表完整(含上限、维度、LLM 需要性)
- [x] `LevelPromotionJudge` 60 条路径表述清晰
- [x] 成长力加权 3 个边界(ratio / prevAq<30 / prevAq>=140)明确
- [x] `/开期` / `/开窗` / `/结业` 三个命令的伪代码完整
- [x] 运营 gating 5 层路径明确,`isEligibleStudent` 唯一真相源
- [x] LLM worker 架构完整(并发/限流/退避/崩溃恢复/观测)
- [x] 6 个 LLM Prompt 模板全部列出
- [x] 废弃清单 + 保留清单明确
- [x] 测试覆盖率目标明确
- [x] 部署假设明确(无公网域名约束)
- [x] 相对附件的偏差全部记录

---

## 11. Next Step

调 `superpowers:writing-plans` skill,根据本 spec 生成子项目 1 的分步实现计划(带 TDD RED/GREEN/REFACTOR 的任务粒度)。
