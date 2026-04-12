# 飞书卡片开发经验

## Schema 2.0 三大坑

### 1. `tag: "action"` 已废弃 → 230099 错误
```
ErrCode: 200861; unsupported tag action
```
**替代方案**: 用 `column_set > column > elements` 包裹按钮/下拉。参考 `admin-panel-v1.ts`。

### 2. 按钮 name 必须全卡片唯一 → 11310 错误
```
ErrCode: 11310; name(quiz_select) duplicate
```
**修复**: 在 name 中加入唯一后缀，如 `quiz_select_${questionId}_${optionId}`。

### 3. card 更新响应导致 200672
WS 模式下，card.action.trigger 返回 `{ card: {...} }` → 飞书 base64 编码后无法解析。
**唯一方案**: 所有操作只返回 `{ toast: {...} }`。

## Handler 注册必须完整

写了 Handler 但忘记 `cardDispatcher.register(cardType, actionName, handler)` → 运行时 `unknown_action` 错误。
**检查清单**: 每次新增 handler 后确认 app.ts 中有对应 register 调用。

## Quiz Resolver 必须注入

CardActionDispatcher 的 deps 需要显式注入 `[QUIZ_SET_RESOLVER_KEY]`，否则 quiz_submit 返回"resolver 未注入"。

## card_type 命名一致性

Handler 存入 DB 时用 `cardType: "quiz"`，但查询时用 `card_type = 'quiz-v1'` → 查不到记录。
**规则**: 存和查的 card_type 字符串必须完全一致。

## WS 模式限制总结

| 能做 | 不能做 |
|------|--------|
| 返回 toast | 返回 card 更新 |
| 缓存 select 值 | form_submit 事件 |
| 普通 button 回调 | monkey-patch handleEventData |
| EventDispatcher 注册 | CardActionHandler 参数 |

## 必读文件

- `docs/skills/feishu-card-development.md` — 完整 checklist
- `docs/skills/feishu-card-ws.md` — WS 模式详细指南
- `memory/project_feishu_ws_card_action_lessons.md` — 7 种失败方案记录
