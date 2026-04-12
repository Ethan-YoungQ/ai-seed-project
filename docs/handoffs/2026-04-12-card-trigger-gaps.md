# 卡片触发断路清单 — 开发交接文档

> 日期：2026-04-12
> 交接人：YongQ → 开发线程
> 优先级：P0（上线阻塞）
> 上线目标：2026-04-15

---

## 一、问题总结

系统的 17 种卡片中，**模板和 Handler 全部已开发完成**，但**只有管理面板（admin_panel）接通了群消息触发**。其余功能卡片没有触发入口——学员在群里无法看到签到、测验、作业等卡片，导致整个评分闭环无法启动。

**一句话：后端全通了，但"谁把卡片发到群里"这一步大部分没接。**

---

## 二、断路清单

### 🔴 P0 断路（上线阻塞，必须修复）

| # | 卡片类型 | 模板文件 | Handler 文件 | 断路描述 | 建议触发方式 |
|---|---------|---------|-------------|---------|------------|
| 1 | `daily_checkin` 每日签到 | `cards/templates/daily-checkin-v1.ts` | `cards/handlers/daily-checkin-handler.ts` | 模板+Handler 完整，但无法通过群消息或管理面板发送到群里。学员看不到签到卡片，K3/K4/H2/C1/C3/G2 六个评分项全部无法提交。 | 培训师在群里发 **"签到"** → Bot 发送当期签到卡片 |
| 2 | `quiz` 测验 | `cards/templates/quiz-v1.ts` | `cards/handlers/quiz-handler.ts` | 模板+Handler 完整，但无触发入口。K1+K2 两个评分项无法使用。测验需要题库数据（QuizQuestion[]），触发时需指定题目集。 | 培训师在群里发 **"测验"** → Bot 发送当期测验卡片 |
| 3 | `homework_submit` 作业提交 | `cards/templates/homework-submit-v1.ts` | `cards/handlers/homework-handler.ts` | 模板+Handler 完整，但无触发入口。H1 评分项无法使用。 | 培训师在群里发 **"作业"** → Bot 发送作业提交卡片 |
| 4 | `video_checkin` 视频打卡 | `cards/templates/video-checkin-v1.ts` | `cards/handlers/video-checkin-handler.ts` | 模板+Handler 完整，但无触发入口。G1+H3 两个评分项无法使用。 | 培训师在群里发 **"视频"** → Bot 发送视频打卡卡片 |
| 5 | `peer_review_vote` 互评投票 | `cards/templates/peer-review-vote-v1.ts` | `cards/handlers/peer-review-handler.ts` | 模板+Handler 完整，但无触发入口。S1+S2 两个评分项无法使用。 | 培训师在群里发 **"互评"** → Bot 发送互评卡片 |

### 🟡 P1 断路（非阻塞但影响完整性）

| # | 卡片类型 | 断路描述 | 建议处理 |
|---|---------|---------|---------|
| 6 | `peer_review_settle` 互评结算 | 投票记录已入库，但缺少结算逻辑将票数转化为 S1/S2 分数。Handler 存在但未连接触发。 | 在管理面板增加"互评结算"按钮，或关键词 **"结算互评"** 触发 |
| 7 | `member_mgmt` 成员管理 | 模板+Handler 完整，仅可通过 API 调用，群内无入口。 | 关键词 **"成员"** 触发 |
| 8 | `manual_adjust` 手动调分 | 模板+Handler 完整，仅可通过 API 调用，群内无入口。 | 关键词 **"调分"** 触发 |
| 9 | C2 Emoji 反应计分 | C1 通过后 Bot 会推 `c1_echo` 卡片，但学员点 emoji 后是否正确触发 C2 计分未验证。需确认 `im.message.reaction.created_v1` 事件是否已在 ws-runtime 中处理。 | 验证事件订阅 + 补充 reaction handler |

### ✅ 已正常工作

| 卡片类型 | 触发方式 |
|---------|---------|
| `admin_panel` 管理面板 | 群里发"管理" ✅ |
| `review_queue` 审核队列 | LLM 评分完成后自动推送 ✅ |
| `llm_decision` LLM 决策通知 | LLM 完成后 DM 推送 ✅ |
| `c1_echo` 创意回声 | C1 通过后自动推送 ✅ |
| `level_announcement` 段位通知 | 窗口结算后自动推送 ✅ |
| `graduation` 毕业通知 | 毕业结算后自动推送 ✅ |
| `leaderboard` 排行榜卡片 | 卡片内分页操作 ✅ |
| `period_open` 开期通知 | 管理面板开期后自动推送 ✅ |
| `window_open` 开窗通知 | 管理面板开窗后自动推送 ✅ |

---

## 三、开发方案

### 3.1 核心思路

参照已成功的 `admin_panel` 关键词触发模式，在 `message-commands.ts` 中增加 5 个关键词处理器。

### 3.2 需要修改的文件

