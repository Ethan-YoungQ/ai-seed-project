# 评分系统踩坑记录

## 1. card_type 存查不一致

Handler 存 `cardType: "quiz"`，adapter 查 `card_type = 'quiz-v1'` → 永远查不到。
**修复**: 统一为 `"quiz"`。

## 2. 分类器返回值变更

初版返回 `ClassificationResult | null`（单项），改版返回 `ClassificationResult[]`（多项）。
调用方必须适配：`if (!result)` → `if (results.length === 0)`。

## 3. Ingestor 未被调用

第一版 auto-reply 只发了确认消息，忘了调用 Ingestor 写入分数 → 回复成功但分数没记录。
**规则**: 自动捕获链路必须同时做 ingest + reply。

## 4. 飞书 Base 可被删除

旧 Base appToken `OiclbQXUqaNmY8sthCqc5nbtn7b` 返回 `code: 1002, msg: "note has been deleted"`。
需要创建新 Base 并更新所有环境变量。

## 5. 飞书 contact API 权限

`client.contact.user.get` 获取头像需要 `contact:user.base:readonly` 权限。
当前 app 可能缺少此权限 → 使用 Dicebear 生成头像作为 fallback。

## 6. K1 签到策略

原设计: 学员发"签到"关键词 → 签到。
改后: 任何群活动（消息/图片/文件/表情）→ 自动签到。
Ingestor 的 per-period cap 和 sourceRef 去重保证每期只记一次。
