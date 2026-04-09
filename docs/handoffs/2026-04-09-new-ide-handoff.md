# AI Seed Project 新 IDE 通用交接文档

本文是给任何“新 IDE / 新代理 / 新会话”使用的统一交接入口。目标不是解释所有历史讨论，而是把项目背景、一期边界、最新事实、关键入口、未完成项和接手顺序一次性讲清楚，让后续接手方不必再从聊天记录倒推状态。

## 1. 项目一句话背景

这是一个面向 Pfizer HBU AI Bootcamp 的作业评估项目：学员在飞书群内提交 PDF / DOCX，后端下载文档、抽取文本、执行规则校验和模型评分，把结果落到 SQLite，并同步到 Feishu Base 作为排行榜与运营视图。

## 2. 一期正式目标与交付边界

一期正式交付形态已经冻结为：

- 飞书原生交付面
- 阿里云常驻后端
- SQLite 事实源
- Feishu Base 展示与运营协作层

这意味着一期签收目标不是独立公网 Web 产品，也不是独立 `/operator` 后台正式上线。当前 Web 页面和 `/operator` 路由仍然保留为工程辅助面，用于开发、排障和后续阶段扩展，但它们不构成一期 release blocker。

边界基线可从这些文档确认：

- [README.md](../../README.md)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\README.md`
- [2026-04-09-project-master-plan.md](../../../../docs/superpowers/plans/2026-04-09-project-master-plan.md)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\docs\superpowers\plans\2026-04-09-project-master-plan.md`
- [release-runbook.md](../release-runbook.md)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\docs\release-runbook.md`
- [feishu-setup.md](../feishu-setup.md)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\docs\feishu-setup.md`

## 3. 当前执行上下文

