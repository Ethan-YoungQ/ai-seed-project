# 2026-04-06 项目交接说明

## 1. 项目是什么

这是一个服务于辉瑞中国 HBU AI 训练营的评估系统，核心目标不是做通用 LMS，也不是 SaaS，而是尽快把飞书群里的训练营运营闭环跑通。

当前系统的总体形态是：
- 飞书群消息接入
- SQLite 作为事实源
- 飞书 Base 作为镜像和运营协作面
- 公共榜单 / 学员可见看板
- 运营后台 / 管理端
- Bot 播报与双周快照

当前业务节奏是 **双周一期**。

## 2. 当前产品规则基线

新线程接手时，必须以这套规则为准，不要回退到早期版本的 tag 驱动模型：

- 作业提交主通道是 **PDF / DOCX 文档**
- 学员未来提交作业时 **不再依赖 tag**
- Tag 只保留兼容意义，不再是文档提交的必要条件
- 一个双周周期只有一个作业槽位
- 同一学员在同一双周周期内多次提交文档时：
  - 分数 **不累计**
  - 取 **最高有效分**
  - 若同分，取 **最新提交**
- 硬规则优先：
  - 是否落在当前双周窗口
  - 是否按时
  - 是否满足“证据 + 过程 + 结果”
- LLM 只用于：
  - 过程分辅助
  - 质量分辅助
- 公共面向学员/群成员
- 后台面向管理员

## 3. 当前仓库状态

### 当前主分支

- `codex/integration-baseline`

### 接手前必须注意

当前工作树 **不是干净的**。新线程不要默认可以直接开工，第一步先执行 `git status`。

截至本次交接时，已经观察到的工作区状态是：

- 已修改：
  - [README.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/README.md)
  - [docs/feishu-setup.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/feishu-setup.md)
  - [docs/release-runbook.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/release-runbook.md)
  - [docs/release-smoke-tests.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/release-smoke-tests.md)
  - [src/services/feishu/client.ts](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/src/services/feishu/client.ts)
  - [src/services/scoring/evaluate-window.ts](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/src/services/scoring/evaluate-window.ts)
- 未跟踪：
  - [docs/final-acceptance-2026-04-05.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/final-acceptance-2026-04-05.md)
  - [docs/superpowers/plans/2026-04-06-doc-first-admin-llm-dashboard.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/superpowers/plans/2026-04-06-doc-first-admin-llm-dashboard.md)
  - [tests/services/feishu-client.test.ts](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/tests/services/feishu-client.test.ts)

结论：新线程在任何开发前，先确认这些改动是否需要保留、提交或整理，避免在脏工作树上误操作。

## 4. 已完成任务

这不是一个从零开始的项目。以下主链路已经存在：

- 飞书长连接接入
- 群消息入库
- Bot 发群消息
- 飞书 Base 镜像同步
- SQLite 事实库
- 双周 session 窗口匹配
- 当前版本的规则评分
- 公共榜单
- 运营后台雏形
- warnings 状态机
- 快照与播报接口

### 真实飞书链路曾通过验收

高可信依据见：

- [final-acceptance-2026-04-05.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/final-acceptance-2026-04-05.md)

这份文档明确说明：

- 真实飞书群 PDF 提交曾成功下载、解析、评分
- Bot 发群消息成功
- Base 镜像成功
- 榜单播报成功

因此，新线程不要误判为“飞书接入还没完成”。更准确的说法是：

- 飞书接入主链路已成立
- 但产品规则和系统形态已经继续演进，当前还没有按最新规则完全收口

## 5. 当前未完成缺口

虽然主链路已存在，但以下能力还没有按最新要求完全落地：

### 5.1 文档优先作业模型未最终切换完成

当前系统还保留早期“消息窗口 + 候选聚合”的设计痕迹。

缺口是：

- 没有彻底切成“每个 PDF/DOCX 是一次提交尝试”
- 没有完全实现“同周期取最高分”
- 还存在早期 tag / 文本混合路由逻辑

### 5.2 真实 LLM API 尚未接入

当前评分系统能打分，但本质上仍是：

- 规则判断
- heuristic fallback

还没有真正完成：

- 低成本真实 LLM provider 接入
- `.env` 层面的模型配置
- process/quality 真实模型辅助评分

### 5.3 3 管理员后台尚未实现

当前虽然已有 operator API 和运营页面，但还没有：

- 管理员登录
- 三个管理员账号的访问控制
- 后台权限边界

所以现在只是“后台原型”，还不是“可由 3 个管理员共同管理的后台”。

### 5.4 学员/public dashboard 仍不完整

