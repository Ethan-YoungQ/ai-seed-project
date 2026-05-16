# 2026-05-16 AI Boot Feishu Operating System Design

本设计是在 2026-05-16 服务器、源码、数据库和日志审计基础上形成的总体重构方案。目标不是修补旧评分项，而是把 AI Boot 重构成一个可运营、可审计、低打扰、高激励的飞书群运营代理。

## 1. North Star

AI Boot 的核心职责是提升飞书训练营群的运营效率和体验：

- 让学员愿意持续互动、实践、分享和互助。
- 让高价值 AI 学习行为被及时识别和适度激励。
- 让运营能看到群里发生了什么、哪些内容值得放大、哪些评分需要纠正。
- 让天梯榜成为正反馈系统，而不是刷屏源或争议源。
- 保留既有历史分数，不重算旧账；新分数从新引擎开始可解释、可回放。

这次重构允许大范围改变底层评分规则、数据模型、Bot 通知策略和 LLM prompt。历史分数作为资产冻结保留，未来新分数走新版账本。

## 2. Current Constraints And Facts

现状里的关键事实：

- 服务器当前运行的 `dist` 与 Git/TypeScript 源码行为不一致。正常从源码重新部署会恢复旧语义评分路径，存在把刷屏问题带回来的风险。
- 生产 DB 有 306 条评分事件，其中 24 条是 LLM `pass=false` 但最终 `approved`，H2 占 18 条。
- 212 条 rejected 事件全部缺少 `review_note`，审计链不完整。
- 图片/文件评分没有真正把图像或文件证据送进最终 LLM worker。
- 旧规则过度绑定作业表单和 prompt 模板，不能覆盖 AI 图片、作品、经验复盘等真实群运营行为。
- 旧代码存在多个判断层：关键词分类、统一语义评分、单项 LLM worker、人工审核卡片，各层定义不一致。

因此重构的第一原则是：先消除运行态漂移，再建立单一权威决策链。

## 3. Non-Goals

本轮重构不做这些事：

- 不回滚或批量重算历史分数。
- 不把所有群消息都交给人工审核。
- 不用单纯换模型替代系统重构。
- 不继续围绕旧 K3/C1/C3/H2 语义打补丁。
- 不让 Bot 对每个得分事件都发群消息。

## 4. Target Architecture

新版系统由 7 个核心模块组成。

### 4.1 Event Ledger

所有飞书输入先进入统一事件账本：

- text/image/file/reaction/card/mention 都有统一事件记录。
- 保存 messageId、chatId、sender、messageType、eventTime、source、附件元信息、脱敏摘要。
- 保存 `engine_version`、`ruleset_version`、`decision_id`、`notification_state`。
- 每条事件可以被 replay，用于重新评估新规则，但 replay 不自动修改历史分。

### 4.2 Content Extraction

把群消息变成可评分证据：

- 文本：清洗 @、表情、URL、引用片段。
- 图片：下载并生成可传给 VLM 的输入；必要时 OCR 或视觉摘要。
- 文件：PDF/DOCX 本地解析，保存解析状态和摘要。
- 链接：只记录 URL 和上下文，不默认抓取外网内容。
- 附件解析失败时，事件仍保留，但评分可进入低置信或人工审核。

### 4.3 Scoring Decision Engine

用一个权威引擎替代多层冲突判断。输出固定结构：

```ts
interface ScoringDecision {
  shouldScore: boolean;
  category:
    | "daily_participation"
    | "ai_artifact"
    | "ai_practice_reflection"
    | "prompt_or_method"
    | "resource_recommendation"
    | "peer_help"
    | "formal_task"
    | "operator_adjustment";
  scoreDelta: number;
  confidence: "high" | "medium" | "low";
  evidence: string;
  reason: string;
  reviewRequired: boolean;
  notifyPolicy: "silent" | "personal_reply" | "group_praise" | "daily_digest";
  badges: string[];
}
```

