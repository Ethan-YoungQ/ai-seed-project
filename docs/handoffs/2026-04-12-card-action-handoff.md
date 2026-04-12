# 飞书卡片回调 Bug 修复 — 新线程交接文档

> 给新 Claude 线程的完整上下文。目标：修复管理面板卡片按钮的 200672 错误。

## 一、紧急：当前服务器状态

服务器可能因为本次会话中频繁重启（>10 次）导致 WS 连接不稳定。

**第一步请执行：**
```bash
ALIYUN="/c/Users/qiyon/Desktop/aliyun-cli-windows-latest-amd64/aliyun.exe"
"$ALIYUN" swas-open run-command \
  --profile deploy-temp --biz-region-id cn-hangzhou \
  --instance-id 0cf24a62cd3a463baf31c196913dc3cd \
  --type RunShellScript --name "health" \
  --command-content 'systemctl restart ai-seed-project && sleep 5 && systemctl is-active ai-seed-project && curl -s http://localhost:3000/api/health && journalctl -u ai-seed-project --no-pager -n 3'
```

如果 "ws client ready" 出现，等 2-3 分钟后请用户在飞书群发"管理"测试。

## 二、项目背景

辉瑞 HBU AI 训练营，飞书群机器人。管理员在群里发"管理"→ 机器人发送管理面板卡片 → 点击按钮操作（开期/开窗/毕业/刷新）。

### 技术栈
- Node.js + Fastify + SQLite
- `@larksuiteoapi/node-sdk` v1.60.0
- WebSocket 长连接模式接收事件

### 服务器
- 阿里云 SWAS 114.215.170.79
- 实例 ID: `0cf24a62cd3a463baf31c196913dc3cd`
- 部署目录: `/opt/ai-seed-project`
- 分支: `codex/phase-one-feishu`
- 部署方式: Base64 直写文件 或 git pull + `npm run build` + `systemctl restart`

### 阿里云 CLI
```
路径: C:\Users\qiyon\Desktop\aliyun-cli-windows-latest-amd64\aliyun.exe
Profile: deploy-temp (AK/SK, region cn-hangzhou)
```

## 三、已解决的问题

| 问题 | 状态 | 解决方案 |
|------|------|---------|
| 发"管理"拉不起卡片 | ✅ | im.message.receive_v1 通过 EventDispatcher 正常工作 |
| 卡片按钮点击不到达服务端 | ✅ | 在 EventDispatcher 注册 "card.action.trigger" |
| 下拉选择值不随按钮提交 | ✅ | 服务端缓存 select 值，按钮点击时注入 |
| UNIQUE constraint 重复开期 | ✅ | openNewPeriod 先检查是否已存在 |
| 服务端处理逻辑 | ✅ | 开期/开窗/毕业/刷新全部在服务端正确执行 |

## 四、未解决的核心问题

### 问题：所有 card.action.trigger 响应都显示 200672

**200672 含义**：飞书官方定义为"响应体格式不正确"。

**关键发现**：
- **toast 响应曾经工作过** — 用户看到了 "请先在下拉菜单中选择周期编号" 等 toast
- **card 更新响应一定导致 200672** — `{ card: { type: "raw", data: cardJson } }` 无法被飞书解析
- 当前代码已改为只返回 toast（不返回 card 更新），但 200672 仍然出现
- select_static 返回 undefined 也导致 200672（但 WS 连接稳定）

### SDK 内部响应流程
```
handler 返回 result (toast/card/undefined)
→ EventDispatcher.invoke() 返回 result
→ handleEventData: if (result) { respPayload.data = base64(JSON.stringify(result)) }
→ sendMessage: { code: 200, data: "<base64>" }
→ 飞书接收 → 200672
```

### 为什么 toast 之前能工作现在又不行？
可能因为频繁重启导致 WS 连接状态不正常。也可能之前的 toast 显示是因为 Feishu 的降级处理。

## 五、必须遵守的规则（经验教训）

**请先阅读**: `~/.claude/projects/D--Vibe-Coding-Project-AI-Seed-Project/memory/project_feishu_ws_card_action_lessons.md`

### 绝对不能做的事
1. **不要 monkey-patch handleEventData** — 会破坏 im.message.receive_v1 投递
2. **不要用 form_container + action_type="form_submit"** — 事件完全不到达服务端
3. **不要返回 {} 给 card.action.trigger** — truthy 值被 base64 编码后飞书无法解析，且 WS 断连
4. **build 不能用 `| tail` 管道** — 会吞掉 tsc 的非零退出码
5. **每次修改后必须验证"管理"命令仍然能拉起卡片** — 这是最基本的回归测试

### 部署检查清单
1. `npm run build` 退出码 = 0（不用管道）
2. `systemctl restart ai-seed-project`
3. 等待 "ws client ready" 日志
4. 用户发"管理"确认卡片弹出
5. 然后再测试按钮功能

## 六、可探索的解决方向

### 方向 A：找到正确的 WS card callback 响应格式
SDK 用 `{ code: 200, data: base64(result) }` 格式发送响应。这对事件 ACK 正确，但对卡片回调可能需要不同格式。
- 查看 Python SDK 的 card 响应处理
- 查看 Go SDK 的 `handleDataFrame` 中注释掉的 `WithCardHandler`

### 方向 B：用 API 主动推送替代 WS 响应
操作成功后不通过 WS 响应更新卡片，而是用 `im.message.create` API 发送新的管理面板卡片。
- 优点：绕过 WS 响应格式问题
- 缺点：群里会多一条卡片消息

### 方向 C：配置飞书开发者控制台的回调设置
在"事件与回调"→"回调配置"中检查 card.action.trigger 是否正确配置了长连接接收。

### 方向 D：升级 SDK 或直接 patch SDK
检查是否有更新版本的 @larksuiteoapi/node-sdk 修复了 WS card 回调。
或者直接 patch `node_modules` 中 handleEventData 的响应格式。

## 七、关键文件清单

| 文件 | 作用 | 是否可修改 |
|------|------|-----------|
| `src/services/feishu/ws-runtime.ts` | WS 运行时，EventDispatcher 注册 | ✅ 但不要加 monkey-patch |
| `src/services/feishu/cards/handlers/admin-panel-handler.ts` | 管理面板处理逻辑 | ✅ 当前返回 toast |
| `src/services/feishu/cards/templates/admin-panel-v1.ts` | 卡片模板 JSON | ✅ 不要用 form_container |
| `src/v2-production-wiring.ts` | 周期/窗口生命周期 | ✅ 已修复 UNIQUE 约束 |
| `src/app.ts` | WS handler 连接 | ⚠️ 谨慎修改 |
| `src/services/feishu/cards/router.ts` | HTTP 卡片回调路由 | 已有但未使用 |

## 八、飞书 Skill 和工具

项目安装了飞书相关的 skill：
- `lark-im` — 收发消息
- `lark-event` — 事件订阅
- `lark-shared` — 认证和配置
- `lark-openapi-explorer` — API 探索
- `feishu-automation` — 自动化能力

如果需要直接调用飞书 API（如发送卡片消息、检查回调配置），可以使用这些 skill。