| 文件 | 修改内容 |
|------|---------|
| `src/services/feishu/message-commands.ts` | 新增 5 个关键词（签到/测验/作业/视频/互评）的触发逻辑 |
| `src/app.ts` | 将新增依赖（题库数据、period 信息等）注入到 MessageCommandDeps |
| `src/services/feishu/cards/templates/admin-panel-v1.ts` | 可选：在管理面板中增加"发送签到卡片""发送测验"等按钮 |

### 3.3 每个卡片的触发实现要点

#### 1. 每日签到（"签到"）

```
触发条件：培训师发"签到"
需要数据：当前活跃 period（number + id）
构建函数：buildDailyCheckinCard(emptyDailyCheckinState({periodNumber, periodId, postedAt}))
发送目标：群聊 chatId
权限检查：operator / trainer
注意事项：
  - 每期只应发一张签到卡片，重复发送需检查是否已有 live_card
  - 需要调用 insertLiveCard() 记录到 feishu_live_cards 表
  - 学员后续点击按钮时，Handler 通过 findLiveCard() 查找状态
```

代码参考：
- 模板：`cards/templates/daily-checkin-v1.ts` → `buildDailyCheckinCard(state)`
- 状态工厂：`emptyDailyCheckinState({periodNumber, postedAt, periodId})`
- Handler 入口：`cards/handlers/daily-checkin-handler.ts`（已注册到 dispatcher）

#### 2. 测验（"测验"）

```
触发条件：培训师发"测验"
需要数据：当前 period + 题库（QuizQuestion[]）
构建函数：buildQuizCard({setCode, periodNumber, title, questions})
权限检查：operator / trainer
注意事项：
  - 题库数据从哪来？需要确认：
    a) 硬编码在代码中？
    b) 从数据库/配置文件读取？
    c) 管理员填写后存储？
  - 当前 quiz-v1.ts 接受 QuizQuestion[] 参数，需要补充题库数据源
  - quiz-handler.ts 中 quiz_select 记录选项、quiz_submit 计算 K1+K2
```

代码参考：
- 模板：`cards/templates/quiz-v1.ts` → `buildQuizCard(state)`
- Handler：`cards/handlers/quiz-handler.ts`
- 题目接口：`QuizQuestion { id, text, options: QuizOption[] }`

#### 3. 作业提交（"作业"）

```
触发条件：培训师发"作业"
需要数据：作业标题、截止时间
构建函数：buildHomeworkSubmitCard({sessionId, title, deadline, submitters: []})
权限检查：operator / trainer
注意事项：
  - 需要讲师指定作业标题（可用默认值如"第 N 期作业"）
  - 截止时间可以设为当期结束时间
  - 学员点"提交作业"→ H1 自动计 5 分（无需 LLM）
```

代码参考：
- 模板：`cards/templates/homework-submit-v1.ts` → `buildHomeworkSubmitCard(state)`
- Handler：`cards/handlers/homework-handler.ts`

#### 4. 视频打卡（"视频"）

```
触发条件：培训师发"视频"
需要数据：当前 period
构建函数：buildVideoCheckinCard(state)
权限检查：operator / trainer
注意事项：
  - 学员点"完成打卡"→ G1 计 3 分 + H3 计 2 分（都是自动）
```

代码参考：
- 模板：`cards/templates/video-checkin-v1.ts`
- Handler：`cards/handlers/video-checkin-handler.ts`

#### 5. 互评投票（"互评"）

```
触发条件：培训师发"互评"
需要数据：当前 period + 学员列表
构建函数：buildPeerReviewVoteCard(state)
权限检查：operator / trainer
注意事项：
  - 需要传入当期所有学员名单作为投票选项
  - 投票后记录到 v2_peer_review_votes
  - 投票结算（票数→S1/S2 分数）是独立的 P1 任务
```

代码参考：
- 模板：`cards/templates/peer-review-vote-v1.ts`
- Handler：`cards/handlers/peer-review-handler.ts`

### 3.4 可选方案：管理面板集成

除了关键词触发，也可以在管理面板中增加按钮。在 `admin-panel-v1.ts` 的 body elements 中加一组：

```
📋 发送卡片
  [签到] [测验] [作业] [视频] [互评]
```

管理员点按钮 → admin_panel_handler 处理 → 构建对应卡片 → sendCardMessage 到群。

这两种方式可以并存。

---

## 四、测验题库问题

测验卡片需要题目数据（`QuizQuestion[]`），但当前代码中**没有题库数据源**。需要决定：

| 方案 | 说明 | 复杂度 |
|------|------|--------|
| A. 硬编码 | 把 12 期的题目写在代码里 | 低，但不灵活 |
| B. 配置文件 | 放在 `data/quiz-sets/` 目录下的 JSON 文件 | 中，推荐 |
| C. 数据库表 | 新建 `quiz_sets` + `quiz_questions` 表 | 高，暂不推荐 |
| D. 管理员输入 | 管理员在群里发题目文本，Bot 解析 | 高，暂不推荐 |