一条群消息只产生一个主评分决策。可以附加 badge，但不再一条消息同时乱入多个旧评分项。

### 4.4 Scorebook

Scorebook 是新账本分数层：

- 历史旧分冻结为 `legacy_score_snapshot`。
- 新决策写入 `score_events_v3`。
- 榜单总分 = 历史冻结分 + 新账本 approved 分 + 人工调分。
- 所有人工调分必须保存操作者、原因、前后差值。
- 每条分数都能追溯到事件、证据、规则版本和模型版本。

### 4.5 Notification Orchestrator

通知策略独立于评分：

- K1/每日参与默认静默。
- pending/review/rejected 不发“已得分”。
- 只有高价值贡献才发群内 praise。
- 同一人、同一主题、短时间内多条贡献合并通知。
- 群级限流、用户级限流、主题去重同时生效。
- 每日或每周产出群学习摘要，替代零散刷屏。

### 4.6 Operator Console

运营后台需要能解释和纠错：

- 查看每条事件的评分理由、证据、模型版本、规则版本。
- 过滤低置信、待审核、被用户申诉、重复疑似事件。
- 一键通过、拒绝、改分类、调分。
- 对人工修正反向沉淀为 golden set，供后续评估 prompt 和模型。

### 4.7 Evaluation Harness

在生产切换前，用真实样本评估：

- 从飞书群和 DB 抽样，脱敏后形成 golden set。
- 标注：是否应得分、类别、分值区间、是否通知、理想理由。
- 对比旧系统、新规则、不同模型。
- 量化 false positive、false negative、重复通知、LLM 失败率、Bot 日发言量。

## 5. New Scoring Rules

新版评分从“任务项”改为“运营行为激励”。

### 5.1 Daily Participation

- 每日有效参与，1 分。
- 每人每天最多 1 次。
- 普通聊天、签到、简短反馈都可计入活跃，但不发群通知。
- 旧 K1 的每期 3 分语义停止扩展；历史 K1 保留。

### 5.2 AI Artifact

- AI 生成图片、海报、流程图、报告、应用截图、工作流、Demo、可见成果。
- 3-5 分。
- 不要求必须分享 prompt。
- 如果只有图片但上下文不足，低置信时进入审核；如果图像本身明显是 AI 作品或群上下文可证明 AI 相关，可直接计分。

### 5.3 AI Practice Reflection

- 描述自己如何使用 AI、尝试了什么、结果如何、遇到什么问题、学到什么。
- 3-5 分。
- 经验分享即使没有 prompt 也可以计分。

### 5.4 Prompt Or Method

- 分享 prompt、工作流、参数设置、工具组合、可复用方法论。
- 4-6 分。
- prompt 是高价值贡献，但不再是其他类别的硬门槛。

### 5.5 Resource Recommendation

- 分享 AI 相关工具、文章、视频、案例、模板。
- 2-3 分。
- 纯链接不计分；必须有推荐理由、使用场景或个人判断。

### 5.6 Peer Help

- 解答他人问题、补充思路、帮忙定位错误、延展别人的案例。
- 2-4 分。
- 简短附和不计分，实质帮助才计分。

### 5.7 Formal Task

- 课程作业、测验、指定打卡等正式任务。
- 保留现有任务分值资产，但写入新账本。
- 正式任务可进入审核，但不应该让群内通知过载。

### 5.8 Operator Adjustment

- 运营可人工补分、扣分、改分类。
- 必须写原因。
- 不受普通 cap 限制，但需要在后台可见。

## 6. Decision Flow

每条消息的标准流程：

1. 接收飞书事件，写入 Event Ledger。
2. 做幂等检查：同 messageId 不重复处理，同内容 hash 可提示疑似重复。
3. 判断是否运营/讲师/系统消息；非学员默认不进入学生自动评分。
4. 判断是否 @Bot 问答；问答与评分分离。
5. 抽取文本、图片、文件证据。
6. 运行 deterministic guard：
   - 空内容、纯表情、纯感谢、纯转发且无说明，不计贡献分。
   - 每日参与单独静默计入。
   - 已达到 cap 的类别不再创建噪音 rejected 行，除非需要审计。