- 仓库根目录：`D:\Vibe Coding Project\AI Seed Project`
- 当前主执行工作区：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu`
- 当前分支：`codex/phase-one-feishu`
- 当前 worktree 不是干净状态。最近一次 `git status --short` 汇总为：
  - `39` 个已修改文件
  - `2` 个已删除文件
  - `15` 个未跟踪文件

新 IDE 接手时，必须把当前工作树视为“仍在推进中的工作区”，而不是“已整理完毕、可以放心回退”的稳定基线。

## 4. 最新状态快照

截至 2026-04-09，项目的最新冻结状态如下：

- 一期交付边界已经冻结，文档口径已经统一到“飞书原生 + Aliyun 后端 + Base”。
- Aliyun 目标环境已经从“待发现”推进到“已锁定 SWAS 实例”。
- GLM 已替代旧 Qwen 方案成为正式评估路径：
  - 文本评分默认 `glm-4.7`
  - 文档解析兜底改为 GLM file parser
- 真实飞书群的 PDF 提交链路已经再次打通，至少两份真实 PDF 已被远端消费、解析、评分并同步进 Base。
- 群内积分看板当前不是自动嵌入显示，而是通过 `leaderboardUrl` 打开 Feishu Base 仪表盘。

文档优先级与时效性说明：

1. 最新交接以本文为准。
2. 总体执行主线以 [2026-04-09-project-master-plan.md](../../../../docs/superpowers/plans/2026-04-09-project-master-plan.md) 为准。
3. 运行与验收细节以当前 worktree 内的 runbook / smoke / setup 为准。
4. 2026-04-07 的 handoff 与 roadmap 仍可读，但只作为历史背景参考，不再代表最新状态。

## 5. 已完成事项

- 一期正式目标、交付边界和运行时契约已冻结。
- 本地开发基线已建立，README、setup、runbook、smoke 文档已对齐一期口径。
- 飞书接入链路已建立，`/api/feishu/status` 和 bot 发信能力可用于就绪检查。
- GLM 路径已完成代码层替换：
  - provider-neutral `LLM_*` 配置已生效
  - `glm-4.7` 作为默认文本评分模型
  - 文档兜底采用 GLM 文件解析器
- 真实飞书群 PDF 链路已验证：
  - 后端已接收真实群文件消息
  - 文档已成功解析
  - 分数已写入 SQLite
  - Base 镜像同步已确认
- 现有项目文档已经明确：群内“积分看板”不自动出现，真正的看板入口是 Feishu Base 仪表盘链接。

## 6. 进行中事项

- 云端环境仍处于“已部署推进但尚未完成完整发布签收”的状态。
- 当前主线不是重做架构，而是把“云部署事实、飞书验收、模型验收、交接收尾”彻底闭环。
- 当前工作区保留了大量尚未整理提交的修改，说明项目处于持续推进中，而不是静态归档状态。

## 7. 未完成与阻塞项

以下事项仍未完成或未完全关闭：

- 真实 `DOCX` 提交流程尚未完成最终云端验收闭环。
- 真实“本地解析失败后走 GLM 文件兜底”的样本验收尚未在生产链路完成闭环。
- 群内积分看板仍未实现自动推送卡片或自动入口曝光；当前只能通过 `leaderboardUrl` 打开 Base 仪表盘。
- 当前 worktree 仍是 dirty 状态，后续接手前必须先判断：
  - 是继续在当前工作树上推进
  - 还是先整理/归档/拆分已有改动

本项目当前真正的风险不是“设计未定”，而是：

- 历史 handoff 容易让新接手方误以为还停留在 2026-04-07 的云发现阶段
- dirty worktree 容易让新接手方误做大范围覆盖、回退或误删

## 8. 云端与飞书真实环境事实

以下都是当前已确认、但不属于敏感 secret 的运行事实，可以用于后续定位与验收：

- 当前正式目标环境已经明确为阿里云 SWAS。
- 目标环境事实：
  - Region：`cn-hangzhou`
  - Instance ID：`0cf24a62cd3a463baf31c196913dc3cd`
  - Public IP：`114.215.170.79`
  - Instance Status：`Running`
- 真实飞书接受群 chat ID：`oc_a867f87170ab5e892b86ffc2de79790b`
- 真实群 PDF 链路已再次验证，至少两份 PDF 被成功消费：
  - `balanced_value_methodology.pdf`
  - `final_report_readable.pdf`
- 已确认这两条链路都完成了：
  - 原始事件入库
  - 文档文本抽取
  - 分数写入
  - Feishu Base 镜像同步
- `leaderboardUrl` 目前是 Feishu Base 仪表盘入口，不是群内自动面板。
- 当前已确认的 live leaderboard 入口为：
  - [Feishu Base Leaderboard](https://fcnxwpz0ut78.feishu.cn/base/OiclbQXUqaNmY8sthCqc5nbtn7b)

注意：本节只允许保留 URL、chat ID、instance ID、public IP 这类非敏感运行事实；任何 AK/SK、API key、`.env` 明文都不得写入文档。

## 9. 关键代码入口

新 IDE 接手后，优先从以下代码入口建立心智模型：

- [src/app.ts](../../src/app.ts)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\src\app.ts`  
  说明：主 API 入口，包含 `/api/health`、`/api/feishu/status`、`/api/feishu/send-test`、`/api/announcements/run` 等关键路由。
- [src/services/llm/provider-config.ts](../../src/services/llm/provider-config.ts)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\src\services\llm\provider-config.ts`  
  说明：`LLM_PROVIDER=glm`、默认 `LLM_BASE_URL`、`glm-4.7` 和 file parser 行为的配置源头。
- [src/services/llm/llm-evaluator.ts](../../src/services/llm/llm-evaluator.ts)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\src\services\llm\llm-evaluator.ts`  
  说明：文本评分主入口，走 OpenAI-compatible chat completion。
- [src/services/llm/glm-file-parser.ts](../../src/services/llm/glm-file-parser.ts)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\src\services\llm\glm-file-parser.ts`  
  说明：GLM 文档兜底解析实现。
- [src/services/documents/extract-text.ts](../../src/services/documents/extract-text.ts)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\src\services\documents\extract-text.ts`  
  说明：文档文本抽取总入口，决定本地解析与 GLM 兜底的顺序。