**建议方案 B**：每期一个 JSON 文件如 `quiz-period-1.json`，培训师在群里发"测验"时读取当期题目文件。

---

## 五、飞书卡片 Schema 2.0 注意事项

开发新卡片时必须遵守，否则飞书 API 返回 400：

| 规则 | 说明 |
|------|------|
| ❌ 禁止 `action` 标签 | Schema 2.0 已废弃，会报 230099 错误 |
| ✅ 用 `column_set` + `column` | 所有交互组件（button, select_static）放在 column > elements 里 |
| ✅ try/catch | onMessage callback 必须有 try/catch，否则错误被 SDK 吞掉 |
| ✅ @mention strip | rawText 含 `@_user_1` 前缀，用 `stripAtMentionPrefix()` 处理 |
| ✅ 权限检查 | findMemberByOpenId 依赖 `source_feishu_open_id` 列预先绑定 |

详细规范参见：`docs/skills/feishu-card-development.md`

---

## 六、部署注意事项

服务器是阿里云 SWAS（不是 ECS），部署流程参见：`docs/skills/aliyun-swas-deploy.md`

关键点：
- GitHub 从服务器直连经常超时 → 用 Base64 编码文件直写
- 每次部署后必须 `systemctl restart ai-seed-project`
- 用 `journalctl -u ai-seed-project | grep AdminPanel` 查诊断日志

---

## 七、影响范围评估

### 修复后解锁的评分项

| 修复的卡片 | 解锁的评分项 | 影响维度 |
|-----------|------------|---------|
| daily_checkin | K3, K4, H2, C1, C3, G2 | K + H + C + G |
| quiz | K1, K2 | K |
| homework_submit | H1 | H |
| video_checkin | G1, H3 | G + H |
| peer_review_vote | S1, S2 | S |

**修复前**：15 个评分项中只有管理面板的管理功能可用，**0 个评分项可被学员使用**。
**修复后**：全部 15 个评分项闭环打通。

### 不修复的后果

4/15 上线日学员入群后：
- 看不到签到卡片 → 无法提交 K3/K4/H2/C1/C3/G2
- 看不到测验卡片 → 无法答题得 K1/K2 分
- 看不到作业卡片 → 无法提交作业得 H1 分
- 排行榜永远是 0 分
- **整个系统等于没有运行**

---

## 八、开发优先级建议

```
P0 必须在 4/14 完成（上线阻塞）：
  1. daily_checkin 签到卡片触发  ← 最重要，6 个评分项依赖
  2. quiz 测验卡片触发 + 题库方案
  3. homework_submit 作业提交触发

P0 但可简化（4/14 完成最小版本）：
  4. video_checkin 视频打卡触发
  5. peer_review_vote 互评投票触发

P1 可延后（4/15 后补充）：
  6. peer_review_settle 互评结算逻辑
  7. member_mgmt / manual_adjust 关键词触发
  8. C2 emoji 反应计分验证
  9. 题库管理方案
```

---

## 九、验收标准

- [ ] 培训师在群里发"签到" → Bot 发出签到卡片 → 学员可点击提交各项内容
- [ ] 培训师在群里发"测验" → Bot 发出测验卡片 → 学员可答题 → K1/K2 自动计分
- [ ] 培训师在群里发"作业" → Bot 发出作业卡片 → 学员可提交 → H1 自动计分
- [ ] 培训师在群里发"视频" → Bot 发出视频打卡卡片 → 学员可打卡 → G1/H3 自动计分
- [ ] 培训师在群里发"互评" → Bot 发出互评卡片 → 学员可投票
- [ ] K3/K4/H2/C1/C3/G2 提交后 → LLM 评分 → 审核卡片推送 → 管理员可批准/拒绝
- [ ] 排行榜实时显示学员分数变化
- [ ] 所有卡片使用 column_set（非 action 标签），飞书 API 返回 200

---

## 十、参考文件索引

| 文件 | 用途 |
|------|------|
| `src/services/feishu/message-commands.ts` | 关键词触发（当前只有"管理"，需要扩展） |
| `src/app.ts` (行 128-146) | onMessage 回调 + 依赖注入 |
| `src/services/feishu/cards/card-action-dispatcher.ts` | Handler 注册和分发 |
| `src/services/feishu/cards/router.ts` | action → cardType 解析 |
| `src/domain/v2/scoring-items-config.ts` | 15 个评分项配置 |
| `src/domain/v2/ingestor.ts` | 10 步摄入管道 |
| `docs/skills/feishu-card-development.md` | 卡片开发 Skill（避坑指南） |
| `docs/skills/aliyun-swas-deploy.md` | 阿里云部署 Skill |
| `docs/handoffs/2026-04-12-phase2-completion-handoff.md` | 完整项目上下文 |

---

*文档生成时间：2026-04-12*
*生成者：Claude Code — 系统审查*
