# 2026-04-06 下一线程交接

## 现状

这一轮已经把一期的正式边界收口到：

- 飞书原生交付面
- 阿里云常驻后端
- SQLite 作为事实源
- Feishu Base 作为展示层和运维协作层

当前运行时已经接入 provider-neutral `LLM_*` scoring contract。启用时会走兼容/国产
模型评分，失败或禁用时回退 heuristic scoring。

`FEISHU_LEARNER_HOME_DOC_*` 和 `FEISHU_OPERATOR_HOME_DOC_*` 仍然只是为后续飞书首页落
地预留的一期配置占位，不是 `readFeishuConfig()` 当前消费项。

一期不再把独立 Web 看板和 `/operator` 当作正式交付面。它们可以保留为工程调试
入口，但不能再写进正式对外说明里。

## 当前正式交付面

- 学员入口：飞书知识库 / 文档首页
- 排名与结果：飞书 Base 看板与视图
- 运维入口：飞书 Base 运维视图
- 运行底座：阿里云常驻后端服务
- 通知与快照：飞书机器人和 Base 镜像

## 交接目标

下一线程继续做的事情，应该围绕“让一期正式交付面更稳、更完整”，而不是重新拉回
独立 Web 路线。

优先级建议：

1. 保持飞书原生入口可用
2. 保持评分与同步链路稳定
3. 保持 Base 镜像和公告可追踪
4. 只有在明确是工程辅助时，才看 `/api/public-board` 或 `/api/operator`

## 这次已经确认的契约

- `.env.example` 使用 `LLM_*`，不再使用 `OPENAI_*`
- `FEISHU_EVENT_MODE` 的一期目标是 `long_connection`
- `FEISHU_BOT_CHAT_ID`、`FEISHU_VERIFICATION_TOKEN`、`FEISHU_ENCRYPT_KEY` 都属于一期配置
- `FEISHU_BASE_*` 是一期正式交付面的一部分
- `FEISHU_LEARNER_HOME_DOC_*` 和 `FEISHU_OPERATOR_HOME_DOC_*` 只是预留占位，不是当前运行
  时消费项
- smoke test 和 release runbook 只应该把飞书原生路径当作正式验收目标

## 下一线程要避免的误区

- 不要把独立 Web 看板写回正式 scope
- 不要把 `/operator` 重新描述成一期用户面
- 不要把 `OPENAI_*` 当成默认 LLM 路线
- 不要把 `LLM_*` 写成“尚未接入”
- 不要把飞书首页占位变量写成当前 runtime 已经读取

## 推荐参考

- [README](../../README.md)
- [Feishu setup](../feishu-setup.md)
- [Release runbook](../release-runbook.md)
- [Smoke test checklist](../release-smoke-tests.md)
- [一期设计说明](../superpowers/specs/2026-04-07-feishu-native-phase-one-design.md)
- [一期实现计划](../superpowers/plans/2026-04-07-feishu-native-phase-one-implementation.md)
