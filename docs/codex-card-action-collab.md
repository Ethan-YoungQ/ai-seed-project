# 飞书卡片按钮回调 — Codex 协作排查文档

> 目标：让 Codex 理解完整背景，协助解决 WS 长连接模式下卡片按钮回调的 200672 问题。

## 一、项目背景

辉瑞 HBU AI 训练营评估系统，使用飞书（Feishu/Lark）作为用户交互平台。

### 核心架构
- **后端**：Node.js + Fastify + SQLite
- **飞书集成**：`@larksuiteoapi/node-sdk` v1.60.0
- **事件接收**：WebSocket 长连接模式（非 HTTP webhook）
- **交互方式**：管理员在飞书群发"管理"两字 → Bot 发送管理面板卡片 → 点击卡片按钮操作

### 管理面板功能
管理面板是一张飞书交互式卡片（interactive card），包含：
- 下拉菜单选择周期编号（1-12）+ "开启此周期"按钮
- 下拉菜单选择窗口编号（W1-W5/FINAL）+ "开启此窗口"按钮
- "触发毕业结算"按钮
- "刷新状态"按钮

## 二、要解决的问题

### 问题描述
用户点击卡片上的按钮后，飞书客户端显示 **"出错了，请稍后重试 code: 200672"**。

### 200672 含义
飞书官方文档：**"响应体格式不正确"**。服务端处理了请求但返回的响应格式飞书无法解析。

### 当前状态
| 功能 | 状态 | 说明 |
|------|------|------|
| 发"管理"拉起管理卡片 | ✅ 正常 | im.message.receive_v1 通过 EventDispatcher |
| 下拉菜单选择 | ✅ 到达服务端 | card.action.trigger + tag=select_static |
| 按钮点击到达服务端 | ✅ 到达 | card.action.trigger + tag=button |
| 按钮操作执行 | ✅ 成功 | openNewPeriod 返回正确结果 |
| **toast 响应显示** | ✅ 正常 | 用户能看到"请先选择周期编号"等 toast |
| **card 更新响应** | ❌ 200672 | newCardJson 返回后飞书无法解析 |

**关键发现：toast 响应能正常工作，card 更新响应导致 200672。**

## 三、SDK 分析

### Lark Node SDK v1.60.0 的 WS 卡片回调处理

**文件**: `node_modules/@larksuiteoapi/node-sdk/lib/index.js`

1. **WSClient.handleEventData()** (line 85544):
   ```javascript
   if (type !== MessageType.event) { return; }  // line 85553
   ```
   硬编码只处理 `type="event"` 的 WS 消息，丢弃 `type="card"` 消息。

2. **但实际测试发现**：card.action.trigger 事件（select_static 和 button）都以 `type="event"` 到达，不是 `type="card"`。所以事件能通过 EventDispatcher 路由。

3. **EventDispatcher.invoke()** (line 84175):
   ```javascript
   const result = yield this.handles.get(type)(targetData);
   return ret;
   ```
   调用我们注册的 handler，返回结果。

4. **handleEventData 响应包装** (line 85572):
   ```javascript
   const result = yield this.eventDispatcher.invoke(mergedData, { needCheck: false });
   if (result) {
       respPayload.data = Buffer.from(JSON.stringify(result)).toString("base64");
   }
   // 发送 { code: 200, data: "<base64>" }
   ```

### 关键问题
- 当 handler 返回 `undefined`（无响应）→ 发送 `{ code: 200 }` → **正常**（事件 ACK）
- 当 handler 返回 `{ toast: {...} }` → 发送 `{ code: 200, data: base64(toast) }` → **toast 显示正常** ✅
- 当 handler 返回 `{ card: {...} }` → 发送 `{ code: 200, data: base64(card) }` → **200672** ❌

**toast 和 card 使用完全相同的 base64 编码路径，但 toast 能工作，card 不能。**

### 可能的原因推测
1. card 更新响应的 JSON 体积太大（完整卡片 JSON），可能超过某个 WS 帧大小限制
2. card 更新响应的格式在 WS 模式下有不同的要求
3. 飞书 WS 协议对 card callback 的 data 字段有不同的解码逻辑

## 四、已尝试的所有方案及结果

### 方案 1: 独立 CardActionHandler
```javascript
const cardHandler = new lark.CardActionHandler({...}, handler);
wsClient.start({ eventDispatcher, cardActionHandler: cardHandler });
```
**结果**：SDK 的 `start()` 忽略 `cardActionHandler` 参数。

### 方案 2: Monkey-patch handleEventData 处理 type="card"
```javascript
wsClient.handleEventData = async (data) => {
  if (headers.type === "card") { /* 处理 */ }
  else { return originalHandleEventData(data); }
};
```
**结果**：button 实际以 `type="event"` 到达，不走 card 分支。且 monkey-patch 会破坏 im.message.receive_v1 投递。