7. 调用 Scoring Decision Engine。
8. 校验 JSON schema 和分值范围。
9. 写入 `score_events_v3`：
   - high confidence 且无风险：approved。
   - medium/low confidence 或证据不足：review_required。
   - 明确不计分：no_score。
10. 更新 Scorebook。
11. Notification Orchestrator 决定是否发言。
12. 运营后台可追溯、审核、纠错。

## 7. LLM And Model Strategy

现阶段不把“换模型”作为第一解。

默认策略：

- 文本评分 baseline 继续使用 `glm-4.7`。
- 图片/作品类必须先接通真实视觉输入，再评估 VLM。
- `glm-5.1` 作为候选模型进入 evaluation harness。
- 模型切换标准不是主观感觉，而是 golden set 指标：
  - false positive 降低；
  - false negative 降低；
  - JSON 格式稳定；
  - 延迟和失败率可接受；
  - praise 文案更具体且低重复。

评分 prompt 要拆成两层：

- Policy prompt：稳定规则、类别定义、不得分边界。
- Few-shot prompt：来自真实群消息的脱敏正反例。

## 8. Bot Personality And Group Experience

Bot 的群内表现要从“夸夸群群主”改为“克制、具体、懂运营的 AI 助教”。

群内话术原则：

- 具体指出被认可的行为，而不是泛泛夸。
- 不默认要求“分享 prompt”。
- 不用高频网络词堆叠。
- 不对低价值事件发言。
- 对连续贡献做合并总结。
- 每日摘要比即时碎片夸赞更重要。

示例方向：

> @学员名 这次图片分享适合作为案例：它展示了你把 AI 用在视觉表达上的尝试，不只是贴结果。已计入 AI 作品分享。

> 今天群里有 4 个值得回看的 AI 实践：海报生成、会议材料整理、提示词改写、图像风格实验。建议大家优先看前两个案例，复用性比较高。

## 9. Migration Strategy

迁移必须保护现有分数。

1. 冻结旧分数快照。
2. 新建 v3 账本，不直接覆盖 v2 表。
3. 旧榜单接口改为读取 `legacy + v3`。
4. 新引擎先 shadow run，不影响真实分。
5. shadow 期间输出对比报告：
   - 旧系统会加分但新系统不加的事件；
   - 新系统会加分但旧系统漏掉的事件；
   - 通知数量变化；
   - 审核队列变化。
6. 人工确认后切换生产入账。
7. v2 保留只读，用于追溯。

## 10. Success Metrics

重构成功的判断标准：

- Bot 群内日发言量下降到运营可接受范围。
- 不再出现 LLM `pass=false` 但自动 approved 的新事件。
- rejected/review_required 都有明确原因和证据。
- 图片/作品类分享不再因为缺 prompt 被系统性漏分。
- 纯链接、纯闲聊、纯表情不会触发贡献分。
- 运营能在后台解释每条分数。
- 学员能感知“分享作品、经验、方法、互助”都会被认可。
- 24 小时内无需人工救火式批量调分。

## 11. Implementation Boundaries

推荐按工程边界拆实施任务，但整体上作为一次系统重构推进：

1. Runtime source-of-truth cleanup：把线上 hotfix 回收到源码，消除 dist 漂移。
2. Event Ledger + evidence extraction。
3. Scorebook v3 + legacy score preservation。
4. ScoringDecision schema + rule engine。
5. New LLM prompt + schema validation。
6. Notification Orchestrator。
7. Operator Console audit/review upgrades。
8. Evaluation harness + golden set workflow。
9. Shadow run and production cutover。

每个任务都必须有测试和回放验证。生产切换前必须备份 DB。