当前已有排行榜和面板，但仍缺：

- 每个学员的分数进展可视化图表
- 更清晰的学员/public 看板
- 与管理员控制台的明确角色分离

### 5.5 乱码风险仍未完全清零

历史上已经多次出现中文乱码 / mojibake。

风险点包括：

- 可见 UI 文案
- 评分理由
- 旧 handoff 文档

新线程必须继续把这件事当成上线质量问题，而不是“文案小问题”。

## 6. 下一步开发主线

新线程不要重新设计系统，也不要重新开题。实现主线已经明确，直接按下面这份计划推进：

- [2026-04-06-doc-first-admin-llm-dashboard.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/superpowers/plans/2026-04-06-doc-first-admin-llm-dashboard.md)

这份计划是当前最新、最完整的实现蓝图。新线程应按它的顺序推进：

1. 文档优先作业模型
2. 真实 LLM 接入
3. 3 管理员认证后台
4. public/student board 与 admin console 分离
5. 分数进展图与轻游戏化
6. 文档和发布收口

不要跳过前两项直接去做 UI；否则产品外观会先行，规则和评分会继续漂移。

## 7. 经验教训 / 踩坑

这些经验是新线程最应该继承的部分：

### 7.1 不要再围绕 tag 设计主提交流程

早期版本默认 tag 驱动，这是旧思路。现在的真实场景已经变成：

- 学员直接发 PDF / Word
- tag 不再稳定

所以后续不要再把 tag 当主键规则。

### 7.2 Base 只能做镜像，不要反转成事实源

SQLite 是事实源，Base 是镜像和运营协作面。

如果把 Base 反转成主数据源，会直接带来：

- 幂等问题
- 审计困难
- 状态机口径漂移

### 7.3 公共榜单和运营后台不能混成一个页面

当前代码里已经出现了一个页面里同时塞 public/operator 逻辑的痕迹。这个方向不要继续扩大。

正确方向是：

- 学员/public board
- 管理员 console

分开建设。

### 7.4 “飞书权限已补开”不等于“新规则已实现”

飞书链路可用，只代表底层接入没问题。

不代表以下能力已经完成：

- 文档优先作业模型
- 最高分结算
- 真实 LLM
- 3 管理员后台
- 学员/管理员双视图产品化

### 7.5 乱码问题会污染 UI 和规则判断

这不是纯展示问题。

它还会影响：

- 评分理由可读性
- 规则命中关键词
- handoff 文档可信度

### 7.6 不要默认旧 handoff 文档是可信事实源

旧交接文档里存在明显乱码，不能直接拿来指导实现。

## 8. 文档索引与可信度

### 高可信文档

这些文档可以优先作为事实依据：

- [README.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/README.md)
- [docs/final-acceptance-2026-04-05.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/final-acceptance-2026-04-05.md)
- [docs/release-runbook.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/release-runbook.md)
- [docs/release-smoke-tests.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/release-smoke-tests.md)
- [docs/feishu-setup.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/feishu-setup.md)
- [docs/superpowers/plans/2026-04-06-doc-first-admin-llm-dashboard.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/superpowers/plans/2026-04-06-doc-first-admin-llm-dashboard.md)

### 低可信文档

以下文档只能作为历史参考，不能作为主依据：

- [docs/feishu-thread-handoff-2026-04-05.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/feishu-thread-handoff-2026-04-05.md)

原因：

- 存在严重乱码
- 可读性差
- 易误导新线程对当前状态的判断

## 9. 新线程启动 checklist

新线程开始前，按这个顺序做：

- 读 [README.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/README.md)
- 读 [docs/final-acceptance-2026-04-05.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/final-acceptance-2026-04-05.md)
- 读 [2026-04-06-doc-first-admin-llm-dashboard.md](/D:/Vibe%20Coding%20Project/AI%20Seed%20Project/docs/superpowers/plans/2026-04-06-doc-first-admin-llm-dashboard.md)
- 执行 `git status`
- 确认当前分支
- 确认 `.env`
- 跑 `npm test`
- 跑 `npm run build`
- 再开始开发

## 10. 交接结论

这个项目已经有飞书接入、事实库、榜单、后台和播报等主链路，不是从零开始。

新线程真正要做的，不是“重做评估系统”，而是：

- 在现有基础上完成 **文档优先作业模型**
- 接入 **真实 LLM**
- 做完 **3 管理员后台**
- 完成 **学员/public dashboard 与管理员 console 的产品化收口**

如果新线程只记住一句话，那就是：

**这是一个已经有 MVP 和真实飞书链路的项目，下一步工作是按最新产品规则完成收口，而不是重新设计系统。**