### 方案 3: EventDispatcher 注册 card.action.trigger ✅
```javascript
dispatcher.register({
  "im.message.receive_v1": messageHandler,
  "card.action.trigger": cardHandler,
} as any);
```
**结果**：事件正确到达 handler，select_static 和 button 都能处理。toast 响应正常显示。但 card 更新响应（newCardJson）导致 200672。

### 方案 4: form_container + action_type="form_submit"
```json
{ "tag": "form", "elements": [select_static, { "tag": "button", "action_type": "form_submit" }] }
```
**结果**：form_submit 按钮的事件完全不到达服务端。

### 方案 5: 服务端缓存 select 值 ✅
select_static 事件到达时缓存值，button 点击时注入缓存值。
**结果**：成功获取 select 值，handler 正确执行 openNewPeriod。

### 方案 6: 深层 monkey-patch（拦截所有 type="event" 并检查 payload）
**结果**：破坏了 im.message.receive_v1 投递（"管理"拉不起卡片）。

### 方案 7: handler 返回 toast 而非 card 更新
**结果**：编译失败（unused import），旧编译产物被使用，导致管理卡片功能回退。

## 五、当前代码状态

### 已验证能工作的架构
```
用户发"管理" → im.message.receive_v1 → EventDispatcher → onMessage → sendCardMessage ✅
用户选下拉 → card.action.trigger(select_static) → EventDispatcher → 缓存值 → return undefined ✅
用户点按钮 → card.action.trigger(button) → EventDispatcher → 注入缓存值 → dispatch → handler 执行 ✅
handler 返回 toast → SDK base64 编码 → WS 发送 → 飞书显示 toast ✅
handler 返回 card → SDK base64 编码 → WS 发送 → 飞书 200672 ❌
```

### 关键文件
| 文件 | 职责 |
|------|------|
| `src/services/feishu/ws-runtime.ts` | WS 运行时，EventDispatcher 注册，select 缓存 |
| `src/services/feishu/cards/templates/admin-panel-v1.ts` | 管理面板卡片模板 JSON |
| `src/services/feishu/cards/handlers/admin-panel-handler.ts` | 管理面板操作处理逻辑 |
| `src/services/feishu/cards/card-action-dispatcher.ts` | 卡片动作分发器 |
| `src/services/feishu/cards/router.ts` | HTTP 卡片回调路由（已有但未在 WS 模式使用） |
| `src/services/feishu/message-commands.ts` | "管理"关键词处理，发送管理面板卡片 |
| `src/app.ts` | WS handler 注册和连接 |

## 六、待解决的核心问题

### Q1: 为什么 toast 响应正常但 card 更新响应 200672？
两者使用相同的 SDK base64 编码路径。差异在于 card 更新的 JSON 体积更大（完整卡片 JSON vs 简单 toast 对象）。需要调查：
- WS 帧大小限制？
- card 响应是否需要不同的包装格式？
- 飞书对 card callback 的 WS 响应是否有特殊解码要求？

### Q2: 是否应该放弃 WS 模式的 card 更新，改用 API 主动推送？
可选方案：
1. handler 返回 toast 确认 + 通过 `sendCardMessage` API 发送新卡片
2. 配置飞书开发者控制台使用 HTTP webhook 接收卡片回调（而非 WS）
3. 找到 WS card 更新的正确响应格式

### Q3: 飞书开发者控制台的"回调配置"
可能需要在"事件与回调" → "回调配置"中单独配置 card.action.trigger 的接收方式。目前不确定是否已正确配置。

## 七、约束条件

1. **不能破坏"管理"拉起卡片功能** — 这是最高优先级的回归测试
2. **不能使用 monkey-patch** — 会破坏消息投递
3. **SDK v1.60.0 的 WSClient 不支持 CardActionHandler** — 已确认
4. **form_submit 按钮不兼容 WS 长连接** — 已确认
5. **服务端缓存 select 值方案已验证可行** — 可以继续使用

## 八、建议的探索方向

1. **对比 toast 和 card 响应的 base64 编码后大小** — 看是否有 WS 帧大小限制
2. **查看飞书 WS 协议的 payload 大小限制文档**
3. **尝试返回最小化的 card JSON**（只包含必要字段）看是否还是 200672
4. **尝试通过 API (`sendCardMessage`) 主动发送新卡片替代 WS 响应中的 card 更新**
5. **检查飞书开发者控制台的回调配置**

## 九、部署信息

- **服务器**：阿里云 SWAS 114.215.170.79，/opt/ai-seed-project
- **部署方式**：Base64 直写文件 + `npm run build` + `systemctl restart`
- **阿里云 CLI**：`C:\Users\qiyon\Desktop\aliyun-cli-windows-latest-amd64\aliyun.exe`
- **SWAS 实例 ID**：`0cf24a62cd3a463baf31c196913dc3cd`
- **部署注意**：build 必须验证 EXIT_CODE=0，不能用 `| tail` 管道吞错误