- [src/services/feishu/client.ts](../../src/services/feishu/client.ts)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\src\services\feishu\client.ts`  
  说明：飞书 API 客户端实现。目前 bot 发信主实现仍然是 `sendTextMessage()`；这也是为什么“群内积分看板”还没有自动卡片化呈现。

## 10. 关键文档地图

按优先级建议阅读这些文档：

- [本文：2026-04-09-new-ide-handoff.md](./2026-04-09-new-ide-handoff.md)  
  用途：最新状态冻结、上下文移交、下一步建议
- [2026-04-09-project-master-plan.md](../../../../docs/superpowers/plans/2026-04-09-project-master-plan.md)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\docs\superpowers\plans\2026-04-09-project-master-plan.md`  
  用途：总体主线、Phase 划分、执行优先级
- [release-runbook.md](../release-runbook.md)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\docs\release-runbook.md`  
  用途：运行时配置、bring-up 顺序、真实 GLM smoke 指引
- [release-smoke-tests.md](../release-smoke-tests.md)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\docs\release-smoke-tests.md`  
  用途：release 后的验收清单
- [feishu-setup.md](../feishu-setup.md)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\docs\feishu-setup.md`  
  用途：飞书接入、Base 配置、GLM 运行时契约
- [2026-04-07-task-2-cloud-discovery-timeout-handoff.md](./2026-04-07-task-2-cloud-discovery-timeout-handoff.md)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\docs\handoffs\2026-04-07-task-2-cloud-discovery-timeout-handoff.md`  
  用途：理解 4 月 7 日时为什么项目卡在云环境发现与 SWAS 路线确认
- [final-acceptance-2026-04-05.md](../final-acceptance-2026-04-05.md)  
  绝对路径：`D:\Vibe Coding Project\AI Seed Project\.worktrees\phase-one-feishu\docs\final-acceptance-2026-04-05.md`  
  用途：理解项目更早一轮真实飞书验收的证据基线

历史文档仍可参考，但默认不视为最新状态源，尤其是 2026-04-07 的旧 roadmap 和旧 handoff。

## 11. 新 IDE 接手后的建议顺序

固定按下面顺序接手，不要跳步：

1. 先读本文，建立“项目做什么、做到哪、哪些已验证、哪些未完成”的总认知。
2. 再读 [2026-04-09-project-master-plan.md](../../../../docs/superpowers/plans/2026-04-09-project-master-plan.md)，明确总路线图和执行优先级。
3. 再读 [release-runbook.md](../release-runbook.md)、[release-smoke-tests.md](../release-smoke-tests.md)、[feishu-setup.md](../feishu-setup.md)，把运行、验收、配置契约读实。
4. 然后检查当前 worktree diff，先理解 `39 modified / 2 deleted / 15 untracked` 到底分别属于什么类别。
5. 最后才决定：
   - 继续推进部署 / 验收
   - 继续补文档 / 补交接
   - 先整理工作树再推进

如果新 IDE 在没读完上述文档、没检查 dirty worktree 前就直接开始回退、覆盖或大改，很容易把已经验证过的链路破坏掉。

## 12. 注意事项与禁区

- 不把任何云端密钥、模型密钥、AK/SK、API key、`.env` 明文写入仓库。
- 不把独立 Web 看板误判为一期签收目标。
- 不把群内缺少积分看板误判为主链路失败。当前群内不自动出现看板是设计与实现事实，不是异常。
- 不在未核对当前 dirty worktree 的情况下做大范围回退、覆盖、`git checkout --` 或清理。
- 不因为旧 handoff 写着“云发现中”就忽略 2026-04-09 之后已经推进到的 SWAS、GLM、真实 PDF 验收事实。
- 不把“真实 PDF 已通”误判为“一期全部验收完成”。当前仍有 DOCX 和 parser fallback 的真实生产链路验收缺口。
- 若后续要实现“群内积分看板”，应理解那是“新增群消息 / 卡片推送能力”，不是修复当前主链路故障。

