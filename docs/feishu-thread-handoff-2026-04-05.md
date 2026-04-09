# 飞书接入线程交接摘要

## 背景
本线程目标是把“辉瑞 HBU AI 训练营评估系统”从本地 MVP 推进到可接入真实飞书测试群的可运行版本，重点覆盖：
- 飞书官方 MCP/CLI 接入 Codex
- 项目级 `feishu-automation` Skill 对齐官方能力
- 真实测试群 `HBU奇点玩家` 接入
- Bot 出站、群消息读取、长连接状态验证
- 群文件消息进入 SQLite / 候选 / 评分 / Base 镜像链路验证

---

## 已完成事项

### 1. 官方飞书 MCP 接入完成
- 已将官方 `lark-mcp` 接入 Codex。
- 配置已写入：
  - `C:\Users\qiyon\.codex\config.toml`
- 当前会话中 `mcp__lark_mcp__*` 工具可用，已实际调用成功。

### 2. 项目级 `feishu-automation` Skill 已改为官方基线
- 已更新：
  - `D:\Vibe Coding Project\AI Seed Project\.agents\skills\feishu-automation\SKILL.md`
  - `D:\Vibe Coding Project\AI Seed Project\.agents\skills\feishu-automation\feishu-mcp-setup.js`
- 变更内容：
  - 不再把 Skill 自身当事实源
  - 明确以飞书官方 CLI/MCP 文档为准
  - 安装/检测逻辑改为优先使用 `~/.codex/config.toml`
  - 明确区分：
    - MCP 负责 OpenAPI
    - 开放平台控制台负责事件订阅、权限开关、发布版本

### 3. 飞书 OpenAPI 侧能力已验证
已通过官方飞书 MCP 验证以下事项：
- 可搜索测试群 `HBU奇点玩家`
- 可发送群消息
- 可读取群历史消息
- 读取结果中已包含：
  - 用户发送的文本消息
  - 用户发送的 PDF 文件消息
- 这证明：
  - `im:message.group_msg` 权限已生效
  - 发布版本已对 OpenAPI 结果生效
  - 不需要继续追查“群消息读取权限”本身

### 4. 服务状态接口已增强
已新增“群消息读取权限探针”，接入：
- `src/services/feishu/client.ts`
- `src/app.ts`
- `tests/api/app.test.ts`

新增状态字段：
- `groupMessageReadAccess`
- `groupMessageReadProbe`

当前 `/api/feishu/status` 可直接显示是否缺少群消息读取权限，不再依赖人工猜测。

### 5. 本地 API 服务已恢复运行
- 已重新启动 `dev:api`
- 当前日志文件：
  - `D:\Vibe Coding Project\AI Seed Project\.run\dev-api.log`
  - `D:\Vibe Coding Project\AI Seed Project\.run\dev-api.err.log`

运行时日志已确认：
- `client ready`
- `event-dispatch is ready`
- `ws client ready`

### 6. 当前飞书状态接口已验证全绿
当前 `GET /api/feishu/status` 返回关键信号：
- `credentialsValid=true`
- `longConnectionEnabled=true`
- `campBound=true`
- `baseReady=true`
- `groupMessageReadAccess=true`

说明以下链路均已成立：
- App ID / Secret 有效
- 长连接模式正常
- Camp 已绑定到测试群
- Base app / tables 已配置完成
- 群消息读取权限已通过

### 7. Bot 出站已验证成功
- 已通过 `POST /api/feishu/send-test` 成功发群消息
- 最近一次 Bot 测试消息已成功进入 `HBU奇点玩家`

### 8. 真实文件消息业务链路已部分验证成功
我用群里已有的真实 PDF 消息做了一次“重放式验收”，结果如下：
- 消息成功进入 `/api/feishu/events`
- 成功归属到 `session-01`
- 成功写入 SQLite `raw_events`
- 成功生成 `submission_candidates`
- 成功生成 `scores`
- 成功同步到飞书 Base

这证明以下链路已经打通：
- 群路由
- session 匹配
- SQLite 入库
- 候选生成
- 评分落库
- Base 镜像同步

---

## 当前进展结论

### 已打通
- 飞书 MCP
- 项目级 Skill 与官方能力对齐
- 测试群接入
- Bot 发群消息
- 群消息读取
- 长连接 ready
- SQLite / 候选 / 评分 / Base 主链路

### 当前未打通
- **飞书文件二进制下载**
- 失败点发生在：
  - `GET https://open.feishu.cn/open-apis/im/v1/files/{file_key}`

---

## 当前卡点

### 唯一核心卡点
缺少“消息文件资源下载/访问”相关权限，导致文件内容无法被实际下载并解析。

### 当前表现
对真实 PDF 消息重放后：
- `document_parse_status = failed`
- `document_parse_reason = Request failed with status code 400`
- 评分结果为：
  - `final_status = pending_review`
  - `score_reason = pending_review_parse_failed`

### 影响范围
- 当前系统已经能识别“有文件提交”
- 也能进入候选与评分入口
- 但因为拿不到文件二进制内容，`PDF/DOCX` 解析无法完成
- 因此自动评分只能停在“待复核解析失败”

---

## 数据侧已确认结果

### SQLite 已有记录
真实消息 `om_x100b523b17393ca4c31e460f96f5ec2` 已写入：
- `raw_events`
- `submission_candidates`
- `scores`

对应状态：
- `parse_status = pending_review_parse_failed`
- `document_parse_status = failed`
- `final_status = pending_review`

### Base 已有镜像记录
已通过飞书 MCP 查到：
- `rawEvents` 表中存在该 `event_id`
- `scores` 表中存在该 `candidate_id`

说明 Base 同步不是当前阻塞点。

---

## 建议主线程下一步

1. 在飞书开放平台继续补开“消息文件/文件资源下载/获取文件内容”相关权限
2. 重新发布应用版本
3. 在群 `HBU奇点玩家` 中重新发送一个新的 `PDF` 或 `DOCX`
4. 再次验收以下信号：
   - `/api/feishu/status` 中 `lastInboundEventAt` 更新
   - `lastNormalizedMessage.documentParseStatus` 变为 `parsed`
   - SQLite 中对应 `raw_events.document_text` 有内容
   - `scores.final_status` 进入真正自动评分结果，而不是 `pending_review_parse_failed`

---

## 相关关键文件

### 已修改
- `D:\Vibe Coding Project\AI Seed Project\.agents\skills\feishu-automation\SKILL.md`
- `D:\Vibe Coding Project\AI Seed Project\.agents\skills\feishu-automation\feishu-mcp-setup.js`
- `D:\Vibe Coding Project\AI Seed Project\src\services\feishu\client.ts`
- `D:\Vibe Coding Project\AI Seed Project\src\app.ts`
- `D:\Vibe Coding Project\AI Seed Project\tests\api\app.test.ts`

### 关键运行文件
- `D:\Vibe Coding Project\AI Seed Project\.run\dev-api.log`
- `D:\Vibe Coding Project\AI Seed Project\.env`
- `C:\Users\qiyon\.codex\config.toml`

---

## 一句话结论
本线程已经把“飞书 Bot 接入”推进到只差**文件资源下载权限**这最后一个点；除了 PDF/DOCX 二进制下载未通以外，其余 OpenAPI、Bot、群接入、长连接、SQLite、评分入口、Base 镜像都已成立。
